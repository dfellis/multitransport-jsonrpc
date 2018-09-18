const jsonrpc = require('../lib/index')
const HttpTransport = jsonrpc.transports.server.http
const TcpTransport = jsonrpc.transports.server.tcp
const shared = require('../lib/transports/shared/tcp')
const JSONRPCserver = jsonrpc.server
const ErrorCode = jsonrpc.errorcode
const http = require('http')
const net = require('net')

exports.loopbackHttp = (test) => {
  test.expect(4)
  const jsonRpcServer = new JSONRPCserver(new HttpTransport(32431), {
    loopback: (arg1, callback) => callback(null, arg1)
  })
  const testJSON = JSON.stringify({
    id: 1,
    method: 'loopback',
    params: [{ hello: 'world' }]
  })
  const req = http.request({
    hostname: 'localhost',
    port: 32431,
    path: '/',
    method: 'POST'
  }, (res) => {
    res.setEncoding('utf8')
    let resultString = ''
    res.on('data', (data) => resultString += data)
    res.on('end', () => {
      test.equal(200, res.statusCode, 'The http transport provided an OK status code')
      let resultObj
      try {
        resultObj = JSON.parse(resultString)
      } catch(e) {
        // Do nothing, test will fail
      }
      test.equal(resultObj.id, 1, 'The JSON-RPC server sent back the same ID')
      test.equal(resultObj.result.hello, 'world', 'The loopback method worked as expected')
      test.ok(resultObj.error === undefined, 'The error property is not defined on success')
      test.done()
      jsonRpcServer.transport.server.close()
    })
  })
  req.write(testJSON)
  req.end()
}

exports.loopbackHttp = (test) => {
  test.expect(5)
  const jsonRpcServer = new JSONRPCserver(new HttpTransport(32432), {
    loopback: (arg1, callback) => callback(null, arg1)
  })
  const testJSON = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'loopback',
    params: [{ hello: 'world' }]
  })
  const req = http.request({
    hostname: 'localhost',
    port: 32432,
    path: '/',
    method: 'POST'
  }, (res) => {
    res.setEncoding('utf8')
    let resultString = ''
    res.on('data', (data) => {
      resultString += data
    })
    res.on('end', () => {
      test.equal(200, res.statusCode, 'The http transport provided an OK status code')
      let resultObj
      try {
        resultObj = JSON.parse(resultString)
      } catch(e) {
        // Do nothing, test will fail
      }
      test.equal(resultObj.jsonrpc, '2.0', 'The JSON-RPC server sent back the same jsonrpc version')
      test.equal(resultObj.id, 1, 'The JSON-RPC server sent back the same ID')
      test.equal(resultObj.result.hello, 'world', 'The loopback method worked as expected')
      test.ok(resultObj.error === undefined, 'The error property is not defined on success')
      test.done()
      jsonRpcServer.transport.server.close()
    })
  })
  req.write(testJSON)
  req.end()
}

exports.loopbackHttpBatch = (test) => {
  test.expect(11)
  const jsonRpcServer = new JSONRPCserver(new HttpTransport(32123), {
    loopback: (arg1, callback) => callback(null, arg1),
  })
  const testJSON = JSON.stringify([
    {
      id: 1,
      method: 'loopback',
      params: [{ hello: 'world' }]
    },
    {
      id: 2,
      method: 'noexists',
      params: [{ hello: 'world' }]
    },
    {
      id: 3,
      method: 'loopback',
      params: [{ hello: 'batch world' }]
    }
  ])
  const req = http.request({
    hostname: 'localhost',
    port: 32123,
    path: '/',
    method: 'POST'
  }, (res) => {
    res.setEncoding('utf8')
    let resultString = ''
    res.on('data', (data) => {
      resultString += data
    })
    res.on('end', () => {
      test.equal(200, res.statusCode, 'The http transport provided an OK status code')
      let resultObj
      try {
        resultObj = JSON.parse(resultString)
      } catch(e) {
        // Do nothing, test will fail
      }
      test.equal(Array.isArray(resultObj), true, 'The batch response is array')
      let obj
      {
        obj = resultObj[0]
        test.equal(obj.id, 1, 'The JSON-RPC server sent back the same ID')
        test.equal(obj.result.hello, 'world', 'The loopback method worked as expected')
        test.ok(resultObj.error === undefined, 'The error property is not defined on success')
      }
      {
        obj = resultObj[1]
        test.equal(obj.id, 2, 'The JSON-RPC server sent back the same ID')
        test.equal(obj.error.code, -32601, 'The method is not found')
        test.ok(obj.result === undefined, 'The result property is not defined on error response')
      }
      {
        obj = resultObj[2]
        test.equal(obj.id, 3, 'The JSON-RPC server sent back the same ID')
        test.equal(obj.result.hello, 'batch world', 'The loopback method worked as expected')
        test.ok(resultObj.error === undefined, 'The error property is not defined on success')
      }
      test.done()
      jsonRpcServer.transport.server.close()
    })
  })
  req.write(testJSON)
  req.end()
}

exports.failureTcp = (test) => {
  test.expect(4)
  const jsonRpcServer = new JSONRPCserver(new TcpTransport(32863), {
    failure: (arg1, callback) => callback(new Error('I have no idea what I\'m doing')),
  })
  const con = net.connect({
    port: 32863,
    host: 'localhost'
  }, () => con.write(shared.formatMessage({
    id: 1,
    method: 'failure',
    params: [{ hello: 'world' }]
  })))
  const buffers = []
  let bufferLen = 0, messageLen = 0
  con.on('data', (data) => {
    buffers.push(data)
    bufferLen += data.length
    if (messageLen === 0) messageLen = shared.getMessageLen(buffers)
    if (bufferLen === messageLen + 4) con.end()
  })
  con.on('end', () => {
    try {
      const res = shared.parseBuffer(buffers, messageLen)
      test.equal(res[1].id, 1, 'The JSON-RPC server sent back the same ID')
      test.equal(res[1].error.code, ErrorCode.internalError)
      test.equal(res[1].error.message, 'I have no idea what I\'m doing', 'Returns the error as an error')
      test.ok(res[1].result === undefined, 'The result property is not defined on error response')
    } catch(e) {
      // Do nothing
    }
    jsonRpcServer.transport.server.close()
    test.done()
  })
}

exports.nonexistentMethod = (test) => {
  test.expect(4)
  const jsonRpcServer = new JSONRPCserver(new HttpTransport(32111), {})
  const testJSON = JSON.stringify({
    id: 25,
    method: 'nonexistent',
    params: []
  })
  const req = http.request({
    hostname: 'localhost',
    port: 32111,
    path: '/',
    method: 'POST'
  }, (res) => {
    res.setEncoding('utf8')
    let resultString = ''
    res.on('data', (data) => resultString += data)
    res.on('end', () => {
      let resultObj
      try {
        resultObj = JSON.parse(resultString)
      } catch(e) {
        // Do nothing, test will fail
      }
      test.equal(resultObj.id, 25, 'The JSON-RPC server sent back the correct ID')
      test.equal(resultObj.error.code, ErrorCode.methodNotFound)
      test.equal(resultObj.error.message, 'Requested method does not exist.', 'The JSON-RPC server returned the expected error message.')
      test.ok(resultObj.result === undefined, 'The result property is not defined on error response')
      jsonRpcServer.shutdown(test.done.bind(test))
    })
  })
  req.write(testJSON)
  req.end()
}

exports.noncompliantJSON = (test) => {
  test.expect(4)
  const jsonRpcServer = new JSONRPCserver(new HttpTransport(32123), {})
  const testJSON = JSON.stringify({ hello: 'world' })
  const req = http.request({
    hostname: 'localhost',
    port: 32123,
    path: '/',
    method: 'POST'
  }, (res) => {
    res.setEncoding('utf8')
    let resultString = ''
    res.on('data', (data) => resultString += data)
    res.on('end', () => {
      let resultObj
      try {
        resultObj = JSON.parse(resultString)
      } catch(e) {
        // Do nothing, test will fail
      }
      test.equal(resultObj.id, null, 'The JSON-RPC server sent back the correct ID')
      test.equal(resultObj.error.code, ErrorCode.invalidRequest)
      test.equal(resultObj.error.message, 'Did not receive valid JSON-RPC data.', 'The JSON-RPC server returned the expected error message.')
      test.ok(resultObj.result === undefined, 'The result property is not defined on error response')
      jsonRpcServer.shutdown(test.done.bind(test))
    })
  })
  req.write(testJSON)
  req.end()
}

exports.blockingFunction = (test) => {
  test.expect(3)
  const jsonRpcServer = new JSONRPCserver(new HttpTransport(32767), {})
  jsonRpcServer.register('answerToUltimateQuestion', jsonRpcServer.blocking(() => 42))
  const testJSON = JSON.stringify({
    id: 26,
    method: 'answerToUltimateQuestion',
    params: []
  })
  const req = http.request({
    hostname: 'localhost',
    port: 32767,
    path: '/',
    method: 'POST'
  }, (res) => {
    res.setEncoding('utf8')
    let resultString = ''
    res.on('data', (data) => resultString += data)
    res.on('end', () => {
      let resultObj
      try {
        resultObj = JSON.parse(resultString)
      } catch(e) {
        // Do nothing, test will fail
      }
      test.equal(resultObj.id, 26, 'The JSON-RPC server sent back the correct ID')
      test.equal(resultObj.result, 42, 'The answer to life, the universe, and everything')
      test.ok(resultObj.error === undefined, 'The error property is not defined')
      jsonRpcServer.shutdown(test.done.bind(test))
    })
  })
  req.write(testJSON)
  req.end()
}

exports.asyncFunction = (test) => {
  test.expect(3)
  const jsonRpcServer = new JSONRPCserver(new HttpTransport(32766), {})
  jsonRpcServer.registerPromise('answerToUltimateQuestion', async () => 42)
  const testJSON = JSON.stringify({
    id: 27,
    method: 'answerToUltimateQuestion',
    params: []
  })
  const req = http.request({
    hostname: 'localhost',
    port: 32766,
    path: '/',
    method: 'POST'
  }, (res) => {
    res.setEncoding('utf8')
    let resultString = ''
    res.on('data', (data) => resultString += data)
    res.on('end', () => {
      let resultObj
      try {
        resultObj = JSON.parse(resultString)
      } catch(e) {
        // Do nothing, test will fail
      }
      test.equal(resultObj.id, 27, 'The JSON-RPC server sent back the correct ID')
      test.equal(resultObj.result, 42, 'The answer to life, the universe, and everything')
      test.ok(resultObj.error === undefined, 'The error property is not defined')
      jsonRpcServer.shutdown(test.done.bind(test))
    })
  })
  req.write(testJSON)
  req.end()
}

exports.callbackFunction = (test) => {
  test.expect(3)
  const jsonRpcServer = new JSONRPCserver(new HttpTransport(32765), {})
  jsonRpcServer.registerCallback('answerToUltimateQuestion', (callback) => callback(null, 42))
  const testJSON = JSON.stringify({
    id: 28,
    method: 'answerToUltimateQuestion',
    params: []
  })
  const req = http.request({
    hostname: 'localhost',
    port: 32765,
    path: '/',
    method: 'POST'
  }, (res) => {
    res.setEncoding('utf8')
    let resultString = ''
    res.on('data', (data) => resultString += data)
    res.on('end', () => {
      let resultObj
      try {
        resultObj = JSON.parse(resultString)
      } catch(e) {
        // Do nothing, test will fail
      }
      test.equal(resultObj.id, 28, 'The JSON-RPC server sent back the correct ID')
      test.equal(resultObj.result, 42, 'The answer to life, the universe, and everything')
      test.ok(resultObj.error === undefined, 'The error property is not defined')
      jsonRpcServer.shutdown(test.done.bind(test))
    })
  })
  req.write(testJSON)
  req.end()
}
