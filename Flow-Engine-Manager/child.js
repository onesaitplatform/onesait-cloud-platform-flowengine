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

const transformer = function transformer(logData) {
  const transformed = logData;
    switch(transformed.level){
        case 10:
            transformed.level_name="FATAL"
            break;
        case 20:
            transformed.level_name="ERROR"
            break; 
        case 30:
            transformed.level_name="WARN"
            break;
        case 40:
            transformed.level_name="INFO"
            break;
        case 50:
            transformed.level_name="DEBUG"
            break;
        case 60:
            transformed.level_name="TRACE"
            break; 
        case 98:
            transformed.level_name="AUDIT"
            break; 
        case 99:
            transformed.level_name="METRIC"
            break; 
    }
  return transformed;
};

// GELF configuration
${COMMENT_GRAYLOG_START}
var gelfLog = require('gelf-pro');
gelfLog.setConfig({
  fields: {app_name: "NodeRED", domain: domain}, // optional; default fields for all messages
  filter: [], // optional; filters to discard a message
  transform: [transformer], // optional; transformers for a message
  broadcast: [], // optional; listeners of a message
  levels: {trace:60, debug:50, info: 40, warn:30, error: 20, fatal:10}, // optional; default: see the levels section below
  aliases: {}, // optional; default: see the aliases section below
  adapterName: 'udp', // optional; currently supported "udp", "tcp" and "tcp-tls"; default: udp
  adapterOptions: { // this object is passed to the adapter.connect() method
    // common
    host: '${GRAYLOG_HOST}', // optional; default: 127.0.0.1
    port: ${GRAYLOG_PORT}, // optional; default: 12201
    // tcp adapter example
    // family: 4, // tcp only; optional; version of IP stack; default: 4
    // timeout: 1000 // tcp only; optional; default: 10000 (10 sec)

  }
});
${COMMENT_GRAYLOG_END}

// Create the settings object - see default settings.js file for other options

var domain = process.env.domain;
var port = process.env.port;
var home = process.env.home;
var servicePort = process.env.servicePort;
${COMMENT_PROXY_START}
process.env.http_proxy = '${HTTP_PROXY}';
process.env.https_proxy = '${HTTPS_PROXY}';
process.env.no_proxy = '${NO_PROXY}';
${COMMENT_PROXY_END}
 //settings NODE-RED
	 settings = {
	    httpAdminRoot:"/"+domain,
	    httpNodeRoot: "/"+domain,
	    userDir:home,
	    flowFile:home+"/flows_"+domain+".json",
      credentialSecret: '${FLOW_SECRET}',
	    servicePortOnesaitPlatform : servicePort,
	    functionGlobalContext: { }   ,
        // Timeout in milliseconds for HTTP request connections
        httpRequestTimeout: ${HTTPREQUESTTIMEOUT},
        socketTimeout: ${SOCKETTIMEOUT},
        httpStatic: [{path:'/opt/nodeRed/Flow-Engine-Manager/public/'}],
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
	            enabled: true
	        },
	        userMenu: false
	    },
	    adminAuth: require("./node_modules/node-red/user-authentication")
        ,
        ${COMMENT_START}
	    httpNodeMiddleware:  async function(req,res,next) {
		    // Perform any processing on the request.
		    // Be sure to call next() if the request should be passed
		    // to the relevant HTTP In node.

		    if (typeof req.headers['x-op-nodekey'] != "undefined" && req.headers['x-op-nodekey'] != null) {

				var opts = {};
		    	opts.hostname = "localhost";
		    	opts.port = 5050;
	            opts.path = "/"+domain+"/settings";
	            opts.method = "GET";
	            opts.headers = {'Authorization': 'Bearer '+req.headers['x-op-nodekey']};
	            opts.encoding = null;

		    	try{
					const response_body = await tokenValidation(opts);
					next();
		    	} catch(e){
		    		console.debug("--- AUTH Middleware --- Exception: "+e);
		    		res.status(401).send('unauthorized');
		    	}

		    } else {
		    	console.debug("--- AUTH Middleware --- no header");
		    	res.status(401).send('unauthorized');
		    }
		},
        ${COMMENT_END}
	    logging: {
            console: {
                level: "info",
                metrics: false,
                audit: false,
                handler: function(settings) {
                    // Called when the logger is initialised

                    // Return the logging function
                    return function(msg) {
                        msg=transformer(msg)
                        msg.domain=domain
                        msg.timestampISO=(new Date(msg.timestamp)).toISOString()
                        console.log(JSON.stringify(msg))
                    }
                }
            }
             // Custom GELF logger
            ${COMMENT_GRAYLOG_START}
            ,myCustomGelfLogger: {
                level: 'info',
                audit: false,
                metrics: false,
                handler: function(settings) {
                    // Called when the logger is initialised

                    // Return the logging function
                    return function(msg) {
                        msg.timestampISO=(new Date(msg.timestamp)).toISOString()
                        gelfLog.message(JSON.stringify(msg),msg.level);
                    }
                }
            }
            ${COMMENT_GRAYLOG_END}
        }
	};


function  tokenValidation(opts, postData) {
    return new Promise(function(resolve, reject) {
        var req = http.request(opts, function(res) {
            // reject on bad status
            if (res.statusCode < 200 || res.statusCode >= 300) {
                return reject(new Error('statusCode=' + res.statusCode));
            }
            // cumulate data
            var body = [];
            res.on('data', function(chunk) {
                body.push(chunk);
            });
            // resolve on end
            res.on('end', function() {
                try {
                    body = JSON.parse(Buffer.concat(body).toString());
                } catch(e) {
                    reject(e);
                }
                resolve(body);
            });
        });
        // reject on request error
        req.on('error', function(err) {
            // This is not a "Second reject", just a different sort of failure
            reject(err);
        });
        if (postData) {
            req.write(postData);
        }
        // IMPORTANT
        req.end();
    });
}

function stats(pid) {
    return new Promise((resolve, reject) => {
        try{
    		if(pid==null){
                  resolve({});
            }
    		pusage(pid, (err, data) => {
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

if (process.env.PROMETHEUS_ENABLED == 'true'){
    console.log("Enabling prometheus metrics for domain: " + domain );
    const client = require('prom-client');

    // Create a Registry to register the metrics
    const register = new client.Registry();
    client.collectDefaultMetrics({
        labels: { domain: domain },
        register
    });
    app.get('/'+domain+'/metrics', async (req, res) => {
        res.setHeader('Content-Type', register.contentType);
        res.send(await register.metrics());
    });
}

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
