/* eslint-disable indent */
// eslint-disable-next-line spaced-comment
/*******************************************************************************
 * Copyright 2015 IBM Corp.
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

var timer = require('./timer.js');
// Default to metrics on once probe has been started
var _enabled = true;

// Not running by default
var _started = false;

const zipkin = require('zipkin');
const CLSContext = require('zipkin-context-cls');
const ctxImpl = new CLSContext();

function Probe(name) {
  this.name = name;
  this.config = {};
  this.recorder = {};
  this.serviceName = '';
  this.ibmapmContext = {};
  this.pathFilters = [];
  this.headerFilters = {};
  this.tracer;
}

/*
 * Function to add instrumentation to the target module
 */
Probe.prototype.attach = function(name, target) {
  return target;
};

/*
 * Set configuration by merging passed in config with current one
 */
Probe.prototype.setConfig = function(newConfig) {
  for (var prop in newConfig) {
    if (typeof (newConfig[prop]) !== 'undefined') {
      this.config[prop] = newConfig[prop];
    }
  }
};

Probe.prototype.setRecorder = function(recorder) {
  this.recorder = recorder;
};

Probe.prototype.setServiceName = function(name) {
  this.serviceName = name;
};
Probe.prototype.setPathFilter = function(paths) {
  this.pathFilters = paths || [];
};
Probe.prototype.setHeaderFilter = function(headers) {
  this.headerFilters = headers || {};
};

Probe.prototype.setIbmapmContext = function(ibmapmContext) {
  this.ibmapmContext = ibmapmContext;
};

/*
 * Lightweight metrics probes
 */
Probe.prototype.metricsStart = function(probeData) {
  probeData.timer = timer.start();
};

// Implentors should stop the timer and emit an event.
Probe.prototype.metricsEnd = function(probeData) {
  probeData.timer.stop();
};

/*
 * Default to metrics off until started
 */
Probe.prototype.metricsProbeStart = function(req, res, am) {};
Probe.prototype.metricsProbeEnd = function(req, res, am) {};


Probe.prototype.opentracingProbeStart = function(arg1) { return [0, 0, 0]; };
Probe.prototype.opentracingProbeEnd = function(arg1, arg2, arg3) {};

Probe.prototype.opentracingStart = function() { return [0, 0, 0]; };
Probe.prototype.opentracingEnd = function() {};

Probe.prototype.enable = function() {
  _enabled = true;
  if (_started) {
    this.metricsProbeStart = this.metricsStart;
    this.metricsProbeEnd = this.metricsEnd;
    this.opentracingProbeStart = this.opentracingStart;
    this.opentracingProbeEnd = this.opentracingEnd;
  }
};

Probe.prototype.disable = function() {
  _enabled = false;
  this.metricsProbeStart = function() {};
  this.metricsProbeEnd = function() {};
  this.opentracingProbeStart = function(arg1) { return [0, 0, 0]; };
  this.opentracingProbeEnd = function(arg1, arg2, arg3) {};
};

Probe.prototype.start = function() {
  _started = true;
  if (_enabled) {
    this.metricsProbeStart = this.metricsStart;
    this.metricsProbeEnd = this.metricsEnd;
    this.opentracingProbeStart = this.opentracingStart;
    this.opentracingProbeEnd = this.opentracingEnd;
  }
  this.tracer = new zipkin.Tracer({
    ctxImpl,
    recorder: this.recorder,
    sampler: new zipkin.sampler.CountingSampler(this.config.sampleRate),
        // sample rate 0.01 will sample 1 % of all incoming requests
    traceId128Bit: true // to generate 128-bit trace IDs.
  });
};

Probe.prototype.stop = function() {
  _started = false;
  this.metricsProbeStart = function() {};
  this.metricsProbeEnd = function() {};
  this.opentracingProbeStart = function(arg1) { return [0, 0, 0]; };
  this.opentracingProbeEnd = function(arg1, arg2, arg3) {};
};

Probe.prototype.fetchStack = function(thing) {
  //    Originally only if methodTrace enabled
  var oldLimit = Error.stackTraceLimit;
  Error.stackTraceLimit = 20;
  var trace = {};
  Error.captureStackTrace(trace);
  Error.stackTraceLimit = oldLimit;
  var lines = trace.stack.split('\n');
  return lines.filter(isNotIbmApmStack).join('\n');
};

Probe.prototype.fetchStackSimple = function(thing) {
  //    Originally only if methodTrace enabled
  var trace = {};
  Error.captureStackTrace(trace);
  return trace.stack;
};
function isNotIbmApmStack(line) {
  return line.indexOf('appmetrics') === -1 && line.indexOf('lib/aspect.js') === -1 && line.indexOf('ibmapm') === -1;
}

module.exports = Probe;
