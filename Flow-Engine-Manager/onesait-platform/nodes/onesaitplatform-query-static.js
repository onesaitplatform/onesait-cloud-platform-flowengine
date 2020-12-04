

module.exports = function(RED) {
	var Client = require('node-rest-client').Client;
	var platformConfig = require('./config/onesait-platform-config');
 	var client = new Client();
 	
	function LoadQuery(n) {
		RED.nodes.createNode(this,n);
		var node = this;

		this.query=n.query;
		//this.query = this.query.replace(/ /g, "+");
		
		var endpoint = platformConfig.scriptBasePath + "/flowengine/node/services/user/query";

		var args = {
                requesConfig: { timeout: 5000 },
                responseConfig: { timeout: 5000 },
                data: { "ontology": n.ontology, "queryType": n.queryType, "query": this.query , "domainName": process.env.domain},
                headers: { "Content-Type": "application/json" }
        };

		this.on('input', function(msg) {
			var req = client.post(endpoint, args,function (data, response) {
				// parsed response body as js object 
				console.log("statusCode: ", response.statusCode);
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
				console.log("request has expired");
				req.abort();
			});
			 
			req.on('responseTimeout', function (res) {
				msg.ok=false;
				console.log("response has expired");
			});
			
		});
		
		 
	}
	 RED.nodes.registerType("onesaitplatform-query-static",LoadQuery);

}
