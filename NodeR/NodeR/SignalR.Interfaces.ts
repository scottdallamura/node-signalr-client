import url = require("url");
import http = require("http");
var Q = require("q");

export interface HttpResponse {
	response?: http.ClientResponse;
	content?: string;
}

export class TransportEvents {
	public static OnReceived: string = "onReceived";
	public static OnError: string = "onError";
}

export class ConnectionEvents {
	public static OnDisconnect: string = "onDisconnect";
	public static OnStateChanged: string = "onStateChanged";
	public static OnReconnect: string = "onReconnect";
	public static OnReconnecting: string = "onReconnecting";
	public static OnConnectionSlow: string = "onConnectionSlow";
}


/**
 * The response to a negotiate request.
 */
export interface NegotiateResponse {
	/**
	 * The connection id.
	 */
	ConnectionId?: string;

	/**
	 * The connection token.
	 */
	ConnectionToken?: string;

	/**
	 * The disconnect timeout.
	 */
	DisconnectTimeout?: number;

	/**
	 * The keep-alive timeout.
	 */
	KeepAliveTimeout?: number;

	/**
	 * The long-poll delay.
	 */
	LongPollDelay?: number;

	/**
	 * The SignalR protocol version.
	 */
	ProtocolVersion?: string;

	/**
	 * The transport timeout, in seconds.
	 */
	TransportConnectTimeout?: number;

	/**
	 * Indicates whether the client should attempt to connect with the websockets transport.
	 */
	TryWebSockets?: boolean;

	/**
	 * The application-relative url, i.e. /signalr
	 */
	Url?: string;
}


export enum ConnectionState {
	Connecting,
	Connected,
	Reconnecting,
	Disconnected
}


/**
 * Represents a SignalR connection.
 */
export interface Connection extends NodeJS.EventEmitter {
	/**
	 * The application-relative URL, i.e. /signalr
	 */
	appRelativeUrl: string;

	/**
	 * The base url, i.e. https://myserver.com/signalr
	 */
	baseUrl: string;

	/**
	 * The SignalR protocol used by this connection.
	 */
	clientProtocol: string;

	/**
	 * The connection URL.
	 */
	connectionUrl: url.Url;

	/**
	 * Connection-specific data.
	 */
	data: string;

	/**
	 * The groups token.
	 */
	groupsToken: string;

	/**
	 * The logger.
	 */
	logger: Logger;

	/**
	 * The most recent message id.
	 */
	messageId: string;

	/**
	 * Connection-specific data to include on the query string.
	 */
	queryString: string;

	/**
	 * Changes the state of the conection if the current state matches the expected state.
	 * Returns true if the state was changed.
	 * @param expectedState The expected current state
	 * @param newState The new state
	 */
	changeState(expectedState: ConnectionState, newState: ConnectionState): boolean;

	/**
	 * Clears the reconnect timer.
	 */
	clearReconnectTimer(): void;

	/**
	 * Indicates whether the connection is currently connected or attempting to reconnect.
	 */
	isConnectedOrReconnecting(): boolean;

	/**
	 * Updates the "most recent message received" timestamp.
	 */
	markLastMessage(): void;

	/**
	 * Adds SignalR-specific query string parameters to a url.
	 * @param url The url
	 */
	prepareQueryString(url: string): string;

	/**
	 * Starts the reconnect timer.
	 */
	setReconnectTimer(): void;

	/**
	 * Starts the connection.
	 * @param transport The connected transport.
	 */
	start(transport: Transport): void;

	/**
	 * Stops the connection
	 * @param notifyServer Whether to notify the server that the client is disconnecting
	 */
	stop(notifyServer: boolean): Q.Promise<any>;

	/**
	 * Updates the groups token.
	 * @param groupsToken The new groups token.
	 */
	updateGroups(groupsToken: string): void;

	/**
	 * Determines whether the last activity was within the reconnect timeout.
	 */
	verifyLastActive(): boolean;
}


/**
 * Represents a SignalR transport.
 */
export interface Transport extends NodeJS.EventEmitter {
	/**
	 * The name of the transport.
	 */
	name: string;

	/**
	 * Aborts the connection.
	 */
	abort(): Q.Promise<any>;

	/**
	 * Called by SignalR when keep-alive indicates that the connection has been lost.
	 */
	lostConnection();

	/**
	 * Sends data via the transport.
	 * @param data The data to send
	 */
	send(data: any);

	/**
	 * Starts the transport.
	 * @param connection The SignalR connection
	 * @param reconnecting Whether this is a reconnect attempt
	 */
	start(connection: Connection, reconnecting?: boolean): Q.Promise<any>;

	/**
	 * Stops the transport.
	 */
	stop(): void;

	/**
	 * Indicates whether the transport supports keep-alive.
	 */
	supportsKeepAlive(): boolean;
}


/**
 * Static Transport methods.
 */
export interface TransportStatic {
	/**
	 * Construct a new instance of the transport.
	 */
	new (): Transport;

	/**
	 * Determines whether the transport is supported.
	 * @param negotiateResponse The negotiate response from the server
	 */
	isSupported(negotiateResponse: NegotiateResponse): boolean;
}


/**
 * Represents a server method invoked by the client.
 */
export interface MinifiedServerHubInvocation {
	/**
	 * The hub name.
	 */
	H: string;

	/**
	 * The method name.
	 */
	M: string;

	/**
	 * The method arguments.
	 */
	A: any[];

	/**
	 * The callback id.
	 */
	I: number;

	/**
	 * The hub state.
	 */
	S?: any;
}


/**
 * Represents a client method invoked by the server
 */
export interface MinifiedClientHubInvocation {
	/**
	 * The hub name.
	 */
	H: string;

	/**
	 * The method name.
	 */
	M: string;

	/**
	 * The method arguments.
	 */
	A: any[];

	/**
	 * The hub state.
	 */
	S: any;
}

/**
 * Represents a client method invoked by the server
 */
export interface ClientHubInvocation {
	/**
	 * The hub name.
	 */
	Hub: string;

	/**
	 * The method name.
	 */
	Method: string;

	/**
	 * The method arguments.
	 */
	Args: any[];

	/**
	 * The hub state.
	 */
	State: any;
}


export interface MinifiedServerHubResponse {
	S: string;
	R: any;
	P: {
		I: number;
		D: string;
	};
	I: number;
	H: boolean;
	E: string;
	T: string;
	D: string;
}


export interface ServerHubResponse {
	State: string;
	Result: any;
	Progress: {
		Id: number;
		Data: string;
	};
	Id: number;
	IsHubException: boolean;
	Error: string;
	StackTrace: string;
	ErrorData: string;
}

export interface MinifiedSignalRMessage {
	C: string;
	M: any[];
	S: boolean;
	D: boolean;
	T: boolean;
	L: number;
	G: string;
}


/**
 * Represents a message from the server.
 */
export interface SignalRMessage {
	/**
	 * The message id.
	 */
	MessageId: string;

	/**
	 * The messages. These may be responses to server calls or invocations of client methods.
	 */
	Messages: any[];

	/**
	 * Indicates whether the connection is initialized.
	 */
	Initialized: boolean;

	/**
	 * Indicates whether the client should disconnect.
	 * This is only used by the long-polling transport.
	 */
	Disconnect: boolean;

	/**
	 * Indicates whether the client should reconnect.
	 * This is only used by the long-polling transport.
	 */
	ShouldReconnect: boolean;

	/**
	 * The long-polling delay (in seconds).
	 * This is only used by the long-polling transport.
	 */
	LongPollDelay: number;

	/**
	 * The groups token. This is used to automatically rejoin the client to the appropriate groups in the event of a reconnection.
	 */
	GroupsToken: string;
}


/**
 * Represents a SignalR connection used by a hub.
 */
export interface HubConnection {
	/**
	 * The logger.
	 */
	logger: Logger;

	/**
	 * Gets a new callback id.
	 */
	getInvocationCallbackId(): number;

	/**
	 * Sends a SignalR message.
	 * @param data The data to send
	 * @param callback The callback to invoke when a response is received
	 */
	sendWithCallback(data: MinifiedServerHubInvocation, callback: (minified: MinifiedServerHubResponse) => void): boolean;
}


/**
 * Logging interface.
 */
export interface Logger {
	trace(message: string);
	debug(message: string);
	info(message: string);
	warn(message: string);
	error(message: string);
}