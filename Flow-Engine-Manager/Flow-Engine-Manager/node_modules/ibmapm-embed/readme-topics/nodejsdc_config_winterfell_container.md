## Monitoring Node.js applications in IBM Cloud Private
During data collector deployment, the Cloud App Management server information must be provided so that the data collector can be configured to connect to the appropriate server, the server information is provided as a configure package for download from the Cloud App Management console.

### Prerequisites

The service account that you use to install and configure the data collector must have access to Kubernetes resources. You can run the following commands on the Kubernetes master node to determine if the data collector has access to resources by using your service account:

```
kubectl auth can-i list nodes --as system:serviceaccount:<namespace>:<service_account_name>
kubectl auth can-i get pods --as system:serviceaccount:<namespace>:<service_account_name>
kubectl auth can-i list services --as system:serviceaccount:<namespace>:<service_account_name>
kubectl auth can-i get services --as system:serviceaccount:<namespace>:<service_account_name>
kubectl auth can-i list endpoints --as system:serviceaccount:<namespace>:<service_account_name>
kubectl auth can-i get endpoints --as system:serviceaccount:<namespace>:<service_account_name>
```

Remember to change the `<namespace>` and `<service_account_name>` in the commands to the namespace of your environment and the name for the service account that you use to configure the data collector. By default, the `<service_account_name>` is `default`.

If your service account does not have access to Kubernetes resources, follow the instructions in [Configuring the data collector to access Kubernetes resources](nodejsdc_config_access.md).

### Download the Configure package:

1. Log in to the Cloud App Management console and click <b>Get Started</b>.
2. Click <b>Administration</b> to open the Administration user interface.
3. Click <b>Integrations</b> to add an integration and then click <b>Configure an integration</b>.
4. In the <b>Standard monitoring agents</b> section, go to the <b>Data Collectors</b> tile and click <b>Configure</b>.
5. Click <b>Download file</b> to download the `ibm-cloud-apm-dc-configpack.tar` file.

Extract the `ibm-cloud-apm-dc-configpack.tar` file to get the `global.environment` file and the `keyfiles`. This file contains all variables and their values required by data collectors for server connection.

There are two ways to configure the Node.js data collector to monitoring the Node.js applicaton.

### Option 1 (Passing ICAM server configuration via secret - Preferred option)

You can create a secret for the file `global.environment` and `keyfile.p12` extracted from the ICAM configuration package, and mount this secret when you deploy the application as a kubenetes deployment.

#### Install Data Collector

If your environment can access Internet:

1. Update the package.json, add <code> "appmetrics": "^5.0.0" </code> as dependency.  
2. Update the main file of application, add the <code>require('appmetrics')</code> at top.  

If your environment cannot access internet:

1. Unpack greenfield package according to your Node.js Runtime version, e.g. with Node.js v8.x Runtime, You need to do the following steps:

```
tar xzf appMgtDataCollectors_2019.4.0.tar.gz
cd appMgtDataCollectors_2019.4.0
tar zxf app_mgmt_runtime_dc_2019.4.0.tar.gz
cd app_mgmt_runtime_dc_2019.1.0
tar zxf nodejs_datacollector_2019.1.0.tgz
tar zxf ibmapm-greenfield-v8-lx64.tgz
```
2. Copy or move `ibmapm` folder you get from step 1 to the root folder of application (the folder that contains application entry file)  
```
mv ibmapm <application_root_folder>/ibmapm
```
3. Add `require('./ibmapm');` in the first line of your application entry file  

#### Configure Data Collector

1. Create the Kubernetes Secret:
    <pre>
    cd ibm-cloud-apm-dc-configpack
    kubectl -n <my_namespace> create secret generic icam-server-secret \
    --from-file=keyfiles/keyfile.p12 \
    --from-file=global.environment
    </pre>
    Or you can choose to create cert files e.g. keyfile.jks, ca.pem .... In case the other Data collector, which using the keyfile.jks keystore, can share the same Secret with Node.js Data collector.

2. Update the application yaml file to mount the configure map. See the example below.
    <pre>
    apiVersion: extensions/v1beta1
    kind: Deployment
    metadata:
    name: acmeair
    labels:
        app: acmeair
    spec:
    selector:
        matchLabels:
        app: acmeair
        pod: acmeair
    replicas: 1
    template:
        metadata:
        name: acmeair
        labels:
            app: acmeair
            pod: acmeair
        spec:
        containers:
        - name: acmeair
            image: mycluster.icp:8500/default/acmeair:v1
            imagePullPolicy: Always
            ports:
            - containerPort: 3000
            protocol: TCP
            env:        
            - name: KNJ_LOG_TO_FILE
            value: "true"
            - name: KNJ_LOG_LEVEL
            value: "debug"
            - name: APPLICATION_NAME
            value: "acmeair"
            volumeMounts:
            - name: serverconfig
            mountPath: /opt/ibm/apm/serverconfig
        volumes:
        - name: serverconfig
          secret:
            secretName: icam-server-secret
            optional: true
    </pre>
3. Build the new Docker image.
4. Update the application yaml file to use the new Docker image.

### Option 2 (Embedding ICAM server configuration into docker image - Not preferred option usually)

You can copy the file global.environment and keyfile.p12 extracted from the configure package into the root directory of Node.js application directly.

#### Install Data Collector

If your environment can access Internet:

1. Update the package.json, add <code> "appmetrics": "^5.0.0" </code> as dependency.  
2. Update the main file of application, add the <code>require('appmetrics')</code> at top.  

If your environment cannot access internet: 

1. Unpack greenfield package according to your Node.js Runtime version, e.g. with Node.js v8.x Runtime, You need to do the following steps:

```
tar xzf appMgtDataCollectors_2019.4.0.tar.gz
cd appMgtDataCollectors_2019.4.0
tar zxf app_mgmt_runtime_dc_2019.4.0.tar.gz
cd app_mgmt_runtime_dc_2019.1.0
tar zxf nodejs_datacollector_2019.1.0.tgz
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

2. Build the new Docker image.
3. Update the application yaml file to use the new Docker image.