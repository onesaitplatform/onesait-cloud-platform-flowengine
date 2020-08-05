var http = require('http');
var express = require("express");
var RED = require("node-red");
var pusage = require('pidusage');
var process = require('process');
var cp = require('child_process');
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
        httpStatic: "/opt/nodeRed/Flow-Engine-Manager/public/",
        nodesDir: "/opt/nodeRed/Flow-Engine-Manager/onesait-platform/nodes/",
	    // enables global context
	    editorTheme: {
	        page: {
	            title: "OnesaitPlatform FlowEngine",
                    //css: "/opt/nodeRed/Flow-Engine-Manager/node_modules/node-red-onesait-platform/public/red/onesait.platform.custom.css",
                css: "/opt/nodeRed/Flow-Engine-Manager/onesait-platform/css/onesait.platform.custom.css",
                favicon: "/opt/nodeRed/Flow-Engine-Manager/onesait-platform/nodes/icons/platform_logo.png"
	            //favicon: "/opt/nodeRed/Flow-Engine-Manager/node_modules/node-red-onesait-platform/public/red/icons/platform_logo.png" //can use '__dirname + "\\img\\favicon.png" (\\ on Windows)'
	        },
	        header: {
	            title: "OnesaitPlatform FlowEngine",
	            //image: "/opt/nodeRed/Flow-Engine-Manager/node_modules/node-red-onesait-platform/public/icons/platform_logo.png", // or null to remove image
	            //image: "/home/rtvachet/noderedVersions/node_modules/node-red-onesait-platform/@node-red/editor-client/public/red/images/icons/platform_logo.png",
                image:null,
	            url: "http://nodered.org" // optional url to make the header text/image a link to this url
	        },
	        projects: {
	            // To enable the Projects feature, set this value to true
	            enabled: false
	        }, 
	        userMenu: false
	    },
	    adminAuth: require("./node_modules/node-red/user-authentication")
        /*,
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

function stats(pid) {
    return new Promise((resolve, reject) => {
        try{
    		if(pid==null){
                  resolve({});
            }
    		pusage.stat(pid, (err, data) => {
                if (err) {
                    reject(err)
                }
                try{
                    resolve(data)
                }catch(e){
                    console.log("Node-Red Manager. app.js-->REST Method: status(). No status for PID " + pid);
                     reject(e);
                }


            })
        }catch(e){
            console.log("Node-Red Manager. app.js-->REST Method: status().  ChildProcess_PID: " + pid);
             reject(e);
        }
    })
}

function socketCount(pid){
    
    
    
    return new Promise((resolve, reject) => {
        try{
    		if(pid==null){
                  resolve({});
            }
    		cp.exec('lsof -i -P |grep '+pid, function (err, data) {
                if(err)
                    resolve({});
                var sockertInfo = data.split('\n');
                sockertInfo.pop(); //last one is always empty
                resolve( sockertInfo);
            });
        }catch(e){
            console.log("Node-Red Manager. app.js-->REST Method: status().  ChildProcess_PID: " + pid);
             reject(e);
        }
    })
}
    
//Healthcheck endoint
app.get('/'+domain+'/health', function (req, res) {
    
    try{
        stats(process.pid).then(function(data) {
			console.log("Node-Red Manager. app.js-->REST Method: getAllDomainMF(). Respuesta:"+JSON.stringify(data));
            var domainStats = data;
            socketCount(process.pid).then(function(data3){
                domainStats.sockets = data3;
                
            res.send(JSON.stringify(domainStats)); 
                
            })
        })   
     }catch(err){
        console.log("Node-Red Manager. app.js-->REST Method: getAllDomainMF(). Error",err);
        res.send(err);
     }
})


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

process.on('SIGINT',function(){
    process.exit(0);    
});
