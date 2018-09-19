const net = require('net')
const EventEmitter = require('events').EventEmitter
const shared = require('../shared/tcp')

class TcpTransport extends EventEmitter {
  constructor(port, config) {
    super()

    // Fix config property references if no config provided
    config = config || {}

    // If the server retries count is a number, establish the number of times it has currently retried to zero
    // and make sure there is a retry interval
    if (config.retries/1 === config.retries) {
      config.retry = 0
      config.retryInterval = config.retryInterval || 250
    }

    // The fake handler guarantees that V8 doesn't subclass the transport when the user's handler is attached
    this.handler = (json, next) => next({})
    this.port = port

    this.logger = config.logger || (() => undefined)
    this.connections = {}
    this.server = net.createServer((con) => {
      this.connections[JSON.stringify(con.address())] = con
      this.emit('connection', con)
      con.on('data', shared.createDataHandler(this, (message) => {
        this.handler(message, this.handlerCallback.bind(this, con))
      }))
      const onEndOrError = () => {
        delete this.connections[JSON.stringify(con.address())]
        if (!con.isClosed) {
          this.emit('closedConnection', con)
          // When the connection for a client dies, make sure the handlerCallbacks don't try to use it
          con.isClosed = true
        }
      }
      con.on('end', onEndOrError)
      con.on('error', onEndOrError)
    })

    // Shorthand for registering a listening callback handler
    this.server.on('listening', () => {
      // Reset the retry counter on a successful connection
      config.retry = 0
      this.emit('listening')
    })
    this.server.listen(port)

    // Any time the server encounters an error, check it here.
    // Right now it only handles errors when trying to start the server
    this.server.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        // If something else has the desired port
        if (config.retries && config.retry < config.retries) {
          this.emit('retry', e)
          // And we're allowed to retry
          config.retry++
          // Wait a bit and retry
          setTimeout(() => {
            this.server.listen(port)
          }, config.retryInterval)
        } else {
          // Or bitch about it
          this.emit('error', e)
        }
      } else {
        // Some unhandled error
        this.emit('error', e)
      }
    })

    // A simple flag to make sure calling ``shutdown`` after the server has already been shutdown doesn't crash Node
    this.server.on('close', () => {
      this.logger('closing')
      this.emit('shutdown')
      this.notClosed = false
    })
    this.notClosed = true
  }

  // An almost ridiculously simple callback handler, whenever the return object comes in, stringify it and send it down the line (along with a message length prefix)
  handlerCallback(con, retObj) {
    if (!con.isClosed) con.write(shared.formatMessage(retObj, this))
  }

  // When asked to shutdown the server, shut it down
  shutdown(done) {
    this.logger('shutdown transport')
    if (this.server && this.notClosed) {
      this.logger('shutdown transport 2')
      this.server.close(done)
      Object.keys(this.connections).forEach((key) => {
        const con = this.connections[key]
        con.destroy()
      })
    }
  }
}

module.exports = TcpTransport
