/// <reference path="./typings/node/node.d.ts" />

var Q = require("q");
import url = require("url");
import util = require("util");
import http = require("http");
import SignalRInterfaces = require("./SignalR.Interfaces");
import SignalRHubs = require("./SignalR.Hubs");
import SignalRConnection = require("./SignalR.Connection");
import SignalRHelpers = require("./SignalR.Helpers");
import SignalRProtocol = require("./SignalR.Protocol");
import SignalRErrors = require("./SignalR.Errors");

class MagicStrings {
	public static NegotiateAborted: string = "__Negotiate Aborted__";
}

class BasicLogger implements SignalRInterfaces.Logger {
	public trace(message: string) {
		console.log(message);
	}

	public debug(message: string) {
		console.log(message);
	}

	public info(message: string) {
		console.log(message);
	}

	public warn(message: string) {
		console.log(message);
	}

	public error(message: string) {
		console.log(message);
	}
}


/**
 * A SignalR client for node.js
 */
export class SignalRClient implements SignalRInterfaces.HubConnection {
	public static DefaultProtocolVersion: string = "1.4";

	/**
	 * The logger.
	 */
	public logger: SignalRInterfaces.Logger;

	private _installedTransports: SignalRInterfaces.TransportStatic[];
	private _negotiateRequest: http.ClientRequest;
	private _startDeferred: Q.Deferred<any>;
	private _connection: SignalRConnection.Connection;
	private _connectedTransport: SignalRInterfaces.Transport;
	private _invocationCallbackId: number = 0;
	private _invocationCallbacks: { [id: string]: (minifedResult: SignalRInterfaces.MinifiedServerHubResponse) => void; } = {};
	private _hubs: { [name: string]: SignalRHubs.SignalRHub; } = {};
	private _connectionTimer: NodeJS.Timer;
	private _transportConnectTimeout: number;

	/**
	 * Construct a new SignalR client.
	 * @param transports The transports to attempt
	 * @param logger The logger
	 */
	constructor(transports: SignalRInterfaces.TransportStatic[], logger?: SignalRInterfaces.Logger) {
		this._installedTransports = transports;

		this.logger = !!logger ? logger : new BasicLogger();
	}

	/**
	 * Starts a SignalR session.
	 * @param baseUrl The url to the application hosting SignalR, i.e. http://myserver.com
	 * @param connectionData Session-specific data
	 */
	public start(baseUrl: string, connectionData: any): Q.Promise<any> {
		this._startDeferred = this._startDeferred || Q.defer();

		var transports: SignalRInterfaces.Transport[] = [];

		this._negotiate(baseUrl, connectionData)
			.then((negotiateResponse: SignalRInterfaces.NegotiateResponse) => {
				delete this._negotiateRequest;

				this._transportConnectTimeout = negotiateResponse.TransportConnectTimeout * 1000;

				// get supported transports
				var supportedTransports: SignalRInterfaces.Transport[] = this.getSupportedTransports(negotiateResponse);
				if (supportedTransports.length === 0) {
					throw SignalRErrors.createError(SignalRErrors.Messages.NoTransportOnInit, null, this);
				}

				return this.tryTransports(supportedTransports);
			})
			.then((transport: SignalRInterfaces.Transport) => {
				// transport connected ok
				this._connectedTransport = transport;

				this._connection.start(transport);

				// message listener
				this._connectedTransport.addListener(SignalRInterfaces.TransportEvents.OnReceived, (data: any) => {
					if (!!data) {
						if (typeof (data.P) !== "undefined") {
							// progress notification
							var callbackId: string = data.P.I.toString();

							var callback = this._invocationCallbacks[callbackId];
							if (!!callback) {
								callback(data);
							}
						}
						else if (typeof (data.I) !== "undefined") {
							// return value from a server method
							var callbackId: string = data.I.toString();

							var callback = this._invocationCallbacks[callbackId];
							if (!!callback) {
								this._invocationCallbacks[callbackId] = null;
								delete this._invocationCallbacks[callbackId];

								callback(data);
							}
						}
						else {
							// client method invoked from server
							var invocation: SignalRInterfaces.ClientHubInvocation = SignalRProtocol.expandClientHubInvocation(data);
							this.logger.debug("Triggering client hub event '" + invocation.Method + "' on hub '" + invocation.Hub + "'.");

							// normalize hub name to lowercase
							var hubName: string = invocation.Hub.toLowerCase();
							// the browser client normalizes methodName to lowercase too, but we're not using a dynamically generated proxy
							var methodName: string = invocation.Method;

							var hub: SignalRHubs.SignalRHub = this._hubs[hubName];
							if (!!hub) {
								SignalRHelpers.extendState(hub.state, invocation.State);
								hub.emit(methodName, invocation.Args);
							}
						}
					}
				});

				// resolve promise
				this._startDeferred.resolve(true);
			})
			.fail((error: Error) => {
				// reject
				this._startDeferred.reject(error);
			})
			.finally(() => {
				delete this._startDeferred;
			});

		return this._startDeferred.promise;
	}

	/**
	 * Creates a new SignalR hub and associates it with this client.
	 * @param hubName The name of the hub
	 */
	public createHub(hubName: string): SignalRHubs.SignalRHub {
		var hub: SignalRHubs.SignalRHub = this._hubs[hubName];

		if (!hub) {
			hub = new SignalRHubs.SignalRHub(hubName, this);
			this._hubs[hubName.toLowerCase()] = hub;
		}

		return hub;
	}

	/**
	 * Stops the SignalR session.
	 */
	public stop() {
		if (!!this._startDeferred) {
			this._startDeferred.reject(SignalRErrors.createError(SignalRErrors.Messages.StoppedWhileStarting, null, this));
		}

		if (!!this._negotiateRequest) {
			this._negotiateRequest.abort();
			delete this._negotiateRequest;
		}

		if (!!this._connection) {
			this._connection.stop(true);
		}
	}

	/**
	 * Gets a new callback id.
	 */
	public getInvocationCallbackId(): number {
		var result: number = this._invocationCallbackId;
		this._invocationCallbackId += 1;
		return result;
	}

	/**
	 * Sends a SignalR message.
	 * @param data The data to send
	 * @param callback The callback to invoke when a response is received
	 */
	public sendWithCallback(data: SignalRInterfaces.MinifiedServerHubInvocation, callback: (minified: SignalRInterfaces.MinifiedServerHubResponse) => void): boolean {
		if (!!this._connectedTransport) {
			var invocationCallbackId: number = data.I;
			this._invocationCallbacks[invocationCallbackId.toString()] = callback;

			this._send(data);

			return true;
		}
		else {
			return false;
		}
	}

	private _send(data: any) {
		if (!!this._connectedTransport) {
			var payload: string = SignalRHelpers.stringifyData(data);

			this._connectedTransport.send(payload);
		}
	}

	private tryTransports(transports: SignalRInterfaces.Transport[]): Q.Promise<SignalRInterfaces.Transport> {
		var deferred: Q.Deferred<SignalRInterfaces.Transport> = Q.defer();

		this._tryTransports(transports, 0, deferred);

		return deferred.promise;
	}

	private _tryTransports(transports: SignalRInterfaces.Transport[], index: number, deferred: Q.Deferred<SignalRInterfaces.Transport>) {
		var transport: SignalRInterfaces.Transport = transports[index];
		var initializationComplete: boolean = false;

		var tryNextTransport = () => {
			if (index === transports.length - 1) {
				// all transports failed
				deferred.reject(SignalRErrors.createError(SignalRErrors.Messages.NoTransportOnInit, null, this));
			}
			else {
				this._tryTransports(transports, index + 1, deferred);
			}
		};

		var onFailed = () => {
			if (!initializationComplete) {
				initializationComplete = true;
				clearTimeout(<any>this._connectionTimer);
				transport.stop();
				tryNextTransport();
			}
		};

		// start connection timer
		this._connectionTimer = <any>setTimeout(() => {
			this.logger.warn(transport.name + " timed out when trying to connect.");
			onFailed();
		}, this._transportConnectTimeout);

		// try to start the transport
		transport.start(this._connection)
			.then(() => {
				initializationComplete = true;
				clearTimeout(<any>this._connectionTimer);
				deferred.resolve(transport);
			})
			.fail((error: Error) => {
				this.logger.error(transport.name + " transport failed with error '" + error.message + "' when attempting to start.");
				onFailed();
			});
	}

	private getSupportedTransports(negotiateResponse: SignalRInterfaces.NegotiateResponse): SignalRInterfaces.Transport[]{
		var results: SignalRInterfaces.Transport[] = [];

		var transportFactories: SignalRInterfaces.TransportStatic[] = this._installedTransports;
		if (Array.isArray(transportFactories)) {
			for (var i = 0; i < transportFactories.length; i++) {
				if (transportFactories[i].isSupported(negotiateResponse)) {
					results.push(new transportFactories[i]());
				}
			}
		}

		return results;
	}

	private _negotiate(baseUrl: string, connectionData?: any): Q.Promise<SignalRInterfaces.NegotiateResponse> {
		var protocolVersion: string = SignalRClient.DefaultProtocolVersion;

		var deferred: Q.Deferred<SignalRInterfaces.NegotiateResponse> = Q.defer();

		var path: string = "/signalr/negotiate?clientProtocol=" + encodeURIComponent(protocolVersion);
		if (!!connectionData) {
			if (!util.isArray(connectionData)) {
				connectionData = [connectionData];
			}

			path += "&connectionData=" + encodeURIComponent(JSON.stringify(connectionData));
		}

		var negotiateDeferred: Q.Deferred<SignalRInterfaces.HttpResponse> = Q.defer();
		this._negotiateRequest = SignalRHelpers.createGetRequest(baseUrl + path, negotiateDeferred);

		negotiateDeferred.promise
			.then((response: SignalRInterfaces.HttpResponse) => {
				if (response.response.statusCode >= 400) {
					if (response.content === MagicStrings.NegotiateAborted) {
						deferred.reject(SignalRErrors.createError(SignalRErrors.Messages.StoppedWhileNegotiating, null, this));
					}
					else {
						deferred.reject(SignalRErrors.createError(SignalRErrors.Messages.ErrorOnNegotiate, response, this));
					}
				}

				var negotiateResponse: SignalRInterfaces.NegotiateResponse = JSON.parse(response.content);

				if (!negotiateResponse.ProtocolVersion || negotiateResponse.ProtocolVersion !== protocolVersion) {
					// not the requested protocol version
					var protocolError: Error = SignalRErrors.createError(SignalRHelpers.format(SignalRErrors.Messages.ProtocolIncompatible, protocolVersion, negotiateResponse.ProtocolVersion), null, this);
					deferred.reject(protocolError);
				}
				else {
					// set up the connection data
					this._connection = new SignalRConnection.Connection(this.logger, baseUrl, negotiateResponse, connectionData);

					deferred.resolve(negotiateResponse);
				}
			})
			.fail((reason: any) => {
				deferred.reject(SignalRErrors.createError(SignalRErrors.Messages.ErrorOnNegotiate, reason, this));
			});

		return deferred.promise;
	}
}