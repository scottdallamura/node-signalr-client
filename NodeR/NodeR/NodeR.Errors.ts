export class Messages {
	public static ErrorOnNegotiate: string = "Error during negotiation request.";
	public static StoppedWhileNegotiating: string = "The connection was stopped during the negotiation request.";
	public static NotConnected: string = "Not connected.";
	public static NoTransportOnInit: string = "No transport could be initialized successfully. Try specifying a different transport or none at all for auto initialization.";
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