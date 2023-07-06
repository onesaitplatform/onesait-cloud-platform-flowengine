
module.exports = function(RED) {
    var Client = require('node-rest-client').Client;
    var platformConfig = require('./config/onesait-platform-config');
    var client = new Client();
    
var process = require('process');
    function LoadQuery(n) {
        RED.nodes.createNode(this,n);
        var node = this;
        var ontology = n.ontology;
        
        this.on('input', function(msg) {
            var targetOntology = ontology;
            if(typeof ontology == 'undefined' || ontology == ''){
                targetOntology = msg.ontology;
            }
             var args = {
                requesConfig: { timeout: 5000 },
                responseConfig: { timeout: 5000 },
                data: { "ontology": targetOntology, "data": JSON.stringify(msg.payload), "domainName": process.env.domain, "verticalSchema": process.env.vertical},
                headers: { "Content-Type": "application/json" }
            };
            var endpoint = platformConfig.scriptBasePath + "/flowengine/node/services/user/insert";
            var req = client.post(endpoint, args,function (data, response) {
                // parsed response body as js object 
                //console.log("timestamp: ",new Date().getTime(), ", domain: ", process.env.domain, ", nodeId: ", n.id, ", msgid: ", msg._msgid, ", operation: onesaitplatform-insert, message: Status code ", response.statusCode);
                var logMsg={
                    "msgid":msg._msgid,
                    "message": "Status code "+ response.statusCode
                }
                node.log(logMsg);
                if(response.statusCode== 200){
                    msg.ok=true;
                }else{
                    msg.ok=false;
                }
                msg.payload=data;
                if (Buffer.isBuffer(msg.payload)){
                    msg.payload = msg.payload.toString();
                }
                node.send(msg);
            });
            req.on('requestTimeout', function (req) {
                msg.ok=false;
                //console.log("timestamp: ",new Date().getTime(), "domain: ", process.env.domain, ", nodeId: ", n.id, ", msgid: ", msg._msgid, ", operation: onesaitplatform-insert, message: Error, request has expired");
                var logMsg={
                    "msgid":msg._msgid,
                    "message": "Error, request has expired"
                }
                node.error(logMsg);
                req.abort();
            });
             
            req.on('responseTimeout', function (res) {
                msg.ok=false;
                //console.log("timestamp: ",new Date().getTime(), "domain: ", process.env.domain, ", nodeId: ", n.id,  ", msgid: ", msg._msgid, ", operation: onesaitplatform-insert, message: Error, response has expired");
                var logMsg={
                    "msgid":msg._msgid,
                    "message": "Error, request has expired"
                }
                node.error(logMsg);
            });
        });
        
         
    }
     RED.nodes.registerType("onesaitplatform-insert",LoadQuery);

}
