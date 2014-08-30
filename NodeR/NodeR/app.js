var SignalRClient = require("./SignalR.Client");
var SignalRHelpers = require("./SignalR.Helpers");
var WebSocketTransport = require("./SignalR.Transports.WebSockets");

console.log('Hello world');

var _name;
var signalRClient = new SignalRClient.SignalRClient([WebSocketTransport.WebSocketsTransport]);

function getName() {
    return SignalRHelpers.getConsoleInput("Enter your name: ");
}

getName().then(function (name) {
    console.log("your name is " + name);
    _name = name;
    
    var connectionData = {
        name: "chathub"
    };

    return signalRClient.start("http://localhost:51554", connectionData);
}).then(function (result) {
    console.log(result);
    
    var hub = signalRClient.createHub("chatHub");
    
    hub.addListener("broadcastMessage", function (args) {
        console.log(args);
    });

    return hub.invoke("send", [_name, "test"]);
}).then(function (result) {
    console.log(result);
}).catch(function (err) {
    console.log(err);
});
