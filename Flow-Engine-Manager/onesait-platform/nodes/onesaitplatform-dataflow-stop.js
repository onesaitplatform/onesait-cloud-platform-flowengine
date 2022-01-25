
module.exports = function(RED) {
    var Client = require('node-rest-client').Client;
    var platformConfig = require('./config/onesait-platform-config');
    var client = new Client();
    
    function StopDataflow(n) {
        RED.nodes.createNode(this,n);
        var node = this;
        var dataflowIdentification = n.dataflowIdentification;
        

        this.on('input', function(msg) {
            var targetDataflowIdentification = dataflowIdentification;
            if((typeof msg.dataflowIdentification != 'undefined' && msg.dataflowIdentification != '') || typeof dataflowIdentification == 'undefined' || dataflowIdentification == ''){
                targetDataflowIdentification = msg.dataflowIdentification;
            }
             var args = {
                requesConfig: { timeout: 5000 },
                responseConfig: { timeout: 5000 },
                data: { "dataflowIdentification": targetDataflowIdentification, "domainName": process.env.domain},
                headers: { "Content-Type": "application/json" }
            };
            var endpoint = platformConfig.scriptBasePath + "/flowengine/node/services/user/dataflow/stop";
            var req = client.post(endpoint, args,function (data, response) {
                // parsed response body as js object 
                console.log("statusCode: ", response.statusCode);
                if(response.statusCode== 200){
                    msg.ok=true;
                    msg.payload=data;
                }else if(response.statusCode == 403 || response.statusCode == 404){
                    msg.ok=false;
                    msg.payload=data;
                }else{
                    msg.ok=false;
                    msg.payload={"error":"Error stopping dataflow. Is it already stopped?. Please check its status before starting dataflow."};
                }
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
     RED.nodes.registerType("Stop Dataflow",StopDataflow);

}