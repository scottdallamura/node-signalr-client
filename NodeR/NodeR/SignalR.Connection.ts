import url = require("url");
import events = require("events");
import SignalRInterfaces = require("./SignalR.Interfaces");
import SignalRHelpers = require("./SignalR.Helpers");
import SignalRErrors = require("./SignalR.Errors");

var KeepAliveWarning = 2 / 3;

export class KeepAlive {
	public activated: boolean;
	public timeout: number;
	public timeoutWarning: number;
	public beatInterval: number;
	public monitoring: boolean = false;
	public userNotified: boolean = false;

	constructor(negotiateResponse: SignalRInterfaces.NegotiateResponse) {
		if (!!negotiateResponse.KeepAliveTimeout) {
			var keepAliveTimeout: number = negotiateResponse.KeepAliveTimeout * 1000;
			var timeoutWarning: number = keepAliveTimeout * KeepAliveWarning;

			this.activated = true;
			this.timeout = keepAliveTimeout;
			this.timeoutWarning = timeoutWarning;
			this.beatInterval = (keepAliveTimeout - timeoutWarning) / 3;
		}
		else {
			this.activated = false;
		}
	}
}

export class Connection extends events.EventEmitter implements SignalRInterfaces.Connection {
	public baseUrl: string;
	public connectionUrl: url.Url;
	public appRelativeUrl: string;
	public groupsToken: string;
	public messageId: string;
	public reconnectWindow: number;
	public clientProtocol: string;
	public queryString: string;
	public token: string;
	public data: string;

	public id: string;
	public disconnectTimeout: number;
	public keepAlive: KeepAlive;

	private static HeartbeatInterval: number = 5000;
	private static ReconnectDelay: number = 2000;

	private _connectionState: SignalRInterfaces.ConnectionState = SignalRInterfaces.ConnectionState.Disconnected;
	private _lastMessageAt: number;
	private _lastActiveAt: number;
	private _transport: SignalRInterfaces.Transport;
	private _keepAliveMonitor: () => void;
	private _reconnectTimer: NodeJS.Timer;
	private _heartbeatTimer: NodeJS.Timer;

	constructor(baseUrl: string, negotiateResponse: SignalRInterfaces.NegotiateResponse, connectionData: any) {
		super();

		this.baseUrl = baseUrl;
		this.connectionUrl = url.parse(baseUrl);
		this.clientProtocol = negotiateResponse.ProtocolVersion;
		this.appRelativeUrl = negotiateResponse.Url;
		this.token = negotiateResponse.ConnectionToken;
		this.data = JSON.stringify(connectionData);
		this.id = negotiateResponse.ConnectionId;
		this.disconnectTimeout = negotiateResponse.DisconnectTimeout * 1000;
		this.keepAlive = new KeepAlive(negotiateResponse);

		this.reconnectWindow = this.disconnectTimeout + (this.keepAlive.timeout || 0);
	}

	public log(message: string) {
		console.log(message);
	}

	public isConnectedOrReconnecting(): boolean {
		return this._connectionState === SignalRInterfaces.ConnectionState.Connected || this._connectionState === SignalRInterfaces.ConnectionState.Reconnecting;
	}

	public markLastMessage() {
		this._lastMessageAt = new Date().getTime();
	}

	public markActive(): boolean {
		if (this.verifyLastActive()) {
			this._lastActiveAt = new Date().getTime();
		}
		else {
			return false;
		}
	}

	public updateGroups(groupsToken: string) {
		if (!!groupsToken) {
			this.groupsToken = groupsToken;
		}
	}

	public verifyLastActive(): boolean {
		if (new Date().getTime() - this._lastActiveAt >= this.reconnectWindow) {
			var message: string = SignalRHelpers.format(SignalRErrors.Messages.ReconnectWindowTimeout, new Date(this._lastActiveAt), this.reconnectWindow);
			this.log(message);

			this.emit(SignalRInterfaces.TransportEvents.OnError, SignalRErrors.createError(message, "TimeoutException", this));

			this.stop(false);

			return false;
		}
		else {
			return true;
		}
	}

	public start(transport: SignalRInterfaces.Transport) {
		this._transport = transport;

		this.startMonitoringKeepAlive();
		this.startHeartbeat();
	}

	public stop(notifyServer: boolean): Q.Promise<any> {
		var promise: Q.Promise<any> = Q.resolve(true);

		if (this._connectionState !== SignalRInterfaces.ConnectionState.Disconnected) {
			this.log("Stopping connection.");

			this.changeState(this._connectionState, SignalRInterfaces.ConnectionState.Disconnected);

			if (!!this._transport) {
				this._transport.stop();
				this.stopMonitoringKeepAlive();

				if (notifyServer) {
					promise = this._transport.abort(this);
				}

				this._transport = null;
			}

			this.emit(SignalRInterfaces.ConnectionEvents.OnDisconnect, this);
		}

		return promise;
	}

	public clearReconnectTimer() {
		if (!!this._reconnectTimer) {
			clearTimeout(<any>this._reconnectTimer);
			delete this._reconnectTimer;
		}
	}

	public setReconnectTimer() {
		this._reconnectTimer = <any>setTimeout(() => {
			if (this.verifyLastActive()) {
				this._transport.stop();

				if (this.ensureReconnectingState()) {
					this.log(this._transport.name + " reconnecting.");
					this._transport.start(this, true);
				}
			}
		}, Connection.ReconnectDelay);
	}

	private ensureReconnectingState(): boolean {
		if (this.changeState(SignalRInterfaces.ConnectionState.Connected, SignalRInterfaces.ConnectionState.Reconnecting)) {
			this.emit(SignalRInterfaces.ConnectionEvents.OnReconnecting, this);
		}

		return this._connectionState === SignalRInterfaces.ConnectionState.Reconnecting;
	}

	private startHeartbeat() {
		this._lastActiveAt = new Date().getTime();
		this.beat();
	}

	private beat() {
		if (this.keepAlive.monitoring) {
			this.checkIfAlive();
		}

		if (this.markActive()) {
			this._heartbeatTimer = <any>setTimeout(() => {
				this.beat();
			}, Connection.HeartbeatInterval);
		}
	}

	private checkIfAlive() {
		var keepAlive: KeepAlive = this.keepAlive;

		if (this._connectionState === SignalRInterfaces.ConnectionState.Connected) {
			var elapsedTime: number = new Date().getTime() - this._lastMessageAt;
			if (elapsedTime >= keepAlive.timeout) {
				this.log("Keep alive timed out.  Notifying transport that connection has been lost.");

				this._transport.lostConnection(this);
			}
			else if (elapsedTime >= keepAlive.timeoutWarning) {
				if (!keepAlive.userNotified) {
					this.log("Keep alive has been missed, connection may be dead/slow.");

					this.emit(SignalRInterfaces.ConnectionEvents.OnConnectionSlow, this);

					keepAlive.userNotified = true;
				}
			}
			else {
				keepAlive.userNotified = false;
			}
		}
	}

	private startMonitoringKeepAlive() {
		if (this.supportsKeepAlive()) {
			if (!this.keepAlive.monitoring) {
				this.keepAlive.monitoring = true;

				this.markLastMessage();

				this._keepAliveMonitor = () => {
					this.markLastMessage();
				};

				this.addListener(SignalRInterfaces.ConnectionEvents.OnReconnect, this._keepAliveMonitor);

				this.log("Now monitoring keep alive with a warning timeout of " + this.keepAlive.timeoutWarning + " and a connection lost timeout of " + this.keepAlive.timeout + ".");
			}
			else {
				this.log("Tried to monitor keep alive but it's already being monitored.");
			}
		}
	}

	private stopMonitoringKeepAlive() {
		if (this.keepAlive.monitoring && this.supportsKeepAlive()) {
			this.keepAlive.monitoring = false;

			this.removeListener(SignalRInterfaces.ConnectionEvents.OnReconnect, this._keepAliveMonitor);
			this._keepAliveMonitor = null;

			this.log("Stopping the monitoring of the keep alive.");
		}
	}

	private supportsKeepAlive(): boolean {
		return this.keepAlive.activated && this._transport.supportsKeepAlive();
	}

	public changeState(expectedState: SignalRInterfaces.ConnectionState, newState: SignalRInterfaces.ConnectionState): boolean {
		if (this._connectionState === expectedState) {
			this._connectionState = newState;

			this.emit(SignalRInterfaces.ConnectionEvents.OnStateChanged, expectedState, newState);

			return true;
		}
		else {
			return false;
		}
	}
}