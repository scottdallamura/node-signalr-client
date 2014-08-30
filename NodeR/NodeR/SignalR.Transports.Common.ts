var Q = require("q");
import events = require("events");
import SignalRInterfaces = require("./SignalR.Interfaces");
import SignalRHelpers = require("./SignalR.Helpers");
import SignalRErrors = require("./SignalR.Errors");
import SignalRProtocol = require("./SignalR.Protocol");

/**
 * A base class for SignalR transports.
 */
export class TransportBase extends events.EventEmitter {
	public _signalRConnection: SignalRInterfaces.Connection;

	/**
	 * The name of the transport.
	 */
	public name: string;

	/**
	 * Create a new instance of the transport.
	 * @param name The name of the transport
	 */
	constructor(name: string) {
		super();

		this.name = name;
	}

	/**
	 * Initiates the reconnection process.
	 * @param connection The SignalR connection
	 */
	public reconnect(connection: SignalRInterfaces.Connection) {
		if (connection.isConnectedOrReconnecting()) {
			if (connection.verifyLastActive()) {
				connection.setReconnectTimer();
			}
		}
	}

	/**
	 * Processes messages received from the server.
	 * @param connection The SignalR connection
	 * @param data The data received from the server
	 * @param onInitialized A method that will be invoked when the server sends a message with the Initialized flag set
	 */
	public processMessages(connection: SignalRInterfaces.Connection, data: SignalRInterfaces.MinifiedSignalRMessage, onInitialized: () => void) {
		connection.markLastMessage();

		if (!!data) {
			var persistentResponse: SignalRInterfaces.SignalRMessage = SignalRProtocol.expandSignalRMessage(data);

			connection.updateGroups(persistentResponse.GroupsToken);

			if (!!persistentResponse.MessageId) {
				connection.messageId = persistentResponse.MessageId;
			}

			if (!!persistentResponse.Messages) {
				for (var i = 0; i < persistentResponse.Messages.length; i++) {
					this.emit(SignalRInterfaces.TransportEvents.OnReceived, persistentResponse.Messages[i]);
				}

				// handle the Initialized flag
				if (persistentResponse.Initialized && !!onInitialized) {
					onInitialized();
				}
			}
		}
	}

	/**
	 * Aborts the connection.
	 */
	public abort(): Q.Promise<any> {
		if (!!this._signalRConnection) {
			var abortUrl: string = this._signalRConnection.baseUrl + "/abort?transport=" + this.name;
			abortUrl = this._signalRConnection.prepareQueryString(abortUrl);

			var deferred: Q.Deferred<any> = Q.defer();
			SignalRHelpers.createPostRequest(abortUrl, deferred);
			return deferred.promise;
		}
		else {
			return Q.resolve(null);
		}
	}
}