const EventEmitter = require('events').EventEmitter

// The loopback transport allows you to mock a JSON-RPC interface where the client
// and server are on the same process.
class LoopbackTransport extends EventEmitter {
  constructor() {
    super()
    this.handler = () => {}
  }

  // Create a fake shutdown method for the sake of API compatibility
  shutdown(done) {
    this.emit('shutdown')
    if (done instanceof Function) done()
  }

  // Pass the client requests to the server handler, and the response handling is taken care of
  // by the client's response handler.
  request(body, callback) {
    this.emit('message', body, JSON.stringify(body).length)
    this.handler(body, callback)
  }
}

module.exports = LoopbackTransport
