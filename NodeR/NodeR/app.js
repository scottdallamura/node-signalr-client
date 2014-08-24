var NodeR = require("./NodeR");
var NodeRHelpers = require("./NodeR.Helpers");
var WebSocketTransport = require("./SignalR.Transports.WebSockets");

console.log('Hello world');

var _name;
var nodeRClient = new NodeR.NodeRClient([new WebSocketTransport.WebSocketsTransport()]);

function getName() {
    return NodeRHelpers.getConsoleInput("Enter your name: ");
}

getName().then(function (name) {
    console.log("your name is " + name);
    _name = name;
    
    var connectionData = {
        name: "chathub"
    };

    return nodeRClient.start("http://localhost:51554", connectionData);
}).then(function (result) {
    console.log(result);
    
    var hub = nodeRClient.createHub("chatHub");
    
    hub.addListener("broadcastMessage", function (args) {
        console.log(args);
    });

    return hub.invoke("send", [_name, "test"]);
}).then(function (result) {
    console.log(result);
}).catch(function (err) {
    console.log(err);
});
