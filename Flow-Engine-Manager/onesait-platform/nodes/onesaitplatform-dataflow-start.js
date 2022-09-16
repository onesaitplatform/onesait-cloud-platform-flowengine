
module.exports = function(RED) {
    var Client = require('node-rest-client').Client;
    var platformConfig = require('./config/onesait-platform-config');
    var client = new Client();
    
    function StartDataflow(n) {
        RED.nodes.createNode(this,n);
        var node = this;
        var dataflowIdentification = n.dataflowIdentification;
        var parametersInputs = n.parameterInputs;
        var resetOrigin = n.resetOrigin;
        


        this.on('input', function(msg) {
            var targetDataflowIdentification = dataflowIdentification;
            if((typeof msg.dataflowIdentification != 'undefined' && msg.dataflowIdentification != '') || typeof dataflowIdentification == 'undefined' || dataflowIdentification == ''){
                targetDataflowIdentification = msg.dataflowIdentification;
            }
            var parameters = {};
            for(var i=0;i<parametersInputs.length;i++){
                if(parametersInputs[i].type == "msg"){
                    parameters[parametersInputs[i].param] = msg[parametersInputs[i].value];
                } else if (parametersInputs[i].type == "str"){
                    parameters[parametersInputs[i].param] = parametersInputs[i].value;
                }
            }
            var finalParameters = JSON.stringify(parameters);
            if(typeof parameters == 'undefined' || parameters == '' || (typeof msg.parameters != 'undefined' && msg.parameters != '')){
                finalParameters = msg.parameters;
            }

            var finalResetOrigin = resetOrigin;
            if(typeof resetOrigin == 'undefined' || (typeof msg.resetOrigin == "boolean")){
                finalResetOrigin = msg.resetOrigin;
            }

             var args = {
                requesConfig: { timeout: 5000 },
                responseConfig: { timeout: 5000 },
                data: { "dataflowIdentification": targetDataflowIdentification, "domainName": process.env.domain, "parameters":finalParameters, "resetOrigin":finalResetOrigin, "verticalSchema": process.env.vertical},
                headers: { "Content-Type": "application/json" }
            };
            var endpoint = platformConfig.scriptBasePath + "/flowengine/node/services/user/dataflow/start";
            var req = client.post(endpoint, args,function (data, response) {
                // parsed response body as js object 
                console.log("timestamp: ",new Date().getTime(), ", domain: ", process.env.domain, ", nodeId: ", n.id, ", msgid: ", msg._msgid, ", operation: Start Dataflow, message: Status code ", response.statusCode);
                if(response.statusCode== 200){
                    msg.ok=true;
                    msg.payload=data;
                }else if(response.statusCode == 403 || response.statusCode == 404){
                    msg.ok=false;
                    msg.payload=data;
                } else {
                    msg.ok=false;
                    msg.payload={"error":"Error starting dataflow. Is it already running?. Please check its status before starting dataflow."};
                }
                
                node.send(msg);
            });
            req.on('requestTimeout', function (req) {
                msg.ok=false;
                console.log("timestamp: ",new Date().getTime(), "domain: ", process.env.domain, ", nodeId: ", n.id, ", msgid: ", msg._msgid, ", operation: Start Dataflow, message: Error, request has expired");
                req.abort();
            });
             
            req.on('responseTimeout', function (res) {
                msg.ok=false;
                console.log("timestamp: ",new Date().getTime(), "domain: ", process.env.domain, ", nodeId: ", n.id, ", msgid: ", msg._msgid, ", operation: Start Dataflow, message: Error, response has expired");
            });
        });
        
         
    }
     RED.nodes.registerType("Start Dataflow",StartDataflow);

}
