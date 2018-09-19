const jsonrpc = require('../lib/index')
const HttpTransport = jsonrpc.transports.server.http
const http = require('http')

exports.loopback = (test) => {
  test.expect(2)
  const httpTransport = new HttpTransport(11235)
  httpTransport.handler = (jsonObj, callback) => callback(jsonObj)
  const testJSON = JSON.stringify({ hello: 'world' })
  const req = http.request({
    hostname: 'localhost',
    port: 11235,
    path: '/',
    method: 'POST'
  }, (res) => {
    res.setEncoding('utf8')
    let resultString = ''
    res.on('data', (data) => resultString += data)
    res.on('end', () => {
      test.equal(res.statusCode, 200, 'The http transport provided an OK status code')
      test.equal(resultString, testJSON, 'The http transport successfully sent the same JSON data back to the client.')
      httpTransport.server.close()
      test.done()
    })
  })
  req.write(testJSON)
  req.end()
}

exports.failure = (test) => {
  test.expect(1)
  const httpTransport = new HttpTransport(12345)
  httpTransport.handler = (jsonObj, callback) => callback({ error: 'I have no idea what I\'m doing.' })
  const testJSON = JSON.stringify({ hello: 'world' })
  const req = http.request({
    hostname: 'localhost',
    port: 12345,
    path: '/',
    method: 'POST'
  }, (res) => {
    res.setEncoding('utf8')
    res.on('data', () => {})
    res.on('end', () => {
      test.equal(res.statusCode, 500, 'The http transport provided a server error status code')
      httpTransport.server.close()
      test.done()
    })
  })
  req.write(testJSON)
  req.end()
}
