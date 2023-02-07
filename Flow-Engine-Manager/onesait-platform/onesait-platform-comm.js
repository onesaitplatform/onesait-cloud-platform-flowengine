var deployFlowsServicePath="/flowengine/node/services/deployment";

var serverHost = 'localhost';

var serverPort = 20100;

var http = require('http');

//var request = require('sync-request');

var domain;

//TODO Levantar aqui un unico servicio REST de comunicación con toda la infraestructura de Onesait Platform
//Recibirá notificaciones a los nodos de este motor. Para eso se utiliza servicePortOnesaitPlatform

module.exports = {
    log: function(trace) {
        console.log(trace);
    },
	setDomain: function(path){
		var pathArray=path.split( '/' );
		domain=pathArray[1];
	},
	notifyNodes: function(flows, deployRes, version, data){
		var domainObject={'domain': domain};
        
        console.log("OnesaitPlatform flows DOMAIN: "+JSON.stringify(domainObject));
		flows.unshift(domainObject);
        
        console.log("OnesaitPlatform flows deploy: "+JSON.stringify(flows));
		
		//Enviar al servicio REST del modulo Script
		//El módulo flowengine filtrará los flujos y extraerá los nodos propios de Onesait Platform con su configuracion
		
		var options = {
		  host: serverHost,
		  port: serverPort,
		  path: deployFlowsServicePath,
		  method: 'POST'
		};
		
		var postheaders = {
			'Content-Type' : 'application/json',
			'Content-Length' : Buffer.byteLength(JSON.stringify(flows), 'utf8')
		};
		 
		// do the POST call
		
		var reqPost = http.request(options, function(res) {
			console.log("statusCode: ", res.statusCode);
		 	if(res.statusCode == 200){
				res.on('data', function(d) {
					console.info('POST result:\n');
					process.stdout.write(d);
					console.info('\n\nPOST completed');
					if (version === "v1") {
					    deployRes.status(204).end();
					} else if (version === "v2") {
					    deployRes.json(data);
					}
					
				});
			} else {
				res.on('data', function(d) {
					console.info('POST error: '+d+'\n');
					process.stdout.write(d);
					console.info('\n\nPOST completed');
					try{
						deployRes.status(500).json({error:JSON.parse(d).error, message:JSON.parse(d).message});
					}catch(e){
						deployRes.status(500).json({error:"Error while deploying.", message: d.toString()});
					}
				});
			}
		});
		reqPost.write(JSON.stringify(flows));
		reqPost.end();
		reqPost.on('error', function(e) {
			console.error(e);
		});

		//NEW sync deployment request
		/*try{
			var endpoint = 'http://'+serverHost+':'+serverPort+deployFlowsServicePath;
			console.log("DELETEME -- :"+endpoint);
			var res = request('POST', 'http://'+serverHost+':'+serverPort+deployFlowsServicePath, {
			  headers: {
			    'Content-Type' : 'application/json',
				'Content-Length' : Buffer.byteLength(JSON.stringify(flows), 'utf8')
			  },{json:JSON.stringify(flows)},
			});
			console.log(res.getBody());
		}catch(err){
			console.log("ERROR");
		};*/
		
	//	console.log(domain);
	//	console.log(flows);
	}
	
	
}
