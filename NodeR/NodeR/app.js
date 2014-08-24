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

    return nodeRClient.start("http://localhost:51554");
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

/*NodeR.test(500).then(function (response) {
    console.log(response);
});*/