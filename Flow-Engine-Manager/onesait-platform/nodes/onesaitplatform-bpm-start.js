module.exports = function(RED) {
     var Client = require('node-rest-client').Client;
    var platformConfig = require('./config/onesait-platform-config');
    var client = new Client();
    
    function StartBPMProcess(n) {
        RED.nodes.createNode(this, n);
        var node = this;
        var bpmProcessName = n.bpmProcessName;
        var bpmProcessInputId = n.bpmProcessInputId;
        var input = n.bpmProcessInputId;
        var messageContent = n.bpmProcessMessage;
        var messageType = n.bpmProcessMessageType;
        var inputsLoaded = n.bpmProcessInputsLoaded

        this.on('input', function(msg) {
            //get value of message
            var finalMessage = "";
            var finalMessageName = bpmProcessInputId;


            if(bpmProcessInputId != null && bpmProcessInputId != ""){
                //input selection
                var hasMessage = false;
                var listOfInputs = JSON.parse(inputsLoaded);
                console.log(inputsLoaded);
                for (var i=0;i<listOfInputs.length;i++){
                    if(listOfInputs[i].id == bpmProcessInputId){
                        finalMessageName = listOfInputs[i].name;
                        //there are inputs with no message, this are the ones with null name
                        hasMessage = (listOfInputs[i].name != null);
                    }
                }

                if (hasMessage){
                    if (messageType == "str"){
                        finalMessage = messageContent;
                    } else {
                        var translatedElementValue = messageContent.replace("[",".").replace("]","");
                            var fieldComposition = translatedElementValue.split(".");
                            var finalValue = msg;
                            for(var i=0;i<fieldComposition.length;i=i+1){
                                if(typeof finalValue[fieldComposition[i]] !== "undefined") {
                                    // obj is a valid variable, do something here.
                                    finalValue = finalValue[fieldComposition[i]];
                                } else {
                                    var errorMsg = "msg."+messageContent+" does not exist in message. Please check 'Input Message' input field definition.";
                                    node.error(errorMsg);
                                    node.status({fill:"red", shape:"ring", text:"Please check 'Input Message' input field definition."});
                                    errorOnValueRetrieval=true;
                                    msg.payload={error:true, msg:errorMsg};
                                    //msgToSend[outputs -1 ] = msg;
                                    node.send(msg);
                                    break;
                                }
                            }
                            if(typeof finalValue != 'string'){
                                finalMessage = JSON.stringify(finalValue);
                            } else {
                                finalMessage = finalValue;
                            }
                    }
                }

            }

            var args = {
                requesConfig: { timeout: 5000 },
                responseConfig: { timeout: 5000 },
                data: { "bpmProcessInputName": finalMessageName,"bpmProcessId":bpmProcessName, "data": finalMessage, "domainName": process.env.domain, "verticalSchema": process.env.vertical},
                headers: { "Content-Type": "application/json" }
            };

            var endpoint = platformConfig.scriptBasePath + "/flowengine/node/services/user/bpm/start";

            var req = client.post(endpoint, args,function (data, response) {
                
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
    RED.nodes.registerType("Start BPM", StartBPMProcess);
}
