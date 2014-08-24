/// <reference path="./typings/node/node.d.ts" />

var Q = require("q");
import url = require("url");
import util = require("util");
import SignalRInterfaces = require("./SignalR.Interfaces");
import SignalRHubs = require("./SignalR.Hubs");
import NodeRInterfaces = require("./NodeR.Interfaces");
import NodeRHelpers = require("./NodeR.Helpers");
import NodeRErrors = require("./NodeR.Errors");

class MagicStrings {
	public static NegotiateAborted: string = "__Negotiate Aborted__";
}

export function test(code: number): Q.Promise<NodeRInterfaces.HttpResponse> {
	var options: any = {
		host: "localhost",
		port: 51554,
		path: "/api/values/" + code,
		method: "GET",
		headers: {}
	};

	return NodeRHelpers.makeGetRequest(options);
}

export class NodeRClient implements SignalRInterfaces.HubConnection {
	public static DefaultProtocolVersion: string = "1.4";

	private _installedTransports: SignalRInterfaces.Transport[];
	private _connection: SignalRInterfaces.Connection;
	private _connectedTransport: SignalRInterfaces.Transport;
	private _invocationCallbackId: number = 0;
	private _invocationCallbacks: { [id: string]: (minifedResult: SignalRInterfaces.MinifiedHubResponse) => void; } = {};
	private _hubs: { [name: string]: SignalRHubs.SignalRHub; } = {};

	constructor(transports: SignalRInterfaces.Transport[]) {
		this._installedTransports = transports;
	}

	public start(baseUrl: string): Q.Promise<any> {
		var deferred: Q.Deferred<any> = Q.defer();
		var transports: SignalRInterfaces.Transport[] = [];

		this.negotiate(baseUrl)
			.then((negotiateResponse: SignalRInterfaces.NegotiateResponse) => {
				// get supported transports
				var supportedTransports: SignalRInterfaces.Transport[] = this.getSupportedTransports(negotiateResponse);
				if (supportedTransports.length === 0) {
					throw NodeRErrors.createError(NodeRErrors.Messages.NoTransportOnInit, null, this);
				}

				return this.tryTransports(supportedTransports);
			})
			.then((transport: SignalRInterfaces.Transport) => {
				// transport connected ok
				this._connectedTransport = transport;
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
							var invocation: SignalRInterfaces.ClientHubInvocation = NodeRHelpers.expandClientHubInvocation(data);
							this.log("Triggering client hub event '" + invocation.Method + "' on hub '" + invocation.Hub + "'.");

							// normalize hub name to lowercase
							var hubName: string = invocation.Hub.toLowerCase();
							// the browser client normalizes methodName to lowercase too, but we're not using a dynamically generated proxy
							var methodName: string = invocation.Method;

							var hub: SignalRHubs.SignalRHub = this._hubs[hubName];
							if (!!hub) {
								NodeRHelpers.extendState(hub.state, invocation.State);
								hub.emit(methodName, invocation.Args);
							}
						}
					}
				});

				deferred.resolve(true);
			})
			.fail((error: Error) => {
				deferred.reject(error);
			});

		return deferred.promise;
	}

	public createHub(hubName: string) {
		var hub: SignalRHubs.SignalRHub = this._hubs[hubName];

		if (!hub) {
			hub = new SignalRHubs.SignalRHub(hubName, this);
			this._hubs[hubName.toLowerCase()] = hub;
		}

		return hub;
	}

	public send(data: any) {
		if (!!this._connectedTransport) {
			this._connectedTransport.send(this._connection, data);
		}
	}

	public getInvocationCallbackId(): number {
		var result: number = this._invocationCallbackId;
		this._invocationCallbackId += 1;
		return result;
	}

	public sendWithCallback(data: any, invocationCallbackId: number, callback: (minified: SignalRInterfaces.MinifiedHubResponse) => void): boolean {
		if (!!this._connectedTransport) {
			this._invocationCallbacks[this._invocationCallbackId.toString()] = callback;

			this.send(data);

			return true;
		}
		else {
			return false;
		}
	}

	private tryTransports(transports: SignalRInterfaces.Transport[]): Q.Promise<SignalRInterfaces.Transport> {
		var deferred: Q.Deferred<SignalRInterfaces.Transport> = Q.defer();

		this._tryTransports(transports, 0, deferred);

		return deferred.promise;
	}

	private _tryTransports(transports: SignalRInterfaces.Transport[], index: number, deferred: Q.Deferred<SignalRInterfaces.Transport>) {
		var transport: SignalRInterfaces.Transport = transports[index];
		transport.start(this._connection)
			.then(() => {
				deferred.resolve(transport);
			})
			.fail((error: Error) => {
				this.log(transport.name + " transport failed with error '" + error.message + "' when attempting to start.");

				if (index === transports.length - 1) {
					// all transports failed
					deferred.reject(NodeRErrors.createError(NodeRErrors.Messages.NoTransportOnInit, null, this));
				}
				else {
					this._tryTransports(transports, index + 1, deferred);
				}
			});
	}

	private getSupportedTransports(negotiateResponse: SignalRInterfaces.NegotiateResponse): SignalRInterfaces.Transport[]{
		var results: SignalRInterfaces.Transport[] = [];

		var transports: SignalRInterfaces.Transport[] = this._installedTransports;
		if (Array.isArray(transports)) {
			for (var i = 0; i < transports.length; i++) {
				if (transports[i].isSupported(negotiateResponse)) {
					results.push(transports[i]);
				}
			}
		}

		return results;
	}

	public negotiate(baseUrl: string, connectionData?: any): Q.Promise<SignalRInterfaces.NegotiateResponse> {
		var protocolVersion: string = NodeRClient.DefaultProtocolVersion;

		var deferred: Q.Deferred<SignalRInterfaces.NegotiateResponse> = Q.defer();

		// var url: string = "http://localhost:51554/signalr/negotiate?clientProtocol=1.4&connectionData=%5B%7B%22name%22%3A%22chathub%22%7D%5D&_=1408209389918";
		connectionData = {
			name: "chathub"
		};

		var path: string = "/signalr/negotiate?clientProtocol=" + encodeURIComponent(protocolVersion);
		if (!!connectionData) {
			if (!util.isArray(connectionData)) {
				connectionData = [connectionData];
			}

			path += "&connectionData=" + encodeURIComponent(JSON.stringify(connectionData));
		}

		NodeRHelpers.makeGetRequest(baseUrl + path)
			.then((response: NodeRInterfaces.HttpResponse) => {
				if (response.response.statusCode >= 400) {
					if (response.content === MagicStrings.NegotiateAborted) {
						deferred.reject(NodeRErrors.createError(NodeRErrors.Messages.StoppedWhileNegotiating, null, this));
					}
					else {
						deferred.reject(NodeRErrors.createError(NodeRErrors.Messages.ErrorOnNegotiate, response, this));
					}
				}

				var negotiateResponse: SignalRInterfaces.NegotiateResponse = JSON.parse(response.content);

				this._connection = {
					connectionUrl: url.parse(baseUrl),
					clientProtocol: protocolVersion,
					appRelativeUrl: negotiateResponse.Url,
					token: negotiateResponse.ConnectionToken,
					data: JSON.stringify(connectionData)
				};

				deferred.resolve(negotiateResponse);
			})
			.fail((reason: any) => {
				deferred.reject(NodeRErrors.createError(NodeRErrors.Messages.ErrorOnNegotiate, reason, this));
			});

		return deferred.promise;
	}

	public log(message: string) {
		console.log(message);
	}
}