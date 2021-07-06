
module.exports = function(RED) {
    var request = require("request");
    var platformConfig = require('./config/onesait-platform-config');
  
    
    function InvokeRestApiOperation(n) {
        RED.nodes.createNode(this,n);
        var node = this;
        var restApiName = n.restApiName;
        var restApiVersion = n.restApiVersion;
        var restApiOperationName = n.restApiOperationName;
        var restApiOperationMethod = n.restApiOperationMethod;
        var opsList = JSON.parse(n.restApiOperationsLoaded);
        var outputs = n.outputs;
        var inputs = n.operationInputs;


        this.on('input', function(msg) {
            //
            node.status({fill:"blue",shape:"dot",text:"httpin.status.requesting"});

            var endpoint = platformConfig.scriptBasePath + "/flowengine/node/services/user/invoke_rest_api_operation";
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
                var skipParam = false;
                if(element.type == "str"){
                    //the given value as a string
                    paramValue.value = element.value;
                } else if(element.type =='DoNotSend'){
                    //Do nothing with the param
                    skipParam = true;
                    console.log("Discarded operation param as is optional and was marked as 'DoNotSend'. API: "+restApiName+" - V"+restApiVersion+" Operation: "+restApiOperationName+"Param: "+element.value);
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
                            if(element.required){
                                var errorMsg = "msg."+element.value+" does not exist in message. Please check '"+paramValue.name+"' input param definition.";
                                node.error(errorMsg);
                                node.status({fill:"red", shape:"ring", text:"Please check '"+paramValue.name+"' input param definition."});
                                errorOnValueRetrieval=true;
                                msg.payload={error:true, msg:errorMsg};
                                msgToSend[outputs -1 ] = msg;
                                node.send(msgToSend);
                                break;
                            } else {
                                skipParam = true;
                                console.log("Discarded operation param as is optional and 'undefined' value was assigned. API: "+restApiName+" - V"+restApiVersion+" Operation: "+restApiOperationName+"Param: "+element.value);
                            }
                        }
                    }
                    if(typeof finalValue != 'string'){
                        paramValue.value = JSON.stringify(finalValue);
                    } else {
                        paramValue.value = finalValue;
                    }
                }
                if(!skipParam){
                    inputParamValues.push(paramValue);
                }
            });
            //Do not continue if param values are wrong
            if(errorOnValueRetrieval) return;
            var body = JSON.stringify({ "apiName": restApiName, "apiVersion":restApiVersion, "operationName": restApiOperationName, "operationMethod":restApiOperationMethod, "operationInputParams":inputParamValues, "domainName": process.env.domain});

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
                        node.status({fill:"red", shape:"ring", text:"Body response was not a JSON."});
                        node.warn(RED._("httpin.errors.json-error")); 
                    }
                    opsList.forEach(function(operation) {
                        var outputFoud = false;
                        if(operation.name == restApiOperationName){
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
                    node.status({});
                    node.send(msgToSend);
                }
            });

        });
        
         
    }
     RED.nodes.registerType("onesaitplatform-Rest-API-invoker",InvokeRestApiOperation);

}
