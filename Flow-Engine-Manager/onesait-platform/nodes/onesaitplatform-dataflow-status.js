
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
        this.dataflowStatusToCheck = n.dataflowStatusToCheck;
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
        };

        if(!this.resetCheckingOnIncomingMsg){
            node.repeaterSetup({});
        } else {
            this.status({fill:"yellow",shape:"ring",text:"Waiting for incoming msg to schedule status check on status: "+this.dataflowStatusToCheck});
        }

        this.on('checkStatus',function(msg){

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
            var endpoint = platformConfig.scriptBasePath + "/flowengine/node/services/user/dataflow/status";
            var req = client.post(endpoint, args,function (data, response) {
                // parsed response body as js object 
                console.log("statusCode: ", response.statusCode);
                if(response.statusCode== 200){
                    msg.ok=true;
                }else{
                    msg.ok=false;
                }
                msg.payload=data;
                if(n.repeat == "" && n.crontab == "" ){
                    node.send(msg);
                } else if(data.status == n.dataflowStatusToCheck){
                    if(n.stopAfterMatch){
                        node.stopScheduledStatusCheck();
                        if(n.resetCheckingOnIncomingMsg){
                            node.status({fill:"green",shape:"ring",text:"Status found. Send new msg to schedule status check on status: "+n.dataflowStatusToCheck});
                        } else {
                            node.status({fill:"green",shape:"ring",text:"Status found. Re-deploy to start new loop."});
                        }
                    }
                    node.send(msg);
                }
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
    };

    GetDataflowStatus.prototype.firstStatusfound = function() {

        this.crontab = "";
        this.repeat = "";
    };
}
