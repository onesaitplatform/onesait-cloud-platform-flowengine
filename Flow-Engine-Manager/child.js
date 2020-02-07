var http = require('http');
var express = require("express");
var RED = require("node-red-onesait-platform");

// Create an Express app
var app = express();

// Add a simple route for static content served from 'public'
app.use("/",express.static("public"));



// Create the settings object - see default settings.js file for other options

var domain = process.env.domain;
var port = process.env.port;
var home = process.env.home;
var servicePort = process.env.servicePort;

 //settings NODE-RED
	 settings = {
	    httpAdminRoot:"/"+domain,
	    httpNodeRoot: "/"+domain,
	    userDir:home,
	    flowFile:home+"/flows_"+domain+".json",
	    servicePortOnesaitPlatform : servicePort,
	    functionGlobalContext: { }   , 
        // Timeout in milliseconds for HTTP request connections
        httpRequestTimeout: 10000,
        socketTimeout: 22000,
	    // enables global context
	    editorTheme: {
	        page: {
	            title: "OnesaitPlatform FlowEngine",
	            css: "/opt/nodeRed/Flow-Engine-Manager/node_modules/node-red-onesait-platform/public/red/onesait.platform.custom.css",
	            favicon: "/opt/nodeRed/Flow-Engine-Manager/node_modules/node-red-onesait-platform/public/red/icons/platform_logo.png" //can use '__dirname + "\\img\\favicon.png" (\\ on Windows)'
	            //scripts: "/absolute/path/to/custom/js/file"  // As of 0.17
	        },
	        header: {
	            title: "OnesaitPlatform FlowEngine",
	            //image: "/opt/nodeRed/Flow-Engine-Manager/node_modules/node-red-onesait-platform/public/icons/platform_logo.png", // or null to remove image
	            image: "",
	            url: "http://nodered.org" // optional url to make the header text/image a link to this url
	        },
	        projects: {
	            // To enable the Projects feature, set this value to true
	            enabled: false
	        }, 
	        userMenu: false
	    },
	    adminAuth: require("./node_modules/node-red-onesait-platform/user-authentication")/*,
	    httpNodeMiddleware:  async function(req,res,next) {
		    // Perform any processing on the request.
		    // Be sure to call next() if the request should be passed
		    // to the relevant HTTP In node.
		   const checkAuth = (opts) => {
		    	return new Promise((resolve, reject) => {
									http.get(opts, (response) => {
										let chunks_of_data = [];
										response.on('data', (fragments) => {
											chunks_of_data.push(fragments);
										});

										response.on('end', () => {
											let response_body = Buffer.concat(chunks_of_data);
											resolve(200);
										});

										response.on('error', (error) => {
											reject(401);
										});
									});
								});
		    };
		    
		
		    //if (typeof req.headers['X-OP-NODEKey'] != "undefined" && req.headers['X-OP-NODEKey'] != null) {
		    if (typeof req.headers['x-op-nodekey'] != "undefined" && req.headers['x-op-nodekey'] != null) {
		    	
		    	var opts = {};
		    	opts.hostname = "localhost";
		    	opts.port = 5050;
	            opts.path = domain+"/settings";
	            //opts.timeout = node.reqTimeout;
	            opts.method = "GET";
	            opts.headers = {"Authentication":req.headers['x-op-nodekey']};
	            opts.encoding = null;

		    	try{

					console.log("DELETEME --------- PRE");
					//const response_body = await checkAuth(opts);
					var val = checkAuth(opts).then(function(ret){console.log("DELETEME --------- "+ret);return next();}).catch((e)=>{		console.log("DELETEME --------- ERROR "+e);})
					// holds response from server that is passed when Promise is resolved
					
					
					console.log("DELETEME --------- POST"+val);
					//return next();
		    	} catch(e){
		    		console.debug("--- AUTH Middleware --- Exception: "+e);
		    		res.status(401).send('unauthorized');
		    	}

		    } else {
		    	console.debug("--- AUTH Middleware --- no header");
		    	res.status(401).send('unauthorized');
		    }

		   //res.status(401).send('unauthorized');
		}*/
	    


	};



// Create a server
var server = http.createServer(app);



// Initialise the runtime with a server and settings
RED.init(server,settings);

// Serve the editor UI from /red
app.use(settings.httpAdminRoot,RED.httpAdmin);

// Serve the http nodes UI from /api
app.use(settings.httpNodeRoot,RED.httpNode);





server.listen(port);

server.on('error', (e) => {
  if (e.code == 'EADDRINUSE') {
    console.log("Node-Red Manager. child.js. WARNING! The port: "+ port +" is in use. Cannot create NodeRed Instance");
  }else{
	  console.log("Node-Red Manager. child.js. Error generico en server del motor de flujos");
  }
});




// Start the runtime
RED.start().then(function(){
		var env = {
			domainStarted: domain,
			startedAtPort: port
		};
		process.send(env);
    });


//Comunicacion con el padre.
function comunicationProcess(input) {
  
   var message ="";
   if(input!=null && input.msg!=undefined){

   	  message = input.msg;
   
   }else{
   	  message = input;
   
   }

	switch(message) {
	    case 'stop':
	        RED.stop();
			server.close();
			setTimeout(function() {
				process.exit(1);
			}, 2000);
			break;
	    case 'kill':
	        RED.stop();
	        server.close();
	        setTimeout(function() {
				process.exit(1);
			}, 2000);
	    default:
	       
	}
  
}

process.on('message', function(m) {
	comunicationProcess(m);
});
