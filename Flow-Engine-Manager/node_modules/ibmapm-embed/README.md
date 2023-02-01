Table of Contents
=================
- [Table of Contents](#table-of-contents)
    - [Overview](#overview)
    - [The latest ibmapm package](#the-latest-ibmapm-package)
    - [Configuring the Node.js application monitoring using the Cloud App Management server](#configuring-the-nodejs-application-monitoring-using-the-cloud-app-management-server)
        - [Monitoring Node.js applications in IBM Cloud Private](#monitoring-nodejs-applications-in-ibm-cloud-private)
        - [Monitoring Microclimate based Node.js applications in IBM Cloud Private](#monitoring-microclimate-based-nodejs-applications-in-ibm-cloud-private)
        - [Monitoring on-premises Node.js applications](#monitoring-on-premises-nodejs-applications)
        - [Disabling the Node.js data collector](#disabling-the-nodejs-data-collector)
    - [Configuring Node.js application monitoring using the Cloud APM v8 server](#configuring-nodejs-application-monitoring-using-the-cloud-apm-v8-server)
    - [Troubleshooting](#troubleshooting)    

## Overview
The Node.js data collector can provide you with visibility and control of your Node.js applications, and help you ensure optimal performance and efficient use of resources. You can reduce and prevent application crashes and slowdowns around the clock, as the data collector assists you in detecting, diagnosing and isolating performance issues.

The Node.js data collector helps you to manage the performance and availability of the following:

- Node.js applications in IBM Cloud Private
- Node.js applications in IBM Cloud (aka Bluemix)
- Local Node.js applications

This data collector can be configured to connect to the Cloud App Management server, or the IBM Cloud Application Performance Management (Cloud APM v8) server.

## The latest ibmapm package
The Node.js data collector is published to npm already. You can find it in [ibmapm](https://www.npmjs.com/package/ibmapm).


## Configuring the Node.js application monitoring using the Cloud App Management server
When the data collector is configured to connect to the Cloud App Management server, you can use it to monitor both the Node.js applications in IBM Cloud Private and on-premises Node.js applications.

### Monitoring Node.js applications in IBM Cloud Private

To monitor a Node.js applications running as a container in IBM Cloud Private, follow the instructions as documented in [Configuring the data collector for applications in IBM Cloud Private](readme-topics/nodejsdc_config_winterfell_container.md)

### Monitoring Microclimate based Node.js applications in IBM Cloud Private

To monitor a Node.js applications which created by Microclimate running as a container in IBM Cloud Private, follow the instructions as documented in [Configuring the data collector for Microclimate based applications in IBM Cloud Private](readme-topics/nodejsdc_config_winterfell_container_microclimate.md)

### Monitoring on-premises Node.js applications
To monitor on-premises Node.js applications, follow the instructions as documented in [Configuring on-premises Node.js applications monitoring using the Cloud App Management server](readme-topics/nodejsdc_config_winterfell_onpremise.md).

You can also use the supported variables to change the default behavior of data collection. For more information, see [Advanced configuration](readme-topics/nodejs_dc_advanced_config.md).

### Disabling the Node.js data collector
To disable the Node.js data collector, roll back the changes that you have made to your application and then update the application deployment. For more information, see [Disabling the Node.js data collector](readme-topics/nodejs_dc_unconfig.md).

## Configuring Node.js application monitoring using the Cloud APM v8 server
You can configure the Node.js data collector using the Cloud APM v8 server to monitor your Node.js applications running locally or in IBM Cloud Private.

### Prerequisites
Before configure the Node.js DC to connect to the Cloud APM v8 server, you need to get the configuration information from APM server first, see [Get the APM configuration information](readme-topics/nodejs_dc_apm_configure.md).

- If you are a Cloud APM, Private (on-premises) user, complete the following procedures:
> - [Configuring the data collector for local applications](readme-topics/nodejsdc_config_apm_onpremise.md)
> - [Configuring the data collector for applications in IBM Cloud Private](readme-topics/nodejsdc_config_apm_icp.md)
> - [Configuring method trace and transaction tracking](readme-topics/nodejsdc_mt_tt.md)

You can also use the supported variables to change the default behavior of data collection. For more information, see [Advanced configuration](readme-topics/nodejs_dc_advanced_config.md).

## Troubleshooting
Find below some possible problem scenarios and corresponding diagnostic steps. 
### Multiple versions of Node Application Metrics are being initialized.

```
AssertionError [ERR_ASSERTION]: Multiple versions of Node Application Metrics are being initialized.
This version 3.1.3 is incompatible with already initialized
version 4.0.0.
```
This error indicates there are multiple versions of Node Application Metrics are being installed in your application. The appmetrics version 4.0.0 or later is required for Node.js data collector.
If your application requires the module such as: appmetrics-dash, appmetrics-prometheus or appmetrics-zipkin which require the appmetrics, please make sure these modules has right version which requiring the appmetrics 4.0.0 or later.
```
"appmetrics-dash": "^4.0.0",
"appmetrics-prometheus": "^2.0.0",
"appmetrics-zipkin": "^1.0.4",
```

### New version of Node Application Metrics are using by application.

```
AssertionError [ERR_ASSERTION]: New version of Node Application Metrics are using by application.
This version 4.*.* is incompatible with already initialized
version 4.0.1.
```
If you are using greenfield ibmapm in your application, and your application is using a higher version of appmetrics, you will find this error.  
you need to delete the appmetrics folder in ./ibmapm/node_modules (it is v4.0.1), so that the latest version in your application could be used.
```
rm -rf ./ibmapm/node_modules/appmetrics
```

