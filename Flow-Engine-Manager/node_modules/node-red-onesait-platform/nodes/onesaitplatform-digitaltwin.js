

module.exports = function(RED) {
	
    var Client = require('node-rest-client').Client;
	var SockJS = require('sockjs-client');
    var Stomp = require('stompjs');
    var platformConfig = require('./config/onesait-platform-config');

	function digitalTwin(n) {
		RED.nodes.createNode(this,n);
		var node = this;
		//Connect and subscribe to events
		var socket = new SockJS(platformConfig.digitalTwinBasePath+'/digitaltwinbroker/websocket');
		node.stompClient = Stomp.over(socket);
		node.stompClient.connect({}, function (frame) {
			node.subscribeEvents = node.stompClient.subscribe('/api/custom/'+n.digitalTwinDevice, function (notification) {
				var obj=JSON.parse(notification.body);
				var needsOutput = false;
				var msgToSend = new Array();
				msgToSend.length = n.customOutputLabels.length;
				n.customOutputLabels.forEach(function (currentValue, index, array) {
            		if(currentValue == obj.event && index != 0){
            			needsOutput = true;
            			msgToSend[index+1] = {'payload':obj};
            		}
        		}); 
        		if (needsOutput){
        			node.send(msgToSend);
        		} 
			});
			node.subscribeShadow = node.stompClient.subscribe('/api/shadow/' + n.digitalTwinDevice, function (notification) {
	    	   	
	           	var obj=JSON.parse(notification.body)	        	
				var msgToSend = new Array();
				msgToSend.length = n.customOutputLabels.length;
				msgToSend[0] = {'payload':obj};
				node.send(msgToSend);
       		});
           
		});
		node.on('input', function(msg) {
			//Process MSG input (actions)
			//Send to digitalTwin via WS
			node.stompClient.send("/api/sendAction", {'Authorization': n.digitalKey}, "{'id':'"+n.digitalTwinDevice+"','name':'"+msg.topic+"','data':'"+msg.payload+"'}");
		});
		node.on("close", function(done) {
            if (node.stompClient) {
                // disconnect can accept a callback - but it is not always called.
                node.subscribeEvents.unsubscribe();
                node.subscribeShadow.unsubscribe();
                node.stompClient.disconnect();
            }
            done();
        });
	}
	 RED.nodes.registerType("onesaitplatform-digitaltwin",digitalTwin);

}
