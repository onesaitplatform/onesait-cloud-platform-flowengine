'use strict';
var log4js = require('log4js');
global.KNJ_MAX_LOG_SIZE = 10485760;

var loglevel = process.env.KNJ_LOG_LEVEL ? process.env.KNJ_LOG_LEVEL.toUpperCase() : undefined;
if (!loglevel ||
    !(loglevel === 'OFF' || loglevel === 'ERROR' || loglevel === 'INFO' ||
        loglevel === 'DEBUG' || loglevel === 'ALL')) {
    loglevel = 'INFO';
}
log4js.shutdown(function(err) { err; });
log4js.configure({
    appenders: {
        knj_restclient_log_console: {type: 'console'},
        knj_restclient_log_file: {
            type: 'multiFile',
            maxLogSize: global.KNJ_MAX_LOG_SIZE,
            base: '.',
            property: 'fileName',
            extension: '.log'
        },
        dumper_file: {
            type: 'file',
            maxLogSize: global.KNJ_MAX_LOG_SIZE,
            filename: 'resourceRegistry.log'
        }
    },
    categories: {
        default: {
            appenders: [
                isTrue(process.env.KNJ_LOG_TO_CONSOLE) ? 'knj_restclient_log_console' : 'knj_restclient_log_file'
            ],
            level: loglevel
        },
        dumper: {
            appenders: [
                'dumper_file'
            ],
            level: loglevel
        }
    }
});

var loggers = {};

exports.getLogger = function(tag) {
    if (!loggers[tag]){
        loggers[tag] = log4js.getLogger(tag);
        loggers[tag].addContext('fileName', 'nodejs_restclient');
    }
    return loggers[tag];
};

exports.updateLogLevel = function(loglevel) {
    for (var tag in loggers) {
        loggers[tag].level = loglevel;
    }
};

exports.getResourceRegisterDumper = function() {
    if (!loggers['dumper']){
        loggers['dumper'] = log4js.getLogger('dumper');
    }
    return loggers['dumper'];
};

function isTrue(v) {
    if (v && ['false', 'False', 'FALSE', ''].indexOf(v) < 0) {
        return true;
    } else {
        return false;
    }
};
