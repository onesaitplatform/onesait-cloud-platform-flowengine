// Copyright IBM Corp. 2017. All Rights Reserved.
// Node module: ibmapm
// This file is licensed under the Apache License 2.0.
// License text available at https://opensource.org/licenses/Apache-2.0
'use strict';
var fs = require('fs');
var url = require('url');
var crypto = require('crypto');
const zipkin = require('../appmetrics-zipkin/index.js');
var restClient = require('ibmapm-restclient');
var aarTools = require('./tool/aartools');
var adrTools = require('./tool/adrtools');
var uuid = require('uuid');
var os = require('os');
var commonTools = require('./tool/common');
var k8sutil = restClient.getK8stool();
var logger = global.knj_logger;
var serviceEndPointResIDs = [];
var hostPorts = {};
var predefined_situation = require('../etc/predefined_situation.json');
var dcConfig = require('./config.js');
var queryProviderRetry = 0;
var configurationInitialized = false;
global.MAX_METRIC_BATCH_SIZE = 150;
global.REREGISTER_DURATION = process.env['KNJ_REREGISTER_DURATION'] ? process.env['KNJ_REREGISTER_DURATION'] : 10;
global.configurationIsNotPosted = true;
global.queryProviderInterval = undefined;
global.k8providerIdRetry = 3;

var getDeployment = function() {
    if (k8sutil.isICP()) {
        return 'container';
    } else {
        return 'traditional';
    }

};


function JsonSender() {
    this.port = 443;
    this.app_hostname = os.hostname();
    this.applicationName = process.env.APPLICATION_NAME;
    this.nodeAppRuntimeString = undefined;
    this.nodeAppRuntimeMD5String = undefined;
    this.interfaceMD5String = undefined;
    this.instanceString = undefined;
    this.isServiceEndPointReady = false;
    this.externalRegister = {};
    this.startTime = (new Date()).toISOString();
    this.vcap = undefined;
    this.appVersion = undefined;

    this.app_data = undefined;

    this.isAppMetricInitialized = false;
    this.environment = undefined;

    this.registeredAll = false;
    this.situationPosted = false;
    this.aarBatchForBI = {
        payload: [],
        committed: false
    };
    this.dcversion = global.DC_VERSION ? global.DC_VERSION : getDCVersion();
    this.serviceIds = [];
    this.serviceNames = [];
    this.isicp = k8sutil.isICP();
}

function getDCVersion() {
    var packageFile = __dirname + '/../package.json';
    var packageString = fs.readFileSync(packageFile);
    var packageJson = JSON.parse(packageString);
    if (packageJson && packageJson.version) {
        return packageJson.version;
    }
    return '1.0.0';
}

function getServerAddress(family, defAddr) {
    var interfaces = os.networkInterfaces();
    for (var intf in interfaces) {
        if (interfaces.hasOwnProperty(intf)) {
            var iface = interfaces[intf];
            for (var i = 0; i < iface.length; i++) {
                var alias = iface[i];

                if (alias.family === family && alias.address !== '127.0.0.1' &&
                    alias.address !== '::1' && !alias.internal)
                    return alias.address;
            }
        }
    }
    return defAddr || '127.0.0.1';
}

var _this = this;
JsonSender.prototype.register = function register() { // Register DC and Resouce
    // Prepare Node.js App related reusable strings: this.applicationName, this.nodeAppMD5String

    logger.debug('Register...');
    var path = process.mainModule ? process.mainModule.filename : process.argv[1];
    _this.IP = getServerAddress('IPv4', '127.0.0.1');
    _this.IPv6 = getServerAddress('IPv6', '::1');
    if (process.env.VCAP_APPLICATION) {
        _this.vcap = JSON.parse(process.env.VCAP_APPLICATION);
        _this.applicationName = _this.applicationName || _this.vcap.application_name;
        _this.instanceString = _this.vcap.instance_id;
        _this.nodeAppRuntimeString = _this.vcap.application_id + 'nodeapplicationruntime';
    } else if (_this.isicp) {
        _this.applicationName = _this.applicationName || k8sutil.getNamespace() +
            k8sutil.getPodName() + path;
        _this.instanceString = 'NodejsDC' + k8sutil.getNamespace() + k8sutil.getContainerID() + path;
        _this.nodeAppRuntimeString = commonTools.uid_po(k8sutil.getNamespace(), k8sutil.getPodName(),
            k8sutil.getContainerName(), 'nodeApplicationRuntime');
        _this.serviceNames = k8sutil.getServiceName();
        _this.serviceIds = k8sutil.getServiceID();
    } else {
        _this.applicationName = _this.applicationName || process.argv[1];
        _this.instanceString = 'NodejsDC' + _this.app_hostname + _this.applicationName + path;
        var containerId = k8sutil.getContainerID();
        if (containerId) {
            _this.instanceString += containerId;
        }
        _this.nodeAppRuntimeString = commonTools.uid_onprem_runtime('nodeApplicationRuntime',
            _this.app_hostname, path, _this.applicationName, containerId);
    }
    _this.nodeAppRuntimeMD5String = crypto.createHash('md5').update(_this.nodeAppRuntimeString)
        .digest('hex');
    _this.dcMD5String = crypto.createHash('md5').update(_this.instanceString)
        .digest('hex');

    logger.debug('The plain text of node application runtime id: ', _this.nodeAppRuntimeMD5String);
    logger.debug('The plain text of provider id: ', _this.instanceString + 'NodejsDC');

    // Register DC:

};

var dcConfiguration = {
    properties: {
        TRACE_LEVEL: {
            type: 'Enum',
            value: process.env.KNJ_LOG_LEVEL ?
                process.env.KNJ_LOG_LEVEL.toUpperCase() : 'INFO',
            valueList: ['DEBUG', 'INFO',
                'WARNING', 'ERROR', 'OFF'
            ]
        },
        SAMPLING_COUNT: {
            type: 'Number',
            value: process.env.KNJ_SAMPLING ? process.env.KNJ_SAMPLING : 1
        },
        MIN_CLOCK_TRACE: {
            type: 'Number',
            value: process.env.KNJ_MIN_CLOCK_TRACE ?
                process.env.KNJ_MIN_CLOCK_TRACE : 0
        },
        MIN_CLOCK_STACK: {
            type: 'Number',
            value: process.env.KNJ_MIN_CLOCK_STACK ?
                process.env.KNJ_MIN_CLOCK_STACK : 0
        },
        EVENTS_PER_FILE: {
            type: 'Number',
            value: process.env.EVENTS_PER_FILE ?
                process.env.EVENTS_PER_FILE : 200
        },
        FILE_COMMIT_TIME: {
            type: 'Number',
            value: process.env.FILE_COMMIT_TIME ?
                process.env.FILE_COMMIT_TIME : 60
        }
    },
    capabilities: {
        enableDataCollection: 'true',
        enableTransactionTracking: commonTools.testTrue(process.env.KNJ_ENABLE_TT) ? 'true' : 'false',
        enableDiagnosticData: commonTools.testTrue(process.env.KNJ_ENABLE_DEEPDIVE) ? 'true' : 'false',
        enableMethodTracing: commonTools.testTrue(process.env.KNJ_ENABLE_METHODTRACE) ? 'true' : 'false',
        enableMetrics: 'true'
    }
};

JsonSender.prototype.registerDC = function registerDC() {
    if (global.providerIsRegistered) {
        if (global.configurationIsNotPosted) {
            postDCConfiguration();
            return;
        } else {
            return;
        }
    }
    var dcObj = {
        id: process.env.KNJ_PROVIDER_ID ? process.env.KNJ_PROVIDER_ID : this.dcMD5String,
        type: ['provider'],
        startedTime: this.startTime,
        properties: {
            tags: ['deployment:' + getDeployment()],
            name: this.applicationName,
            dataCollectorVersion: this.dcversion,
            version: this.dcversion,
            host: this.app_hostname,
            providerType: 'NodejsDC'
        }
    };

    if (this.isicp) {
        dcObj.properties.namespace = k8sutil.getNamespace();
    }


    dcObj.references = [
        {
            direction: 'to', type: 'monitors',
            id: process.env.KNJ_NODEAPPLICATIONRUNTIME_ID ? process.env.KNJ_NODEAPPLICATIONRUNTIME_ID :
                ((!process.env.VCAP_APPLICATION) ? this.nodeAppRuntimeString : this.nodeAppRuntimeMD5String)
        }
    ];
    if (!process.env.UA_LWDC_LISTENER_URL) {
        for (let index = 0; index < serviceEndPointResIDs.length; index++) {
            const element = serviceEndPointResIDs[index];
            dcObj.references.push({direction: 'to', type: 'monitors', id: element});
        }
    }

    restClient.registerDC(dcObj, function(error, res) {
        try {
            if (error) {
                return;
            }
            if (res && ((res.statusCode >= 200 && res.statusCode < 300) || res.statusCode === 409)) {
                if (process.env.UA_LWDC_LISTENER_URL) {
                    logger.debug('Provider posted to ua-plugin successfully.');
                    global.providerIsRegistered = true;
                    logger.debug('Now the global.providerIsRegistered is ' + global.providerIsRegistered);
                    postDCConfiguration();
                    return;
                }
                if (!global.queryProviderInterval) {
                    global.queryProviderInterval = setInterval(function() {
                        restClient.getDC(dcObj.id, function(getDCerror, getDCres) {
                            queryProviderRetry++;
                            if (getDCerror) {
                                logger.warn('Failed to get provider, please contact your server admin.');
                                return;
                            }
                            if (queryProviderRetry >= 240) {
                                clearInterval(global.queryProviderInterval);
                                logger.error('Failed to get provider 4 hours after registered,' +
                                    ' please contact your server admin.');
                                return;
                            }
                            getDCres.on('data', function(d) {
                                var providerString = d.toString();
                                logger.debug('get provider: ', providerString);
                                try {
                                    var providerJson = JSON.parse(providerString);
                                    if (providerJson && providerJson._items && providerJson._items.length === 1) {
                                        clearInterval(global.queryProviderInterval);
                                        global.providerIsRegistered = true;
                                        postDCConfiguration();
                                    } else {
                                        logger.debug('Provider is not ready, hold to post configuration.');
                                    }
                                } catch (e) {
                                    logger.error('Failed to parse provider, please contact your server admin.', e);
                                }
                            });
                        });
                    }, 60000); // queryProviderInterval end
                }
            }
        } catch (e) {
            logger.error('Failed to register DC', e);
        }
    });
};

function postDCConfiguration() {
    restClient.postDCConfiguration(dcConfiguration, 'NodejsDC', function(posterr, postres) {
        if (posterr) {
            global.configurationIsNotPosted = true;
            return;
        }
        if (postres && ((postres.statusCode >= 200 && postres.statusCode < 300) ||
            postres.statusCode === 409)) {
            if (global.configurationIsNotPosted) {
                global.configurationIsNotPosted = false;
                var getConfigurationInterval = setInterval(function() {
                    restClient.getConfiguration(function(geterr, getres) {
                        if (geterr) {
                            return;
                        }
                        if (getres && getres.headers && getres.headers['last-modified'] &&
                            getres.headers['last-modified'] !== global.KNJ_CONFIG_LASTMODIFIED
                        ) {
                            global.KNJ_CONFIG_LASTMODIFIED = getres.headers['last-modified'];
                            getres.on('data', function(d) {
                                var configuration = d.toString();
                                logger.debug('get configuration: ', configuration);
                                try {
                                    var configurationJson = JSON.parse(configuration);
                                    dealwithConfigurationChange(configurationJson);
                                } catch (e) {
                                    logger.error('Failed to parse configuration.', e);
                                }
                            });
                        }
                    });
                }, 60000); // getConfigurationInterval end
                getConfigurationInterval.unref();
            }
        } else {
            global.configurationIsNotPosted = true;
        }
    });
}

function dealwithConfigurationChange(conf) {
    logger.debug('Configuration:', conf.configuration);
    var curr = dcConfig.getConfig();
    if (conf.configuration) {
        var updated = false;
        if (conf.configuration.capabilities.enableTransactionTracking !==
            process.env.KNJ_ENABLE_TT) {
            process.env.KNJ_ENABLE_TT = conf.configuration.capabilities.enableTransactionTracking;
            updated = true;
        }
        if (conf.configuration.capabilities.enableDiagnosticData !==
            process.env.KNJ_ENABLE_DEEPDIVE) {
            process.env.KNJ_ENABLE_DEEPDIVE = conf.configuration.capabilities.enableTransactionTracking;
            updated = true;
        }
        if (conf.configuration.capabilities.enableMethodTracing !==
            process.env.KNJ_ENABLE_METHODTRACE) {
            process.env.KNJ_ENABLE_METHODTRACE = conf.configuration.capabilities.enableTransactionTracking;
            updated = true;
        }
        if (conf.configuration.properties.SAMPLING_COUNT.value !==
            parseInt(process.env.KNJ_SAMPLING)) {
            process.env.KNJ_SAMPLING = conf.configuration.properties.SAMPLING_COUNT.value + '';
            updated = true;
        }
        if (conf.configuration.properties.MIN_CLOCK_TRACE.value !==
            parseInt(process.env.KNJ_MIN_CLOCK_TRACE)) {
            process.env.KNJ_MIN_CLOCK_TRACE = conf.configuration.properties.MIN_CLOCK_TRACE.value + '';
            updated = true;
        }
        if (conf.configuration.properties.MIN_CLOCK_STACK.value !==
            parseInt(process.env.KNJ_MIN_CLOCK_STACK)) {
            process.env.KNJ_MIN_CLOCK_STACK = conf.configuration.properties.MIN_CLOCK_STACK.value + '';
            updated = true;
        }
        if (conf.configuration.properties.EVENTS_PER_FILE.value !==
            parseInt(process.env.KNJ_EVENTS_PER_FILE)) {
            process.env.KNJ_EVENTS_PER_FILE = conf.configuration.properties.EVENTS_PER_FILE.value + '';
            updated = true;
        }
        if (conf.configuration.properties.FILE_COMMIT_TIME.value !==
            parseInt(process.env.KNJ_FILE_COMMIT_TIME)) {
            process.env.KNJ_FILE_COMMIT_TIME = conf.configuration.properties.FILE_COMMIT_TIME.value + '';
            updated = true;
        }
        if (updated) {
            if (configurationInitialized) {
                logger.info('DC Configuration Changed', conf.configuration);
                configurationInitialized = true;
            }
            dcConfig.update(curr);
        }
        if (!process.env.KNJ_LOG_LEVEL ||
            process.env.KNJ_LOG_LEVEL.toUpperCase() !==
            conf.configuration.properties.TRACE_LEVEL.value.toUpperCase()) {
            logger.info('Loglevel Configuration Changed',
                conf.configuration.properties.TRACE_LEVEL.value);
            process.env.KNJ_LOG_LEVEL = conf.configuration.properties.TRACE_LEVEL.value.toUpperCase();
            logger.level = process.env.KNJ_LOG_LEVEL;
            restClient.updateLoglevel(process.env.KNJ_LOG_LEVEL);
        }
    }
}


JsonSender.prototype.init = function init(envType) {
    _this = this;
    var the_port;
    try {
        if (process.env.KNJ_CONFIG_FILE) {
            restClient.setConfiguration('./' + process.env.KNJ_CONFIG_FILE);
        } else {
            restClient.setConfiguration('./config.json');
        }
        _this.IP = getServerAddress('IPv4', '127.0.0.1');
        _this.IPv6 = getServerAddress('IPv6', '::1');

        var vcapApplication;
        if (process.env.VCAP_APPLICATION) {
            vcapApplication = JSON.parse(process.env.VCAP_APPLICATION);
            this.applicationName = this.applicationName || vcapApplication['application_name'];
            _this.app_data = {
                APP_NAME: this.applicationName,
                INSTANCE_ID: vcapApplication['instance_id'],
                INSTANCE_INDEX: vcapApplication['instance_index'],
                URI: vcapApplication['uris'],
                START_TIME: vcapApplication['started_at'],
                APP_PORT: vcapApplication['port']
            };
        } else {
            the_port = commonTools.getServerPort();
            the_port = the_port === 'unknown' ? 0 : the_port;

            if (!process.env.APPLICATION_NAME) {
                // find name in package.json
                if (process.mainModule.paths && process.mainModule.paths.length > 0) {
                    var name = generateAppNameByPackage();

                    if (!name) {
                        logger.debug('Failed to get name in package.json,' +
                            ' will generate applicationName and' +
                            ' APP_GUID by file position.');
                        this.generateAppNameAndGuidbyPath();
                    } else {
                        this.applicationName = name;
                    }
                } else {
                    this.generateAppNameAndGuidbyPath();
                }
            }
            _this.app_data = {
                APP_NAME: this.applicationName,
                INSTANCE_ID: '' + process.pid,
                INSTANCE_INDEX: 0,
                URI: [this.app_hostname + ':' + the_port],
                START_TIME: (new Date()).toISOString(),
                APP_PORT: the_port
            };
        }

        // zipkin.updateServiceName(this.app_hostname + '_' + this.applicationName);
        this.register();
    } catch (e) {
        logger.error('JsonSender initialization error: ' + e);
        logger.error(e.stack);
    }

};

JsonSender.prototype.generateAppNameAndGuidbyPath = function generateAppNameAndGuidbyPath() {
    var the_path = process.env.PWD;
    var the_folder = the_path.replace(/\//g, '_');
    var arg_str = process.argv[1].replace(/\//g, '_');
    var appGuid = this.app_hostname + '_' + the_folder + '_' + arg_str;
    var nodeAppNPMMD5 = crypto.createHash('md5');
    nodeAppNPMMD5.update(appGuid);
    appGuid = nodeAppNPMMD5.digest('hex');

    if (process.argv[1].indexOf(the_path) !== -1) {
        this.applicationName = this.applicationName || process.argv[1];
    } else {
        this.applicationName = this.applicationName || the_path + '/' + process.argv[1];
    }
};

function generateAppNameByPackage() {
    let name;
    for (const i in process.mainModule.paths) {
        if (process.mainModule.paths.hasOwnProperty(i)) {
            const packageFile = process.mainModule.paths[i].split('node_modules')[0] +
                '/' + 'package.json';
            try {
                const packageString = fs.readFileSync(packageFile);
                const packageJson = JSON.parse(packageString);
                if (packageJson.name) {
                    name = packageJson.name;
                    break;
                }
            } catch (e) {
                logger.debug('Could not found the ' + packageFile);
            }
        }
    }
    return name;
}

JsonSender.prototype.registerAppModel = function registerAppModel() {
    if (this.vcap && !global.RESOURCE_SVCEP_REGISTED) {
        global.RESOURCE_SVCEP_REGISTED = true;
        serviceEndPointResIDs = [];
        for (var index = 0; index < this.vcap.application_uris.length; index++) {
            var uri = this.vcap.application_uris[index];
            var interfaceMD5String = crypto.createHash('MD5').update(uri + ':' + this.vcap.port)
                .digest('hex');
            var interfaceObj = {
                id: process.env.KNJ_SERVICEENDPOINTS_ID ? process.env.KNJ_SERVICEENDPOINTS_ID : interfaceMD5String,
                type: ['serviceEndpoint'],
                properties: {
                    port: this.vcap.port,
                    name: this.vcap.name,
                    tags: ['deployment:' + getDeployment(), 'serviceEndpoint'],
                    metricsAvailable: false
                }
            };
            serviceEndPointResIDs.push(interfaceObj.id);
            if (process.env.UA_LWDC_LISTENER_URL) {
                logger.debug('Found defaut UA plugin URL, DC will work under UA mode');
                global.SERVICEENDPOINT_REGISTED = true;
                this.registerDC();
                this.registerAppRuntime(interfaceObj && interfaceObj.properties.port);
                return;
            }
            restClient.registerResource(interfaceObj, function(err, res) {
                if (err) {
                    return;
                }
                if (res.statusCode === 409) {
                    restClient.updateResource(interfaceObj, res.headers.location);
                    global.SERVICEENDPOINT_REGISTED = true;
                } else if (res.statusCode < 400) {
                    global.SERVICEENDPOINT_REGISTED = true;
                }
            });
        }
        this.registerDC();
        this.registerAppRuntime(interfaceObj && interfaceObj.properties.port);
    }
};
JsonSender.prototype.registerAppRuntime = function registerAppRuntime(urlPort) {
    logger.debug('json-sender.js', 'registerAppRuntime', 'start');
    const runtimeObj = {
        id: process.env.KNJ_NODEAPPLICATIONRUNTIME_ID ?
            process.env.KNJ_NODEAPPLICATIONRUNTIME_ID : this.nodeAppRuntimeMD5String,
        type: ['nodeApplicationRuntime'],
        references: [],
        properties: {
            name: this.applicationName,
            applicationName: this.applicationName,
            host: this.app_hostname,
            ip: this.IP,
            tags: ['deployment:' + getDeployment(), 'serviceInstance'],
            port: urlPort,
            VersionDependencies: {
                version: process.versions.node,
                http_parser: process.versions.http_parser,
                v8: process.versions.v8,
                ares: process.versions.ares,
                uv: process.versions.uv,
                zlib: process.versions.zlib,
                modules: process.versions.modules,
                openssl: process.versions.openssl
            }
        }

    };
    if (process.env.UA_LWDC_LISTENER_URL) {
        global.onpremise_serviceName = '_tenantid_' + '_' + runtimeObj.id;
    } else {
        global.onpremise_serviceName = process.env.APM_TENANT_ID + '_' + runtimeObj.id;
    }
    zipkin.updateServiceName(global.onpremise_serviceName);
    for (let index = 0; index < serviceEndPointResIDs.length; index++) {
        const element = serviceEndPointResIDs[index];
        runtimeObj.references.push({direction: 'from', type: 'communicatesWith', id: element});
    }
    if (process.env.UA_LWDC_LISTENER_URL) {
        logger.debug('json-sender.js', 'nodeApplicationRuntime does not need to be registered in ua-plugin mode');
        global.nodeApplicationRuntimeIsRegistered = true;
        return;
    }
    restClient.registerResource(runtimeObj, function(err, res) {
        if (err) {
            return;
        }
        if (res && ((res.statusCode >= 200 && res.statusCode < 300) || res.statusCode === 409)) {
            logger.debug('nodeApplicationRuntime is registered');
            global.nodeApplicationRuntimeIsRegistered = true;
        }
        if (res.statusCode === 409) {
            restClient.updateResource(runtimeObj, res.headers.location);
        }
    });
};

JsonSender.prototype.registerAppModelOnPre = function registerAppModelOnPre(reqData) {
    if (this.vcap || this.isicp || !this.applicationName) {
        return;
    }
    // global.RESOURCE_SVCEP_REGISTED = true;
    if (reqData === undefined || reqData.requestHeader === undefined || reqData.requestHeader.host === undefined) {
        logger.debug('The invalidate request data from Appmetrics.', reqData);
        return;
    }
    var host = reqData.requestHeader.host;
    if (!host.toLowerCase().startsWith('http')) {
        host = 'http://' + host;
    }
    var uri = url.parse(host);
    if (hostPorts[uri.href]) {
        return;
    }
    hostPorts[uri.href] = true;
    this.interfaceString = commonTools.uid_onprem_service('serviceEndpoint', this.applicationName,
        uri.host, k8sutil.getContainerID());

    var interfaceObj = {
        id: process.env.KNJ_SERVICEENDPOINTS_ID ? process.env.KNJ_SERVICEENDPOINTS_ID : this.interfaceString,
        type: ['serviceEndpoint'],
        properties: {
            port: uri.port === null ? 80 : uri.port,
            name: (uri.host).replace(':', '_'),
            tags: ['deployment:' + getDeployment(), 'serviceEndpoint'],
            metricsAvailable: false
        }
    };
    serviceEndPointResIDs = [interfaceObj.id];
    if (process.env.UA_LWDC_LISTENER_URL) {
        logger.debug('json-sender.js', 'serviceEndpoint does not need to be registered in ua-plugin mode');
        this.registerDC();
        this.registerAppRuntimeOnPre(interfaceObj.properties.port);
        global.SERVICEENDPOINT_REGISTED = true;
        return;
    }
    restClient.registerResource(interfaceObj, function(err, res) {
        if (err) {
            return;
        }
        if (res.statusCode === 409) {
            restClient.updateResource(interfaceObj, res.headers.location);
            global.SERVICEENDPOINT_REGISTED = true;
        } else if (res.statusCode < 400) {
            global.SERVICEENDPOINT_REGISTED = true;
        }
    });

    this.registerDC();
    this.registerAppRuntimeOnPre(interfaceObj.properties.port);
};

JsonSender.prototype.registerAppRuntimeOnPre = function registerAppRuntimeOnPre(urlPort) {
    logger.debug('json-sender.js', 'registerAppRuntimeOnPre', 'start');
    var instanceName;
    if (global.containerId) {
        if (this.app_hostname === k8sutil.getShortContainerID()) {
            instanceName = this.app_hostname + '_' + this.applicationName;
        } else {
            instanceName = this.app_hostname + '_' + k8sutil.getShortContainerID() + '_' + this.applicationName;
        }
    } else {
        instanceName = this.app_hostname + '_' + this.applicationName;
    }
    const runtimeObj = {
        id: process.env.KNJ_NODEAPPLICATIONRUNTIME_ID ?
            process.env.KNJ_NODEAPPLICATIONRUNTIME_ID : this.nodeAppRuntimeString,
        type: ['nodeApplicationRuntime'],
        references: [],
        properties: {
            name: instanceName,
            applicationName: this.applicationName,
            host: this.app_hostname,
            port: urlPort,
            ip: this.IP,
            tags: ['deployment:' + getDeployment(), 'serviceInstance'],
            VersionDependencies: {
                version: process.versions.node,
                http_parser: process.versions.http_parser,
                v8: process.versions.v8,
                ares: process.versions.ares,
                uv: process.versions.uv,
                zlib: process.versions.zlib,
                modules: process.versions.modules,
                openssl: process.versions.openssl
            }
        }

    };
    if (process.env.UA_LWDC_LISTENER_URL) {
        global.onpremise_serviceName = '_tenantid_' + '_' + runtimeObj.id;
    } else {
        global.onpremise_serviceName = process.env.APM_TENANT_ID + '_' + runtimeObj.id;
    }
    zipkin.updateServiceName(global.onpremise_serviceName);
    for (let index = 0; index < serviceEndPointResIDs.length; index++) {
        const element = serviceEndPointResIDs[index];
        runtimeObj.references.push({direction: 'from', type: 'communicatesWith', id: element});
    }
    if (process.env.UA_LWDC_LISTENER_URL) {
        logger.debug('json-sender.js', 'nodeApplicationRuntime does not need to be registered in ua-plugin mode');
        global.nodeApplicationRuntimeIsRegistered = true;
        return;
    }
    restClient.registerResource(runtimeObj, function(err, res) {
        if (err) {
            return;
        }
        if (res && ((res.statusCode >= 200 && res.statusCode < 300) || res.statusCode === 409)) {
            logger.debug('nodeApplicationRuntime is registered');
            global.nodeApplicationRuntimeIsRegistered = true;
        }
        if (res.statusCode === 409) {
            restClient.updateResource(runtimeObj, res.headers.location);
        }
    });
};
JsonSender.prototype.registerAppModelOnICP = function registerAppModelOnICP() {
    logger.debug('json-sender.js', 'registerAppModelOnICP', 'start');
    if (this.vcap) {
        logger.debug('json-sender.js', 'registerAppModelOnICP', 'is vcap environment skip ICP register');
        return;
    }

    var svcArr = k8sutil.getServicesConn();
    if (!svcArr || svcArr.length === 0) {
        k8sutil.refreshServiceInfo();
        return;
    }

    var nodePort = [];
    var nodeIP = [];
    serviceEndPointResIDs = [];
    if (svcArr.length === 0) {
        serviceName = commonTools.polishServiceName(k8sutil.getK8MProviderId(),
            k8sutil.getNamespace(), this.applicationName);
        if (serviceName) {
            zipkin.updateServiceName(serviceName);
        } else {
            return;
        }
    }

    for (var index = 0; index < svcArr.length; index++) {
        var svc = svcArr[index];
        var serviceID = commonTools.uid_service('serviceEndpoint', k8sutil.getNamespace(), svc.name, svc.uid);
        var svcName = commonTools.polishServiceName(k8sutil.getK8MProviderId(), k8sutil.getNamespace(), svc.name);
        serviceEndPointResIDs.push(process.env.KNJ_SERVICEENDPOINTS_ID ?
            process.env.KNJ_SERVICEENDPOINTS_ID : serviceID);
        var serviceName;
        if (this.serviceNames.length <= 0) {
            this.serviceNames = k8sutil.getServiceName();
        }
        if (this.serviceNames.length > 0) {
            serviceName = commonTools.polishServiceName(k8sutil.getK8MProviderId(),
                k8sutil.getNamespace(), this.serviceNames[0]);
        } else {
            serviceName = commonTools.polishServiceName(k8sutil.getK8MProviderId(),
                k8sutil.getNamespace(), this.applicationName);
        }

        if (serviceName) {
            zipkin.updateServiceName(serviceName);
        } else {
            return;
        }
        if (process.env.UA_LWDC_LISTENER_URL) {
            logger.debug('json-sender.js', 'serviceEndpoint does not need to be registered in ua-plugin mode');
            global.SERVICEENDPOINT_REGISTED = true;
            if (serviceEndPointResIDs.length === 0) {
                k8sutil.reinit();
            }
            this.registerAppRuntimeOnICP(Array.from(new Set(nodePort)), Array.from(new Set(nodeIP)), serviceName);
            return;
        }
        let interfaceObj = {
            id: process.env.KNJ_SERVICEENDPOINTS_ID ? process.env.KNJ_SERVICEENDPOINTS_ID : serviceID,
            type: ['serviceEndpoint'],
            properties: {
                name: svcName,
                namespace: k8sutil.getNamespace(),
                connections: svc.connections,
                mergeTokens: svc.mergeTokens.concat([svc.uid, serviceName]),
                clusterName: global.clusterName ? global.clusterName : 'unnamedcluster',
                tags: ['deployment:' + getDeployment(), 'serviceEndpoint'],
                metricsAvailable: false
            }
        };

        if (svc.nodePort.length > 0) {
            interfaceObj.properties.connections = interfaceObj.properties.connections.concat(
                commonTools.combineArr(k8sutil.getNodeIPs(), ':', svc.nodePort));
            nodePort = svc.nodePort;
        }
        for (var conn = 0; interfaceObj.properties.connections
        && conn < interfaceObj.properties.connections.length; conn++) {
            var connect = interfaceObj.properties.connections[conn];
            var ipport = connect.split(':');
            if (ipport.length === 2) {
                nodePort.push(ipport[1]);
                nodeIP.push(ipport[0]);
            }
        }

        restClient.registerResource(interfaceObj, function(err, res) {
            if (err) {
                return;
            }
            if (res.statusCode === 409) {
                restClient.updateResource(interfaceObj, res.headers.location);
                global.SERVICEENDPOINT_REGISTED = true;
            } else if (res.statusCode < 400) {
                global.SERVICEENDPOINT_REGISTED = true;
            }
        });
    }

    if (serviceEndPointResIDs.length === 0) {
        k8sutil.reinit();
    }

    this.registerAppRuntimeOnICP(Array.from(new Set(nodePort)), Array.from(new Set(nodeIP)), serviceName);
};

JsonSender.prototype.registerAppRuntimeOnICP = function registerAppRuntimeOnICP(nodePort, nodeIP, svcName) {
    logger.debug('json-sender.js', 'registerAppRuntimeOnICP', 'start');
    if (process.env.UA_LWDC_LISTENER_URL) {
        global.getMergeTokens = k8sutil.getMergeTokens();
        logger.debug('json-sender.js', 'global getMergeTokens is ', global.getMergeTokens);
    }
    if (!k8sutil.getContainerName() || !k8sutil.getContainerFullID()) {
        logger.warn('Not get containerName and containerID yet, postpond resource register.');
        k8sutil.reinit();
        return;
    }
    if (!process.env.VCAP_APPLICATION) {
        this.nodeAppRuntimeString = commonTools.uid_po(k8sutil.getNamespace(), k8sutil.getPodName(),
            k8sutil.getContainerName(), 'nodeApplicationRuntime');
    }
    this.registerDC();
    const runtimeObj = {
        id: process.env.KNJ_NODEAPPLICATIONRUNTIME_ID ?
            process.env.KNJ_NODEAPPLICATIONRUNTIME_ID : this.nodeAppRuntimeString,
        type: ['nodeApplicationRuntime'],
        references: [],
        properties: {
            name: k8sutil.getNamespace() + '.' + k8sutil.getPodName() + '.' + this.applicationName,
            applicationName: this.applicationName,
            host: this.app_hostname,
            ip: nodeIP ? nodeIP.join(',') : this.IP,
            port: nodePort ? nodePort.join(',') : 0,
            tags: ['deployment:' + getDeployment(), 'serviceInstance'],
            namespace: k8sutil.getNamespace(),
            clusterName: global.clusterName ? global.clusterName : 'unnamedcluster',
            mergeTokens: [
                k8sutil.getNodeName() + '.' + k8sutil.getNamespace() +
                '.' + k8sutil.getPodID() + '.' + k8sutil.getContainerName(),
                k8sutil.getNodeName() + '.' + k8sutil.getNamespace() +
                '.' + k8sutil.getPodID() + '.' + k8sutil.getContainerFullID(),
                k8sutil.getContainerID(),
                k8sutil.getPodID(), svcName
            ]
        },
        VersionDependencies: {
            version: process.versions.node,
            http_parser: process.versions.http_parser,
            v8: process.versions.v8,
            ares: process.versions.ares,
            uv: process.versions.uv,
            zlib: process.versions.zlib,
            modules: process.versions.modules,
            openssl: process.versions.openssl
        }

    };

    if (k8sutil.getContainerID()) {
        global.containerId = k8sutil.getContainerID();
        runtimeObj.properties.containerId = global.containerId;
    }
    if (k8sutil.getPodName()) {
        global.podName = k8sutil.getPodName();
        runtimeObj.properties.podName = global.podName;
    }
    if (k8sutil.getPodID()) {
        global.podId = k8sutil.getPodID();
    }
    for (let index = 0; index < serviceEndPointResIDs.length; index++) {
        const element = serviceEndPointResIDs[index];
        runtimeObj.references.push({direction: 'from', type: 'communicatesWith', id: element});
    }
    if (process.env.UA_LWDC_LISTENER_URL) {
        logger.debug('json-sender.js', 'nodeApplicationRuntime does not need to be registered in ua-plugin mode');
        global.nodeApplicationRuntimeIsRegistered = true;
        return;
    }
    restClient.registerResource(runtimeObj, function(err, res) {
        if (err) {
            return;
        }
        if (res && ((res.statusCode >= 200 && res.statusCode < 300) || res.statusCode === 409)) {
            logger.debug('nodeApplicationRuntime is registered');
            global.nodeApplicationRuntimeIsRegistered = true;
        }
        if (res.statusCode === 409) {
            restClient.updateResource(runtimeObj, res.headers.location);
        }
    });
};

var lastRegisterTimestamp;

function registerCheck() {
    var curr = new Date();
    logger.debug('registerCheck: curr', curr, 'lastRegisterTimestamp', lastRegisterTimestamp);
    if (!global.nodeApplicationRuntimeIsRegistered) {
        logger.debug('registerCheck: curr', '!global.nodeApplicationRuntimeIsRegistered is', !global.nodeApplicationRuntimeIsRegistered);
        return true;
    } else if (!global.clusterId && curr - lastRegisterTimestamp >= (60000 * global.REREGISTER_DURATION)) {
        logger.debug('registerCheck: curr', '!global.clusterId is', !global.clusterId);
        logger.debug('registerCheck: curr', ' curr - lastRegisterTimestamp >= (60000 * global.REREGISTER_DURATION)',
            curr - lastRegisterTimestamp >= (60000 * global.REREGISTER_DURATION));
        return true;
    } else if (curr - lastRegisterTimestamp >= (180000 * global.REREGISTER_DURATION)) {
        logger.debug('registerCheck: curr', '(curr - lastRegisterTimestamp >= (180000 * global.REREGISTER_DURATION) is',
            curr - lastRegisterTimestamp >= (180000 * global.REREGISTER_DURATION));
        return true;
    } else return false;
}

JsonSender.prototype.dynamicRegister = function dynamicRegister(env) {
    var doRegister = registerCheck();
    logger.debug('json-sender.js', 'dynamicRegister', doRegister);
    if (!doRegister) {
        return;
    }
    lastRegisterTimestamp = new Date();
    var self = this;
    if (this.isicp && !this.vcap) {
        k8sutil.fetchK8MProviderID(function() {
            if (k8sutil.getK8MProviderId() && !process.env.UA_LWDC_LISTENER_URL) {
                restClient.getDC(k8sutil.getK8MProviderId(), function(err, res) {
                    if (err) {
                        self.registerAppModelOnICP();
                        return;
                    }
                    logger.debug('Get k8m provider status code:', res.statusCode);
                    res.on('data', function(d) {
                        try {
                            var content = JSON.parse(d.toString());
                            if (content && content._items && content._items.length === 1) {
                                var _id = content._items[0]._id;
                                logger.debug('Get cluster provider id:', _id);
                                restClient.queryRelationship(_id, function(relerr, relres) {
                                    if (relerr) {
                                        logger.warn('Get providerID, but not get relationship, register anyway');
                                        self.registerAppModelOnICP();
                                        return;
                                    }
                                    logger.debug('Get k8m relationship status code:', relres.statusCode);
                                    relres.on('data', function(rel) {
                                        var relationships = JSON.parse(rel.toString());
                                        if (relationships && relationships._items && relationships._items.length >= 1) {
                                            if (relationships._items.length === 1) {
                                                global.clusterId = relationships._items[0].uid;
                                                global.clusterName = relationships._items[0].name;
                                                logger.debug('Get clusterId:', global.clusterId);
                                                self.registerAppModelOnICP();
                                                return;
                                            } else {
                                                for (var i = 0; i < relationships._items.length; i++) {
                                                    var item = relationships._items[i];
                                                    if (item.type === 'k8sCluster') {
                                                        global.clusterId = item.uid;
                                                        global.clusterName = item.name;
                                                        logger.debug('Get clusterId:', global.clusterId);
                                                        self.registerAppModelOnICP();
                                                        return;
                                                    }
                                                }
                                            }
                                        } else {
                                            logger.warn('Get providerID, but not get clusterName, register anyway');
                                            self.registerAppModelOnICP();
                                            return;
                                        }
                                    });
                                });
                            } else {
                                logger.warn('Get providerID, but not get provider content, register anyway');
                                self.registerAppModelOnICP();
                                return;
                            }
                        } catch (e) {
                            logger.warn('Failed to get clusterName, register anyway', e);
                            self.registerAppModelOnICP();
                        }
                    });
                });
            } else if (k8sutil.getK8MProviderId() && process.env.UA_LWDC_LISTENER_URL) {
                k8sutil.fetchK8MClusterID(function(provierid, name) {
                    if (provierid !== undefined && name !== undefined) {
                        global.clusterId = provierid + '_k8sCluster_' + name;
                        global.clusterName = name;
                        logger.debug('Get clusterId:', global.clusterId);
                        self.registerAppModelOnICP();
                        return;
                    } else {
                        logger.warn('Failed to get clusterID, register anyway');
                        self.registerAppModelOnICP();
                        return;
                    }
                });
            } else {
                if (global.k8providerIdRetry-- > 0) {
                    logger.warn('No k8m provider ID found, retry left: ', global.k8providerIdRetry);
                } else {
                    logger.info('No k8m provider ID found, register as normal');
                    self.registerAppModelOnICP();
                }
            }
        });
    } else if (!global.nodeApplicationRuntimeIsRegistered) {
        this.registerAppModel();
    }
};

JsonSender.prototype.setEnvironment = function setEnvironment(env) {
    logger.debug('json-sender.js', 'setEnvironment', env);
    this.isAppMetricInitialized = true;
    this.environment = env;
};

function getIp() {
    var ips = os.networkInterfaces();
    for (var k in ips) {
        if (ips.hasOwnProperty(k)) {
            for (var i = 0; ips[k] && i < ips[k].length; i++) {
                var theIp = ips[k][i];
                if (!theIp.internal && theIp.family === 'IPv4') {
                    return theIp.address;
                }
            }
        }
    }
}

JsonSender.prototype.send = function send(data) {
    if (data == null || data.appInfo == null) {
        return;
    }

    // if (this.isAppMetricInitialized) {
    //     this.dynamicRegister(this.environment);
    // }
    try {
        this.dynamicRegister();
    } catch (e) {
        logger.error('dynamicRegister failed: ', e);
    }
    if (global.nodeApplicationRuntimeIsRegistered &&
        !global.situationPosted) {
        if (process.env.UA_LWDC_LISTENER_URL) {
            logger.debug('json-sender.js', 'Situation does not need to be registered in ua-plugin mode');
            global.situationPosted = true;
            return;
        }
        restClient.postSituationConfiguration({PRIVATESIT: predefined_situation}, function(err, res) {
            if (err) {
                return;
            }
            if (res && ((res.statusCode >= 200 && res.statusCode < 300) || res.statusCode === 409)) {
                logger.debug('json-sender.js', 'Situation is posted successfully');
                global.situationPosted = true;
            }
        });
    }
    var metricPayloads = [];
    var dimensions_content = {
        pidi: (process.pid % 10) + ''
    };
    if (this.isicp) {
        if (this.serviceNames.length <= 0) {
            this.serviceNames = k8sutil.getServiceName();
        }
        for (var i = 0, len = this.serviceNames.length; i < len; i++) {
            dimensions_content[commonTools.polishServiceName(
                k8sutil.getK8MProviderId(),
                k8sutil.getNamespace(), this.serviceNames[i])] = 'serviceIds';
        }
        if (this.serviceNames.length > 0) {
            dimensions_content['serviceName'] = commonTools.polishServiceName(
                k8sutil.getK8MProviderId(),
                k8sutil.getNamespace(), this.serviceNames[0]);
        } else {
            dimensions_content['serviceName'] = commonTools.polishServiceName(
                k8sutil.getK8MProviderId(),
                k8sutil.getNamespace(), this.applicationName);
        }
        if (commonTools.getk8mServiceID()) {
            dimensions_content['serviceId'] = commonTools.getk8mServiceID();
        }
        if (global.podName) {
            dimensions_content['podName'] = global.podName;
        }
        if (global.containerId) {
            dimensions_content['containerId'] = 'docker://' + global.containerId;
        }
        var namespace = k8sutil.getNamespace();
        if (namespace) {
            dimensions_content['nameSpace'] = namespace;
        }
        if (global.clusterId) {
            dimensions_content['clusterID'] = global.clusterId;
        } else {
            dimensions_content['clusterID'] = 'unnamedcluster';
        }
        if (this.dcversion) {
            dimensions_content['version'] = this.dcversion;
        }
        if (process.env.UA_LWDC_LISTENER_URL) {
            dimensions_content['_provider_id'] = process.env.KNJ_PROVIDER_ID ?
                process.env.KNJ_PROVIDER_ID : this.dcMD5String;
            dimensions_content['_resource_id'] = process.env.KNJ_NODEAPPLICATIONRUNTIME_ID ?
                process.env.KNJ_NODEAPPLICATIONRUNTIME_ID :
                ((!this.vcap) ? this.nodeAppRuntimeString : this.nodeAppRuntimeMD5String);
            if (global.getMergeTokens) {
                dimensions_content['_mergeTokens'] = global.getMergeTokens;
            }
            dimensions_content['applicationName'] = this.applicationName;
            dimensions_content['instanceName'] = k8sutil.getNamespace() + '.' + k8sutil.getPodName() + '.' + this.applicationName;
            dimensions_content['host'] = this.app_hostname;
        }
    } else {
        if (global.onpremise_serviceName) {
            dimensions_content['serviceName'] = global.onpremise_serviceName;
        }
        if (global.podName) {
            dimensions_content['podName'] = global.podName;
        }
        if (global.containerId) {
            dimensions_content['containerId'] = 'docker://' + global.containerId;
        }
        namespace = k8sutil.getNamespace();
        if (namespace) {
            dimensions_content['nameSpace'] = namespace;
        }
        if (this.dcversion) {
            dimensions_content['version'] = this.dcversion;
        }
        if (process.env.UA_LWDC_LISTENER_URL) {
            dimensions_content['_provider_id'] = process.env.KNJ_PROVIDER_ID ?
                process.env.KNJ_PROVIDER_ID : this.dcMD5String;
            dimensions_content['_resource_id'] = process.env.KNJ_NODEAPPLICATIONRUNTIME_ID ?
                process.env.KNJ_NODEAPPLICATIONRUNTIME_ID :
                ((!this.vcap) ? this.nodeAppRuntimeString : this.nodeAppRuntimeMD5String);
            dimensions_content['host'] = this.app_hostname;
            dimensions_content['applicationName'] = this.applicationName;
            if (global.containerId) {
                if (this.app_hostname === k8sutil.getShortContainerID()) {
                    dimensions_content['instanceName'] = this.app_hostname + '_' + this.applicationName;
                } else {
                    dimensions_content['instanceName'] = this.app_hostname + '_' + k8sutil.getShortContainerID() + '_' + this.applicationName;
                }
            } else {
                dimensions_content['instanceName'] = this.app_hostname + '_' + this.applicationName;
            }
        }

    }
    var ibmapmContext = JSON.parse(JSON.stringify(dimensions_content));
    if (this.vcap) {
        ibmapmContext.ip = getIp();
        ibmapmContext['resource.id'] = process.env.KNJ_NODEAPPLICATIONRUNTIME_ID ?
            process.env.KNJ_NODEAPPLICATIONRUNTIME_ID : this.nodeAppRuntimeMD5String;
    } else if (this.isicp) {
        ibmapmContext.nodeName = k8sutil.getNodeName();
        ibmapmContext.ip = k8sutil.getNodeName();
        ibmapmContext['resource.id'] = process.env.KNJ_NODEAPPLICATIONRUNTIME_ID ?
            process.env.KNJ_NODEAPPLICATIONRUNTIME_ID : this.nodeAppRuntimeString;
    } else {
        ibmapmContext.ip = getIp();
        ibmapmContext['resource.id'] = process.env.KNJ_NODEAPPLICATIONRUNTIME_ID ?
            process.env.KNJ_NODEAPPLICATIONRUNTIME_ID : this.nodeAppRuntimeString;
    }
    ibmapmContext.hostname = this.app_hostname;
    ibmapmContext['applicationName'] = this.applicationName;
    ibmapmContext['tenantId'] = process.env.APM_TENANT_ID;
    zipkin.updateIbmapmContext(ibmapmContext);

    var reqSummPayload = this.genReqSumm(dimensions_content, data);
    metricPayloads.push(reqSummPayload);

    var reqsSummPayload =
        this.genRequestSummaries(dimensions_content, data);
    metricPayloads = metricPayloads.concat(reqsSummPayload.summary);
    metricPayloads = metricPayloads.concat(reqsSummPayload.record);
    metricPayloads = metricPayloads.concat(reqsSummPayload.errorCount);
    var enginePayloadMeta;
    if (this.nodeAppRuntimeMD5String) {
        if (process.env.UA_LWDC_LISTENER_URL) {
            enginePayloadMeta = {
                measurement: 'nodeApplicationRuntime',
                timestamp: new Date().toISOString()
            };
        } else {
            enginePayloadMeta = {
                resourceID: process.env.KNJ_NODEAPPLICATIONRUNTIME_ID ?
                    process.env.KNJ_NODEAPPLICATIONRUNTIME_ID :
                    ((!this.vcap) ? this.nodeAppRuntimeString : this.nodeAppRuntimeMD5String),
                timestamp: new Date().toISOString()
            };
        }
        var gcPayload = this.genGCPayload(dimensions_content,
            data, enginePayloadMeta);
        metricPayloads.push(gcPayload);

        var saturationPayload = this.genSaturationPayload(dimensions_content,
            data, enginePayloadMeta);
        metricPayloads.push(saturationPayload);

        var elPayload = this.genELPayload(dimensions_content,
            data, enginePayloadMeta);
        metricPayloads = metricPayloads.concat(elPayload);

        var sysPayload = this.genSysInfo(dimensions_content,
            data, enginePayloadMeta);
        metricPayloads.push(sysPayload);
    }
    // Plus other parts for BI
    var payloadBISpecial = {
        BIOnly: true,
        APP_NAME: this.app_data.APP_NAME,
        INSTANCE_ID: this.app_data.INSTANCE_ID,
        INSTANCE_INDEX: this.app_data.INSTANCE_INDEX,
        URI: this.app_data.URI,
        START_TIME: this.app_data.START_TIME,
        APP_PORT: this.app_data.APP_PORT,
        PORT: data.appInfo.PORT,
        HTTP_REQ: data.httpReq,
        eventloop_time: data.El.eventloop_time,
        averageEventLoopLatency: data.El.eventloop_latencyAvg,
        minimumEventLoopLatency: data.El.eventloop_latencyMin,
        maximumEventLoopLatency: data.El.eventloop_latencyMax,
        averageEventLoopTickTime: data.El.loop_average,
        maximumEventLoopTickTime: data.El.loop_maximum,
        minimumEventLoopTickTime: data.El.loop_minimum,
        eventLoopTickCount: data.El.loop_count,
        REQCOUNT: data.appInfo.REQCOUNT,
        REQRATE: data.appInfo.REQRATE,
        PID: data.appInfo.PID,
        APP_ENTRY: data.appInfo.APP_ENTRY,
        app_memAll: data.appInfo.app_memAll,
        app_uptime: data.appInfo.app_uptime
    };
    if (data.appInfo.TYPE) {
        payloadBISpecial.TYPE = data.appInfo.TYPE;
    }
    metricPayloads.push(payloadBISpecial);
    if (metricPayloads.length >= global.MAX_METRIC_BATCH_SIZE) {
        var oneBatch = metricPayloads.slice(0, global.MAX_METRIC_BATCH_SIZE);
        var rest = metricPayloads.slice(global.MAX_METRIC_BATCH_SIZE);
        restClient.sendMetrics(oneBatch);
        while (rest.length > 0) {
            oneBatch = rest.slice(0, global.MAX_METRIC_BATCH_SIZE);
            rest = rest.slice(global.MAX_METRIC_BATCH_SIZE);
            restClient.sendMetrics(oneBatch);
        }
    } else {
        restClient.sendMetrics(metricPayloads);
    }
    if (data.prof.length > 0) {
        this.sendMethodProfiling(data.prof, data.profMeta);
    }
    return;
};
JsonSender.prototype.genELPayload = function genELPayload(dimensions_content, data, enginePayloadMeta) {
    var elPayload = [];
    for (let index = 0; data.EL_Arr && index < data.EL_Arr.length; index++) {
        const eventloop = data.EL_Arr[index];
        enginePayloadMeta.timestamp = new Date(eventloop.eventloop_timestamp).toISOString();
        if (process.env.UA_LWDC_LISTENER_URL) {
            elPayload.push(commonTools.merge([
                enginePayloadMeta, {
                    fields: {
                        '!averageEventLoopLatency': eventloop.eventloop_latencyAvg,
                        '!minimumEventLoopLatency': eventloop.eventloop_latencyMin,
                        '!maximumEventLoopLatency': eventloop.eventloop_latencyMax
                    }
                }, {
                    tags: commonTools.merge([dimensions_content,
                        {_componentType: 'eventLoop'}
                    ])
                }
            ]));
        } else {
            elPayload.push(commonTools.merge([
                enginePayloadMeta, {
                    metrics: {
                        averageEventLoopLatency: eventloop.eventloop_latencyAvg,
                        minimumEventLoopLatency: eventloop.eventloop_latencyMin,
                        maximumEventLoopLatency: eventloop.eventloop_latencyMax
                    }
                }, {
                    tags: commonTools.merge([dimensions_content,
                        {_componentType: 'eventLoop'}
                    ])
                }
            ]));
        }
    }

    for (let index = 0; data.Loop_Arr && index < data.Loop_Arr.length; index++) {
        const loop = data.Loop_Arr[index];
        enginePayloadMeta.timestamp = new Date(loop.loop_timestamp).toISOString();
        if (process.env.UA_LWDC_LISTENER_URL) {
            elPayload.push(commonTools.merge([
                enginePayloadMeta, {
                    fields: {
                        '!averageEventLoopTickTime': loop.loop_average,
                        '!maximumEventLoopTickTime': loop.loop_maximum,
                        '!minimumEventLoopTickTime': loop.loop_minimum,
                        '!loopCpuUser': loop.loop_cpu_user,
                        '!loopCpuSystem': loop.loop_cpu_system,
                        '!eventLoopTickCount': loop.loop_count
                    }
                }, {
                    tags: commonTools.merge([dimensions_content,
                        {_componentType: 'loop'}
                    ])
                }
            ]));
        } else {
            elPayload.push(commonTools.merge([
                enginePayloadMeta, {
                    metrics: {
                        averageEventLoopTickTime: loop.loop_average,
                        maximumEventLoopTickTime: loop.loop_maximum,
                        minimumEventLoopTickTime: loop.loop_minimum,
                        loopCpuUser: loop.loop_cpu_user,
                        loopCpuSystem: loop.loop_cpu_system,
                        eventLoopTickCount: loop.loop_count
                    }
                }, {
                    tags: commonTools.merge([dimensions_content,
                        {_componentType: 'loop'}
                    ])
                }
            ]));
        }
    }

    return elPayload;
};
JsonSender.prototype.genGCPayload = function genGCPayload(dimensions_content,
                                                          data, enginePayloadMeta) {
    var gcPayload;
    if (process.env.UA_LWDC_LISTENER_URL) {
        gcPayload = commonTools.merge([
            enginePayloadMeta, {
                fields: {
                    '!gcDuration': data.GC.gc_duration,
                    '!scavengeGcCount': data.GC.gc_sCount,
                    '!markSweepGcCount': data.GC.gc_mCount,
                    '!incrementalMarkingGcCount': data.GC.gc_iCount,
                    '!processWeakCallbacksGcCount': data.GC.gc_wCount,
                    '!usedHeap': data.GC.gc_heapUsed,
                    '!heapSize': data.GC.gc_heapSize
                }
            }, {
                tags: commonTools.merge([dimensions_content,
                    {_componentType: 'nodeApplicationRuntime'}
                ])
            }
        ]);
    } else {
        gcPayload = commonTools.merge([
            enginePayloadMeta, {
                metrics: {
                    gcDuration: data.GC.gc_duration,
                    scavengeGcCount: data.GC.gc_sCount,
                    markSweepGcCount: data.GC.gc_mCount,
                    incrementalMarkingGcCount: data.GC.gc_iCount,
                    processWeakCallbacksGcCount: data.GC.gc_wCount,
                    usedHeap: data.GC.gc_heapUsed,
                    heapSize: data.GC.gc_heapSize
                }
            }, {
                tags: commonTools.merge([dimensions_content,
                    {_componentType: 'nodeApplicationRuntime'}
                ])
            }
        ]);
    }
    return gcPayload;
};

JsonSender.prototype.genSaturationPayload = function genSaturationPayload(dimensions_content,
                                                                          data, enginePayloadMeta) {
    var saturationPayload;
    if (process.env.UA_LWDC_LISTENER_URL) {
        saturationPayload = commonTools.merge([
            enginePayloadMeta, {
                fields: {
                    '!saturation': data.GC.gc_heapSize === 0 ? 0 : data.GC.gc_heapUsed / data.GC.gc_heapSize
                }
            }, {
                tags: commonTools.merge([dimensions_content,
                    {
                        _componentType: 'saturations',
                        saturationType: 'memory',
                        includeGoldenSignals: 'true'
                    }
                ])
            }
        ]);
    } else {
        saturationPayload = commonTools.merge([
            enginePayloadMeta, {
                metrics: {
                    saturation: data.GC.gc_heapSize === 0 ? 0 : data.GC.gc_heapUsed / data.GC.gc_heapSize
                }
            }, {
                tags: commonTools.merge([dimensions_content,
                    {
                        _componentType: 'saturations',
                        saturationType: 'memory',
                        includeGoldenSignals: 'true'
                    }
                ])
            }
        ]);
    }
    return saturationPayload;
};

JsonSender.prototype.genReqSumm = function genReqSumm(dimensions_content, data) {
    var requestSummary;
    if (process.env.UA_LWDC_LISTENER_URL) {
        requestSummary = {
            measurement: 'nodeApplicationRuntime',
            tags: commonTools.merge([dimensions_content,
                {
                    _componentType: 'requestSummary',
                    includeGoldenSignals: 'true'
                }
            ]),
            fields: commonTools.merge([{
                // responseTime_50th: data.appInfo.responseTime_50th,
                // responseTime_90th: data.appInfo.responseTime_90th,
                // responseTime_95th: data.appInfo.responseTime_95th,
                '!throughput': data.appInfo.REQRATE,
                '!requestErrorRate': data.appInfo.requestErrorRate,
                '!averageResponseTime': data.appInfo.RESP_TIME,
                '!slowestResponseTime': data.appInfo.MAX_RSPTIME
            }, data.appInfo2])
        };
    } else {
        requestSummary = {
            resourceID: process.env.KNJ_NODEAPPLICATIONRUNTIME_ID ?
                process.env.KNJ_NODEAPPLICATIONRUNTIME_ID :
                ((!this.vcap) ? this.nodeAppRuntimeString : this.nodeAppRuntimeMD5String),
            tags: commonTools.merge([dimensions_content,
                {
                    _componentType: 'requestSummary',
                    includeGoldenSignals: 'true'
                }
            ]),
            metrics: commonTools.merge([{
                // responseTime_50th: data.appInfo.responseTime_50th,
                // responseTime_90th: data.appInfo.responseTime_90th,
                // responseTime_95th: data.appInfo.responseTime_95th,
                throughput: data.appInfo.REQRATE,
                requestErrorRate: data.appInfo.requestErrorRate,
                averageResponseTime: data.appInfo.RESP_TIME,
                slowestResponseTime: data.appInfo.MAX_RSPTIME
            }, data.appInfo2])
        };
    }
    return requestSummary;
};

JsonSender.prototype.genRequestSummaries = function genRequestSummaries(dimensions_content, data) {
    var requestsSummaryPayload = [];
    var requestsRecordsPayload = [];
    var errorCountPayload = [];
    for (var index = 0; data.httpReq && index < data.httpReq.length; index++) {
        var req = data.httpReq[index];
        if (process.env.UA_LWDC_LISTENER_URL) {
            requestsSummaryPayload.push({
                measurement: 'nodeApplicationRuntime',
                timestamp: new Date().toISOString(),
                tags: commonTools.merge([dimensions_content,
                    {
                        applicationName: this.applicationName,
                        requestName: req['URL'],
                        requestMethod: req['METHOD'],
                        _componentType: 'requestsSummary'
                    }
                ]),
                fields: {
                    '!averageServiceResponseTime': req['REQ_RESP_TIME'],
                    '!traffic': req['HIT_COUNT'],
                    '!errorRate': req['ERROR_RATE']
                }
            });
        } else {
            requestsSummaryPayload.push({
                resourceID: process.env.KNJ_NODEAPPLICATIONRUNTIME_ID ?
                    process.env.KNJ_NODEAPPLICATIONRUNTIME_ID :
                    ((!this.vcap) ? this.nodeAppRuntimeString : this.nodeAppRuntimeMD5String),
                timestamp: new Date().toISOString(),
                tags: commonTools.merge([dimensions_content,
                    {
                        applicationName: this.applicationName,
                        requestName: req['URL'],
                        requestMethod: req['METHOD'],
                        _componentType: 'requestsSummary'
                    }
                ]),
                metrics: {
                    averageServiceResponseTime: req['REQ_RESP_TIME'],
                    traffic: req['HIT_COUNT'],
                    errorRate: req['ERROR_RATE']
                }
            });
        }
        for (let respIndex = 0; respIndex < req.goodResps.length; respIndex++) {
            var oneMetric;
            if (process.env.UA_LWDC_LISTENER_URL) {
                oneMetric = {
                    measurement: 'nodeApplicationRuntime',
                    timestamp: (new Date(req.goodResps[respIndex].timestamp)).toISOString(),
                    tags: commonTools.merge([dimensions_content,
                        {
                            applicationName: this.applicationName,
                            requestName: req['URL'],
                            requestType: req['METHOD'],
                            requestMethod: req['METHOD'],
                            _componentType: 'requestMetrics',
                            status: 'success',
                            statusCode: req.goodResps[respIndex].statusCode + '',
                            requestDetail: req.goodResps[respIndex].url_prefix + req['URL'],
                            includeGoldenSignals: 'true'
                        }
                    ]),
                    fields: {
                        '!latency': req.goodResps[respIndex].resp
                    }
                };
            } else {
                oneMetric = {
                    resourceID: process.env.KNJ_NODEAPPLICATIONRUNTIME_ID ?
                        process.env.KNJ_NODEAPPLICATIONRUNTIME_ID :
                        ((!this.vcap) ? this.nodeAppRuntimeString : this.nodeAppRuntimeMD5String),
                    timestamp: (new Date(req.goodResps[respIndex].timestamp)).toISOString(),
                    tags: commonTools.merge([dimensions_content,
                        {
                            applicationName: this.applicationName,
                            requestName: req['URL'],
                            requestType: req['METHOD'],
                            requestMethod: req['METHOD'],
                            _componentType: 'requestMetrics',
                            status: 'success',
                            statusCode: req.goodResps[respIndex].statusCode + '',
                            requestDetail: req.goodResps[respIndex].url_prefix + req['URL'],
                            includeGoldenSignals: 'true'
                        }
                    ]),
                    metrics: {
                        latency: req.goodResps[respIndex].resp
                    }
                };
            }
            requestsRecordsPayload.push(oneMetric);
        }
        for (let respIndex = 0; respIndex < req.badResps.length; respIndex++) {
            var badMetric;
            if (process.env.UA_LWDC_LISTENER_URL) {
                badMetric = {
                    measurement: 'nodeApplicationRuntime',
                    timestamp: (new Date(req.badResps[respIndex].timestamp)).toISOString(),
                    tags: commonTools.merge([dimensions_content,
                        {
                            applicationName: this.applicationName,
                            requestName: req['URL'],
                            requestType: req['METHOD'],
                            _componentType: 'requestMetrics',
                            status: 'fail',
                            statusCode: req.badResps[respIndex].statusCode + '',
                            requestDetail: req.badResps[respIndex].url_prefix + req['URL']
                        }
                    ]),
                    fields: {
                        '!latency': req.badResps[respIndex].resp
                    }
                };
            } else {
                badMetric = {
                    resourceID: process.env.KNJ_NODEAPPLICATIONRUNTIME_ID ?
                        process.env.KNJ_NODEAPPLICATIONRUNTIME_ID :
                        ((!this.vcap) ? this.nodeAppRuntimeString : this.nodeAppRuntimeMD5String),
                    timestamp: (new Date(req.badResps[respIndex].timestamp)).toISOString(),
                    tags: commonTools.merge([dimensions_content,
                        {
                            applicationName: this.applicationName,
                            requestName: req['URL'],
                            requestType: req['METHOD'],
                            _componentType: 'requestMetrics',
                            status: 'fail',
                            statusCode: req.badResps[respIndex].statusCode + '',
                            requestDetail: req.badResps[respIndex].url_prefix + req['URL']
                        }
                    ]),
                    metrics: {
                        latency: req.badResps[respIndex].resp
                    }
                };
            }
            requestsRecordsPayload.push(badMetric);
        }

        for (var key in req.badCounter) {
            if (!req.badCounter[key]) {
                continue;
            }
            var errorCount = req.badCounter[key];
            if (process.env.UA_LWDC_LISTENER_URL) {
                requestsRecordsPayload.push({
                    measurement: 'nodeApplicationRuntime',
                    timestamp: (new Date()).toISOString(),
                    tags: commonTools.merge([dimensions_content,
                        {
                            applicationName: this.applicationName,
                            requestName: req['URL'],
                            requestType: req['METHOD'],
                            requestMethod: req['METHOD'],
                            _componentType: 'errorMetrics',
                            errorCode: key,
                            includeGoldenSignals: 'true'
                        }
                    ]),
                    fields: {
                        '!error': errorCount
                    }
                });
            } else {
                requestsRecordsPayload.push({
                    resourceID: process.env.KNJ_NODEAPPLICATIONRUNTIME_ID ?
                        process.env.KNJ_NODEAPPLICATIONRUNTIME_ID :
                        ((!this.vcap) ? this.nodeAppRuntimeString : this.nodeAppRuntimeMD5String),
                    timestamp: (new Date()).toISOString(),
                    tags: commonTools.merge([dimensions_content,
                        {
                            applicationName: this.applicationName,
                            requestName: req['URL'],
                            requestType: req['METHOD'],
                            requestMethod: req['METHOD'],
                            _componentType: 'errorMetrics',
                            errorCode: key,
                            includeGoldenSignals: 'true'
                        }
                    ]),
                    metrics: {
                        error: errorCount
                    }
                });
            }
        }
    }
    return {summary: requestsSummaryPayload, record: requestsRecordsPayload, errorCount: errorCountPayload};

};

JsonSender.prototype.genSysInfo = function genSysInfo(dimensions_content, data, enginePayloadMeta) {
    var sysInfo;
    if (process.env.UA_LWDC_LISTENER_URL) {
        sysInfo = commonTools.merge([
            enginePayloadMeta, {
                fields: {
                    '!sysCpuPercentage': data.computeInfo.os_sysCpuPercentage,
                    '!sysMemoryAll': data.computeInfo.os_sysMemAll,
                    '!sysMemoryUsed': data.computeInfo.os_sysMemUsed,
                    '!sysMemoryFree': data.computeInfo.os_sysMemFree,
                    '!cpuPercentage': data.appInfo.CPU_P,
                    '!memoryRssSize': data.appInfo.MEM_RSS,
                    '!memoryTotalSize': data.appInfo.app_memAll,
                    '!virtualMemory': data.appInfo.virtualMemory,
                    '!upTime': data.appInfo.UPTIME
                }
            }, {
                tags: commonTools.merge([dimensions_content,
                    {_componentType: 'nodeApplicationRuntime'}
                ])
            }
        ]);
    } else {
        sysInfo = commonTools.merge([
            enginePayloadMeta, {
                metrics: {
                    sysCpuPercentage: data.computeInfo.os_sysCpuPercentage,
                    sysMemoryAll: data.computeInfo.os_sysMemAll,
                    sysMemoryUsed: data.computeInfo.os_sysMemUsed,
                    sysMemoryFree: data.computeInfo.os_sysMemFree,
                    cpuPercentage: data.appInfo.CPU_P,
                    memoryRssSize: data.appInfo.MEM_RSS,
                    memoryTotalSize: data.appInfo.app_memAll,
                    virtualMemory: data.appInfo.virtualMemory,
                    upTime: data.appInfo.UPTIME
                }
            }, {
                tags: commonTools.merge([dimensions_content,
                    {_componentType: 'nodeApplicationRuntime'}
                ])
            }
        ]);
    }
    return sysInfo;
};

JsonSender.prototype.getDataType = function getDataType() {
    return 'json';
};

JsonSender.prototype.sendAAR = function(req_inst) {
    logger.debug('json-sender.js', 'sendAAR');
    if (!(commonTools.testTrue(process.env.KNJ_ENABLE_TT)) &&
        process.env.KNJ_ENVTYPE === 'Cloudnative') {
        // send AAR from http request at resource level
        var interaction_info = {};
        if (req_inst.header && req_inst.requestHeader) {
            interaction_info =
                aarTools.extractInfoFromHeader(req_inst.header, req_inst.requestHeader);
        }
        interaction_info.method = req_inst.method;
        interaction_info.appName = req_inst.url;
        interaction_info.url = interaction_info.fullurl ||
            commonTools.getFullURL(req_inst.url, this.IP, commonTools.getServerPort(),
                interaction_info.protocol);

        var payload_json = {
            metrics: {
                status: req_inst.statusCode < 400 ? 'Good' : 'Failed',
                responseTime: req_inst.duration / 1000
            },
            properties: {
                // threadID: '0',
                documentType: '/AAR/Middleware/NODEJS',
                softwareServerType: 'http://open-services.net/ns/crtv#NodeJS',
                softwareModuleName: this.applicationName,
                resourceID: process.env.KNJ_NODEAPPLICATIONRUNTIME_ID ?
                    process.env.KNJ_NODEAPPLICATIONRUNTIME_ID :
                    ((!this.vcap) ? this.nodeAppRuntimeString : this.nodeAppRuntimeMD5String),
                processID: process.pid,
                diagnosticsEnabled: commonTools.testTrue(process.env.KNJ_ENABLE_DEEPDIVE),
                applicationName: this.applicationName,
                serverName: this.app_hostname,
                serverAddress: this.IP,
                requestName: req_inst.url,
                componentName: this.isicp ? 'Node.JS Application' : 'Bluemix Node.JS Application',
                transactionName: req_inst.url,
                documentVersion: '2.0', // why?
                startTime: (new Date(req_inst.time)).toISOString(),
                finishTime: (new Date(req_inst.time + req_inst.duration)).toISOString(),
                documentID: uuid.v1()
            },
            interactions: []
        };
        if (req_inst.requestHeader['X-Synthetic-Token']) {
            payload_json.properties.syntheticTest = true;
        }
        if (process.env.HYBRID_BMAPPID && process.env.HYBRID_BMAPPID !== 'undefined') {
            payload_json.properties.originID = global.KNJ_BAM_ORIGINID;
        }
        if (this.isicp && this.serviceIds.length > 0) {
            payload_json.properties.serviceIds = this.serviceIds;
        } else if (this.isicp) {
            this.serviceIds = k8sutil.getServiceID();
        }
        restClient.sendAAR(payload_json, function(err) {
            if (err) {
                logger.error(err.message);
            }
        }, global.KNJ_AAR_BATCH_ENABLED);
    }

};

JsonSender.prototype.sendAARTT = function(data) {
    logger.debug('json-sender.js', 'sendAARTT');
    var payload_json = aarTools.composeAARTT(data, commonTools.getServerPort());

    restClient.sendAAR(payload_json, function(err) {
        if (err) {
            logger.error(err.message);
        }
    }, global.KNJ_AAR_BATCH_ENABLED);
};

JsonSender.prototype.sendADR = function(data) {
    logger.debug('json-sender.js', 'sendADR');
    var payload_json = {
        properties: {
            startTime: data.time,
            finishTime: Math.floor(data.time + data.duration),
            documentType: 'ADR/Middleware/NODEJS',
            contentType: 'methodTrace',
            documentID: uuid.v1(),
            reqType: data.type.toUpperCase(),
            methodEntries: commonTools.testTrue(process.env.KNJ_ENABLE_METHODTRACE) ?
                'true' : 'false',
            reqName: data.name
        },
        statistics: {
            summary: {
                responseTime: data.duration / 1000
            }
        }
    };

    payload_json.statistics.traceData = adrTools.composeTraceData([], data.request, 1);

    restClient.sendADR(payload_json, function(err) {
        if (err) {
            logger.error(err.message);
        }
    });
};

JsonSender.prototype.sendMethodProfiling = function(data, meta) {
    var payload_json = {
        properties: {
            startTime: meta.startTime,
            finishTime: meta.finishTime,
            documentType: 'ADR/Middleware/NODEJS',
            contentType: 'methodProfiling',
            documentID: uuid.v1()
        },
        statistics: {
            summary: {}
        }
    };
    var traceData = [];
    for (var i in data) {
        if (data.hasOwnProperty(i)) {
            traceData.push({
                count: data[i].profiling_count,
                name: data[i].profiling_name,
                line: data[i].profiling_line,
                file: data[i].profiling_file
            });
        }
    }
    payload_json.statistics.summary.profilingSampleCount = meta.count;
    payload_json.statistics.traceData = traceData;
    restClient.sendADR(payload_json, function(err) {
        if (err) {
            logger.error(err.message);
        }
    });
};
exports.jsonSender = new JsonSender();
