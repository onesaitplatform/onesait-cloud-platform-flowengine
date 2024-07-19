
module.exports = function (RED) {
    var Client = require('node-rest-client').Client;
    var platformConfig = require('./config/onesait-platform-config');
    var client = new Client();

    function StartDataflow(n) {
        RED.nodes.createNode(this, n);
        var node = this;
        var dataflowIdentification = n.dataflowIdentification;
        var parametersInputs = n.parameterInputs;
        var resetOrigin = n.resetOrigin;

        this.on('input', function (msg) {
            var targetDataflowIdentification = msg.dataflowIdentification || dataflowIdentification;
            var parameters = {};
            for (var i = 0; i < parametersInputs.length; i++) {
                var input = parametersInputs[i];
                parameters[input.param] = input.type === "msg" ? msg[input.value] : input.value;
            }
            var finalParameters = JSON.stringify(parameters);
            if (typeof msg.parameters !== 'undefined' && msg.parameters !== null) {
                if (typeof msg.parameters === 'string') {
                    finalParameters = msg.parameters;
                } else {
                    finalParameters = JSON.stringify(msg.parameters);
                }
            }
            var finalResetOrigin = resetOrigin !== undefined ? resetOrigin : msg.resetOrigin;

            var args = {
                requesConfig: { timeout: 5000 },
                responseConfig: { timeout: 5000 },
                data: { "dataflowIdentification": targetDataflowIdentification, "domainName": process.env.domain, "parameters": finalParameters, "resetOrigin": finalResetOrigin, "verticalSchema": process.env.vertical },
                headers: { "Content-Type": "application/json" }
            };
            var endpoint = platformConfig.scriptBasePath + "/flowengine/node/services/user/dataflow/start";
            var req = client.post(endpoint, args, function (data, response) {
                // parsed response body as js object 
                //console.log("timestamp: ",new Date().getTime(), ", domain: ", process.env.domain, ", nodeId: ", n.id, ", msgid: ", msg._msgid, ", operation: Start Dataflow, message: Status code ", response.statusCode);
                var logMsg = {
                    "msgid": msg._msgid,
                    "message": "Status code " + response.statusCode
                }
                node.log(logMsg);
                if (response.statusCode == 200) {
                    msg.ok = true;
                    msg.payload = data;
                } else if (response.statusCode == 403 || response.statusCode == 404) {
                    msg.ok = false;
                    msg.payload = data.toString();
                } else {
                    msg.ok = false;
                    msg.payload = { "error": "Error starting dataflow. Is it already running?. Please check its status before starting dataflow." };
                }

                node.send(msg);
            });
            req.on('requestTimeout', function (req) {
                msg.ok = false;
                //console.log("timestamp: ",new Date().getTime(), "domain: ", process.env.domain, ", nodeId: ", n.id, ", msgid: ", msg._msgid, ", operation: Start Dataflow, message: Error, request has expired");
                var logMsg = {
                    "msgid": msg._msgid,
                    "message": "Error, request has expired"
                }
                node.error(logMsg);
                req.abort();
            });

            req.on('responseTimeout', function (res) {
                msg.ok = false;
                //console.log("timestamp: ",new Date().getTime(), "domain: ", process.env.domain, ", nodeId: ", n.id, ", msgid: ", msg._msgid, ", operation: Start Dataflow, message: Error, response has expired");
                var logMsg = {
                    "msgid": msg._msgid,
                    "message": "Error, request has expired"
                }
                node.error(logMsg);
            });
        });


    }
    RED.nodes.registerType("Start Dataflow", StartDataflow);

}
