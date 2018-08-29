const jsonrpc = require('../lib/index')
const HttpTransport = jsonrpc.transports.client.http
const TcpTransport = jsonrpc.transports.client.tcp
const JSONRPCclient = jsonrpc.client
const shared = require('../lib/transports/shared/tcp')
const http = require('http')
const net = require('net')

exports.loopbackHttp = function(test) {
  test.expect(1)
  const server = http.createServer(function(req, res) {
    let buffer = ''
    req.setEncoding('utf8')
    req.on('data', function(data) {
      buffer += data
    })
    req.on('end', function() {
      let json
      try {
        json = JSON.parse(buffer)
      } catch(e) { // eslint-disable-next-line no-empty
      }
      res.write(JSON.stringify({
        id: json && json.id,
        result: json && json.params
      }))
      res.end()
    })
  })
  server.listen(22222)
  const jsonRpcClient = new JSONRPCclient(new HttpTransport('localhost', 22222))
  jsonRpcClient.register('foo')
  jsonRpcClient.foo('bar', function(err, result) {
    test.equal('bar', result, 'Looped-back correctly')
    server.close(function() {
      test.done()
    })
  })
}

exports.loopbackHttpWithCustomIdGenerator = function(test) {
  test.expect(2)
  const id = 2
  const generator = function() {
    return id
  }
  const server = http.createServer(function(req, res) {
    let buffer = ''
    req.setEncoding('utf8')
    req.on('data', function(data) {
      buffer += data
    })

    req.on('end', function() {
      let json
      try {
        json = JSON.parse(buffer)
      } catch(e) { // eslint-disable-next-line no-empty
      }
      test.equal(json.id, id)
      res.write(JSON.stringify({
        id : json && json.id,
        result: json && json.params
      }))
      res.end()
    })
  })
  server.listen(22722)
  const options = {
    autoRegister: false,
    idGenerator: generator
  }
  const jsonRpcClient = new JSONRPCclient(new HttpTransport('localhost', 22722), options)
  jsonRpcClient.register('foo')
  jsonRpcClient.foo('bar', function(err, result) {
    test.equal('bar', result, 'Looped-back correctly')
    server.close(function() {
      test.done()
    })
  })
}

exports.loopbackHttpWithInvalidIdGenerator = function(test) {
  test.expect(2)
  const server = http.createServer(function(req, res) {
    req.on('end', function() {
      res.end()
    })
  })
  server.listen(22223)
  const generator = function() {}
  const options = {
    idGenerator: generator
  }
  const jsonRpcClient = new JSONRPCclient(new HttpTransport('localhost', 22223), options)
  jsonRpcClient.register('foo')
  jsonRpcClient.foo('bar', function(err) {
    test.ok(!!err, 'error is thrown')
    test.equals('Request id generator function should return an id', err.message)
    server.close(function() {
      test.done()
    })
  })
}

exports.failureTcp = function(test) {
  test.expect(2)
  const server = net.createServer(function(con) {
    let buffers = []
    let bufferLen = 0
    let messageLen = 0
    con.on('data', function(data) {
      buffers.push(data)
      bufferLen += data.length
      if(messageLen === 0) messageLen = shared.getMessageLen(buffers)
      let res, obj
      if(bufferLen - 4 >= messageLen) {
        while (messageLen && bufferLen - 4 >= messageLen && (res = shared.parseBuffer(buffers, messageLen))) {
          buffers = res[0]
          obj = res[1]
          con.write(shared.formatMessage({
            id: obj && obj.id,
            error: 'I have no idea what I\'m doing.'
          }))
          bufferLen = buffers.map(buffer => buffer.length).reduce((fullLen, currLen) => fullLen + currLen, 0)
          messageLen = shared.getMessageLen(buffers)
        }
      }
    })
  })
  server.listen(11111)
  const jsonRpcClient = new JSONRPCclient(new TcpTransport({ host: 'localhost', port: 11111 }))
  jsonRpcClient.register('foo')
  jsonRpcClient.foo('bar', function(err) {
    test.ok(!!err, 'error exists')
    test.equal('I have no idea what I\'m doing.', err.message, 'The error message was received correctly')
    jsonRpcClient.transport.con.end()
    jsonRpcClient.shutdown(function() {
      server.close(test.done.bind(test))
    })
  })
}

exports.invalidHttp = function(test) {
  test.expect(1)
  const server = http.createServer(function(req, res) {
    res.end('Hahahaha')
  })
  server.listen(23232)
  const jsonRpcClient = new JSONRPCclient(new HttpTransport('localhost', 23232))
  jsonRpcClient.register('foo')
  jsonRpcClient.foo('bar', function(err) {
    test.ok(err instanceof Error, 'received the error response from the client library')
    server.close(test.done.bind(test))
  })
}

exports.serverDownHttp = function(test) {
  test.expect(1)
  const jsonRpcClient = new JSONRPCclient(new HttpTransport('localhost', 23232))
  jsonRpcClient.register('foo')
  jsonRpcClient.foo('bar', function(err) {
    test.ok(err instanceof Error, 'received the error response from the client library')
    test.done()
  })
}
