var net = require('net');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

require('buffertools');

// The Server TCP Transport constructor function
function TcpTransport(port, config) {
    // Initialize the EventEmitter for this object
    EventEmitter.call(this);

    // Fix config property references if no config provided
    config = config || {};

    // If the server retries count is a number, establish the number of times it has currently retried to zero
    // and make sure there is a retry interval
    if(config.retries/1 === config.retries) {
        config.retry = 0;
        config.retryInterval = config.retryInterval || 250;
    }

    // The fake handler guarantees that V8 doesn't subclass the transport when the user's handler is attached
    this.handler = function fakeHandler(json, next) { next({}); };
    this.port = port;

    this.server = net.createServer(function(con) {
        this.emit('connection', con);
        // For each connection establish a buffer to put UTF8 text into
        var buffer = new Buffer('');
        con.on('data', function(data) {
            buffer = buffer.concat(data);
            // Each time the buffer is added to, check for message delimiters (zero byte vals)
            var nullSpot = buffer.indexOf('\0');
            while(nullSpot !== -1) {
                // While there are still message delimiters, parse each message and pass it to the handler, along with the handler callback
                //console.log('buffer');
                //console.log(buffer.toString());
                //console.log('nullSpot');
                //console.log(nullSpot);
                var messageSize = buffer.toString('utf8', 0, nullSpot);
                //console.log('messageSize');
                //console.log(messageSize);
                var messageSizePrefixBytes = Buffer.byteLength(messageSize);
                //console.log('messageSizePrefixBytes');
                //console.log(messageSizePrefixBytes);
                var totalMessageLength = 2 + messageSizePrefixBytes + Number(messageSize);
                // Return if We don't have a full message yet
                if (buffer[totalMessageLength - 1] === undefined) {
                    //console.log('return');
                    return;
                } else if (buffer[totalMessageLength - 1] !== 0) {
                    // TODO corrupted packet
                    //console.log('CORRUPT');
                }
                var message = buffer.toString('utf8', messageSizePrefixBytes + 1, messageSizePrefixBytes + 1 + Number(messageSize));
                buffer = buffer.slice(totalMessageLength);
                var jsonObj;
                try {
                    //console.log('message');
                    //console.log(message);
                    jsonObj = JSON.parse(message);
                } catch(e) {
                    //this.emit('error', e);
                }
                this.emit('message', jsonObj);
                this.handler(jsonObj, this.handlerCallback.bind(this, con));
                nullSpot = buffer.indexOf('\0');
            }
        }.bind(this));
        con.on('end', function() {
            this.emit('closedConnection', con);
            // When the connection for a client dies, make sure the handlerCallbacks don't try to use it
            con = null;
        });
    }.bind(this));

    // Shorthand for registering a listening callback handler
    this.server.on('listening', function() {
        // Reset the retry counter on a successful connection
        config.retry = 0;
        this.emit('listening');
    }.bind(this));
    this.server.listen(port);

    // Any time the server encounters an error, check it here.
    // Right now it only handles errors when trying to start the server
    this.server.on('error', function(e) {
        if(e.code === 'EADDRINUSE') {
            // If something else has the desired port
            if(config.retries && config.retry < config.retries) {
                this.emit('retry');
                // And we're allowed to retry
                config.retry++;
                // Wait a bit and retry
                setTimeout(function() {
                    this.server.listen(port);
                }.bind(this), config.retryInterval);
            } else {
                // Or bitch about it
                this.emit('error', e);
            }
        } else {
           // Some unhandled error
           this.emit('error', e);
        }
    }.bind(this));

    // A simple flag to make sure calling ``shutdown`` after the server has already been shutdown doesn't crash Node
    this.server.on('close', function() {
        this.emit('shutdown');
        this.notClosed = false;
    }.bind(this));
    this.notClosed = true;

    return this;
};

// Attach the EventEmitter prototype into the prototype chain
util.inherits(TcpTransport, EventEmitter);

// An almost ridiculously simple callback handler, whenever the return object comes in, stringify it and send it down the line (along with a message delimiter
TcpTransport.prototype.handlerCallback = function handlerCallback(con, retObj) {
    var retStr = '' + JSON.stringify(retObj);
    //console.log(retStr);
    if(con) con.write(Buffer.byteLength(retStr) + '\0' + retStr  + '\0');
};

// When asked to shutdown the server, shut it down
TcpTransport.prototype.shutdown = function shutdown(done) {
    if(this.server && this.notClosed) this.server.close(done);
};

// Export the Server TCP Transport
module.exports = TcpTransport;
