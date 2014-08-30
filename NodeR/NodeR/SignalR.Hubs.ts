var Q = require("q");
import events = require("events");
import SignalRInterfaces = require("./SignalR.Interfaces");
import SignalRErrors = require("./SignalR.Errors");
import SignalRHelpers = require("./SignalR.Helpers");

export class SignalRHub extends events.EventEmitter {
	public name: string;
	public state: any = {};

	private _hubConnection: SignalRInterfaces.HubConnection;

	constructor(name: string, hubConnection: SignalRInterfaces.HubConnection) {
		super();

		this.name = name;
		this._hubConnection = hubConnection;
	}

	public invoke(method: string, args: any): Q.Promise<any> {
		var deferred: Q.Deferred<any> = Q.defer();

		var invocationCallbackId: number = this._hubConnection.getInvocationCallbackId();
		var data: SignalRInterfaces.MinifiedHubInvocation = {
			H: this.name,
			M: method,
			A: args,
			I: invocationCallbackId
		};

		var callbackMethod = (minifiedResult: SignalRInterfaces.MinifiedHubResponse) => {
			var result: SignalRInterfaces.HubResponse = SignalRHelpers.expandHubResponse(minifiedResult);

			SignalRHelpers.extendState(this.state, result.State);

			if (!!result.Progress) {
				// notify progress
				deferred.notify(result.Progress.Data);
			}
			else if (!!result.Error) {
				if (!!result.StackTrace) {
					this._hubConnection.log(result.Error + "\n" + result.StackTrace + ".");
				}

				var error: Error = SignalRErrors.createError(result.Error, result.IsHubException ? "HubException" : "Exception", this);
				this._hubConnection.log(this.name + "." + method + " failed to execute. Error: " + error.message);

				deferred.reject(error);
			}
			else {
				// success
				this._hubConnection.log("Invoked " + this.name + "." + method);

				deferred.resolve(result.Result);
			}
		};

		if (!this._hubConnection.sendWithCallback(data, invocationCallbackId, callbackMethod)) {
			deferred.reject(SignalRErrors.createError(SignalRErrors.Messages.NotConnected, null, this));
		}

		return deferred.promise;
	}
}