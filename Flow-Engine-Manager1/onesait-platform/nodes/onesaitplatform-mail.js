
module.exports = function(RED) {
    var Client = require('node-rest-client').Client;
    var platformConfig = require('./config/onesait-platform-config');
    var client = new Client();
    
    function LoadQuery(n) {
        RED.nodes.createNode(this,n);
        var node = this;
		var to = n.to;
		var subject = n.subject;
		var body = n.body;
		var file = n.file;
		if(file=="") file = null;
		var htmlenable = n.htmlenable;
        var filedata=null;

        this.on('input', function(msg) {
			if(msg.payload.body!="" && msg.payload.body!=null) body = msg.payload.body;
			if(msg.payload.file!="" && msg.payload.file!=null) file = msg.payload.file;
			if(msg.payload.to!="" && msg.payload.to!=null) to = msg.payload.to;
			if(msg.payload.subject!="" && msg.payload.subject!=null) subject = msg.payload.subject;
			if(msg.payload.htmlenable!=null) htmlenable = msg.payload.htmlenable;
			if(msg.payload.filedata!=null && msg.payload.filedata!="") filedata = msg.payload.filedata.toString('base64');
			var destinations = to.split(';');
			var regex = /^([a-zA-Z0-9_\.\-])+\@(([a-zA-Z0-9\-])+\.)+([a-zA-Z0-9]{2,4})+$/;
			valid_dest=[];
			destinations.forEach(function(dest) {
				var dest_trimmed = dest.trim();
		     	if(dest_trimmed!=null && dest_trimmed!="" && regex.test(dest_trimmed)) 
				{
					valid_dest.push(dest_trimmed); 
				}
			});
			
             var args = {
                requesConfig: { timeout: 5000 },
                responseConfig: { timeout: 5000 },
                data: { "to": valid_dest, "subject":subject, "body":body, "filename": file ,"filedata":filedata, "htmlenable" :htmlenable, "domainName": process.env.domain, "verticalSchema": process.env.vertical},
                headers: { "Content-Type": "application/json" }
            };
            var endpoint = platformConfig.scriptBasePath + "/flowengine/node/services/sendMail";
            var req = client.post(endpoint, args,function (data, response) {
                // parsed response body as js object 
                //console.log("timestamp: ",new Date().getTime(), ", domain: ", process.env.domain, ", nodeId: ", n.id, ", msgid: ", msg._msgid, ", operation: onesaitplatform-mail, message: Status code ", response.statusCode);
                var logMsg={
                    "msgid":msg._msgid,
                    "message": "Status code "+ response.statusCode
                }
                node.log(logMsg);
                if(response.statusCode== 200){
                    msg.ok=true;
					msg.payload="Email sending has been successful";
                }else{
                    msg.ok=false;
					msg.payload="Email sending has failed";
                }
                //msg.payload=data;
                node.send(msg);
            });
            req.on('requestTimeout', function (req) {
                msg.ok=false;
                //console.log("timestamp: ",new Date().getTime(), "domain: ", process.env.domain, ", nodeId: ", n.id, ", msgid: ", msg._msgid, ", operation: onesaitplatform-mail, message: Error, request has expired");
                var logMsg={
                    "msgid":msg._msgid,
                    "message": "Error, request has expired"
                }
                node.error(logMsg);
                req.abort();
            });
             
            req.on('responseTimeout', function (res) {
                msg.ok=false;
                //console.log("timestamp: ",new Date().getTime(), "domain: ", process.env.domain, ", nodeId: ", n.id, ", msgid: ", msg._msgid, ", operation: onesaitplatform-mail, message: Error, response has expired");
                var logMsg={
                    "msgid":msg._msgid,
                    "message": "Error, request has expired"
                }
                node.error(logMsg);
            });
        });
        
         
    }
     RED.nodes.registerType("onesaitplatform-mail",LoadQuery);

}
