# Advanced configurations
You can set the variables described in this section to change the default behavior of your data collector.    


* For IBM Cloud applications, set the following variables in the `manifest.yml` file or on the **Bluemix UI**.  
* For on-premises applications, set the following variables as environment variables file.  

|Variable                | Importance                         | Default Value | Description                                               |
|:---------------------------------|:--------------------------------------|:--------------|:-------------------------------------------------------|
|KNJ_ENABLE_TT           |optional |False        |Enables or disables transaction tracking. By default, transaction tracking is **disabled**.
|KNJ_ENABLE_DEEPDIVE   |optional |False        |Enables or disables Diagnostic. By default, diagnostic is **disabled**.|
|KNJ_ENABLE_METHODTRACE   |optional |False        |Enables or disables Method Trace. By default, method trace is **disabled**. Caution: please set opentracing.enabled='false' if you want to enable methodtrace, they have conflict.|
|OPENTRACING_ENABLED   |optional |true        |Enables or disables Opentracing. By default, opentracing is **enabled**. Caution: please set opentracing.enabled='false' if you want to enable methodtrace, they have conflict. and opentracing is only for ICAM Server support|
|OPENTRACING_SAMPLER   |optional |0.01        |When the OpenTracing function is **enabled**, you can set the OpenTracing sampler rate. The default value is **0.01**, which means that 1 in 100 traces will be sampled. You can set it to other values. |
|LATENCY_SAMPLER_PARAM |optional |0.1         |Latency sampling rate. The default value is **0.1**, which means getting 1 request out of 10 requests. The value must be between 0 and 1. The value of 0 means no latency data will be collected. The value of 1 means no sampler and all requests data will be collected. |
|KNJ_AAR_BATCH_FREQ            |optional |60        |Specifies the interval at which transaction tracking data is batched and sent to the server, in seconds. By default, transaction tracking data is batched and sent to the server **every minute**.
|KNJ_AAR_BATCH_COUNT            |optional |100        |Specifies the maximum number of requests that transaction tracking data contains before the data is batched and sent to the server. By default, when a batch of transaction tracking data contains **100** requests, this batch of data is sent to the server.
|KNJ_LOG_LEVEL            |optional |error        |Specifies the level of information that is printed in the log. Possible values are `off`, `error`, `info`, `debug`, `all`.
|KNJ_LOG_TO_CONSOLE            |optional |false        |Specifies the output of log message, the trace message will be writed to the nodejs_*.log by default. The output will be console when the value is 'true'.
|KNJ_SAMPLING            |optional                             |10             |The number of requests based on which a sample is taken. By default, data collector takes one sample for **every 10** requests.
|KNJ_MIN_CLOCK_TRACE       |optional                             |1              |If the response time of a request instance exceeds the value of this variable (in milliseconds), the data collector collects its method trace.
|KNJ_MIN_CLOCK_STACK       |optional                       |100              |If the response time of a request instance exceeds the value of this variable (in milliseconds), the data collector collects its stack trace.


**Parent topic:** [Node.js Data Collector](../README.md)
