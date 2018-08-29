const http = require('http')
const { EventEmitter, } = require('events')

class HttpTransport extends EventEmitter {
  constructor(server, port, config = {}) {
    super()
    this.path = config.path || '/'
    this.headers = config.headers || {}
    this.logger = config.logger || console
    this.server = server
    this.port = port
  }

  request(body, callback) {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: this.server,
        port: this.port,
        path: this.path,
        headers: this.headers,
        method: 'POST'
      }, res => {
        // Get all of the data and append to an array
        const data = []
        res.on('data', d => data.push(d))
        res.on('end', () => {
          // Once done, parse the data as JSON and execute on it
          const payload = data.join('')
          let json
          try {
            json = JSON.parse(payload)
          } catch (e) {
            this.logger.warn('Bad Response', e)
          }

          // Provide the result to any possible event listener, callback, or promise owner
          this.emit('message', json, payload.length)
          if (callback instanceof Function) callback(json)
          resolve(json)
        })
      })

      // Handle dead connections
      req.once('error', callback)
      req.once('error', reject)

      // The request body is sent to the server as JSON
      req.setHeader('Content-Type', 'application/json')
      req.write(JSON.stringify(body))
      req.end()
    })
  }

  shutdown(done) {
    this.emit('shutdown')
    if (done instanceof Function) done()
  }
}

module.exports = HttpTransport
