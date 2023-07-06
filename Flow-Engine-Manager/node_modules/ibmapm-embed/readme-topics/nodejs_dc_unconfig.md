## Disabling the Node.js data collector

### Procedure

To disable the Node.js data collector, roll back the changes that you have made to your application and then update the application deployment.

1. You can remove the `require('appmetrics');` from the main file of Node.js application, and remove the dependence for "appmetrics" from package.json.

2. Delete the global.environment and keyfiles.p12 from Node.js application, in case you configure the Node.js DC by put these files to the root of application.

3. If you configure the Node.js DC by creating the secret in the Kubernetes, you can disable the Node.js DC by remove the secret.

    `kubectl delete secret icam-server-secret -n <namespace>`