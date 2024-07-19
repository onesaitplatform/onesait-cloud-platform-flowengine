/* eslint-disable spaced-comment */
/* eslint-disable indent */
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
var logger = global.knj_logger;

var serviceName;
var ibmapmContext;
var tracer;
var traceInfo = {};

const {
  Request,
  HttpHeaders: Header,
  option: {
    Some,
    None
  },
  Annotation,
  TraceId
} = require('zipkin');


function hasZipkinHeader(httpsReq) {
  const headers = httpsReq.headers || {};
  return headers[(Header.TraceId).toLowerCase()] !== undefined
    && headers[(Header.SpanId).toLowerCase()] !== undefined;
}

function HttpsProbeZipkin() {
  Probe.call(this, 'https');
  this.config = {
    filters: []
  };
}
util.inherits(HttpsProbeZipkin, Probe);


function stringToBoolean(str) {
  return str === '1' || str === 'true';
}

function stringToIntOption(str) {
  try {
    // eslint-disable-next-line radix
    return new Some(parseInt(str, 10));
  } catch (err) {
    return None;
  }
}

HttpsProbeZipkin.prototype.updateProbes = function() {
  serviceName = this.serviceName;
  ibmapmContext = this.ibmapmContext;
  tracer = this.tracer;
};


HttpsProbeZipkin.prototype.attach = function(name, target) {
  serviceName = this.serviceName;
  tracer = this.tracer;
  var that = this;

  if (name === 'https') {
    if (target.__zipkinProbeAttached__) return target;
    target.__zipkinProbeAttached__ = true;
    var methods = ['on', 'addListener'];

    aspect.before(target.Server.prototype, methods,
      function(obj, methodName, args, probeData) {
        if (args[0] !== 'request') return;
        if (obj.__zipkinhttpsProbe__) return;
        obj.__zipkinhttpsProbe__ = true;
        aspect.aroundCallback(args, probeData, function(obj, args, probeData) {
          if (process.env.JAEGER_ENDPOINT_NOTREADY === 'true'){
            return;
          }
          var httpsReq = args[0];
          var res = args[1];
          // Filter out urls where filter.to is ''
          let traceUrl = parse(httpsReq.url);

          let passdown_edgeRequest = false;
          let passdown_reqMethod = 'GET';
          let passdown_sampled = true;
          let passdown_traceid;

          if (traceUrl !== '') {
            [passdown_edgeRequest, passdown_reqMethod, traceUrl, passdown_sampled, passdown_traceid]
              = that.opentracingProbeStart(args, probeData, httpsReq, traceUrl);
            aspect.after(res, 'end', probeData, function(obj, methodName, args, probeData, ret) {
              that.opentracingProbeEnd(probeData, traceUrl, passdown_edgeRequest,
                  passdown_reqMethod, passdown_sampled, passdown_traceid, res);
            });
          }
        });
      });
  }
  return target;
};

HttpsProbeZipkin.prototype.opentracingStart = function(methodArgs, probeData, httpsReq, traceUrl) {
  var reqMethod = httpsReq.method;
  var childId;
  var edgeRequest = false;
  var sampled = true;
  if (reqMethod.toUpperCase() === 'OPTIONS'
      && httpsReq.headers['access-control-request-method']) {
    reqMethod = httpsReq.headers['access-control-request-method'];
  }
  if (hasZipkinHeader(httpsReq)) {
    const headers = httpsReq.headers;
    var spanId = headers[(Header.SpanId).toLowerCase()];
    if (spanId !== undefined) {
      const traceId = new Some(headers[(Header.TraceId).toLowerCase()] || headers[(Header.TraceId)]);
      const parentSpanId = new Some(headers[(Header.ParentSpanId).toLowerCase()] || headers[(Header.ParentSpanId)]);
      const sampled = new Some(headers[(Header.Sampled).toLowerCase()] || headers[(Header.Sampled)]);
      const flags = (new Some(headers[(Header.Flags).toLowerCase()]
        || headers[(Header.Flags)])).flatMap(stringToIntOption).getOrElse(0);
      var id = new TraceId({
        traceId: traceId,
        parentId: parentSpanId,
        spanId: spanId,
        sampled: sampled.map(stringToBoolean),
        flags
      });
      tracer.setId(id);
      childId = tracer.createChildId();
      tracer.setId(childId);
      probeData.traceId = tracer.id;
    };
  } else {
    edgeRequest = true;
    tracer.setId(tracer.createRootId());
    probeData.traceId = tracer.id;
    // Must assign new options back to args[0]
    const { headers } = Request.addZipkinHeaders(methodArgs[0], tracer.id);
    Object.assign(methodArgs[0].headers, headers);
  }

  sampled = (methodArgs[0].headers[(Header.Sampled)] || methodArgs[0].headers[(Header.Sampled).toLowerCase()]) === '1';
  sampled = sampled ||
  (methodArgs[0].headers[(Header.Sampled)] || methodArgs[0].headers[(Header.Sampled).toLowerCase()]) === 'true';
  var urlPrefix = 'https://' + httpsReq.headers.host;

  if (traceUrl.length > global.KNJ_TT_MAX_LENGTH) {
    traceUrl = traceUrl.substr(0, global.KNJ_TT_MAX_LENGTH);
  }

  if (sampled){
    traceInfo[tracer.id._spanId] = 'start';
    tracer.recordBinary('http.url', urlPrefix + traceUrl);
    tracer.recordAnnotation(new Annotation.ServerRecv());
  }
  logger.debug('https-tracer(before): ', tracer.id, sampled, traceUrl);
  return [edgeRequest, reqMethod, traceUrl, sampled, tracer.id];
};

HttpsProbeZipkin.prototype.opentracingEnd = function(probeData, traceUrl, edgeRequest, reqMethod,
    sampled, traceId, res){
  if (sampled){
    logger.debug('https-tracer traceInfo', traceInfo);
    if (traceId && traceInfo[traceId._spanId] === 'start'){
      delete traceInfo[traceId._spanId];
    } else {
      return;
    }
    tracer.setId(traceId);
    tracer.recordServiceName(serviceName);
    tracer.recordBinary('service.name', serviceName);
    tracer.recordRpc(traceUrl);
    tracer.recordAnnotation(new Annotation.LocalAddr(0));
    if (res) {
      var status_code = res.statusCode.toString();
      tracer.recordBinary('http.status_code', status_code);
      if (status_code >= 400) {
        tracer.recordBinary('error', 'true');
        tracer.recordMessage(this.fetchStack());
        if (res.statusMessage){
          tracer.recordMessage(res.statusMessage.toString());
        }
      }
    }
    tracer.recordBinary('http.method', reqMethod.toUpperCase());
    if (process.env.APM_TENANT_ID && !process.env.UA_JAEGER_ENDPOINT_ZIPKIN_V2 && !process.env.UA_JAEGER_ENDPOINT_ZIPKIN_V1){
      tracer.recordBinary('tenant.id', process.env.APM_TENANT_ID);
    }
    tracer.recordBinary('edge.request', '' + edgeRequest);
    tracer.recordBinary('request.type', 'https');
    tool.recordIbmapmContext(tracer, ibmapmContext);
    tracer.recordAnnotation(new Annotation.ServerSend());
  }
  logger.debug('https-tracer(after): ', tracer.id);
};
/*
 * Custom req.url parser that strips out any trailing query
 */
function parse(url) {
  ['?', '#'].forEach(function(separator) {
    var index = url.indexOf(separator);
    if (index !== -1) url = url.substring(0, index);
  });
  return url;
};

module.exports = HttpsProbeZipkin;
