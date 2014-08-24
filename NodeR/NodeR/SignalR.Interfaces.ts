import url = require("url");

export class TransportEvents {
	public static OnStart: string = "onStart";
	public static OnStarting: string = "onStarting";
	public static OnReceived: string = "onReceived";
	public static OnError: string = "onError";
	public static OnConnectionSlow: string = "onConnectionSlow";
	public static OnReconnecting: string = "onReconnecting";
	public static OnReconnect: string = "onReconnect";
	public static OnStateChanged: string = "onStateChanged";
	public static OnDisconnect: string = "onDisconnect";
}

export interface NegotiateResponse {
	ConnectionId?: string;
	ConnectionToken?: string;
	DisconnectTimeout?: number;
	KeepAliveTimeout?: number;
	LongPollDelay?: number;
	ProtocolVersion?: string;
	TransportConnectTimeout?: number;
	TryWebSockets?: boolean;
	Url?: string;
}

export interface Connection {
	connectionUrl: url.Url;
	appRelativeUrl?: string;
	groupsToken?: string;
	messageId?: string;
	clientProtocol?: string;
	queryString?: string;
	token?: string;
	data?: string;
	lastMessageAt?: number;
}

export interface Transport extends NodeJS.EventEmitter {
	name: string;

	isSupported(negotiateResponse: NegotiateResponse): boolean;
	send(connection: Connection, data: any);
	start(connection: Connection, reconnecting?: boolean): Q.Promise<any>;
	stop(): void;
}

export interface MinifiedHubInvocation {
	H: string;
	M: string;
	A: any[];
	I: number;
}

export interface MinifiedClientHubInvocation {
	H: string;
	M: string;
	A: any[];
	S: any;
}

export interface ClientHubInvocation {
	Hub: string;
	Method: string;
	Args: any[];
	State: any;
}

export interface MinifiedHubResponse {
	S: string;
	R: any;
	P: {
		I: number;
		D: string;
	};
	I: number;
	H: boolean;
	E: string;
	T: string;
	D: string;
}

export interface HubResponse {
	State: string;
	Result: any;
	Progress: {
		Id: number;
		Data: string;
	};
	Id: number;
	IsHubException: boolean;
	Error: string;
	StackTrace: string;
	ErrorData: string;
}

export interface MinifiedPersistentResponse {
	C: string;
	M: any[];
	S: boolean;
	D: boolean;
	T: boolean;
	L: number;
	G: string;
}

export interface PersistentResponse {
	MessageId: string;
	Messages: any[];
	Initialized: boolean;
	Disconnect: boolean;
	ShouldReconnect: boolean;
	LongPollDelay: number;
	GroupsToken: string;
}

export interface HubConnection {
	getInvocationCallbackId(): number;
	log(message: string): void;
	sendWithCallback(data: any, invocationCallbackId: number, callback: (minified: MinifiedHubResponse) => void): boolean;
}