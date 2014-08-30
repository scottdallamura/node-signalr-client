var Q = require("q");
import events = require("events");
import SignalRInterfaces = require("./SignalR.Interfaces");
import SignalRErrors = require("./SignalR.Errors");
import SignalRHelpers = require("./SignalR.Helpers");
import SignalRProtocol = require("./SignalR.Protocol");

/**
 * Represents a SignalR hub.
 */
export class SignalRHub extends events.EventEmitter {
	/**
     * The name of the hub.
	 */
	public name: string;

	/**
	 * Hub state that will be included with each method call.
	 */
	public state: any = {};

	private _hubConnection: SignalRInterfaces.HubConnection;

	/**
	 * Create a new hub.
	 * @param name The hub name
	 * @param hubConnection The connection
	 */
	constructor(name: string, hubConnection: SignalRInterfaces.HubConnection) {
		super();

		this.name = name;
		this._hubConnection = hubConnection;
	}

	/**
	 * Invokes a method against the hub.
	 * @param method The method name
	 * @param args The method arguments
	 */
	public invoke(method: string, args: any): Q.Promise<any> {
		var deferred: Q.Deferred<any> = Q.defer();

		// the callback method will be invoked when a response is received by the server
		var callbackMethod = (minifiedResult: SignalRInterfaces.MinifiedServerHubResponse) => {
			var result: SignalRInterfaces.ServerHubResponse = SignalRProtocol.expandServerHubResponse(minifiedResult);

			SignalRHelpers.extendState(this.state, result.State);

			if (!!result.Progress) {
				// notify progress
				deferred.notify(result.Progress.Data);
			}
			else if (!!result.Error) {
				if (!!result.StackTrace) {
					this._hubConnection.logger.error(result.Error + "\n" + result.StackTrace + ".");
				}

				var error: Error = SignalRErrors.createError(result.Error, result.IsHubException ? "HubException" : "Exception", this);
				this._hubConnection.logger.error(this.name + "." + method + " failed to execute. Error: " + error.message);

				deferred.reject(error);
			}
			else {
				// success
				this._hubConnection.logger.debug("Invoked " + this.name + "." + method);

				deferred.resolve(result.Result);
			}
		};

		// the invocationCallbackId maps the response to the callback
		var invocationCallbackId: number = this._hubConnection.getInvocationCallbackId();
		var data: SignalRInterfaces.MinifiedServerHubInvocation = {
			H: this.name,
			M: method,
			A: args,
			I: invocationCallbackId
		};

		// append state
		if (!SignalRHelpers.isEmptyObject(this.state)) {
			data.S = this.state;
		}

		// send the message
		if (!this._hubConnection.sendWithCallback(data, callbackMethod)) {
			deferred.reject(SignalRErrors.createError(SignalRErrors.Messages.NotConnected, null, this));
		}

		return deferred.promise;
	}
}