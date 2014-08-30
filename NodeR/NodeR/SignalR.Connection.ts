import url = require("url");
import events = require("events");
import SignalRInterfaces = require("./SignalR.Interfaces");
import SignalRHelpers = require("./SignalR.Helpers");
import SignalRErrors = require("./SignalR.Errors");

var KeepAliveWarning = 2 / 3;

class KeepAlive {
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


/**
 * Represents a SignalR connection.
 */
export class Connection extends events.EventEmitter implements SignalRInterfaces.Connection {
	private static HeartbeatInterval: number = 5000;
	private static ReconnectDelay: number = 2000;

	/**
	 * The application-relative URL, i.e. /signalr
	 */
	public appRelativeUrl: string;
	
	/**
	 * The base url, i.e. https://myserver.com/signalr
	 */
	public baseUrl: string;

	/**
	 * The SignalR protocol used by this connection.
	 */
	public clientProtocol: string;

	/**
	 * The connection URL.
	 */
	public connectionUrl: url.Url;

	/**
	 * Connection-specific data.
	 */
	public data: string;	

	/**
	 * The groups token.
	 */
	public groupsToken: string;

	/**
	 * The logger.
	 */
	public logger: SignalRInterfaces.Logger;

	/**
	 * The most recent message id.
	 */
	public messageId: string;

	/**
	 * Connection-specific data to include on the query string.
	 */
	public queryString: string;

	private _id: string;
	private _token: string;
	private _connectionState: SignalRInterfaces.ConnectionState = SignalRInterfaces.ConnectionState.Disconnected;
	private _lastMessageAt: number;
	private _lastActiveAt: number;
	private _transport: SignalRInterfaces.Transport;
	private _keepAliveMonitor: () => void;
	private _keepAlive: KeepAlive;
	private _reconnectTimer: NodeJS.Timer;
	private _reconnectWindow: number;
	private _disconnectTimeout: number;
	private _heartbeatTimer: NodeJS.Timer;

	/**
	 * Creates a new connection.
	 * @param baseUrl The base url, i.e. https://myserver.com/signalr
	 * @param negotiateResponse The response to the negotiate request
	 * @param connectiondata Connection-specific data
	 */
	constructor(logger: SignalRInterfaces.Logger, baseUrl: string, negotiateResponse: SignalRInterfaces.NegotiateResponse, connectionData: any) {
		super();

		this.logger = logger;
		this.baseUrl = baseUrl;
		this.connectionUrl = url.parse(baseUrl);
		this.clientProtocol = negotiateResponse.ProtocolVersion;
		this.appRelativeUrl = negotiateResponse.Url;
		this.data = JSON.stringify(connectionData);

		this._token = negotiateResponse.ConnectionToken;
		this._id = negotiateResponse.ConnectionId;
		this._disconnectTimeout = negotiateResponse.DisconnectTimeout * 1000;
		this._keepAlive = new KeepAlive(negotiateResponse);
		this._reconnectWindow = this._disconnectTimeout + (this._keepAlive.timeout || 0);
	}

	/**
	 * Indicates whether the connection is currently connected or attempting to reconnect.
	 */
	public isConnectedOrReconnecting(): boolean {
		return this._connectionState === SignalRInterfaces.ConnectionState.Connected || this._connectionState === SignalRInterfaces.ConnectionState.Reconnecting;
	}

	/**
	 * Updates the "most recent message received" timestamp.
	 */
	public markLastMessage() {
		this._lastMessageAt = new Date().getTime();
	}

	/**
	 * Updates the "most recent activity" timestamp.
	 * Returns false if the connection has been inactive for too long.
	 */
	public markActive(): boolean {
		if (this.verifyLastActive()) {
			this._lastActiveAt = new Date().getTime();
		}
		else {
			return false;
		}
	}

	/**
	 * Updates the groups token.
	 * @param groupsToken The new groups token.
	 */
	public updateGroups(groupsToken: string) {
		if (!!groupsToken) {
			this.groupsToken = groupsToken;
		}
	}

	/**
	 * Determines whether the last activity was within the reconnect timeout.
	 */
	public verifyLastActive(): boolean {
		if (new Date().getTime() - this._lastActiveAt >= this._reconnectWindow) {
			var message: string = SignalRHelpers.format(SignalRErrors.Messages.ReconnectWindowTimeout, new Date(this._lastActiveAt), this._reconnectWindow);
			this.logger.warn(message);

			this.emit(SignalRInterfaces.TransportEvents.OnError, SignalRErrors.createError(message, "TimeoutException", this));

			this.stop(false);

			return false;
		}
		else {
			return true;
		}
	}

	/**
	 * Starts the connection.
	 * @param transport The connected transport.
	 */
	public start(transport: SignalRInterfaces.Transport) {
		this._transport = transport;

		this.startMonitoringKeepAlive();
		this.startHeartbeat();
	}

	/**
	 * Stops the connection
	 * @param notifyServer Whether to notify the server that the client is disconnecting
	 */
	public stop(notifyServer: boolean): Q.Promise<any> {
		var promise: Q.Promise<any> = Q.resolve(true);

		if (this._connectionState !== SignalRInterfaces.ConnectionState.Disconnected) {
			this.logger.info("Stopping connection.");

			this.changeState(this._connectionState, SignalRInterfaces.ConnectionState.Disconnected);

			if (!!this._transport) {
				this._transport.stop();
				this.stopMonitoringKeepAlive();

				if (notifyServer) {
					promise = this._transport.abort();
				}

				this._transport = null;
			}

			this.emit(SignalRInterfaces.ConnectionEvents.OnDisconnect, this);
		}

		return promise;
	}

	/**
	 * Clears the reconnect timer.
	 */
	public clearReconnectTimer() {
		if (!!this._reconnectTimer) {
			clearTimeout(<any>this._reconnectTimer);
			delete this._reconnectTimer;
		}
	}

	/**
	 * Starts the reconnect timer.
	 */
	public setReconnectTimer() {
		this._reconnectTimer = <any>setTimeout(() => {
			if (this.verifyLastActive()) {
				this._transport.stop();

				if (this.ensureReconnectingState()) {
					this.logger.info(this._transport.name + " reconnecting.");
					this._transport.start(this, true);
				}
			}
		}, Connection.ReconnectDelay);
	}

	/**
	 * Adds SignalR-specific query string parameters to a url.
	 * @param url The url
	 */
	public prepareQueryString(url: string): string {
		var preparedUrl: string = SignalRHelpers.addQueryString(url, "clientProtocol=" + this.clientProtocol);

		preparedUrl = SignalRHelpers.addQueryString(preparedUrl, this.queryString);

		if (!!this._token) {
			preparedUrl += "&connectionToken=" + encodeURIComponent(this._token);
		}

		if (!!this.data) {
			preparedUrl += "&connectionData=" + encodeURIComponent(this.data);
		}

		return preparedUrl;
	}

	/**
	 * Changes the state of the conection if the current state matches the expected state.
	 * Returns true if the state was changed.
	 * @param expectedState The expected current state
	 * @param newState The new state
	 */
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
		if (this._keepAlive.monitoring) {
			this.checkIfAlive();
		}

		if (this.markActive()) {
			this._heartbeatTimer = <any>setTimeout(() => {
				this.beat();
			}, Connection.HeartbeatInterval);
		}
	}

	private checkIfAlive() {
		var keepAlive: KeepAlive = this._keepAlive;

		if (this._connectionState === SignalRInterfaces.ConnectionState.Connected) {
			var elapsedTime: number = new Date().getTime() - this._lastMessageAt;
			if (elapsedTime >= keepAlive.timeout) {
				this.logger.warn("Keep alive timed out.  Notifying transport that connection has been lost.");

				this._transport.lostConnection();
			}
			else if (elapsedTime >= keepAlive.timeoutWarning) {
				if (!keepAlive.userNotified) {
					this.logger.warn("Keep alive has been missed, connection may be dead/slow.");

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
			if (!this._keepAlive.monitoring) {
				this._keepAlive.monitoring = true;

				this.markLastMessage();

				this._keepAliveMonitor = () => {
					this.markLastMessage();
				};

				this.addListener(SignalRInterfaces.ConnectionEvents.OnReconnect, this._keepAliveMonitor);

				this.logger.info("Now monitoring keep alive with a warning timeout of " + this._keepAlive.timeoutWarning + " and a connection lost timeout of " + this._keepAlive.timeout + ".");
			}
			else {
				this.logger.warn("Tried to monitor keep alive but it's already being monitored.");
			}
		}
	}

	private stopMonitoringKeepAlive() {
		if (this._keepAlive.monitoring && this.supportsKeepAlive()) {
			this._keepAlive.monitoring = false;

			this.removeListener(SignalRInterfaces.ConnectionEvents.OnReconnect, this._keepAliveMonitor);
			this._keepAliveMonitor = null;

			this.logger.info("Stopping the monitoring of the keep alive.");
		}
	}

	private supportsKeepAlive(): boolean {
		return this._keepAlive.activated && this._transport.supportsKeepAlive();
	}
}