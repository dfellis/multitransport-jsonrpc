const jsonrpc = require('../lib/index')
const HttpTransport = jsonrpc.transports.client.http
const http = require('http')

exports.loopback = (test) => {
  test.expect(3)
  const server = http.createServer(function(req, res) {
    test.equal('authToken', req.headers.authorization, 'authorization header received')
    test.equal('thing', req.headers.other, 'other header received')

    let buffer = ''
    req.setEncoding('utf8')
    req.on('data', (data) => {
      buffer += data
    })
    req.on('end', () => {
      res.write(buffer)
      res.end()
    })
  })
  server.listen(12345, 'localhost', () => {
    const options = {
      headers: {
        authorization: 'authToken',
        other: 'thing'
      }
    }

    const httpTransport = new HttpTransport('localhost', 12345, options)
    httpTransport.request('foo', (result) => {
      test.equal('foo', result, 'loopback works correctly')
      server.close()
      test.done()
    })
  })
}