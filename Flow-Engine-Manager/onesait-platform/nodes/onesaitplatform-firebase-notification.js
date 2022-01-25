
module.exports = function(RED) {
    
	var Client = require('node-rest-client').Client;
	var platformConfig = require('./config/onesait-platform-config');
	var client = new Client();
	var admin = require("firebase-admin");

    const tunnel = require('tunnel2');
    
	//var serviceAccount = require("path/to/serviceAccountKey.json");

	
	function LoadQuery(n) {
		RED.nodes.createNode(this,n);
		var node = this;
		
		var targetType = n.targetType;
		var targetName = n.target;
		// Credentials if defined in node
		var nodeProjectId = n.projectId;
		var nodeClientEmail = n.clientEmail;
		var nodePrivateKey = n.privateKey.replace(/\\n/g, '\n');
		var nodeDatabaseURL = n.databaseURL;
        var proxyParams = n.proxy;
		var app;
		var appStarted = false;
        var proxyUrl, proxyAuthCred, proxyHost, proxyPort;
        var proxyAgent = false;
        //if (process.env.http_proxy) { proxyUrl = process.env.http_proxy;}
        //if (process.env.HTTP_PROXY) { proxyUrl = process.env.HTTP_PROXY;}
        if (n.proxy) {
            console.log("Entering FIREBASE Proxy config");
            var proxyConfig = RED.nodes.getNode(n.proxy);
            proxyUrl = proxyConfig.url;
            //noprox = proxyConfig.noproxy;
            proxyAuthCred=proxyConfig.credentials.username+':'+proxyConfig.credentials.password;
            proxyHost = proxyUrl.split("//")[1].split(":")[0];
            proxyPort = proxyUrl.split("//")[1].split(":")[1];
            if(proxyConfig.credentials.username && proxyConfig.credentials.username != undefined && proxyConfig.credentials.username!== ""){
                console.log("... Proxy User IS defined. "+proxyUrl+ " - "+proxyHost+" - "+proxyPort);
                proxyAgent = tunnel.httpsOverHttp({
                proxy: {
                    host: proxyHost,
                    port: proxyPort,
                    proxyAuth: proxyAuthCred
                }
                });
            }else{ 
                console.log("... Proxy User NOT defined. "+proxyUrl+ " - "+proxyHost+" - "+proxyPort);
                proxyAgent = tunnel.httpsOverHttp({
                proxy: {
                    host: proxyHost,
                    port: proxyPort
                }
                });
            }
        }  
		try{
			app = admin.initializeApp({
					credential: admin.credential.cert({
					projectId: n.projectId,
					clientEmail: n.clientEmail,
					privateKey: n.privateKey.replace(/\\n/g, '\n')
					},proxyAgent),
					databaseURL: n.databaseURL,
                    httpAgent: proxyAgent
			});
			if(app.name == '[DEFAULT]'){
				node.log('OK');
				this.status({fill:"green",shape:"dot",text:"connected"});
				appStarted = true;
			}else{
				node.log('KO');
				this.status({fill:"red",shape:"dot",text:"Not connected"});
			}
		}catch(err){
            console.log(err);
            console.log("Error creating FIREBASE client: "+JSON.stringify(err));
			node.log('Unable to create Firebase client.');
			this.status({fill:"red",shape:"dot",text:"Not connected"});
			appStarted = false;
		}
		
		
		
		
		
		this.on('input', function(msg) {

			// If credentials not defined in node, then search in msg
			var rebootFirebaseApp = false;
			var credProjectId = nodeProjectId;
			if(typeof nodeProjectId == 'undefined' || nodeProjectId == ""){
				if(typeof msg.projectId != 'undefined' && msg.projectId != ""){
					credProjectId = msg.projectId;
					rebootFirebaseApp = true
				} else {
					this.status({fill:"red",shape:"dot",text:"Project ID for firebase not defined."});
					node.error("Project ID for firebase not defined.");
					msg.payload="Project ID for firebase not defined..";
					msg.error=true;
					node.send(msg);
				}
			}
			var credClientEmail = nodeClientEmail;
			if(typeof nodeClientEmail == 'undefined' || nodeClientEmail == ""){
				if(typeof msg.clientEmail != 'undefined' && msg.clientEmail != ""){
					credClientEmail = msg.clientEmail;
					rebootFirebaseApp = true
				} else {
					this.status({fill:"red",shape:"dot",text:"Client email for firebase not defined."});
					node.error("Client email for firebase not defined.");
					msg.payload="Client email for firebase not defined..";
					msg.error=true;
					node.send(msg);
				}
			}
			var credPrivateKey = nodePrivateKey;
			if(typeof nodePrivateKey == 'undefined' || nodePrivateKey == ""){
				if(typeof msg.privateKey != 'undefined' && msg.privateKey != ""){
					credPrivateKey = msg.privateKey.replace(/\\n/g, '\n');
					rebootFirebaseApp = true
				} else {
					this.status({fill:"red",shape:"dot",text:"Private key for firebase not defined."});
					node.error("Private key for firebase not defined.");
					msg.payload="Private key for firebase not defined..";
					msg.error=true;
					node.send(msg);
				}
			}
			var credDatabaseURL = nodeDatabaseURL;
			if(typeof nodeDatabaseURL == 'undefined' || nodeDatabaseURL == ""){
				if(typeof msg.databaseURL != 'undefined' && msg.databaseURL != ""){
					credDatabaseURL = msg.databaseURL;
					rebootFirebaseApp = true
				} else {
					this.status({fill:"red",shape:"dot",text:"Database URL for firebase not defined."});
					node.error("Database URL for firebase not defined.");
					msg.payload="Database URL for firebase not defined..";
					msg.error=true;
					node.send(msg);
				}
			}

			if (rebootFirebaseApp){
				if(appStarted) {
					//CLose current app and start an other one with new params
					admin.app().delete()
					.then(function() {
					console.log("App deleted successfully");
					})
					.catch(function(error) {
					console.log("Error deleting app:", error);
					});
				}
				app = admin.initializeApp({
								  credential: admin.credential.cert({
									projectId: credProjectId,
									clientEmail: credClientEmail,
									privateKey: credPrivateKey
								  },proxyAgent),
								  databaseURL: credDatabaseURL,
                                  httpAgent: proxyAgent
				});
				if(app.name == '[DEFAULT]'){
					node.log('OK');
					this.status({fill:"green",shape:"dot",text:"connected"});
					appStarted = true;
				}else{
					node.log('KO');
					this.status({fill:"red",shape:"dot",text:"Not connected"});
					appStarted = false;
				}
		
			}


			var input = msg.notificationMessage;
			//Use type from  msg.* . If it does not exist use from node definition
			if(typeof msg.targetType != 'undefined' && msg.targetType != "" && (msg.targetType == "USER" || msg.targetType == "TOPIC")){
				targetType = msg.targetType;
			}else{
				//error, a typ must be defined and valid
				this.status({fill:"red",shape:"dot",text:"Target type undefined or invalid. msg.targetType must be set to either 'USER' or 'TOPIC' value."});
				node.error("Target type undefined or invalid. msg.targetType must be set to either 'USER' or 'TOPIC' value.");
				msg.payload="Target type undefined or invalid. msg.targetType must be set to either 'USER' or 'TOPIC' value.";
				msg.error=true;
				node.send(msg);
			}
			// Get targets (topic name or user token list)
			if(typeof msg.targetName != 'undefined' && msg.targetName != "" ){
				targetName = msg.targetName;
			} else{
				
				//error, a typ must be defined
				this.status({fill:"red",shape:"dot",text:"Target topic or users undefined. Please check taht msg.targetType contains data."});
				node.error("Target topic or users undefined. Please check taht msg.targetType contains data.");
				msg.payload="Target topic or users undefined. Please check taht msg.targetType contains data.";
				msg.error=true;
				node.send(msg);
			
			}


			var endMessage;
			
			if(admin.app() == null){
				node.error("No Firebase APP");
			}
			else{
				node.log(targetType.toUpperCase());
				if(targetType.toUpperCase() == 'TOPIC'){
					var message = {
						notification : {
							body : input.body,
							title : input.title
						},
						topic: targetName
					};
									
					node.log(JSON.stringify(message));
					// Send a message to devices subscribed to the provided topic.
					admin.messaging().send(message)
					  .then((response) => {
						// Response is a message ID string.
						node.log('Successfully sent message:', response);
						msg.payload = response;
						node.send(msg.payload);
					  })
					  .catch((error) => {
						node.log('Error sending message:', error);
						msg.payload = error;
						node.error(error);
					  });
				}
				else{

					targetName.forEach(item =>{

						var message = {
							notification : {
								body : input.body,
								title : input.title
							},
							token: item
						};
										
						node.log(JSON.stringify(message));
						// Send a message to devices subscribed to the provided topic.
						admin.messaging().send(message)
						  .then((response) => {
							// Response is a message ID string.
							node.log('Successfully sent message:', response);
							msg.payload = response;
							node.send(msg.payload);
						  })
						  .catch((error) => {
							node.log('Error sending message:', error);
							msg.payload = error;
							node.error(error);
						  });
					});
				}
			}
		});

		this.on('close', function() {
			if(appStarted) {
				admin.app().delete()
				  .then(function() {
					console.log("App deleted successfully");
				  })
				  .catch(function(error) {
					console.log("Error deleting app:", error);
				  });
			}
		});
		
		 
	}
	 RED.nodes.registerType("onesaitplatform-firebase-notification",LoadQuery);
}
