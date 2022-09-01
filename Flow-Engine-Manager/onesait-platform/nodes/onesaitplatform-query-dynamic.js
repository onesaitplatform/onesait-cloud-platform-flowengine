
module.exports = function(RED) {
	var Client = require('node-rest-client').Client;
	var platformConfig = require('./config/onesait-platform-config');
	var client = new Client();
	
	function LoadQuery(n) {
		RED.nodes.createNode(this,n);
		var node = this;

		this.on('input', function(msg) {
			var ontology=msg.ontology;
			var targetDB=msg.targetDB;
			var queryType=msg.queryType;
			var query=msg.query;
			var url=msg.url;

			//query = query.replace(/ /g, "+");
			
			var args = {
                requesConfig: { timeout: 5000 },
                responseConfig: { timeout: 5000 },
                data: { "ontology": ontology, "queryType": queryType, "query": query , "domainName": process.env.domain, "verticalSchema": process.env.vertical},
                headers: { "Content-Type": "application/json" }
        	};

			var endpoint = platformConfig.scriptBasePath + "/flowengine/node/services/user/query";
				
			var req = client.post(endpoint, args,function (data, response) {
				// parsed response body as js object 
                console.log("timestamp: ",new Date().getTime(), ", domain: ", process.env.domain, ", nodeId: ", n.id, ", msgid: ", msg._msgid, ", operation: onesaitplatform-query-dynamic, message: Status code ", response.statusCode);
				if(response.statusCode== 200){
					msg.ok=true;
				}else{
					msg.ok=false;
				}
				msg.payload=data;
				node.send(msg);
			});
				req.on('requestTimeout', function (req) {
					msg.ok=false;
                    console.log("timestamp: ",new Date().getTime(), "domain: ", process.env.domain, ", nodeId: ", n.id, ", msgid: ", msg._msgid, ", operation: onesaitplatform-query-dynamic, message: Error, request has expired");
					req.abort();
				});
				 
				req.on('responseTimeout', function (res) {
					msg.ok=false;
                    console.log("timestamp: ",new Date().getTime(), "domain: ", process.env.domain, ", nodeId: ", n.id, ", msgid: ", msg._msgid, ", operation: onesaitplatform-query-dynamic, message: Error, response has expired");
				});
			
		});
		
		 
	}
	 RED.nodes.registerType("onesaitplatform-query-dynamic",LoadQuery);
}
