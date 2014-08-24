/// <reference path="./typings/node/node.d.ts" />

var Q = require("q");
import http = require("http");
import websocket = require('websocket');
import SignalRInterfaces = require("./SignalR.Interfaces");
import SignalRTransports = require("./SignalR.Transports.Common");
import NodeRErrors = require("./NodeR.Errors");
import NodeRHelpers = require("./NodeR.Helpers");


export class WebSocketsTransport extends SignalRTransports.TransportBase implements SignalRInterfaces.Transport {
	private _websocketConnection: websocket.connection;

	constructor() {
		super("webSockets");
	}

	public isSupported(negotiateResponse: SignalRInterfaces.NegotiateResponse): boolean {
		return negotiateResponse.TryWebSockets;
	}

	public send(connection: SignalRInterfaces.Connection, data: any) {
		var payload: string = this.stringifyData(data);

		try {
			this._websocketConnection.sendUTF(payload);
		}
		catch (ex) {
			this.emit(SignalRInterfaces.TransportEvents.OnError, NodeRErrors.createError(NodeRErrors.Messages.WebSocketsInvalidState, ex, this));
		}
	}

	public start(connection: SignalRInterfaces.Connection, reconnecting?: boolean): Q.Promise<any> {
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
							transport.emit(SignalRInterfaces.TransportEvents.OnError, NodeRErrors.createError(NodeRErrors.Messages.WebSocketClosed, this, transport));
							transport.reconnect(connection);
						}
					}
				});

				wsConnection.on("message", (data: websocket.IMessage) => {
					var message: any = JSON.parse(data.utf8Data);

					if (!!message) {
						if (NodeRHelpers.isEmptyObject(message) || message.M) {
							this.processMessages(connection, message);
						}
						else {
							this.emit(SignalRInterfaces.TransportEvents.OnReceived, message);
						}
					}
				});

				deferred.resolve(this);
			});

			var websocketUrl: string = this.getWebSocketUrl(connection, false);
			client.connect(websocketUrl);
		}

		return deferred.promise;
	}

	public stop(): void {
		if (!!this._websocketConnection) {
			this._websocketConnection.close();
			this._websocketConnection = null;
		}
	}

	public supportsKeepAlive(): boolean {
		return true;
	}

	public lostConnection(connection: SignalRInterfaces.Connection) {
		this.reconnect(connection);
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
		result = SignalRTransports.prepareQueryString(connection, result);
		result += "&tid=" + Math.floor(Math.random() * 11);

		return result;
	}
}