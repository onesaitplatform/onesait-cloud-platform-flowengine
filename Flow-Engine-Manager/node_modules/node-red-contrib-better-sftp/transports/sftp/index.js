const fs = require('fs');
const path = require('path');
const Client = require('ssh2-sftp-client');

module.exports = function (RED) {
    'use strict';

    function SFtpNode(n) {
        RED.nodes.createNode(this, n);
        this.valid = true;
        var keyPath = "";
        if (n.key) keyPath = n.key.trim();

        if (keyPath.length > 0) {
            try {
                if (keyPath) {
                    this.key = fs.readFileSync(keyPath);
                }
            } catch (err) {
                this.valid = false;
                this.error(err.toString());
                return;
            }
        } else {
            if (this.credentials) {
                var keyData = this.credentials.keydata || "";

                if (keyData) {
                    this.key = keyData;
                }
            }
        }

        this.options = {
            host: n.host || 'localhost',
            port: n.port || 22,
            tryKeyboard: n.tryKeyboard || false,
            algorithms_kex: n.algorithms_kex,
            algorithms_cipher: n.algorithms_cipher,
            algorithms_serverHostKey: n.algorithms_serverHostKey,
            algorithms_hmac: n.algorithms_hmac,
            algorithms_compress: n.algorithms_compress
        };
    }

    RED.nodes.registerType('sftp', SFtpNode, {
        credentials: {
            username: { type: "text" },
            password: { type: "password" },
            keydata: { type: "text" },
            passphrase: { type: "password" }
        },
    });

    function SFtpInNode(n) {
        RED.nodes.createNode(this, n);
        this.sftp = n.sftp;
        this.operation = n.operation;
        this.filename = n.filename;
        this.localFilename = n.localFilename;
        this.workdir = n.workdir;
        this.sftpConfig = RED.nodes.getNode(this.sftp);

        // Validate config exists
        if (!this.sftpConfig) {
            this.error('No configuration found. Please validate configuration.');
            return;
        }

        // Validate credentials are present.
        if (!this.sftpConfig.credentials.username || this.sftpConfig.credentials.username === '') {
            this.error('Username not present. Make sure username is defined in server configuration.');
            return;
        }

        let node = this;
        node.on('input', function (msg, send, done) {

            function handleError(error, msg) {
                if (done) {
                    // Node-RED 1.0 compatible
                    done(error);
                } else {
                    // Node-RED 0.x compatible
                    node.error(error, msg);
                }
            }

            let sftp = new Client();
            node.status({ fill: "blue", shape: "dot", text: 'connecting' });
            try {
                node.workdir = msg.workdir || node.workdir || "./";
                node.localFilename = msg.localFilename || node.localFilename || "";

                /* SFTP options */
                node.sftpConfig.options.host = msg.host || node.sftpConfig.options.host;
                node.sftpConfig.options.port = msg.port || node.sftpConfig.options.port;
                node.sftpConfig.options.username = msg.user || node.sftpConfig.credentials.username || '';
                node.sftpConfig.options.password = msg.password || node.sftpConfig.credentials.password || '';
                node.sftpConfig.options.tryKeyboard = node.sftpConfig.options.tryKeyboard || false;
                node.sftpConfig.options.keydata = node.sftpConfig.key || '';
                node.sftpConfig.options.passphrase = node.sftpConfig.credentials.passphrase || '';
                node.sftpConfig.options.algorithms_kex = node.sftpConfig.options.algorithms_kex || 'ecdh-sha2-nistp256,ecdh-sha2-nistp384,ecdh-sha2-nistp521,diffie-hellman-group-exchange-sha256,diffie-hellman-group14-sha1';
                node.sftpConfig.options.algorithms_cipher = node.sftpConfig.options.algorithms_cipher || 'aes128-ctr,aes192-ctr,aes256-ctr,aes128-gcm,aes128-gcm@openssh.com,aes256-gcm,aes256-gcm@openssh.com';
                node.sftpConfig.options.algorithms_serverHostKey = node.sftpConfig.options.algorithms_serverHostKey || 'ssh-rsa,ecdsa-sha2-nistp256,ecdsa-sha2-nistp384,ecdsa-sha2-nistp521';
                node.sftpConfig.options.algorithms_hmac = node.sftpConfig.options.algorithms_hmac || 'hmac-sha2-256,hmac-sha2-512,hmac-sha1';
                node.sftpConfig.options.algorithms_compress = node.sftpConfig.options.algorithms_compress || 'none,zlib@openssh.com,zlib';

                let conSettings = {
                    host: node.sftpConfig.options.host,
                    port: node.sftpConfig.options.port,
                    username: node.sftpConfig.options.username,
                    password: node.sftpConfig.options.password,
                    privateKey: node.sftpConfig.options.keydata,
                    passphrase: node.sftpConfig.options.passphrase,
                    tryKeyboard: node.sftpConfig.options.tryKeyboard,
                };

                conSettings.algorithms = {
                    kex: node.sftpConfig.options.algorithms_kex.split(','),
                    cipher: node.sftpConfig.options.algorithms_cipher.split(','),
                    serverHostKey: node.sftpConfig.options.algorithms_serverHostKey.split(','),
                    hmac: node.sftpConfig.options.algorithms_hmac.split(','),
                    compress: node.sftpConfig.options.algorithms_compress.split(',')
                };

                return new Promise(async function (resolve, reject) {
                    try {
                        // Try password interative
                        if(conSettings.tryKeyboard === true) {
                            sftp.on('keyboard-interactive', function(name, instructions, instructionsLang, prompts, finish) {
                                finish([conSettings.password]);
                            })
                        }

                        // Connect to sftp server
                        await sftp.connect(conSettings);
                        node.status({ fill: 'green', shape: 'dot', text: 'connected' });

                        switch (node.operation) {
                            case 'list':
                                let fileListing = await sftp.list(node.workdir);
                                msg.payload = fileListing;
                                node.send(msg);
                                break;
                            case 'get':
                                let getFtpFileName = path.join(node.workdir, node.filename);
                                if (msg.payload) getFtpFileName = msg.payload;

                                let fileBytes = await sftp.get(getFtpFileName);
                                msg.payload = fileBytes;
                                node.send(msg);
                                break;
                            case 'put':
                                let putFtpFileName = path.join(node.workdir, node.filename);
                                if (msg.payload.filename) putFtpFileName = path.join(node.workdir, msg.payload.filename);

                                let put = await sftp.put(msg.payload.data, putFtpFileName);

                                msg.payload = put;
                                node.send(msg);
                                break;
                            case 'delete':
                                let delFtpFileName = path.join(node.workdir, node.filename);
                                if (msg.payload) delFtpFileName = msg.payload;
                                let del = await sftp.delete(delFtpFileName);
                                msg.payload = del;
                                node.send(msg);
                                break;
                            case 'mkdir':
                                let mkDirName = (msg.payload) ? msg.payload : node.workdir;
                                let mkdir = await sftp.mkdir(mkDirName, false);
                                msg.payload = mkdir;
                                node.send(msg);
                                break;
                            case 'rmdir':
                                let rmDirName = (msg.payload) ? msg.payload : node.workdir;
                                let rmdir = await sftp.rmdir(rmDirName, false);
                                msg.payload = rmdir;
                                node.send(msg);
                                break;
                            default:
                                node.status({ fill: 'red', shape: 'ring', text: 'failed' });
                                node.error('Invalid operation');
                                reject('Invalid operation');
                                break;
                        }

                        node.status({ fill: 'gray', shape: 'ring', text: 'done!' });
                        resolve('success');
                    } catch (err) {
                        node.status({ fill: 'red', shape: 'ring', text: 'failed' });
                        handleError(err, msg);
                        reject(err);
                    } finally {
                        sftp.client.end();
                        sftp.end();
                        node.status({});
                    }
                });
            } catch (error) {
                handleError(error, msg);
            }
        });
    }
    RED.nodes.registerType('sftp in', SFtpInNode);
};
