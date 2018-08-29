const http = require('http')
const { EventEmitter, } = require('events')

class HttpTransport extends EventEmitter {
  constructor(port, config = {}) {
    super()
    this.handler = (json, next) => next()
    this.acao = config.acao || '*'
    this.port = port
    this.logger = config.logger || console

    // Construct the http server and listen on the desired port
    this.server = http.createServer((req, res) => {
      // All requests are assumed to be POST-like and have a body
      const data = []
      req.on('data', d => data.push(d))
      req.on('end', () => {
        // The result is assumed to be JSON and passed to the request handler, and those results to the response handler
        const payload = data.join('')
        let json
        try {
          json = JSON.parse(payload)
        } catch (e) {
          this.logger.warn('Bad Request', e)
        }
        this.emit('message', json, payload.length)
        this.handler(json, this.responseHandler.bind(this, res))
      })
    })
    this.server.on('listening', () => this.emit('listening'))
    this.server.listen(this.port)
  }

  responseHandler(res, retObj) {
    const outString = JSON.stringify(retObj)
    res.writeHead(retObj.error ? 500 : 200, {
      'Access-Control-Allow-Origin': this.acao,
      'Content-Length': Buffer.byteLength(outString, 'utf8'),
      'Content-Type': 'application/json;charset=utf-8',
    })
    res.end(outString)
  }

  shutdown(done) {
    this.emit('shutdown')
    this.server.close(done)
  }
}

module.exports = HttpTransport
