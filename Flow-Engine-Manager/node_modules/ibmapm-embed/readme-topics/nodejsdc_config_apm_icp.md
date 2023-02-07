# Configuring the data collector for applications in IBM Cloud Private
You can configure the Node.js data collector to monitor applications in IBM Cloud Private and connect to the Cloud APM v8 server.

## Prerequisites
- Before configure the Node.js DC to connect to the Cloud APM v8 server, you need to get the configuration information from APM server first, see [Get the APM configuration information](nodejs_dc_apm_configure.md).

- The service account that you use to install and configure the data collector must have access to Kubernetes resources. You can run the following commands on the Kubernetes master node to determine if the data collector has access to resources by using your service account:

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

## Procedure
Complete the following steps to install appmetrics with the Node.js data collector integrated:

1. In the `package.json` file of your Node.js application, add the following line to the dependencies section:
    <pre>"appmetrics":"^5.0.0"</pre>
2. Add the following line to the begining of the main file of your Node.js application:
    <pre>require('appmetrics');</pre>
    
    **Tip:** If you start your application by running the node app.js command, `app.js` is the main file of your application.
3. Copy the global.environment and keyfile.p12 to the root of Node.js application.
4. Rebuild your docker image.
5. Update the application yaml file to use the new Docker image.
