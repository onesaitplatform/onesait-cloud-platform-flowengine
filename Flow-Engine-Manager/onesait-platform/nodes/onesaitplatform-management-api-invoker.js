
module.exports = function(RED) {
    var request = require("request");
    var platformConfig = require('./config/onesait-platform-config');
  
    
    function InvokeManagementRestApiOperation(n) {
        RED.nodes.createNode(this,n);
        var node = this;
        var managementRestApiName = n.managementRestApiName;
        var managementRestApiVersion = n.managementRestApiVersion;
        var managementRestApiOperationName = n.managementRestApiOperationName;
        var managementRestApiOperationMethod = n.managementRestApiOperationMethod;
        var opsList = JSON.parse(n.managementRestApiOperationsLoaded);
        var outputs = n.outputs;
        var inputs = n.managementOperationInputs;


        this.on('input', function(msg) {
            //
            node.status({fill:"blue",shape:"dot",text:"httpin.status.requesting"});

            var endpoint = platformConfig.scriptBasePath + "/flowengine/node/services/user/management/invoke_rest_api_operation";
            var msgToSend = new Array();

            this.ret = n.ret || "txt";
            var maxTimeout = 15000;
            if (RED.settings.httpRequestTimeout) { 
               maxTimeout = parseInt(RED.settings.httpRequestTimeout) || 15000; 
            }

            var reqTimeout = parseInt(n.timeoutMillis,10);
            if (reqTimeout == null || reqTimeout > maxTimeout){
                reqTimeout = maxTimeout;
            }

            var opts = {};
            opts.url = endpoint;
            opts.timeout = reqTimeout;
            opts.method = 'POST';
            opts.headers = { "Content-type": "application/json; charset=utf-8;",
                            "Accept": "application/json",
                            "Accept-Charset": "utf-8" 
                        };
            opts.encoding = null;  // Force NodeJs to return a Buffer (instead of a string)
            opts.maxRedirects = 21;
            //Get ral values for the call
            var inputParamValues = [];
            var errorOnValueRetrieval=false;
            inputs.forEach(function(element){
                var paramValue = {};
                paramValue.name = element.param;
                if(element.type == "str"){
                    //the given value as a string
                    paramValue.value = element.value;
                } else {
                    // the value comes from the previous message
                    //replace array brakets for just the number
                    /*
                    msg.payoad[0]  will be trasnlated to msg.payload.0
                    */
                    var translatedElementValue = element.value.replace("[",".").replace("]","");
                    //var fieldComposition = element.value.split(".");
                    var fieldComposition = translatedElementValue.split(".");
                    var finalValue = msg;
                    for(var i=0;i<fieldComposition.length;i=i+1){
                        if(typeof finalValue[fieldComposition[i]] !== "undefined") {
                            // obj is a valid variable, do something here.
                            finalValue = finalValue[fieldComposition[i]];
                        } else {
                            var errorMsg = "msg."+element.value+" does not exist in message. Please check '"+paramValue.name+"' input param definition.";
                            node.error(errorMsg);
                            node.status({fill:"red", shape:"ring", text:"Please check '"+paramValue.name+"' input param definition."});
                            errorOnValueRetrieval=true;
                            msg.payload={error:true, msg:errorMsg};
                            msgToSend[outputs -1 ] = msg;
                            node.send(msgToSend);
                            break;
                        }
                    }
                    if(typeof finalValue != 'string'){
                        paramValue.value = JSON.stringify(finalValue);
                    } else {
                        paramValue.value = finalValue;
                    }
                }
                inputParamValues.push(paramValue);
            });
            //Do not continue if param values are wrong
            if(errorOnValueRetrieval) return;
            var body = JSON.stringify({ "apiName": managementRestApiName, "apiVersion":managementRestApiVersion, "operationName": managementRestApiOperationName, "operationMethod":managementRestApiOperationMethod, "operationInputParams":inputParamValues, "domainName": process.env.domain, "verticalSchema": process.env.vertical});

            opts.body=body;



            request(opts, function(err, res, body) {
                if(err){
                    if(err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
                        node.error(RED._("common.notification.errors.no-response"), msg);
                        node.status({fill:"red", shape:"ring", text:"common.notification.errors.no-response"});
                    }else{
                        node.error(err,msg);
                        node.status({fill:"red", shape:"ring", text:err.code});
                    }
                    //console.log("timestamp: ",new Date().getTime(), ", domain: ", process.env.domain, ", nodeId: ", n.id, ", msgid: ", msg._msgid, ", operation: onesaitplatform-management-Rest-API-invoker, message: ", err.code);
                    var logMsg={
                        "msgid":msg._msgid,
                        "message": err.code
                    }
                    node.error(logMsg);
                    msg.payload = err.toString() + " : " + endpoint;
                    msg.statusCode = err.code;
                    msg.ok=false;
                    msgToSend[outputs -1 ] = msg;
                    node.send(msgToSend);
                }else{
                    msg.statusCode = res.statusCode;
                    msg.headers = res.headers;
                    msg.responseUrl = res.request.uri.href;
                    msg.payload = body;

                    try { msg.payload = JSON.parse(msg.payload); } // obj
                    catch(e) { 
                        if(Buffer.isBuffer(msg.payload)){
                            msg.payload = msg.payload.toString("UTF-8");
                        }
                        //console.log("timestamp: ",new Date().getTime(), ", domain: ", process.env.domain, ", nodeId: ", n.id, ", msgid: ", msg._msgid, ", operation: onesaitplatform-management-Rest-API-invoker, message: ", "Body response was not a JSON.");
                        var logMsg={
                            "msgid":msg._msgid,
                            "message": "Body response was not a JSON."
                        }
                        node.error(logMsg);
                        node.status({fill:"red", shape:"ring", text:"Body response was not a JSON."});
                        //node.warn(RED._("httpin.errors.json-error")); 
                    }
                    opsList.forEach(function(operation) {
                        var outputFoud = false;
                        if(operation.name == managementRestApiOperationName){
                            var keys = Object.keys(operation.returnMessagesresponseCodes);
                            msgToSend.length = keys.length;
                            //find by statusCode (index of the object of responses)
                            for(var output=0;output<keys.length; output = output +1){
                                if(keys[output] == res.statusCode) {
                                    msgToSend[output] = msg;
                                    outputFoud = true;
                                }
                            }
                            if (!outputFoud){
                                msgToSend[keys.length -1 ] = msg;
                            }
                        }
                    });
                    //console.log("timestamp: ",new Date().getTime(), ", domain: ", process.env.domain, ", nodeId: ", n.id, ", msgid: ", msg._msgid, ", operation: onesaitplatform-management-Rest-API-invoker, message: Status code ", res.statusCode);
                    var logMsg={
                        //"timestamp":new Date().getTime(),
                        "msgid":msg._msgid,
                        "message": "Status code "+ res.statusCode
                    }
                    node.log(logMsg);
                    node.status({});
                    node.send(msgToSend);
                }
            });

        });
        
         
    }
     RED.nodes.registerType("onesaitplatform-management-Rest-API-invoker",InvokeManagementRestApiOperation);

}
