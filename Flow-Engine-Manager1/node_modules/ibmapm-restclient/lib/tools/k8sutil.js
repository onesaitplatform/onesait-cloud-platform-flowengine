// Copyright IBM Corp. 2017. All Rights Reserved.
// Node module: ibmapm
// This file is licensed under the Apache License 2.0.
// License text available at https://opensource.org/licenses/Apache-2.0
'use strict';
var logger = require('../plugins/logutil').getLogger('k8sutil.js');
var Api = require('kubernetes-client');
var fs = require('fs');
var os = require('os');
var url = require('url');
var http = require('http');
var QUERY_CONTAINER_ID_FILE = '/proc/self/cgroup';
var nodeName;
var namespace = process.env.KUBE_NAMESPACE;
var containerID;
var containerFullID;
var containerName;
var podName;
var podGenerateName;
var podID;
var podJson;
var core;
// var ext;
var containerInfo;
var svcArray = [];
var svcNames = [];
var svcFullNames = [];
var svcIDs = [];
var nodeIPs = [];
var nodeArray = [];
var ingressUrl;
// var deployment;
var NAMESPACE_DEFAULT = process.env.NAMESPACE_DEFAULT ? process.env.NAMESPACE_DEFAULT : 'ops-am';
var NAMESPACE_FILE = '/var/run/secrets/kubernetes.io/serviceaccount/namespace';
var TOKEN_FILE = '/var/run/secrets/kubernetes.io/serviceaccount/token';
var k8mProviderId;
var k8mClusterName;
var isIcp = process.env.IS_ICP_ENV;
var localIP;
var uaK8Info;
var isUa = false;
var mergeTokens;

// var NAMESPACE_DEFAULT = 'default';

function K8sutil() {
    // Detect default LWDC UA Plugin URL exist or not
    if (typeof (process.env.UA_LWDC_LISTENER_URL) === 'undefined') {
        logger.debug('Detect UA plugin URL in restclient');
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

    this.getNamespace();
    localIP = getServerAddress('IPv4', '127.0.0.1');
    fetchContainerID();
    if (this.isICP()) {
        detectUaK8Plugin();
    }
    if (localIP && namespace) {
        fetchPodName(localIP, function() {
        });
    }
    logger.debug('k8sutil', 'K8sutil()', 'The pod name: ', podName);

    try {
        // var kubeconfig = Api.config.fromKubeconfig();
        var kubeconfig = Api.config.getInCluster();
        kubeconfig.promises = true;
        // kubeconfig.namespace = 'default';
        logger.debug('k8sutil', 'K8sutil()', 'Kubeconfig', kubeconfig);
        core = new Api.Core(kubeconfig);
        // ext = new Api.Extensions(kubeconfig);
        namespace = core.namespaces.namespace;
        logger.info('k8sutil', 'K8sutil()', 'Current namespace', namespace);
        if (!podJson && podName) {
            core.ns(namespace).pods(this.getPodName()).get().then(parsePodInfo).catch(
                function(err) {
                    logger.error('k8sutil', 'K8sutil()', err.message);
                }
            );
        }

    } catch (e) {
        logger.debug('k8sutil', 'K8sutil()',
            'Failed to load K8S configuration, is not a ICp environment.');
    }
    findIngressSvc();
    setNodeIPs();
}

function detectUaK8Plugin() {
    if (process.env.UA_LWDC_LISTENER_URL) {
        var uaDefaultEndpoint = process.env.UA_LWDC_LISTENER_URL;
        http.get(uaDefaultEndpoint, (res) => {
            logger.debug('k8sutil', 'detectUaK8Plugin()', 'Detect UA plugin URL, statusCode is', res.statusCode);
            if (res.statusCode < 400) {
                logger.debug('k8sutil', 'detectUaK8Plugin()', 'Try to get all kubernetes information from UA plugin');
                var endpoint = uaDefaultEndpoint + '/k8s';
                var options = url.parse(endpoint);
                options.headers = {
                    'pod.ip': localIP,
                    'container.id': containerID,
                    namespace: namespace
                };
                http.get(options, (res) => {
                    if (res.statusCode < 400) {
                        logger.info('k8sutil', 'detectUaK8Plugin()', 'get kubernetes information from UA plugin successfully');
                        isUa = true;
                        res.on('data', function(d) {
                            var content = JSON.parse(d.toString());
                            logger.info('k8sutil', 'detectUaK8Plugin()', 'ua content is ', content);
                            uaK8Info = content;
                            namespace = content['namespace'];
                            k8mClusterName = content['clusterName'];
                            k8mProviderId = content['k8sProviderID'];
                            podName = content['podName'];
                            podID = content['podUID'];
                            nodeName = content['nodeName'];
                            containerFullID = content['containerIDEx'];
                            containerName = content['containerName'];
                            if (content['serviceNames'] !== undefined) {
                                svcNames = content['serviceNames'];
                            }
                            podGenerateName = content['podGenerateName'].split('-')[0];
                            mergeTokens = content['mergeTokens'];
                        });
                    }
                }).on('error', (e) => {
                    logger.Error('k8sutil', 'detectUaK8Plugin()', 'Failed to get kubernetes information through UA plugin, error message: ', e);
                });
            }
        }).on('error', (e) => {
            logger.info('k8sutil', 'detectUaK8Plugin()', 'No default LWDC UA Plugin URL found, error message:', e);
        });
    }
};

K8sutil.prototype.getMergeTokens = function() {
    return mergeTokens;
};

K8sutil.prototype.getUaK8Info = function() {
    return uaK8Info;
};

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
    return null;
}

K8sutil.prototype.reinit = function() {
    if (process.env.UA_LWDC_LISTENER_URL && !isUa) {
        detectUaK8Plugin();
    }
    if (this.isICP()) {
        try {
            logger.debug('namespace: ', namespace, 'podName', this.getPodName());
            core.ns(namespace).pods(this.getPodName()).get().then(parsePodInfo).catch(
                function(err) {
                    logger.error('k8sutil', 'reinit()', err.message);
                }
            );
        } catch (e) {
            logger.debug('k8sutil', 'reinit()',
                'Failed to load K8S configuration, is not a ICp environment.');
        }
    }
};

K8sutil.prototype.fetchK8MProviderID = function(callback) {
    if (k8mProviderId && isUa) {
        callback();
        return;
    }
    var https = require('https');
    var endpoint = 'https://' + process.env.KUBERNETES_SERVICE_HOST +
        ':' + process.env.KUBERNETES_SERVICE_PORT + '/api/v1/namespaces/default/configmaps/ibm-k8monitor-config';
    var header = {
        Authorization: 'Bearer ' + file_as_string(TOKEN_FILE),
        Accept: 'application/json'
    };
    var options = url.parse(endpoint);
    options.headers = header;
    options.method = 'GET';
    options.rejectUnauthorized = false;
    logger.debug('k8sutil', 'fetchK8MProviderID', 'query ' + JSON.stringify(options));
    var req = https.request(options, function(res) {
        if (!res) {
            logger.debug('k8sutil', 'fetchK8MProviderID', 'no res');
            callback();
            return;
        }
        logger.debug('k8sutil', 'fetchK8MProviderID', 'query status code: ' + res.statusCode);
        if (res.statusCode < 400) {
            res.on('data', function(d) {
                try {
                    var content = JSON.parse(d.toString());
                    if (content.data && content.data.PROVIDER_ID) {
                        k8mProviderId = content.data.PROVIDER_ID;
                        logger.debug('k8sutil', 'fetchK8MProviderID', k8mProviderId);
                        callback();
                    } else {
                        logger.warn('k8sutil', 'fetchK8MProviderID', 'Failed to parse ' + d.toString());
                        callback();
                    }
                } catch (e) {
                    logger.warn('k8sutil', 'fetchK8MProviderID', e);
                    callback();
                }
            });
        } else {
            res.on('error', function(error) {
                logger.error('k8sutil', 'fetchK8MProviderID err:', error);
            });
            callback();
            return;
        }
    });
    req.on('error', function(err) {
        logger.warn('k8sutil', 'fetchK8MProviderID err:', err);
        callback();
        return;
    });
    req.end();
    return;
};

K8sutil.prototype.fetchK8MClusterID = function(callback) {
    if (k8mProviderId && isUa) {
        callback(k8mProviderId, k8mClusterName);
        return;
    }
    var https = require('https');
    var endpoint = 'https://' + process.env.KUBERNETES_SERVICE_HOST +
        ':' + process.env.KUBERNETES_SERVICE_PORT + '/api/v1/namespaces/default/configmaps/ibm-k8monitor-config';
    var header = {
        Authorization: 'Bearer ' + file_as_string(TOKEN_FILE),
        Accept: 'application/json'
    };
    var options = url.parse(endpoint);
    options.headers = header;
    options.method = 'GET';
    options.rejectUnauthorized = false;
    logger.debug('k8sutil', 'fetchK8MClusterID', 'query ' + JSON.stringify(options));
    var req = https.request(options, function(res) {
        if (!res) {
            logger.debug('k8sutil', 'fetchK8MClusterID', 'no res');
            callback();
            return;
        }
        logger.debug('k8sutil', 'fetchK8MClusterID', 'query status code: ' + res.statusCode);
        if (res.statusCode < 400) {
            res.on('data', function(d) {
                try {
                    var content = JSON.parse(d.toString());
                    if (content.data && content.data.PROVIDER_ID && content.data.CLUSTER_NAME) {
                        k8mProviderId = content.data.PROVIDER_ID;
                        k8mClusterName = content.data.CLUSTER_NAME;
                        logger.debug('k8sutil', 'fetchK8MClusterID', ' The clusterID is ', k8mProviderId + '_k8sCluster_' + k8mClusterName);
                        callback(k8mProviderId, k8mClusterName);
                    } else if (content.data && content.data.PROVIDER_ID && !content.data.CLUSTER_NAME) {
                        k8mProviderId = content.data.PROVIDER_ID;
                        k8mClusterName = 'UnnamedCluster';
                        logger.debug('k8sutil', 'fetchK8MClusterID', ' The clusterID is ', k8mProviderId + '_k8sCluster_' + k8mClusterName);
                        callback(k8mProviderId, k8mClusterName);
                    } else {
                        logger.warn('k8sutil', 'fetchK8MClusterID', 'Failed to parse ' + d.toString());
                        callback(k8mProviderId, k8mClusterName);
                    }
                } catch (e) {
                    logger.warn('k8sutil', 'fetchK8MClusterID', e);
                    callback(k8mProviderId, k8mClusterName);
                }
            });
        } else {
            res.on('error', function(error) {
                logger.error('k8sutil', 'fetchK8MClusterID err:', error);
            });
            callback(k8mProviderId, k8mClusterName);
            return;
        }
    });
    req.on('error', function(err) {
        logger.warn('k8sutil', 'fetchK8MClusterID err:', err);
        callback(k8mProviderId, k8mClusterName);
        return;
    });
    req.end();
    return;
};


function fetchPodName(ip, callback) {
    var https = require('https');
    var endpoint = 'https://' + process.env.KUBERNETES_SERVICE_HOST +
        ':' + process.env.KUBERNETES_SERVICE_PORT +
        '/api/v1/namespaces/' + namespace + '/pods?fieldSelector=status.podIP=' + ip + ',status.phase=Running';
    var header = {
        Authorization: 'Bearer ' + file_as_string(TOKEN_FILE),
        Accept: 'application/json'
    };
    var options = url.parse(endpoint);
    options.headers = header;
    options.method = 'GET';
    options.rejectUnauthorized = false;
    logger.debug('k8sutil', 'fetchPodName', 'query ' + JSON.stringify(options));
    var req = https.request(options, function(res) {
        if (!res) {
            logger.debug('k8sutil', 'fetchPodName', 'no res');
            callback();
            return;
        }
        logger.debug('k8sutil', 'fetchPodName', 'query status code: ' + res.statusCode);
        if (res.statusCode < 400) {
            let podsJSONBuff;
            res.on('data', function(d) {
                logger.debug('k8sutil', 'fetchPodName respose:', d.toString());
                if (!podName) {
                    if (!podsJSONBuff) {
                        podsJSONBuff = d;
                    } else {
                        podsJSONBuff = Buffer.concat([podsJSONBuff, d], podsJSONBuff.length + d.length);
                    }
                    var content;
                    try {
                        content = JSON.parse(podsJSONBuff.toString());
                    } catch (e) {
                        logger.warn('k8sutil', 'fetchPodName', 'podsJson content is not ready yet');
                    }
                    if (content && content.items && content.items.length > 0) {
                        podName = content.items[0].metadata.name;
                        podGenerateName = content.items[0].metadata.generateName;
                        containerName = content.items[0].spec.containers[0].name;
                        logger.debug('k8sutil', 'fetchPodName', podName, podGenerateName);
                        callback();
                    } else {
                        logger.warn('k8sutil', 'fetchPodName',
                            'podsJson content is not ready yet', podsJSONBuff.toString());
                        callback();
                    }
                } else {
                    logger.warn('k8sutil', 'fetchPodName', 'podName is ready, skip');
                }
            });
        } else {
            detectUaK8Plugin();
            res.on('error', function(error) {
                logger.error('k8sutil', 'fetchPodName err:', error);
            });
            callback();
            return;
        }
    });
    req.on('error', function(err) {
        logger.warn('k8sutil', 'fetchPodName err:', err);
        callback();
        return;
    });
    req.end();
    return;
};


function file_as_string(filename) {
    if (fs.existsSync(filename)) {
        try {
            var tempcont = fs.readFileSync(filename);
            var content = tempcont.toString().replace('\n', '');
            logger.debug('k8sutil', 'file_as_string(' + filename + ')', content);
            return content;
        } catch (e) {
            return '';
        }
    } else {
        logger.warn('k8sutil', 'file_as_string(' + filename + ')', 'Failed to get content.');
        return '';
    }
}

K8sutil.prototype.getK8MProviderId = function() {
    return k8mProviderId;
};

function setNodeIPs() {
    try {
        core.nodes.get().then(
            function(result) {
                if (!result) {
                    return;
                }
                logger.debug('k8sutil', 'setNodeIPs()', 'The node info: ' + result.items.length);
                var items = result.items;
                for (var index = 0; index < items.length; index++) {
                    var element = items[index];
                    nodeArray.push(element);
                    if (element.status && Array.isArray(element.status.addresses)) {
                        for (let indexnsa = 0; indexnsa < element.status.addresses.length; indexnsa++) {
                            const addr = element.status.addresses[indexnsa];
                            if (addr.type && addr.address && addr.type === 'Hostname') {
                                nodeIPs.push(addr.address);
                            }

                        }
                    }
                }
                logger.debug('k8sutil', 'setNodeIPs()', 'The node IPs: ' + nodeIPs);

            }
        ).catch(function(e) {
            logger.error('k8sutil', 'setNodeIPs()', e.message);
        });
    } catch (e) {
        logger.debug('k8sutil', 'setNodeIPs()',
            'Failed to find nodes IPs, is not a ICp environment.');
    }
}

K8sutil.prototype.getNodes = function() {
    return nodeArray;
};

K8sutil.prototype.getNodeIPs = function() {
    logger.debug('k8sutil', 'getNodeIPs()', 'The node IPs from ICP is : ', nodeIPs);
    return nodeIPs;
};

function findIngressSvc() {
    logger.debug('k8sutil', 'findIngressSvc()', 'start...');
    try {
        core.ns(NAMESPACE_DEFAULT).svc.get().then(
            function(svcJson) {
                if (svcJson.items.length === 0) {
                    return;
                }
                for (var index = 0; index < svcJson.items.length; index++) {
                    var element = svcJson.items[index];
                    var name = element.metadata.name;
                    if (name.endsWith('ingress')) {
                        ingressUrl = 'http://' + name + '.' + NAMESPACE_DEFAULT +
                            '.svc.cluster.local/1.0/data';
                        // process.env.IBAM_INGRESS_URL = ingressUrl;
                        logger.debug('k8sutil', 'findIngressSvc()',
                            'Find the ingressUrl from ICP is : ', ingressUrl);
                    }
                }
            }
        ).catch(
            function(e) {
                logger.error('k8sutil', 'findIngressSvc()', e.message);
            }
        );
    } catch (e) {
        logger.debug('k8sutil', 'findIngressSvc()',
            'Failed to find ingress URL.');
    }
}

K8sutil.prototype.getIngressUrl = function() {
    logger.debug('k8sutil', 'getIngressUrl()', 'The ingressUrl from ICP is : ', ingressUrl);
    return ingressUrl;
};

function parsePodInfo(result) {
    if (isUa) {
        return;
    }
    logger.debug('k8sutil', 'parsePodInfo', 'in');
    podJson = result;
    logger.debug('The pod: ', JSON.stringify(podJson));
    if (!podJson.status || !podJson.status.containerStatuses) {
        return;
    }

    for (var index = 0; index < podJson.status.containerStatuses.length; index++) {
        var element = podJson.status.containerStatuses[index];
        if (element.containerID &&
            element.containerID.indexOf(K8sutil.prototype.getContainerID()) >= 0) {
            containerInfo = element;
            break;
        }
    }
    core.ns(namespace).ep.get().then(setServices).catch(function(e) {
        logger.error('k8sutil', 'parsePodInfo, failed to get service.', e.message);
    });
    // core.ns(namespace).svc.get().then(setServices).catch(function(e) {
    //     logger.error('k8sutil', 'parsePodInfo, failed to get service.', e.message);
    // });
    setPodGenerateName(podJson);
    // ext.ns(namespace).deploy.get().then(SetDeployments).catch(function(e) {
    //     logger.error('k8sutil', 'parsePodInfo, , failed to get deployment', e.message);
    // });
    return;
}

K8sutil.prototype.refreshServiceInfo = function() {
    if (isUa) {
        return;
    }
    if (this.isICP() && namespace && core && podName) {
        try {
            logger.debug('namespace: ', namespace, 'podName', podName);

            core.ns(namespace).ep.get().then(setServices).catch(function(e) {
                logger.error('k8sutil', 'refreshServiceInfo, failed to get service.', e.message);
            });
        } catch (e) {
            logger.debug('k8sutil', 'reinit()',
                'Failed to load K8S configuration, is not a ICp environment.');
        }
    }
};

function setPodGenerateName(podJson) {
    try {
        podGenerateName = podJson.metadata.generateName;
        if (podJson.metadata.labels['pod-template-hash']) {
            podGenerateName = podGenerateName
                .split('-' + podJson.metadata.labels['pod-template-hash'])[0];
        }
        logger.debug('k8sutil', 'setPodGenerateName', podGenerateName);

    } catch (err) {
        logger.error('k8sutil', 'setPodGenerateName', err.message);
    }

}

K8sutil.prototype.getPodGenerateName = function() {
    return podGenerateName;
};

// function SetDeployments(deployJson) {
//     var plabels = podJson.metadata.labels;
//     logger.debug('k8sutil', 'SetDeployments', 'The num of deployments: ', deployJson.items.length);
//     if (deployJson.items.length <= 0) {
//         return;
//     }
//     for (let index = 0; index < deployJson.items.length; index++) {
//         const element = deployJson.items[index];
//         if (isPartOf(element.metadata.labels, plabels)) {
//             logger.debug('k8sutil', 'SetDeployments', 'Set the deployment. ', element);
//             deployment = element;
//         }
//     }
// }

// function isPartOf(prop1, prop2) {
//     for (const key in prop1) {
//         if (!prop2.hasOwnProperty(key) || prop1[key] !== prop2[key]) {
//             return false;
//         }
//     }
//     return true;
// }

// K8sutil.prototype.getDeployName = function() {
//     if (deployment) {
//         logger.debug('k8sutil', 'getDeployName', deployment.metadata.name);
//         return deployment.metadata.name;
//     }
// };

function setServices(epJson) {
    logger.debug('k8sutil', 'setServices', 'The num of endpoints: ', epJson.items.length);
    if (!epJson.items || epJson.items.length === 0) {
        logger.debug('No endpoints exist');
        return;
    }
    // get service name list
    var endpoints = epJson.items;
    svcNames = [];

    for (let i = 0; i < endpoints.length; i++) {
        if (!endpoints[i].subsets) {
            logger.debug('k8sutil', 'setServices', endpoints[i].metadata.name, 'No subsets');
            continue;
        }
        let subsets = endpoints[i].subsets;
        for (let j = 0; j < subsets.length; j++) {
            if (!subsets[j].addresses) {
                logger.debug('k8sutil', 'setServices', endpoints[i].metadata.name, 'No addresses');
                continue;
            }
            let addresses = subsets[j].addresses;
            let gotIP = false;
            for (let k = 0; k < addresses.length; k++) {
                if (addresses[k].ip === localIP) {
                    svcNames.push(endpoints[i].metadata.name);
                    gotIP = true;
                    break;
                }
            }
            if (gotIP) {
                break;
            }
        }
    }
    logger.debug('k8sutil', 'setServices', 'serviceNames', svcNames);
    // use service name to get svc list
    svcArray = [];
    for (let index = 0; index < svcNames.length; index++) {
        let svcName = svcNames[index];

        core.ns(namespace).services(svcName).get().then(function(element) {
            svcArray.push(element);
            logger.debug('k8sutil', 'setServices', 'The services of pod: ', svcArray);
        }).catch(function(e) {
            logger.error('k8sutil', 'setServices', 'failed to get service.', e.message);
        });
    }
}

K8sutil.prototype.getNamespace = function() {
    // if (namespace) {
    //     logger.debug('k8sutil.js', 'getNamespace', namespace);
    //     return namespace;
    // }
    // if (fs.existsSync(NAMESPACE_FILE)) {
    //     var tempcont = fs.readFileSync(NAMESPACE_FILE);
    //     var contArr = tempcont.toString().split(os.EOL);
    //     for (var index = 0; index < contArr.length; index++) {
    //         namespace = contArr[index];
    //         logger.debug('k8sutil.js', 'getNamespace', namespace,
    //             'from', NAMESPACE_FILE);
    //         return namespace;
    //     }
    // }
    // logger.debug('k8sutil.js', 'getNamespace', 'KUBE_NAMESPACE is not defined, and no ',
    //     NAMESPACE_FILE, 'either. ', 'will use default namespace.');
    // namespace = 'default';
    // return namespace;
    if (namespace) {
        return namespace;
    }
    if (fs.existsSync(NAMESPACE_FILE)) {
        var tempcont = fs.readFileSync(NAMESPACE_FILE);
        var contArr = tempcont.toString().split(os.EOL);
        for (var index = 0; index < contArr.length; index++) {
            namespace = contArr[index];
            logger.debug('k8sutil.js', 'getNamespace', namespace,
                'from', NAMESPACE_FILE);
            return namespace;
        }
    }
    try {
        namespace = core.namespaces.namespace;
    } catch (e) {
        logger.debug('k8sutil.js', 'getNamespace()',
            'Cannot get K8S namespace, is not a ICp environment.', namespace);
    }
    return namespace;
};

function fetchContainerID() {
    if (fs.existsSync(QUERY_CONTAINER_ID_FILE)) {
        var tempcont = fs.readFileSync(QUERY_CONTAINER_ID_FILE);
        var contArr = tempcont.toString().split(os.EOL);
        for (var index = 0; index < contArr.length; index++) {
            var element = contArr[index];
            if (element.indexOf('cpu') > 0 || element.indexOf('memory') > 0) {
                if (element.indexOf('docker') > 0 || element.indexOf('kubepods') > 0 || element.indexOf('libpod') > 0) {
                    var tArr = element.split('/');
                    containerID = tArr[tArr.length - 1];
                    if (containerID.indexOf('-') > 0 && containerID.indexOf('.') > 0) {
                        containerID = containerID.split('-')[1].split('.')[0];
                    }
                    logger.debug('The container ID: ', containerID);
                    return containerID;
                }
            }
        }
    }
}

K8sutil.prototype.getContainerID = function getContainerID() {
    if (containerID) {
        return containerID;
    }
    return fetchContainerID();
};

K8sutil.prototype.getShortContainerID = function getShortContainerID() {
    if (containerID) {
        return containerID.substr(0,12);
    } else {
        return 'notFound';
    }

};

K8sutil.prototype.getPodName = function getPodName() {
    if (podName) {
        return podName;
    }
    localIP = getServerAddress('IPv4', '127.0.0.1');
    if (localIP && namespace) {
        fetchPodName(localIP, function() {
        });
    }
    logger.debug('The pod name: ', podName);
    return podName;
};

K8sutil.prototype.isICP = function isICP() {
    if (isIcp !== undefined) {
        let ret = this.isTrue(isIcp);
        logger.debug('k8sutil.js', 'isICP()', ret);
        return ret;
    }
    if (fs.existsSync(NAMESPACE_FILE)) {
        isIcp = true;
        return true;
    }
    try {
        core.ns(namespace).namespace;
        isIcp = true;
        return true;
    } catch (e) {
        isIcp = false;
        logger.debug('k8sutil.js', 'isICP()',
            'Cannot get K8S namespace, is not a ICp environment.', namespace);
    }
    logger.debug('k8sutil.js', 'isICP()', isIcp);
    return false;
};

K8sutil.prototype.isTrue = function(v) {
    if (v && ['false', 'False', 'FALSE', ''].indexOf(v) < 0) {
        return true;
    } else {
        return false;
    }
};

K8sutil.prototype.getPodDetail = function getPodDetail() {
    return podJson;
};

K8sutil.prototype.getContainerDetail = function getContainerDetail() {
    return containerInfo;
};

K8sutil.prototype.getNodeName = function getNodeName() {
    if (nodeName) {
        return nodeName;
    }
    if (podJson) {
        nodeName = podJson.spec.nodeName;
    }
    return nodeName;
};

K8sutil.prototype.getPodID = function getPodID() {
    if (podID) {
        return podID;
    }
    if (podJson) {
        podID = podJson.metadata.uid;
    }
    return podID;
};

K8sutil.prototype.getContainerName = function getContainerName() {
    if (containerName) {
        return containerName;
    }
    if (containerInfo) {
        containerName = containerInfo.name;
    }
    return containerName;
};

K8sutil.prototype.getContainerFullID = function getContainerFullID() {
    if (containerFullID) {
        return containerFullID;
    }
    if (containerInfo) {
        containerFullID = containerInfo.containerID;
    }
    return containerFullID;
};

K8sutil.prototype.getServicesConn = function getServicesConn() {
    var svcConn = [];
    if (isUa) {
        if (svcConn.length === 0 && this.getUaK8Info()) {
            svcConn.push(this.getUaK8Info());
        }
        return svcConn;
    }
    for (var index = 0; index < svcArray.length; index++) {
        var svct = svcArray[index];
        var svcTemp = {
            uid: svct.metadata.uid,
            name: svct.metadata.name,
            namespace: svct.metadata.namespace,
            creationTimestamp: svct.metadata.creationTimestamp,
            connections: [],
            nodePort: [],
            port: [],
            ports: [],
            targetPort: [],
            mergeTokens: [],
            externalIPs: []
        };
        var ports = svct.spec.ports;
        svcTemp.ports = svcTemp.ports.concat(ports);
        for (var indexp = 0; indexp < ports.length; indexp++) {
            var ptemp = ports[indexp];
            svcTemp.mergeTokens.push(svct.spec.clusterIP + ':' + ptemp.port);
            if (ptemp.nodePort) {
                svcTemp.nodePort.push(ptemp.nodePort);
            }
            if (ptemp.targetPort) {
                svcTemp.targetPort.push(ptemp.targetPort);
            }
            svcTemp.port.push(ptemp.port);
        }

        if (svct.spec.clusterIP) {
            svcTemp.clusterIP = svct.spec.clusterIP;
            svcTemp.connections.push(svct.spec.clusterIP + ':' + svcTemp.port.toString());

        }
        if (svct.spec.externalIPs) {
            for (var index1 = 0; index1 < svct.spec.externalIPs.length; index1++) {
                var exIP = svct.spec.externalIPs[index1];
                svcTemp.connections.push(exIP + ':' + svcTemp.port.toString());
                svcTemp.externalIPs.push(exIP);
            }
            svcTemp.mergeTokens = svcTemp.mergeTokens
                .concat(combineArr(svcTemp.externalIPs, ':', svcTemp.port));
        }

        svcConn.push(svcTemp);
    }
    logger.debug('The service connections', svcConn);
    return svcConn;
};

function combineArr(array1, seprator, array2) {
    let ret = [];
    for (let index1 = 0; index1 < array1.length; index1++) {
        let item1 = array1[index1];
        for (let index2 = 0; index2 < array2.length; index2++) {
            let item2 = array2[index2];
            ret.push(item1 + seprator + item2);
        }
    }
    return ret;
}

K8sutil.prototype.getServiceName = function getServiceName() {
    if (svcNames.length > 0) {
        logger.debug('The service names:', svcNames);
        return svcNames;
    }
    if (isUa) {
        detectUaK8Plugin();
        return svcNames;
    }
    for (let index = 0; index < svcArray.length; index++) {
        let svcitem = svcArray[index];
        svcNames.push(svcitem.metadata.name);
    }
    logger.debug('The service names:', svcNames);
    return svcNames;
};

K8sutil.prototype.getFullServiceName = function getFullServiceName() {
    if (svcFullNames.length > 0) {
        logger.debug('k8sutil.js', 'getFullServiceName', 'The full service names:', svcFullNames);
        return svcFullNames;
    }
    if (!namespace) {
        logger.debug('k8sutil.js', 'getFullServiceName', 'namespace is', namespace);
        return;
    }
    for (let index = 0; index < svcArray.length; index++) {
        let svcitem = svcArray[index];
        svcFullNames.push(namespace + '_service_' + svcitem.metadata.name);
    }
    logger.debug('k8sutil.js', 'getFullServiceName', 'The full service names:', svcFullNames);
    return svcFullNames;
};

K8sutil.prototype.getServiceID = function getServiceID() {
    if (svcIDs.length > 0) {
        logger.debug('k8sutil.js', 'getServiceID', 'The service IDs:', svcIDs);
        return svcIDs;
    }

    for (var index = 0; index < svcArray.length; index++) {
        var svct = svcArray[index];
        svcIDs.push(svct.metadata.uid);
    }
    logger.debug('k8sutil.js', 'getServiceID', 'The service IDs:', svcIDs);
    return svcIDs;
};

module.exports = new K8sutil();
