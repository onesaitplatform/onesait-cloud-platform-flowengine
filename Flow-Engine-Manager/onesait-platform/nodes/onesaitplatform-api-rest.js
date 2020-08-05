
module.exports = function(RED) {

    var Client = require('node-rest-client').Client;
    var platformConfig = require('./config/onesait-platform-config');
    
    function NoOp(n) {
        RED.nodes.createNode(this,n);    
    }

    RED.nodes.registerType("onesaitplatform api rest",NoOp);

}
