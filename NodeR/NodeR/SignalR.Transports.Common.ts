import events = require("events");
import SignalRInterfaces = require("./SignalR.Interfaces");

export class TransportBase extends events.EventEmitter {
	constructor() {
		super();
	}

	public stringifyData(data: any): string {
		var payload: string;
		if (typeof (data) === "string" || typeof (data) === "undefined" || data === null) {
			payload = data;
		}
		else {
			payload = JSON.stringify(data);
		}

		return payload;
	}
}

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

export function prepareQueryString(connection: SignalRInterfaces.Connection, url: string): string {
	var preparedUrl: string = addQueryString(url, "clientProtocol=" + connection.clientProtocol);

	preparedUrl = addQueryString(preparedUrl, connection.queryString);

	if (!!connection.token) {
		preparedUrl += "&connectionToken=" + encodeURIComponent(connection.token);
	}

	if (!!connection.data) {
		preparedUrl += "&connectionData=" + encodeURIComponent(connection.data);
	}

	return preparedUrl;
}