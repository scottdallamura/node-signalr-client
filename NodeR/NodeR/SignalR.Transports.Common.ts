var Q = require("q");
import events = require("events");
import SignalRInterfaces = require("./SignalR.Interfaces");
import SignalRHelpers = require("./SignalR.Helpers");
import SignalRErrors = require("./SignalR.Errors");

export class TransportBase extends events.EventEmitter {
	public name: string;

	constructor(name: string) {
		super();

		this.name = name;
	}

	public reconnect(connection: SignalRInterfaces.Connection) {
		if (connection.isConnectedOrReconnecting()) {
			if (connection.verifyLastActive()) {
				connection.setReconnectTimer();
			}
		}
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

	public processMessages(connection: SignalRInterfaces.Connection, data: SignalRInterfaces.MinifiedPersistentResponse) {
		connection.markLastMessage();

		if (!!data) {
			var persistentResponse: SignalRInterfaces.PersistentResponse = SignalRHelpers.expandPersistentResponse(data);

			connection.updateGroups(persistentResponse.GroupsToken);

			if (!!persistentResponse.MessageId) {
				connection.messageId = persistentResponse.MessageId;
			}

			if (!!persistentResponse.Messages) {
				for (var i = 0; i < persistentResponse.Messages.length; i++) {
					this.emit(SignalRInterfaces.TransportEvents.OnReceived, persistentResponse.Messages[i]);
				}
			}
		}
	}

	public abort(connection: SignalRInterfaces.Connection): Q.Promise<any> {
		var abortUrl: string = connection.baseUrl + "/abort?transport=" + this.name;
		abortUrl = prepareQueryString(connection, abortUrl);

		var deferred: Q.Deferred<any> = Q.defer();
		SignalRHelpers.createPostRequest(abortUrl, deferred);
		return deferred.promise;
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