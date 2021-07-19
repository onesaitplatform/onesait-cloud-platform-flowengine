# winston-gelf

Winston transport for Graylog2 for winston 3.x.

## Installation

```
npm install winston
npm install winston-gelf

```

## Usage
```javascript
  const GelfTransport = require('winston-gelf');

  const options = {
    gelfPro: {
      fields: {
        env: 'test',
        facility: 'XYZ'
        //
      },
      adapterName: 'udp', // optional; currently supported "udp", "tcp" and "tcp-tls"; default: udp
      adapterOptions: { // this object is passed to the adapter.connect() method        
        host: '127.0.0.1', // optional; default: 127.0.0.1
        port: 12201, // optional; default: 12201
      }
    }
  }

  const gelfTransport = new GelfTransport(options);

  const logger = () => winston.createLogger( {
    transports: [
      new winston.transports.Console(),
      gelfTransport
    ]
  });


  logger.info('Hello there');

  try {
    ///...
  } catch(err) {
    logger.log({level: 'warn', message: 'Failed something', error: err});
  }
```
