## Get the APM configuration information
Get the configuration information from APM v8 server, then use these configuration information to configure the Node.js DC to connect to the APM v8 server

## Procedure
1. Log in to the APM server, and run the <i><APM_home>/ccm/make_configuration_packages.sh</i>, it will generate the configuration package into a folder like  mkcustpkg_workdir.*, which will includes the onprem_config.tar. Download this tar file and copy it to your environment.

2. Run ./config_node_dc.sh <i><tar_from_APM></i> <i><output_dir></i>. The config_node_dc.sh can be found in the /ibmapm/etc/ of Node.js DC. The global.environment and keyfile.p12 will be generated to <i><output_dir></i>. 