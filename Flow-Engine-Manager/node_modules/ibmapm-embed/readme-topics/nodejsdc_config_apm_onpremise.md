## Configuring on-premises Node.js applications monitoring using the Cloud APM server

### Prerequisites
Before configure the Node.js DC to connect to the Cloud APM v8 server, you need to get the configuration information from APM server first, see [Get the APM configuration information](nodejs_dc_apm_configure.md).

### Procedure:
Complete the following steps to install appmetrics with the Node.js data collector integrated:

1. In the `package.json` file of your Node.js application, add the following line to the dependencies section:
    <pre>"appmetrics":"^4.0.0"</pre>
    
2. Add the following line to the begining of the main file of your Node.js application:
    <pre>require('appmetrics');</pre>
    
    **Tip:** If you start your application by running the node app.js command, `app.js` is the main file of your application.

3. Copy the global.environment and keyfile.p12 to the root of Node.js application.

4. Run the following command to install all required dependencies:
    <pre>npm install</pre>

5. Restart the Node.js application.
