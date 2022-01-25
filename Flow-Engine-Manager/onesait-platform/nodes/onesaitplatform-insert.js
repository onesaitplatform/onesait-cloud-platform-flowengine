
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
                data: { "ontology": targetOntology, "data": JSON.stringify(msg.payload), "domainName": process.env.domain},
                headers: { "Content-Type": "application/json" }
            };
            var endpoint = platformConfig.scriptBasePath + "/flowengine/node/services/user/insert";
            var req = client.post(endpoint, args,function (data, response) {
                // parsed response body as js object 
                console.log("statusCode: ", response.statusCode);
                if(response.statusCode== 200){
                    msg.ok=true;
                }else{
                    msg.ok=false;
                }
                msg.payload=data;
                node.send(msg);
            });
            req.on('requestTimeout', function (req) {
                msg.ok=false;
                console.log("request has expired");
                req.abort();
            });
             
            req.on('responseTimeout', function (res) {
                msg.ok=false;
                console.log("response has expired");
            });
        });
        
         
    }
     RED.nodes.registerType("onesaitplatform-insert",LoadQuery);

}