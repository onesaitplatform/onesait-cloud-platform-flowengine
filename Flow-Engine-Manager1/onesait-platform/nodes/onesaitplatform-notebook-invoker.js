
module.exports = function(RED) {
    "use strict";
	// require sofia2 properties
	var onesaitPlatformConfig = require('./config/onesait-platform-config.js');
    // require any external libraries we may need....
	var zeppelinProtocol = onesaitPlatformConfig.zeppelinProtocol;
	var zeppelinHost = onesaitPlatformConfig.zeppelinHost;
	var zeppelinPort = onesaitPlatformConfig.zeppelinPort;
	var zeppelinPath = onesaitPlatformConfig.zeppelinPath;
	/*if(zeppelinProtocol=="https"){
		var http = require("https");
	}
	else{
		var http = require("http");
	}*/

    var request = require("request");

	function getAuthHeader(){
		return 'Basic ' + new Buffer(sofia2Config.usernameRestZeppelin + ':' + sofia2Config.passwordRestZeppelin).toString('base64');
	}

	 // The main node definition - most things happen in here
    function Notebook(n) {
        // Create a RED node
        RED.nodes.createNode(this,n);

        var node = this;

        var queueExecution = [];
		var runnningExecution = false;
		var notebookID_Base=n.notebook;
		var notebookname=n.notebookname;
		var modeWorkflow=n.workflow;
		var outputparameters = n.outputparameters;
		var paragraphSelector = n.nodeparagraphform;
		var fullexecutionnotebook = n.fullexecutionnotebook;
		var timeout = n.timeoutnotebook*1000;
		var enableoutputs = n.enableoutputs;
		var splitoutputs = n.splitoutputs;
		var executionParams = n.nodeparameters;

		var runNotebookPath = "/flowengine/node/services/user/notebooks/run"   

		/**************************
		// FUNCTIONS
		**************************/

		function runNotebook(msg){
			// Set timeout 
			/* var maxTimeout = 300000;
            if (RED.settings.httpRequestTimeout) { 
               maxTimeout = parseInt(RED.settings.httpRequestTimeout) || 15000; 
            }

            var reqTimeout = parseInt(timeout,10);
            if (reqTimeout == null || reqTimeout > maxTimeout){
                reqTimeout = maxTimeout;
            }*/
			runnningExecution = true;
			// Prepare Notebook info, mode and params

			var opts = {};
            opts.url = onesaitPlatformConfig.scriptBasePath + runNotebookPath ;
            opts.timeout = timeout;
            opts.method = 'POST';
            opts.headers = { "Content-type": "application/json; charset=utf-8;",
                            "Accept": "application/json",
                            "Accept-Charset": "utf-8" 
                        };
            opts.encoding = null;  // Force NodeJs to return a Buffer (instead of a string)
            opts.maxRedirects = 21;
            var requestData = {};
            requestData.notebookId = notebookID_Base;
            requestData.paragraphId = paragraphSelector;
            requestData.executeNotebook = fullexecutionnotebook;
            requestData.domainName = process.env.domain;
            requestData.verticalSchema = process.env.vertical;
            //Prepare execution params
            var execParamsReadyToSend = {"name":"new note","params":{}};
            var execParamsToObject  = JSON.parse(executionParams);
            Object.keys(execParamsToObject).forEach(function(i){
			    if(Object.keys(execParamsToObject[i]).includes('type')){
			    	var paramValue = execParamsToObject[i].value;
			    	//CHeck type of each param (str,date,bool,num,date, msg,flow,global)
			    	if (execParamsToObject[i]['type'] == "msg"){
			    		//MSG
			    		//Check all queued msg if workfloew mode is enabled
			    		var paramFromMsg = JSON.stringify(RED.util.evaluateNodeProperty(execParamsToObject[i].value,execParamsToObject[i].type,node,node.data[0][0]));
			    		execParamsReadyToSend.params[i] = paramFromMsg;
			    	} else if (execParamsToObject[i]['type'] == "flow"){
			    		// Flow var
			    		execParamsReadyToSend.params[i]=node.context().flow.get(execParamsToObject[i].value);
			    	}else if(execParamsToObject[i]['type'] == "global"){
			    		// Global and Flow variables
			    		execParamsReadyToSend.params[i]=node.context().global.get(execParamsToObject[i].value);
			    	} else if (execParamsToObject[i]['type'] == "date"){
			    		// date
			    		execParamsReadyToSend.params[i] =  Date.now();
			    	} else {
			    		// str, date, bool, num
			    		execParamsReadyToSend.params[i] = paramValue;
			    	}
			        
			    }

			});

            requestData.executionParams = JSON.stringify(execParamsReadyToSend);

            var outputParams = JSON.parse(outputparameters);
            requestData.outputParagraphs = outputParams;
            opts.body=JSON.stringify(requestData);

			// Run execution
			request(opts, function(err, res, body) {
                if(err){
                	msg.payload="error";
                    //console.log("timestamp: ",new Date().getTime(), ", domain: ", process.env.domain, ", nodeId: ", n.id, ", msgid: ", msg._msgid, ", operation: Notebook Launcher, message: ", err);
					var logMsg={
						"msgid":msg._msgid,
						"message": err
					}
					node.log(logMsg);
                    node.send(msg);
                }else{
                	var results = JSON.parse(body.toString());
                	if(fullexecutionnotebook) {
	                	//For each output, serach the result
	                	for(var outputNum=0;outputNum<outputParams.length;outputNum++){
	                		var totalOutputResults  = new Array(outputParams.length).fill(null);
	                		var singleResult = null;
		                	for(var i=0;i<results.length;i++){
		                		var dataForParagraph = JSON.parse(results[i]);
		                		if(outputParams[outputNum].paragraph == dataForParagraph.body.id){
		                			singleResult = dataForParagraph;
		                		}
		                	}

		                	msg.payload = singleResult;
		                	totalOutputResults[outputNum] = Object.assign({}, msg);
	                		node.send(totalOutputResults);
	                	}
                	} else {
                		//Just paragraph execution, no multiple responses
                		msg.payload = results;
                		node.send(msg);
                	}
                	
                }
            });
			//Repeat until queue is empty

			if(queueExecution.length != 0){
				var message = queueExecution.shift();
				runNoteebook(message);
			} else {
				runnningExecution = false;
			}
		}

		//Se inician los triggers
		node.warn("Recovering triggers of " + this.id);
		var notebookTriggers = node.context().flow.get('notebookTriggers');
		var lastDeployTime = node.context().flow.get('lastDeployTime')||0;
		var date = new Date();
		if(!notebookTriggers || date.getTime()-lastDeployTime>5000){
			var notebookTriggers={}
		}
		if(this.wires.length>0 && this.wires[0].length>0){
			for(var i=0;i<this.wires[0].length;i++){
				if(this.wires[0][i] in notebookTriggers){
					notebookTriggers[this.wires[0][i]]++;
				}
				else{
					notebookTriggers[this.wires[0][i]]=1;
				}
			}
			node.context().flow.set("notebookTriggers",notebookTriggers);
			node.context().flow.set('lastDeployTime',date.getTime());
		}
		node.warn("Recovered " + JSON.stringify(notebookTriggers) + " triggers for node: "+ this.id);
		node.nTriggers=0;
		node.data=[];
		node.msgs=[];
	    this.on('input', function (msg) {
	    	if(modeWorkflow){
				var totalTriggers = ((node.context().flow.get("notebookTriggers")&&node.context().flow.get("notebookTriggers")[node.id])?node.context().flow.get("notebookTriggers")[node.id]:1);
				node.nTriggers++;
				node.msgs.push(msg);
				node.warn("Triggers " + node.nTriggers + " of " + (totalTriggers));
			}
			if(!modeWorkflow || node.nTriggers>=totalTriggers){
				node.data=[];
				node.data.push(node.msgs);
				node.nTriggers=0;
				node.msgs=[];
				if(!runnningExecution){
					runnningExecution=true;
					runNotebook(msg);
				}
				else{
					queueExecution.push(msg);
				}
			}
	    });
		
		this.on("close", function() {
		        
		});

    }

	RED.nodes.registerType("Notebook Launcher",Notebook);

}
