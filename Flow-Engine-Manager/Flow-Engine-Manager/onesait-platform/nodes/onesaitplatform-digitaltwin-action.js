

module.exports = function(RED) {
	
    var Client = require('node-rest-client').Client;
    var platformConfig = require('./config/onesait-platform-config');
 
	function digitalTwinActionSelector(n) {
		RED.nodes.createNode(this,n);
		var node = this;
		//n is the NODE

		this.on('input', function(msg) {
			//Process MSG input (actions)
			msg.topic=n.digitalTwinAction;
			node.send(msg);
		});
		 
	}
	 RED.nodes.registerType("onesaitplatform-digitaltwin-action",digitalTwinActionSelector);

}
