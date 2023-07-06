# node-red-contrib-better-sftp

Better SFTP was created out of necessity for a SFTP node which 
was fully implemented and had several options to configure algorithms.

Big shout out to [jyu213][https://github.com/jyu213] for creating [ssh2-sftp-client][https://github.com/jyu213/ssh2-sftp-client] to make development
of this node easy.

Install
-------

Run the following command in the root directory of your Node-RED install

    npm install node-red-contrib-better-sftp
    
SFTP
-------
**List Directory** - Lists contents of `msg.payload` as a directory OR working directory on node config.

**Get** - Set `msg.payload` to get the file OR working directory + file name in configuration will be used.

**Put** - Set `msg.payload.data` to either the file name, buffer stream, or buffer object of the source file. 
Set `msg.payload.filename` to the desired name of remote file. 
If `msg.payload.filename` is not specified filename in node config will be used. 
File contents will be uploaded to the SFTP server in the working directory specified.

**Delete File** - Set `msg.payload` to the name of the file you wish to delete in the working directory.

**Make Directory** - Set `msg.payload` to the name of the directory to make. If blank working directory will be used.

**Remove Directory** - Set `msg.payload` to the name of the directory to remove. If blank working directory will be used.

Configuration
-------

Host, username, and password are required to configure a new SFTP client.

Algorithms are set to pre-defined default values. If you need to modify them see
[ssh2-streams][https://github.com/mscdex/ssh2-streams] for more information.

License
-------

See [license](https://github.com/sublime93/node-red-contrib-better-sftp/blob/master/LICENSE)


[https://github.com/mscdex/ssh2-streams]: https://github.com/mscdex/ssh2-streams
[https://github.com/jyu213]: https://github.com/jyu213
[https://github.com/jyu213/ssh2-sftp-client]: https://github.com/jyu213/ssh2-sftp-client
