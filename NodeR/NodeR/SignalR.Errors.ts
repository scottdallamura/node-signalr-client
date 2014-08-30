export class Messages {
	public static ErrorOnNegotiate: string = "Error during negotiation request.";
	public static NotConnected: string = "Not connected.";
	public static NoTransportOnInit: string = "No transport could be initialized successfully. Try specifying a different transport or none at all for auto initialization.";
	public static ProtocolIncompatible: string = "You are using a version of the client that isn't compatible with the server. Client version {0}, server version {1}.";
	public static ReconnectWindowTimeout: string = "The client has been inactive since {0} and it has exceeded the inactivity timeout of {1} ms. Stopping the connection.";
	public static StoppedWhileNegotiating: string = "The connection was stopped during the negotiation request.";
	public static StoppedWhileStarting: string = "The connection was stopped while starting.";
	public static WebSocketClosed: string = "WebSocket closed.";
	public static WebSocketsInvalidState: string = "The Web Socket transport is in an invalid state, transitioning into reconnecting.";
}

export function createError(message: string, source: any, context: any): Error {
	var error: any = new Error(message);
	error.source = source;

	if (typeof (context) !== "undefined") {
		error.context = context;
	}

	return error;
}