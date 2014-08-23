var Q = require("q");
import http = require("http");
import https = require("https");
import url = require("url");
import NodeRInterfaces = require("./NodeR.Interfaces");

export function makeGetRequest(options: any): Q.Promise<NodeRInterfaces.HttpResponse> {
	var deferred: Q.Deferred<NodeRInterfaces.HttpResponse> = Q.defer();

	var protocol: string;
	if (typeof (options) === "string") {
		protocol = url.parse(options).protocol;
	}
	else {
		protocol = options.protocol;
	}

	if (protocol === "http:") {
		http.get(options,
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
		https.get(options,
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

	return deferred.promise;
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