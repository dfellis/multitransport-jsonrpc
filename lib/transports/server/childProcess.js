const EventEmitter = require('events').EventEmitter
const zlib = require('zlib')

function uncompressedMessageHandler(json) {
  this.emit('message', json, -1) // Message len unsupported by the child process message event
  this.handler(json, process.send.bind(process))
}

function compressedMessageResponseHandler(config, jsonrpcObj) {
  const jsonrpcStr = JSON.stringify(jsonrpcObj)
  if (!config.compressLength || jsonrpcStr.length > config.compressLength) {
    zlib.gzip(new Buffer(JSON.stringify(jsonrpcObj)), (err, compressedJSON) => {
      if (err) return this.emit('error', err.message)
      process.send('z' + compressedJSON.toString('base64'))
    })
  } else {
    process.send(jsonrpcStr)
  }
}

function compressedMessageHandler(config, json) {
  if (json.charAt(0) === 'z') {
    const buf = new Buffer(json.substring(1), 'base64')
    zlib.gunzip(buf, (err, uncompressedJSON) => {
      if (err) return this.emit('error', err.message)
      const obj = JSON.parse(uncompressedJSON.toString('utf8'))
      this.handler(obj, compressedMessageResponseHandler.bind(this, config))
    })
  } else {
    const obj = JSON.parse(json)
    this.handler(obj, compressedMessageResponseHandler.bind(this, config))
  }
}

class ChildProcessTransport extends EventEmitter {
  constructor(config) {
    super()

    // Make sure the config is addressable and add config settings
    // and a dummy handler function to the object
    config = config || {}
    this.handler = function fakeHandler(json, next) { next({}) }

    this.messageHandler = config.compressed ? compressedMessageHandler.bind(this, config) : uncompressedMessageHandler.bind(this)
    process.on('message', this.messageHandler)
  }

  // A simple wrapper for closing the HTTP server (so the TCP
  // and HTTP transports have a more uniform API)
  shutdown(done) {
    this.emit('shutdown')
    process.removeListener('message', this.messageHandler)
    if (done instanceof Function) done()
  }
}

module.exports = ChildProcessTransport
