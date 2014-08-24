import events = require("events");
import SignalRInterfaces = require("./SignalR.Interfaces");
import NodeRHelpers = require("./NodeR.Helpers");

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

	public markLastMessage(connection: SignalRInterfaces.Connection) {
		connection.lastMessageAt = new Date().getTime();
	}

	public updateGroups(connection: SignalRInterfaces.Connection, groupsToken: string) {
		if (!!groupsToken) {
			connection.groupsToken = groupsToken;
		}
	}

	public processMessages(connection: SignalRInterfaces.Connection, data: SignalRInterfaces.MinifiedPersistentResponse) {
		this.markLastMessage(connection);

		if (!!data) {
			var persistentResponse: SignalRInterfaces.PersistentResponse = NodeRHelpers.expandPersistentResponse(data);

			this.updateGroups(connection, persistentResponse.GroupsToken);

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