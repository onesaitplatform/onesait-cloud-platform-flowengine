'use strict';
// Copyright IBM Corp. 2017. All Rights Reserved.
// Node module: ibmapm
// This file is licensed under the Apache License 2.0.
// License text available at https://opensource.org/licenses/Apache-2.0
// PLACEHOLDER_FOR_BI_FIX
if (!global.NodeDCLoaded) {
    // The Node.js DC is not required.
    global.NodeDCLoaded = true;
} else {
    return;
}
var log4js = require('log4js');
var properties = require('properties');
var fs = require('fs');
var path = require('path');
var url = require('url');

var appmetrics = global.Appmetrics || require('appmetrics');

function isTrue(v) {
    if (v && ['false', 'False', 'FALSE', ''].indexOf(v) < 0) {
        return true;
    } else {
        return false;
    }
};

function isFalse(v) {
    return v && ['false', 'False', 'FALSE'].indexOf(v) === 0;
}

//    initialize log
global.KNJ_MAX_LOG_SIZE = 10485760;
var log4jsConfiguration = {
    appenders: {
        knj_log_console: {type: 'console'},
        knj_log_file: {
            type: 'multiFile',
            maxLogSize: global.KNJ_MAX_LOG_SIZE,
            base: '.',
            property: 'fileName',
            extension: '.log'
        }
    },
    categories: {
        default: {
            appenders: [
                isTrue(process.env.KNJ_LOG_TO_CONSOLE) ? 'knj_log_console' : 'knj_log_file'
            ],
            level: 'INFO'
        }
    }
};

var loglevel = process.env.KNJ_LOG_LEVEL ? process.env.KNJ_LOG_LEVEL.toUpperCase() : undefined;
var logger;
if (loglevel &&
    (loglevel === 'OFF' || loglevel === 'ERROR' || loglevel === 'INFO' ||
        loglevel === 'DEBUG' || loglevel === 'ALL')) {
    log4jsConfiguration.categories.default.level = loglevel;
    log4js.configure(log4jsConfiguration);
    process.env.KNJ_LOG_LEVEL = loglevel;
    global.knj_logger = log4js.getLogger('knj_log');
    logger = global.knj_logger;
    global.knj_logger.info('KNJ_LOG_LEVEL is set to', loglevel);
} else {
    log4jsConfiguration.categories.default.level = 'INFO';
    log4js.configure(log4jsConfiguration);
    global.knj_logger = log4js.getLogger('knj_log');
    logger = global.knj_logger;
    // logger.info('KNJ_LOG_LEVEL is not set or not set correctly through environment variables.');
    process.env.KNJ_LOG_LEVEL = 'INFO';
    // logger.info('The program set default log level to INFO.');
}
logger.addContext('fileName', 'nodejs_dc');
var commontools = require('./lib/tool/common');

// Detect default LWDC UA Plugin URL exist or not
if (typeof (process.env.UA_LWDC_LISTENER_URL) === 'undefined') {
    logger.debug('Detect UA plugin URL');
    var http = require('http');
    var uaDefaultUrl = 'http://lwdc.cp4mcm-cloud-native-monitoring:8848';
    if (!process.env.UA_LWDC_LISTENER_URL) {
        http.get(uaDefaultUrl, (res) => {
            logger.debug('Detect UA plugin URL, statusCode is', res.statusCode);
            if (res.statusCode === 200) {
                process.env.UA_LWDC_LISTENER_URL = uaDefaultUrl;
                process.env.UA_JAEGER_ENDPOINT_ZIPKIN_V1 = 'http://zipkin.cp4mcm-cloud-native-monitoring:9411/api/v1/spans';
                process.env.UA_JAEGER_ENDPOINT_ZIPKIN_V2 = 'http://zipkin.cp4mcm-cloud-native-monitoring:9411/api/v2/spans';
                logger.info('Found default UA plugin URL: ', uaDefaultUrl);
            }
        }).on('error', (e) => {
            logger.info('No default LWDC UA Plugin URL found');
        });
    }
}


//    initialize log end
// Sometimes we need to change the name of some environment variables to consistant all of DC.
commontools.envDecrator();
global.DC_VERSION = getDCVersion();

//    initialize different code path - BI/BAM/Agent
var configObj;
var opentracing_sampler = process.env['OPENTRACING_SAMPLER'] || 0.01;
var opentracing_disabled = isFalse(process.env['OPENTRACING_ENABLED']);
if (!process.env.MONITORING_SERVER_TYPE) {
    try {
        var configString = fs.readFileSync(path.join(__dirname,
            '/etc/config.properties'));

        configObj = properties.parse(configString.toString(), {
            separators: '=',
            comments: [';', '@', '#']
        });
        process.env.MONITORING_SERVER_TYPE = configObj.MONITORING_SERVER_TYPE;
    } catch (e) {
        logger.warn('Failed to read etc/config.properties');
        logger.warn('Use default MONITORING_SERVER_TYPE: BAM');
        process.env.MONITORING_SERVER_TYPE = 'BAM';
    }
}

if (!process.env.MONITORING_SERVER_URL &&
    configObj && configObj.MONITORING_SERVER_URL) {
    process.env.MONITORING_SERVER_URL = configObj.MONITORING_SERVER_URL;
}

if (!process.env.APPLICATION_NAME &&
    configObj && configObj.APPLICATION_NAME) {
    process.env.APPLICATION_NAME = configObj.APPLICATION_NAME;
}
if (!process.env.MONITORING_SECURITY_URL &&
    configObj && configObj.MONITORING_SECURITY_URL) {
    process.env.MONITORING_SECURITY_URL = configObj.MONITORING_SECURITY_URL;
}
if (!process.env.MONITORING_SERVER_NAME &&
    configObj && configObj.MONITORING_SERVER_NAME) {
    process.env.MONITORING_SERVER_NAME = configObj.MONITORING_SERVER_NAME;
}

if (process.env.MONITORING_SECURITY_URL) {
    process.env.APM_KEYFILE_URL = process.env.MONITORING_SECURITY_URL;
}

// initialize shared configurations:
if (typeof (process.env.SECURITY_OFF) === 'undefined' && configObj && configObj.SECURITY_OFF) {
    process.env.SECURITY_OFF = configObj.SECURITY_OFF;
}

if (commontools.testTrue(process.env.SECURITY_OFF)) {
    global.SECURITY_OFF = true;
}


if (typeof (process.env.KNJ_ENABLE_TT) === 'undefined' && configObj && configObj.KNJ_ENABLE_TT) {
    process.env.KNJ_ENABLE_TT = configObj.KNJ_ENABLE_TT;
}

if (typeof (process.env.KNJ_SAMPLING) === 'undefined' && configObj && configObj.KNJ_SAMPLING) {
    process.env.KNJ_SAMPLING = configObj.KNJ_SAMPLING;
}

if (typeof (process.env.KNJ_MIN_CLOCK_TRACE) === 'undefined' &&
    configObj && configObj.KNJ_MIN_CLOCK_TRACE) {
    process.env.KNJ_MIN_CLOCK_TRACE = configObj.KNJ_MIN_CLOCK_TRACE;
}

if (typeof (process.env.KNJ_MIN_CLOCK_STACK) === 'undefined' &&
    configObj && configObj.KNJ_MIN_CLOCK_STACK) {
    process.env.KNJ_MIN_CLOCK_STACK = configObj.KNJ_MIN_CLOCK_STACK;
}
// if (typeof (process.env.KNJ_DISABLE_METHODTRACE) === 'undefined' &&
//     configObj && configObj.KNJ_DISABLE_METHODTRACE) {
//     process.env.KNJ_DISABLE_METHODTRACE = configObj.KNJ_DISABLE_METHODTRACE;
// }

if (typeof (process.env.KNJ_ENABLE_DEEPDIVE) === 'undefined' &&
    configObj && configObj.KNJ_ENABLE_DEEPDIVE) {
    process.env.KNJ_ENABLE_DEEPDIVE = configObj.KNJ_ENABLE_DEEPDIVE;
}

if (typeof (process.env.KNJ_ENABLE_METHODTRACE) === 'undefined' &&
    configObj && configObj.KNJ_ENABLE_METHODTRACE) {
    process.env.KNJ_ENABLE_METHODTRACE = configObj.KNJ_ENABLE_METHODTRACE;
}


if (typeof (process.env.KNJ_AAR_BATCH_FREQ) === 'undefined' &&
    configObj && configObj.KNJ_AAR_BATCH_FREQ) {
    process.env.KNJ_AAR_BATCH_FREQ = configObj.KNJ_AAR_BATCH_FREQ;
}
if (typeof (process.env.KNJ_AAR_BATCH_COUNT) === 'undefined' &&
    configObj && configObj.KNJ_AAR_BATCH_COUNT) {
    process.env.KNJ_AAR_BATCH_COUNT = configObj.KNJ_AAR_BATCH_COUNT;
}


if (!loglevel &&
    configObj && configObj.KNJ_LOG_LEVEL) {
    process.env.KNJ_LOG_LEVEL = configObj.KNJ_LOG_LEVEL;

    var knj_loglevel = process.env.KNJ_LOG_LEVEL ? process.env.KNJ_LOG_LEVEL.toUpperCase() : undefined;
    if (knj_loglevel &&
        (knj_loglevel === 'OFF' || knj_loglevel === 'ERROR' || knj_loglevel === 'INFO' ||
            knj_loglevel === 'DEBUG' || knj_loglevel === 'ALL')) {
        logger.setLevel(knj_loglevel);
        process.env.KNJ_LOG_LEVEL = knj_loglevel;
        logger.info('KNJ_LOG_LEVEL is set to', knj_loglevel);
        loglevel = knj_loglevel;
        require('ibmapm-restclient').getLogUtil().updateLogLevel(loglevel);
    }
}
// initialize shared configurations end

// initialize BAM configuration
var bamConfObj;
if (process.env.MONITORING_SERVER_TYPE === 'BAM') {
    try {
        var bamConfString = fs.readFileSync(path.join(__dirname,
            '/etc/bam.properties'));

        bamConfObj = properties.parse(bamConfString.toString(), {
            separators: '=',
            comments: [';', '@', '#']
        });
    } catch (e) {
        logger.warn('Failed to read etc/bam.properties.');
        logger.warn('Use default BAM configuration.');
    }

    if (bamConfObj) {
        global.KNJ_AAR_BATCH_COUNT = process.env.KNJ_AAR_BATCH_COUNT ||
            bamConfObj.KNJ_AAR_BATCH_COUNT;
        global.KNJ_AAR_BATCH_FREQ = process.env.KNJ_AAR_BATCH_FREQ ||
            bamConfObj.KNJ_AAR_BATCH_FREQ;
        global.KNJ_ADR_BATCH_COUNT = process.env.KNJ_ADR_BATCH_COUNT ||
            bamConfObj.KNJ_ADR_BATCH_COUNT;
        global.KNJ_ADR_BATCH_FREQ = process.env.KNJ_ADR_BATCH_FREQ ||
            bamConfObj.KNJ_ADR_BATCH_FREQ;
    }
    global.KNJ_ADR_BATCH_COUNT = global.KNJ_ADR_BATCH_COUNT || 100;
    global.KNJ_ADR_BATCH_FREQ = global.KNJ_ADR_BATCH_FREQ || 60;

    if (process.env.KNJ_BAM_ORIGINID) {
        global.KNJ_BAM_ORIGINID = process.env.KNJ_BAM_ORIGINID;
    } else {
        global.KNJ_BAM_ORIGINID = 'defaultProvider';
    }

    if (process.env.KNJ_BAM_APPLICATION_TOPIC) {
        global.KNJ_BAM_APPLICATION_TOPIC = process.env.KNJ_BAM_APPLICATION_TOPIC;
    } else {
        global.KNJ_BAM_APPLICATION_TOPIC = 'applications';
    }
}


if (process.env.NODEJS_DC_DISABLE && process.env.NODEJS_DC_DISABLE.toLowerCase() === 'true') {
    logger.fatal('The Node.js DC is disabled. ' +
        ' Please refer to the document to configure the Node.js DC again.');
    return;
}
if (process.env.ITCAM_DC_ENABLED && process.env.ITCAM_DC_ENABLED.toLowerCase() === 'false') {
    logger.fatal('The Node.js DC is disabled. ' +
        ' Please refer to the document to configure the Node.js DC again.');
    return;
}
initJaegerSender();
commontools.enableTrace(appmetrics);

// Start DC in case rest client is ready to send payload
var restClient = require('ibmapm-restclient');
restClient.checkReadyStatus(startDC);


var DCStarted = false;

function startDC() {
    if (DCStarted) {
        logger.debug('index.js', 'DC started already!');
        return;
    }
    DCStarted = true;
    refreshJaegerSender();
    logger.debug('index.js', 'startDC()', 'start DC.');

    var plugin = require('./lib/plugin.js').monitoringPlugin;
    plugin.init('Cloudnative');

    logger.info('== Data Collector version:', global.DC_VERSION);
    logger.info('== Capabilities:');
    logger.info('   |== Metrics:', 'Enabled');
    logger.info('   |== Diagnostic:', commontools.testTrue(process.env.KNJ_ENABLE_DEEPDIVE) ? 'Enabled' : 'Disabled');
    logger.info('   |== Transaction Tracking:',
        commontools.testTrue(process.env.KNJ_ENABLE_TT) ? 'Enabled' : 'Disabled');
    logger.info('== Supported Integrations:', 'IBM Cloud Application Management,',
        'IBM Cloud Application Performance Management');

}

exports.stopDC = function() {
    appmetrics.stop();
    require('./lib/metric-manager').metricManager.stop();
};

function getDCVersion() {
    var packageJson = require(path.join(__dirname, 'package.json'));
    if (packageJson && packageJson.version) {
        return packageJson.version;
    }
    return '1.0.0';
};

function initJaegerSender() {
    logger.debug('initJaegerSender');
    if (!opentracing_disabled) {
        var uaZipkinUrl = '';
        if (process.env.UA_JAEGER_ENDPOINT_ZIPKIN_V2) {
            uaZipkinUrl = process.env.UA_JAEGER_ENDPOINT_ZIPKIN_V2;
        } else if (process.env.UA_JAEGER_ENDPOINT_ZIPKIN_V1) {
            uaZipkinUrl = process.env.UA_JAEGER_ENDPOINT_ZIPKIN_V1;
        }
        const zipkin = require('./appmetrics-zipkin/index.js');
        const zipkinUrl = uaZipkinUrl.length > 1 ? uaZipkinUrl : (process.env.JAEGER_ENDPOINT_ZIPKIN_V2 ?
            process.env.JAEGER_ENDPOINT_ZIPKIN_V2 : process.env.JAEGER_ENDPOINT_ZIPKIN);
        var jaegerEndpoint = url.parse(zipkinUrl || 'http://localhost:9411/api/v1/spans');
        var enabled = true;
        logger.debug('jaeger', jaegerEndpoint.hostname, jaegerEndpoint.port, opentracing_sampler);
        var zipkinOptions;
        if (jaegerEndpoint.protocol === 'https:') {
            zipkinOptions = {
                zipkinEndpoint: zipkinUrl,
                sampleRate: opentracing_sampler,
                pfx: global.JAEGER_PFX,
                passphase: global.JAEGER_PASSPHASE
            };
            if (!zipkinOptions.pfx || !zipkinOptions.passphase) {
                enabled = false;
            }
        } else {
            zipkinOptions = {
                zipkinEndpoint: zipkinUrl,
                host: jaegerEndpoint.hostname,
                port: jaegerEndpoint.port,
                sampleRate: opentracing_sampler
            };
            if (!process.env.JAEGER_ENDPOINT_ZIPKIN && !process.env.JAEGER_ENDPOINT_ZIPKIN_V2
                && !process.env.UA_JAEGER_ENDPOINT_ZIPKIN_V2 && !process.env.UA_JAEGER_ENDPOINT_ZIPKIN_V1) {
                enabled = false;
            }
        }

        zipkin(zipkinOptions);
        var internalUrls = [
            '/applicationmgmt/0.9',
            '/metric/1.0',
            '/uielement/0.8',
            '/agent_mgmt/0.6',
            'configmaps',
            '?type=providers',
            '?type=aar/middleware',
            '?type=adr/middleware',
            '/1.0/monitoring/data',
            '/OEReceiver/v1/monitoringdata/',
            '/api/v1/spans',
            '/api/v2/spans',
            '/api/v1/namespaces',
            '/api/v1/nodes',
            '/apis/extensions/v1beta1/namespaces',
            '/k8s'
        ];
        zipkin.updatePathFilter(internalUrls);
        zipkin.updateHeaderFilter({
            'User-Agent': 'NodeDC'
        });
        if (!enabled) {
            zipkin.disable();
            process.env.JAEGER_ENDPOINT_NOTREADY = 'true';
        } else {
            zipkin.enable();
            process.env.JAEGER_ENDPOINT_NOTREADY = 'false';
        }

        logger.debug('initJaegerSender done', zipkinUrl, process.env.JAEGER_ENDPOINT_NOTREADY, enabled);
    }
}

function refreshJaegerSender() {
    logger.debug('refreshJaegerSender enter');
    if (!opentracing_disabled) {
        var uaZipkinUrl = '';
        if (process.env.UA_JAEGER_ENDPOINT_ZIPKIN_V2) {
            uaZipkinUrl = process.env.UA_JAEGER_ENDPOINT_ZIPKIN_V2;
        } else if (process.env.UA_JAEGER_ENDPOINT_ZIPKIN_V1) {
            uaZipkinUrl = process.env.UA_JAEGER_ENDPOINT_ZIPKIN_V1;
        }
        logger.debug('enter');
        const zipkin = require('./appmetrics-zipkin/index.js');
        const zipkinUrl = uaZipkinUrl.length > 1 ? uaZipkinUrl : (process.env.JAEGER_ENDPOINT_ZIPKIN_V2 ?
            process.env.JAEGER_ENDPOINT_ZIPKIN_V2 : process.env.JAEGER_ENDPOINT_ZIPKIN);
        var jaegerEndpoint = url.parse(zipkinUrl || 'http://localhost:9411/api/v1/spans');
        var enabled = false;
        logger.debug('jaeger', jaegerEndpoint.hostname, jaegerEndpoint.port, opentracing_sampler);
        var zipkinOptions;
        if (jaegerEndpoint.protocol === 'https:') {
            zipkinOptions = {
                zipkinEndpoint: zipkinUrl,
                sampleRate: opentracing_sampler,
                pfx: global.JAEGER_PFX,
                passphase: global.JAEGER_PASSPHASE
            };
            if (zipkinOptions.pfx && zipkinOptions.passphase) {
                enabled = true;
            }
        } else {
            zipkinOptions = {
                zipkinEndpoint: zipkinUrl,
                host: jaegerEndpoint.hostname,
                port: jaegerEndpoint.port,
                sampleRate: opentracing_sampler
            };
            if (process.env.JAEGER_ENDPOINT_ZIPKIN || process.env.JAEGER_ENDPOINT_ZIPKIN_V2) {
                enabled = true;
            }
            if (process.env.UA_JAEGER_ENDPOINT_ZIPKIN_V1 || process.env.UA_JAEGER_ENDPOINT_ZIPKIN_V2) {
                enabled = true;
            }
        }
        zipkin.update(zipkinOptions);
        if (!enabled) {
            zipkin.disable();
            process.env.JAEGER_ENDPOINT_NOTREADY = 'true';
        } else {
            zipkin.enable();
            process.env.JAEGER_ENDPOINT_NOTREADY = 'false';
        }
        logger.debug('done', zipkinUrl, process.env.JAEGER_ENDPOINT_NOTREADY, enabled);
    }
};

