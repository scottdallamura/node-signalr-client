/// <reference path="./typings/node/node.d.ts" />

var Q = require("q");
import http = require("http");
import websocket = require('websocket');
import SignalRInterfaces = require("./SignalR.Interfaces");
import SignalRTransports = require("./SignalR.Transports.Common");
import SignalRErrors = require("./SignalR.Errors");
import SignalRHelpers = require("./SignalR.Helpers");

/**
 * A SignalR WebSockets transport.
 */
export class WebSocketsTransport extends SignalRTransports.TransportBase implements SignalRInterfaces.Transport {
	private _websocketConnection: websocket.connection;

	/**
	 * Creates a new WebSocketsTransport.
	 */
	constructor() {
		super("webSockets");
	}

	/**
	 * Determines whether the transport is supported.
	 * @param negotiateResponse The negotiate response from the server
	 */
	public static isSupported(negotiateResponse: SignalRInterfaces.NegotiateResponse): boolean {
		return negotiateResponse.TryWebSockets;
	}

	/**
	 * Sends data via the transport.
	 * @param data The data to send
	 */
	public send(data: any) {
		try {
			this._websocketConnection.sendUTF(data);
		}
		catch (ex) {
			this.emit(SignalRInterfaces.TransportEvents.OnError, SignalRErrors.createError(SignalRErrors.Messages.WebSocketsInvalidState, ex, this));
		}
	}

	/**
	 * Starts the transport.
	 * @param connection The SignalR connection
	 * @param reconnecting Whether this is a reconnect attempt
	 */
	public start(connection: SignalRInterfaces.Connection, reconnecting?: boolean): Q.Promise<any> {
		this._signalRConnection = connection;

		var deferred: Q.Deferred<any> = Q.defer();
		var transport: WebSocketsTransport = this;
		var opened: boolean = false;

		if (!this._websocketConnection) {
			var client: websocket.client = new websocket.client()

			client.on("connectFailed", (error: Error) => {
				deferred.reject(error);
			});

			client.on("connect", (wsConnection: websocket.connection) => {
				opened = true;
				this._websocketConnection = wsConnection;

				connection.clearReconnectTimer();
				if (connection.changeState(SignalRInterfaces.ConnectionState.Reconnecting, SignalRInterfaces.ConnectionState.Connected)) {
					// reconnected
					connection.emit(SignalRInterfaces.ConnectionEvents.OnReconnect);
				}
				
				wsConnection.on("error", (error: Error) => {
					deferred.reject(error);
				});

				wsConnection.on("close", function (code: number, desc: string) {
					if (this === wsConnection.socket) {
						if (!opened) {
							if (reconnecting) {
								transport.reconnect(connection);
							}
						}
						else {
							transport.emit(SignalRInterfaces.TransportEvents.OnError, SignalRErrors.createError(SignalRErrors.Messages.WebSocketClosed, this, transport));
							transport.reconnect(connection);
						}
					}
				});

				wsConnection.on("message", (data: websocket.IMessage) => {
					var message: any = SignalRHelpers.parseResponse(data.utf8Data);

					if (!!message) {
						if (SignalRHelpers.isEmptyObject(message) || message.M) {
							// process the message. the callback will be invoked when the server indicates that the connection is ready
							this.processMessages(connection, message, () => {
								deferred.resolve(this);
							});
						}
						else {
							// trigger onReceived for callbacks from outgoing hub calls
							this.emit(SignalRInterfaces.TransportEvents.OnReceived, message);
						}
					}
				});
			});

			var websocketUrl: string = this.getWebSocketUrl(connection, false);
			client.connect(websocketUrl);
		}

		return deferred.promise;
	}

	/**
	 * Stops the transport.
	 */
	public stop(): void {
		this._signalRConnection.clearReconnectTimer();

		if (!!this._websocketConnection) {
			this._signalRConnection.log("Closing the WebSocket.");
			this._websocketConnection.close();
			this._websocketConnection = null;
		}
	}

	/**
	 * Indicates whether the transport supports keep-alive.
	 */
	public supportsKeepAlive(): boolean {
		return true;
	}

	/**
	 * Called by SignalR when keep-alive indicates that the connection has been lost.
	 */
	public lostConnection() {
		this.reconnect(this._signalRConnection);
	}

	private getWebSocketUrl(connection: SignalRInterfaces.Connection, reconnecting: boolean): string {
		var websocketProtocol: string = connection.connectionUrl.protocol === "https:" ? "wss://" : "ws://";
		var result: string = websocketProtocol + connection.connectionUrl.host + connection.appRelativeUrl;
		var queryString: string = "transport=" + this.name;

		if (!!connection.groupsToken) {
			queryString += "&groupsToken=" + encodeURIComponent(connection.groupsToken);
		}

		if (!reconnecting) {
			result += "/connect";
		}
		else {
			result += "/reconnect";

			if (!!connection.messageId) {
				queryString += "&messageId=" + encodeURIComponent(connection.messageId);
			}
		}

		result += "?" + queryString;
		result = connection.prepareQueryString(result);
		result += "&tid=" + Math.floor(Math.random() * 11);

		return result;
	}
}