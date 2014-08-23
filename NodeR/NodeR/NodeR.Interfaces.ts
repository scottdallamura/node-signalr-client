var Q = require("q");
import http = require("http");

export interface HttpResponse {
	response?: http.ClientResponse;
	content?: string;
}
