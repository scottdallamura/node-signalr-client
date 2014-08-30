import SignalRInterfaces = require("./SignalR.Interfaces");

/**
 * Expands a response to a server method.
 * @param minified The minified response
 */
export function expandServerHubResponse(minified: SignalRInterfaces.MinifiedServerHubResponse): SignalRInterfaces.ServerHubResponse {
	return {
		State: minified.S,
		Result: minified.R,
		Progress: !!minified.P ? {
			Id: minified.P.I,
			Data: minified.P.D
		} : null,
		Id: minified.I,
		IsHubException: minified.H,
		Error: minified.E,
		StackTrace: minified.T,
		ErrorData: minified.D
	};
}

/**
 * Expands a client hub invocation.
 * @param minified The minified invocation
 */
export function expandClientHubInvocation(minified: SignalRInterfaces.MinifiedClientHubInvocation): SignalRInterfaces.ClientHubInvocation {
	return {
		Hub: minified.H,
		Method: minified.M,
		Args: minified.A,
		State: minified.S
	};
}

/**
 * Expands a message from the server.
 * @param minified The minified message
 */
export function expandSignalRMessage(minified: SignalRInterfaces.MinifiedSignalRMessage): SignalRInterfaces.SignalRMessage {
	return {
		MessageId: minified.C,
		Messages: minified.M,
		Initialized: !!minified.S,
		Disconnect: !!minified.D,
		ShouldReconnect: !!minified.T,
		LongPollDelay: minified.L,
		GroupsToken: minified.G
	};
}