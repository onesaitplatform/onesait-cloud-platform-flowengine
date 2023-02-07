## Monitoring on-premises Node.js applications
During data collector deployment, the server information must be provided so that the data collector can be configured to connect to the appropriate server, the server information is provided as a configure package for download from the Cloud App Management console.
### Download the Configure package:
1. Log in to the Cloud App Management console and click <b>Get Started</b>.
2. Click <b>Administration</b> to open the Administration user interface.
3. Click <b>Integrations</b> to add an integration and then click <b>Configure an integration</b>.
4. In the <b>Standard monitoring agents</b> section, go to the <b>Cloud Resource Data Collectors</b> tile and click <b>Configure</b>.
5. Click <b>Download file</b> to download the ibm-cloud-apm-dc-configpack.zip file.
Extract the ibm-cloud-apm-dc-configpack.zip file to get the global.environment file and the keyfiles( only presented when the winterfell server is enabled to support https.). This file contains all variables and their values required by data collectors for server connection.

### Procedure:
Using the file global.environment and keyfile.p12( this keyfile is only for the server enabled https.) which extracted from the configure package to configure the Node.js data collector.

#### Install Data Collector  
If your environment can access Internet:
1. Update the package.json, add <code> "appmetrics": "^5.0.0" </code> as dependency.
2. Update the main file of application, add the <code>require('appmetrics')</code> at top.

If your environment cannot access Internet:  
1. Unpack greenfield package according to your Node.js Runtime version, e.g. with Node.js v8.x Runtime, You need to do the following steps:  
```
tar xzf appMgtDataCollectors_2019.4.0.tar.gz
cd appMgtDataCollectors_2019.4.0
tar zxf app_mgmt_runtime_dc_2019.4.0.tar.gz
cd app_mgmt_runtime_dc_2019.4.0
tar zxf nodejs_datacollector.tgz
tar zxf ibmapm-greenfield-v8-lx64.tgz
```
2. Copy or move `ibmapm` folder you get from step 1 to the root folder of application (the folder that contains application entry file)
```
mv ibmapm <application_root_folder>/ibmapm
```
3. Add `require('./ibmapm');` in the first line of your application entry file  

#### Configure Data Collector 
1. Run apply_configpack.sh tool to copy the file global.environment and keyfile.p12 to the root of Node.js application.  
    ```
    ./apply_configpack.sh <configpack> [<application folder>]
    ```
    where, `configpack` is path of configure package which you downloaded from the Cloud App Management console. `application folder` is the root folder of the application (where you run application command executed), if you are at application root folder, it can be not specified.
2. Run command  <i>npm install</i> to install the npm packages under the root directory of application.  
3. Restart the Node.js application.  
