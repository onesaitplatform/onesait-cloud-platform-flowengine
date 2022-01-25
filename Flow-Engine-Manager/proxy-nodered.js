var authServiceUrl='http://localhost:20100/flowengine/node/services/user/validate';


var http = require('http');
var url = require('url');
var querystring = require('querystring');
var httpProxy = require('http-proxy');
var cache = require('memory-cache');
var request = require('sync-request');

var proxyPort
var proxy;
var pathArray;

const GelfTransport = require('winston-gelf');
var winston = require('winston')
/* 
  const options = {
    gelfPro: {
        fields: {app_name: "NodeRED", domain: "proxy-nodered.js"}, // optional; default fields for all messages
        filter: [], // optional; filters to discard a message
        transform: [], // optional; transformers for a message
        broadcast: [], // optional; listeners of a message
        levels: {trace:10, debug:20, info: 30, warn:40, error: 50, fatal:60}, // optional; default: see the levels section below
        aliases: {}, // optional; default: see the aliases section below
        adapterName: 'tcp', // optional; currently supported "udp", "tcp" and "tcp-tls"; default: udp
        adapterOptions: { // this object is passed to the adapter.connect() method
            // common
            host: '192.168.1.109', // optional; default: 127.0.0.1
            port: 12201, // optional; default: 12201
            // tcp adapter example
            family: 4, // tcp only; optional; version of IP stack; default: 4
            timeout: 1000 // tcp only; optional; default: 10000 (10 sec)     
    }
  }
      
}
 
  const gelfTransport = new GelfTransport(options);
 */
  const logger = winston.createLogger({
    transports: [
      new winston.transports.Console()
     // , gelfTransport
    ]
  });


function serverProxy(_proxyPort, usersPorts) {


    proxyPort = _proxyPort;

    proxy = httpProxy.createProxyServer({});
    proxy.on('error', (e) => {
            logger.info("Node-Red Manager. proxy-nodered.js. ERROR on proxyServer!  " + e );
    });

    var serverProxy = http.createServer(function(req, res) {

		var pathArray = req.url.split('/');
        var domain = pathArray[1];
        var queryData = url.parse(req.url, true).query;
        
        if (pathArray.length == 2) { //llega solo la raiz que debaria traer autenticacion
            domainArray = pathArray[1].split('?'); //[ 'proyecto02', 'authentication=1:Sm4r7P14tf0rm!' ]
            if (domainArray.length == 2) {
                domain = domainArray[0];
                //var authentication = domainArray[1];
                var authentication = queryData.authentication;
                var user = domain + '-' + authentication;

                if ((cache.get('cachingUser') == null || cache.get('cachingUser') == undefined) || 
                	(cache.get('cachingUser')!=null && cache.get('cachingUser')!=user)) {


                    var respuesta = request('POST', authServiceUrl, {
                        json: {
                            'authentication': authentication,
                            'dominio': domain
                        }
                    });

		   logger.info("Respuesta servicio autenticacion: "+respuesta.statusCode);

                    if (respuesta.statusCode == 200) {
                        cache.put('cachingUser', user, 1000, function(key, value) {
                            //logger.info(key + '->' + value);
                        });
                    }
                    

                }

            } else {
                res.statusCode = 403;
                res.end();
                return;
            }
        } else if (pathArray.length > 2) {
            if ( typeof( queryData.authentication) !== "undefined" &&  queryData.authentication !== null ) {
                //var authentication = pathArray[pathArray.length-1].split('?authentication=')[1];
                var authentication = queryData.authentication;
                var domain = pathArray[1];

                var user = domain + '-' + authentication;

                if ((cache.get('cachingUser') == null || cache.get('cachingUser') == undefined) || 
                	(cache.get('cachingUser')!=null && cache.get('cachingUser')!=user)) {

                    var respuesta = request('POST', authServiceUrl, {
                        json: {
                            'authentication': authentication,
                            'dominio': domain
                        }
                    });

		   logger.info("Respuesta servicio autenticacion: "+respuesta.statusCode);

                    if (respuesta.statusCode == 200) {
                        cache.put('cachingUser', user, 60000, function(key, value) {
                            //logger.info(key + '->' + value);
                        });

                    }


                }



            } else if (pathArray[2].trim() == '' || pathArray[2].trim() == '#') {
                res.statusCode = 403;
                res.end();
                return
            }
        }




        if (usersPorts[domain] != undefined) {

            proxy.web(req, res, {
                target: 'http://localhost:' + usersPorts[domain]
            });

        } else {
            res.statusCode = 404;
            res.end();
            return
        }

    });



    serverProxy.on('upgrade', function(req, socket, head) {
        var pathArray = req.url.split('/');
        var domain = pathArray[1];
        if (usersPorts[domain] != undefined) {
            proxy.ws(req, socket, head, {
                target: 'http://localhost:' + usersPorts[domain]
            });
        } else {
            logger.info("Node-Red Manager. proxy-nodered.js. Error, domain not found: "+domain);
            socket.end();
        }

    });

    serverProxy.on('error', (e) => {
        if (e.code == 'EADDRINUSE') {
            logger.info("Node-Red Manager. proxy-nodered.js. WARNING! Port: " + proxyPort + " is in use, Cannot start proxy");
            setTimeout(() => {
                server.listen(proxyPort);
            }, 1000);
        }
    });

    serverProxy.on('close', function(res, socket, head) {
    });


    serverProxy.listen(proxyPort);

}

function close() {
    proxy.close();
}



exports.serverProxy = serverProxy;

exports.close = close;
