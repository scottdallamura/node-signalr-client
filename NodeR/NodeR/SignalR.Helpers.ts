var Q = require("q");
import http = require("http");
import https = require("https");
import url = require("url");
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

export function createGetRequest(options: any, deferred: Q.Deferred<SignalRInterfaces.HttpResponse>): http.ClientRequest {
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

export function createPostRequest(options: any, deferred: Q.Deferred<SignalRInterfaces.HttpResponse>): http.ClientRequest {
	return createHttpRequest(options, "POST", deferred);
}

export function createHttpRequest(options: any, method: string, deferred: Q.Deferred<SignalRInterfaces.HttpResponse>): http.ClientRequest {
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

export function stringifyData(data: any): string {
	var result: string;
	if (typeof (data) === "string" || typeof (data) === "undefined" || data === null) {
		result = data;
	}
	else {
		result = JSON.stringify(data);
	}

	return result;
}

export function parseResponse(response: any): any {
	if (!response) {
		return response;
	}
	else if (typeof response === "string") {
		return JSON.parse(response);
	}
	else {
		return response;
	}
}

/**
 * Appends a query string fragment to a URL.
 * @param url The url
 * @param queryString The query string
 */
export function addQueryString(url: string, queryString: string): string {
	var appender: string = url.indexOf("?") !== -1 ? "&" : "?";

	if (!queryString) {
		return url;
	}
	else {
		var firstChar: string = queryString.charAt(0);
		if (firstChar === "?" || firstChar === "&") {
			appender = "";
		}

		return url + appender + queryString;
	}
}