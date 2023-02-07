/* eslint-disable indent */
// eslint-disable-next-line spaced-comment
/*******************************************************************************
 * Copyright 2017 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *******************************************************************************/
'use strict';
var Probe = require('../lib/probe.js');
var aspect = require('../lib/aspect.js');
var tool = require('../lib/tools.js');
var util = require('util');
var url = require('url');
var semver = require('semver');
var logger = global.knj_logger;

var serviceName;
var ibmapmContext;
var headerFilters;
var pathFilters;
var tracer;
var traceInfo = {};

const {
  Request,
  HttpHeaders: Header,
  Annotation
} = require('zipkin');


var methods;
// In Node.js < v8.0.0 'get' calls 'request' so we only instrument 'request'
if (semver.lt(process.version, '8.0.0')) {
  methods = ['request'];
} else {
  methods = ['request', 'get'];
}

// Probe to instrument outbound http requests

function HttpsOutboundProbeZipkin() {
  Probe.call(this, 'https'); // match the name of the module we're instrumenting
}
util.inherits(HttpsOutboundProbeZipkin, Probe);


HttpsOutboundProbeZipkin.prototype.updateProbes = function() {
  serviceName = this.serviceName;
  ibmapmContext = this.ibmapmContext;
  headerFilters = this.headerFilters;
  pathFilters = this.pathFilters;
  tracer = this.tracer;
};

HttpsOutboundProbeZipkin.prototype.attach = function(name, target) {
  tracer = this.tracer;
  serviceName = this.serviceName;
  var that = this;
  let passdown_urlRequested = '';
  let passdown_childId = '';
  let passdown_sampled = true;

  if (name === 'https' && !target.__zipkinOutboundProbeAttached__) {
    target.__zipkinOutboundProbeAttached__ = true;
    aspect.around(
      target,
      methods,
      // Before 'http.request' function
      function(obj, methodName, methodArgs, probeData) {
        [passdown_urlRequested, passdown_childId, passdown_sampled] = that.opentracingProbeStart(methodArgs);
        if (passdown_childId === 0 && passdown_urlRequested === 0) {
          return;
        }
        aspect.aroundCallback(
          methodArgs,
          probeData,
          function(target, args, probeData) {
            that.opentracingProbeEnd(target, passdown_childId,
                passdown_urlRequested, passdown_sampled, 'aroundCallback');
          },
          function(target, args, probeData, ret) {
            return ret;
          }
        );
      },
      // After 'http.request' function returns
      function(target, methodName, methodArgs, probeData, rc) {
        // If no callback has been used then end the metrics after returning from the method instead
        if (passdown_childId === 0 && passdown_urlRequested === 0) {
          return rc;
        }
        if (aspect.findCallbackArg(methodArgs) === undefined) {
          that.opentracingProbeEnd(target, passdown_childId, passdown_urlRequested, passdown_sampled, 'after');
        }
        that.opentracingProbeEnd(target, passdown_childId, passdown_urlRequested, passdown_sampled, 'after');
        return rc;
      }
    );
  }
  return target;
};


HttpsOutboundProbeZipkin.prototype.opentracingStart = function(methodArgs) {
  // Get HTTPS request method from options
  var options = methodArgs[0];
  var requestMethod = 'GET';
  var urlRequested = '';
  var sampled = true;
  if (typeof options === 'object') {
    if (tool.isIcamInternalRequest(options, headerFilters, pathFilters)){
      return [0, 0];
    }
    urlRequested = formatURL(options);
    if (options.method) {
      requestMethod = options.method;
    }
  } else if (typeof options === 'string') {
    urlRequested = options;
    var parsedOptions = url.parse(options);
    if (parsedOptions.method) {
      requestMethod = parsedOptions.method;
    }

    // This converts the outgoing request's options to an object
    // so that we can add headers onto it
    methodArgs[0] = Object.assign({}, parsedOptions);
  }

  if (!methodArgs[0].headers) methodArgs[0].headers = {};
  var childId = tracer.createChildId();
  let { headers } = Request.addZipkinHeaders(methodArgs[0], childId);
  Object.assign(methodArgs[0].headers, headers);
  tracer.setId(childId);

  if (urlRequested.length > global.KNJ_TT_MAX_LENGTH) {
    urlRequested = urlRequested.substr(0, global.KNJ_TT_MAX_LENGTH);
  }

  sampled = (methodArgs[0].headers[(Header.Sampled)] || methodArgs[0].headers[(Header.Sampled).toLowerCase()]) === '1';
  sampled = sampled ||
    (methodArgs[0].headers[(Header.Sampled)] || methodArgs[0].headers[(Header.Sampled).toLowerCase()]) === 'true';

  if (sampled) {
    traceInfo[tracer.id._spanId] = 'start';
    tracer.recordServiceName(serviceName);
    tracer.recordRpc(urlRequested);
    tracer.recordBinary('http.url', urlRequested);
    tracer.recordBinary('http.method', requestMethod.toUpperCase());
    if (process.env.APM_TENANT_ID && !process.env.UA_JAEGER_ENDPOINT_ZIPKIN_V2 && !process.env.UA_JAEGER_ENDPOINT_ZIPKIN_V1){
      tracer.recordBinary('tenant.id', process.env.APM_TENANT_ID);
    }
    tracer.recordBinary('edge.request', 'false');
    tracer.recordBinary('request.type', 'https');
    tool.recordIbmapmContext(tracer, ibmapmContext);
    tracer.recordAnnotation(new Annotation.ClientSend());
  }
  logger.debug('send https-outbound-tracer(before): ', tracer.id, sampled, urlRequested);
  return [urlRequested, childId, sampled];
};

HttpsOutboundProbeZipkin.prototype.opentracingEnd = function(target, childId, urlRequested, sampled, whichOne) {
  if (sampled) {
    logger.debug('https-outbound-tracer traceInfo', traceInfo);
    if (traceInfo[childId._spanId] === 'start'){
      delete traceInfo[childId._spanId];
    } else {
      return;
    }
    tracer.setId(childId);
    logger.debug('confirm:', urlRequested);
    if (target.res) {
      var status_code = target.res.statusCode.toString();
      tracer.recordBinary('http.status_code', status_code);
      if (status_code >= 400) {
        tracer.recordBinary('error', 'true');
      }
    }
    tracer.recordAnnotation(new Annotation.ClientRecv());
  }
  logger.debug('send https-outbound-tracer(' + whichOne + '): ', childId, sampled, urlRequested);
};

// Get a URL as a string from the options object passed to http.get or http.request
// See https://nodejs.org/api/http.html#http_http_request_options_callback
function formatURL(httpsOptions) {
  var url;
  if (httpsOptions.protocol) {
    url = httpsOptions.protocol;
  } else {
    url = 'https:';
  }
  url += '//';
  if (httpsOptions.auth) {
    url += httpsOptions.auth + '@';
  }
  if (httpsOptions.host) {
    url += httpsOptions.host;
  } else if (httpsOptions.hostname) {
    url += httpsOptions.hostname;
    if (httpsOptions.port) {
      url += ':' + httpsOptions.port;
    }
  } else {
    url += 'localhost';
    if (httpsOptions.port) {
      url += ':' + httpsOptions.port;
    }
  }
  if (httpsOptions.path) {
    url += httpsOptions.path;
  } else {
    url += '/';
  }
  return url;
}

module.exports = HttpsOutboundProbeZipkin;
