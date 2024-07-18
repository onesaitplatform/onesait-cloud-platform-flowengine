
module.exports = function(RED) {
    var Client = require('node-rest-client').Client;
    var platformConfig = require('./config/onesait-platform-config');
    var client = new Client();
    var cron = require("cron");
    
    function GetDataflowStatus(n) {
        RED.nodes.createNode(this,n);
        var node = this;
        var dataflowIdentification = n.dataflowIdentification;
        this.repeat = n.repeat*1000;
        this.crontab = n.crontab;
        this.resetCheckingOnIncomingMsg = n.resetCheckingOnIncomingMsg;
        this.interval_id = null;
        this.cronjob = null;
        this.timeout_interval=null;
        this.dataflowStatusToCheck = n.dataflowStatusToCheck;
        this.timeout = n.timeout*1000;
        this.setTimeout = n.setTimeout;
         if (node.repeat > 2147483) {
            node.error(RED._("inject.errors.toolong", this));
            delete node.repeat;
        }

        node.repeaterSetup = function (msg) {
                node.stopScheduledStatusCheck();
                
          if (this.repeat && !isNaN(this.repeat) && this.repeat > 0 ) {
              
            this.repeat = this.repeat ;
            if (RED.settings.verbose) {
              this.log(RED._("inject.repeat", this));
            }
            this.interval_id = setInterval(function() {
              node.emit("checkStatus", msg);
            }, this.repeat);
            this.status({fill:"yellow",shape:"ring",text:"Waiting for dataflow to get status: "+this.dataflowStatusToCheck});
          } else if (this.crontab  ) {

            if (RED.settings.verbose) {
              this.log(RED._("inject.crontab", this));
            }
            this.cronjob = new cron.CronJob(this.crontab, function() { node.emit("checkStatus", msg); }, null, true);

                        this.status({fill:"yellow",shape:"ring",text:"Waiting for dataflow to get status: "+this.dataflowStatusToCheck});
          } else {
            this.status({fill:"yellow",shape:"ring",text:"Waiting for incoming msg to check status."});
          }
          if(this.setTimeout){
            this.timeout_interval=setInterval(function() {
                node.stopScheduledStatusCheck();
                if(n.resetCheckingOnIncomingMsg){
                                node.status({fill:"green",shape:"ring",text:"Timeout exceeded. Send new msg to schedule status check on status: "+n.dataflowStatusToCheck});
                            } else {
                                node.status({fill:"green",shape:"ring",text:"Timeout exceeded. Re-deploy to start new loop."});
                            }
                  //output msg
                  node.emit("processTimeout", msg); 
            }, this.timeout);
          }
        };

        if(!this.resetCheckingOnIncomingMsg){
            node.repeaterSetup({});
        } else {
            this.status({fill:"yellow",shape:"ring",text:"Waiting for incoming msg to schedule status check on status: "+this.dataflowStatusToCheck});
        }
        this.on('processTimeout',function(msg){
            var statusArray = [];
                if(!Array.isArray(n.dataflowStatusToCheck)){
                    statusArray.push(n.dataflowStatusToCheck);
                }else{
                    statusArray = n.dataflowStatusToCheck;
                }
                var msgArray=[];
                msgArray.length = statusArray.length + 1;
                msgArray[statusArray.length]=msg;
                node.send(msgArray);
        });
        this.on('checkStatus',function(msg){

            var targetDataflowIdentification = dataflowIdentification;
            if((typeof msg.dataflowIdentification != 'undefined' && msg.dataflowIdentification != '') || typeof dataflowIdentification == 'undefined' || dataflowIdentification == ''){
                targetDataflowIdentification = msg.dataflowIdentification;
            }
             var args = {
                requesConfig: { timeout: 5000 },
                responseConfig: { timeout: 5000 },
                data: { "dataflowIdentification": targetDataflowIdentification, "domainName": process.env.domain, "verticalSchema": process.env.vertical},
                headers: { "Content-Type": "application/json" }
            };
            var endpoint = platformConfig.scriptBasePath + "/flowengine/node/services/user/dataflow/status";
            var req = client.post(endpoint, args,function (data, response) {
                // parsed response body as js object 
                //console.log("timestamp: ",new Date().getTime(), ", domain: ", process.env.domain, ", nodeId: ", n.id, ", msgid: ", msg._msgid, ", operation: Check Dataflow Status, message: Status code ", response.statusCode);
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
                if(n.repeat == "" && n.crontab == "" ){
                    //Bypass MODE
                    node.send(msg);
                } else{ 
                    //Status check MODE
                    var statusArray = [];
                    if(!Array.isArray(n.dataflowStatusToCheck)){
                        statusArray.push(n.dataflowStatusToCheck);
                    }else{
                        statusArray = n.dataflowStatusToCheck;
                    }

                    if(statusArray.includes( data.status)){
                        var msgArray = []
                        msgArray.length = statusArray.length ;
                        if(n.setTimeout) {
                            msgArray.length = statusArray.length + 1;
                        }
                        if(n.stopAfterMatch){
                            node.stopScheduledStatusCheck();
                            if(n.resetCheckingOnIncomingMsg){
                                node.status({fill:"green",shape:"ring",text:"Status found. Send new msg to schedule status check on status: "+n.dataflowStatusToCheck});
                            } else {
                                node.status({fill:"green",shape:"ring",text:"Status found. Re-deploy to start new loop."});
                            }
                        }
                        msgArray[statusArray.indexOf( data.status)]=msg;
                        node.send(msgArray);
                    }
                }
            });
            req.on('requestTimeout', function (req) {
                msg.ok=false;
                //console.log("timestamp: ",new Date().getTime(), "domain: ", process.env.domain, ", nodeId: ", n.id, ", msgid: ", msg._msgid, ", operation: Check Dataflow Status, message: Error, request has expired");
                var logMsg={
                    "msgid":msg._msgid,
                    "message": "Error, request has expired"
                }
                node.error(logMsg);
                req.abort();
            });
             
            req.on('responseTimeout', function (res) {
                msg.ok=false;
                //console.log("timestamp: ",new Date().getTime(), "domain: ", process.env.domain, ", nodeId: ", n.id, ", msgid: ", msg._msgid, ", operation: Check Dataflow Status, message: Error, response has expired");
                var logMsg={
                    "msgid":msg._msgid,
                    "message": "Error, request has expired"
                }
                node.error(logMsg);
            });
        });

        this.on('input', function(msg) {
            if(n.resetCheckingOnIncomingMsg){
                //Activate planification
                node.repeaterSetup(msg);
            } else {
                //CheckStatus
                node.emit("checkStatus",msg);
            }
        });
        
         
    }
     RED.nodes.registerType("Check Dataflow Status",GetDataflowStatus);

     GetDataflowStatus.prototype.close = function() {
        
        if (this.interval_id != null) {
            clearInterval(this.interval_id);
            if (RED.settings.verbose) { this.log("Dataflow automatic status check disabled"); }
        } else if (this.cronjob != null) {
            this.cronjob.stop();
            if (RED.settings.verbose) { this.log(RED._("Dataflow automatic status check disabled")); }
            delete this.cronjob;
        }
    };

    GetDataflowStatus.prototype.stopScheduledStatusCheck = function (){
        if (this.interval_id != null) {
            clearInterval(this.interval_id);
            if (RED.settings.verbose) { this.log("Dataflow automatic status check disabled"); }
        } else if (this.cronjob != null) {
            this.cronjob.stop();
            if (RED.settings.verbose) { this.log(RED._("Dataflow automatic status check disabled")); }
            delete this.cronjob;
        }
        if(this.timeout_interval != null){
             clearInterval(this.timeout_interval);
        }
    };

    GetDataflowStatus.prototype.firstStatusfound = function() {

        this.crontab = "";
        this.repeat = "";
    };
}
