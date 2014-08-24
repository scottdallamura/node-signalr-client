var Q = require("q");
import http = require("http");
import https = require("https");
import url = require("url");
import NodeRInterfaces = require("./NodeR.Interfaces");
import SignalRInterfaces = require("./SignalR.Interfaces");

function getProtocol(options: any): string {
	var protocol: string;

	if (typeof (options) === "string") {
		protocol = url.parse(options).protocol;
	}
	else {
		protocol = options.protocol;
	}

	return protocol;
}

export function createGetRequest(options: any, deferred: Q.Deferred<NodeRInterfaces.HttpResponse>): http.ClientRequest {
	var protocol: string = getProtocol(options);

	var clientRequest: http.ClientRequest;
	if (protocol === "http:") {
		clientRequest = http.get(options,
			(result: http.ClientResponse) => {
				var content: string = "";

				result
					.on("error", (error) => {
						deferred.reject(error);
					})
					.on("data", (data: string) => {
						content += data;
					})
					.on("end", () => {
						deferred.resolve({
							response: result,
							content: content
						});
					});
			});
	}
	else {
		clientRequest = https.get(options,
			(result: http.ClientResponse) => {
				var content: string = "";

				result
					.on("error", (error) => {
						deferred.reject(error);
					})
					.on("data", (data: string) => {
						content += data;
					})
					.on("end", () => {
						deferred.resolve({
							response: result,
							content: content
						});
					});
			});
	}

	return clientRequest;
}

export function createPostRequest(options: any, deferred: Q.Deferred<NodeRInterfaces.HttpResponse>): http.ClientRequest {
	return createHttpRequest(options, "POST", deferred);
}

export function createHttpRequest(options: any, method: string, deferred: Q.Deferred<NodeRInterfaces.HttpResponse>): http.ClientRequest {
	if (typeof (options) === "string") {
		options = url.parse(options);
	}
	options.method = method;

	var protocol: string = getProtocol(options);
	var clientRequest: http.ClientRequest;

	if (protocol === "http:") {
		clientRequest = http.request(options,
			(result: http.ClientResponse) => {
				var content: string = "";

				result
					.on("error", (error) => {
						deferred.reject(error);
					})
					.on("data", (data: string) => {
						content += data;
					})
					.on("end", () => {
						deferred.resolve({
							response: result,
							content: content
						});
					});
			});
	}
	else {
		clientRequest = https.request(options,
			(result: http.ClientResponse) => {
				var content: string = "";

				result
					.on("error", (error) => {
						deferred.reject(error);
					})
					.on("data", (data: string) => {
						content += data;
					})
					.on("end", () => {
						deferred.resolve({
							response: result,
							content: content
						});
					});
			});
	}

	return clientRequest;
}

export function getConsoleInput(prompt: string): Q.Promise<string> {
	var stdin: NodeJS.ReadableStream = process.stdin;
	var stdout: NodeJS.WritableStream = process.stdout;
	var deferred: Q.Deferred<string> = Q.defer();

	stdin.resume();
	stdout.write(prompt);

	stdin.once("data", (data: string) => {
		deferred.resolve(data.toString().trim());
	});

	return deferred.promise;
}

export function expandHubResponse(minified: SignalRInterfaces.MinifiedHubResponse): SignalRInterfaces.HubResponse {
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

export function expandClientHubInvocation(minified: SignalRInterfaces.MinifiedClientHubInvocation): SignalRInterfaces.ClientHubInvocation {
	return {
		Hub: minified.H,
		Method: minified.M,
		Args: minified.A,
		State: minified.S
	};
}

export function expandPersistentResponse(minified: SignalRInterfaces.MinifiedPersistentResponse): SignalRInterfaces.PersistentResponse {
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

export function extendState(targetState: any, newState: any) {
	for (var key in newState) {
		if (newState.hasOwnProperty(key)) {
			targetState[key] = newState[key];
		}
	}
}

export function isEmptyObject(obj: any): boolean {
	for (var key in obj) {
		return false;
	}
	return true;
}

export function format(template: string, ...args: any[]) {
	for (var i = 0; i < args.length; i++) {
		template = template.replace("{" + i + "}", args[i]);
	}
	return template;
}