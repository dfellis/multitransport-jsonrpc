const jsonrpc = require('../lib/index')
const TcpTransport = jsonrpc.transports.server.tcp
const shared = require('../lib/transports/shared/tcp')
const net = require('net')

exports.loopback = (test) => {
  test.expect(1)
  const tcpTransport = new TcpTransport(11235)
  tcpTransport.handler = (jsonObj, callback) => callback(jsonObj)
  const testJSON = JSON.stringify({ hello: 'world' })
  const con = net.connect({
    port: 11235,
    host: 'localhost'
  }, () => con.write(shared.formatMessage(testJSON)))
  const buffers = []
  let bufferLen = 0, messageLen = 0
  con.on('data', (data) => {
    buffers.push(data)
    bufferLen += data.length
    if (messageLen === 0) messageLen = shared.getMessageLen(buffers)
    if (bufferLen === messageLen + 4) con.end()
  })
  con.on('end', () => {
    const result = buffers.reduce((outBuffer, currBuffer) => Buffer.concat([outBuffer, currBuffer]), new Buffer(''))
    test.equal(result.toString(), shared.formatMessage(testJSON).toString(), 'Loopback functioned correctly')
    tcpTransport.shutdown()
    test.done()
  })
}

exports.failure = (test) => {
  test.expect(1)
  const tcpTransport = new TcpTransport(12345)
  tcpTransport.handler = (jsonObj, callback) => callback({ error: 'I have no idea what I\'m doing.' })
  const testJSON = JSON.stringify({ hello: 'world' })
  const con = net.connect({
    port: 12345,
    host: 'localhost'
  }, () => con.write(shared.formatMessage(testJSON)))
  const buffers = []
  let bufferLen = 0, messageLen = 0
  con.on('data', (data) => {
    buffers.push(data)
    bufferLen += data.length
    if (messageLen === 0) messageLen = shared.getMessageLen(buffers)
    if (bufferLen === messageLen + 4) con.end()
  })
  con.on('end', () => {
    const result = buffers.reduce((outBuffer, currBuffer) => Buffer.concat([outBuffer, currBuffer]), new Buffer(''))
    try {
      const obj = JSON.parse(result.toString('utf8', 4))
      test.equal(obj.error, 'I have no idea what I\'m doing.', 'error returned correctly')
    } catch(e) {
      // Nothing
    }
    tcpTransport.shutdown()
    test.done()
  })
}

exports.listening = (test) => {
  test.expect(1)
  const tcpTransport = new TcpTransport(12346)
  tcpTransport.on('listening', () => {
    test.ok(true, 'listening callback fired')
    tcpTransport.server.close()
    test.done()
  })
}

exports.retry = (test) => {
  test.expect(1)
  const tcpTransport1 = new TcpTransport(2468)
  tcpTransport1.on('listening', () => {
    const tcpTransport2 = new TcpTransport(2468, { retries: 1 })
    tcpTransport2.on('listening', () => {
      test.ok(true, 'second tcpTransport eventually succeeded to start')
      tcpTransport2.server.close()
      test.done()
    })
    setTimeout(() => tcpTransport1.shutdown(), 50)
  })
}

exports.dontSendAfterClose = (test) => {
  test.expect(1)
  const tcpTransport = new TcpTransport(2222)
  tcpTransport.handler = function(jsonObj, callback) {
    // The timeout should cause it to try to send the message after the client disconnected
    // The server should not throw an error in this condition
    setTimeout(callback.bind(this, jsonObj), 3000)
  }
  tcpTransport.on('listening', () => {
    const con = net.connect({
      port: 2222,
      host: 'localhost'
    }, () => {
      con.write(shared.formatMessage({hello: 'world'}))
      test.ok(true, 'wrote the message to the server and killed the connection')
      con.destroy()
    })
  })
  setTimeout(() => tcpTransport.shutdown(test.done.bind(test)), 4000)
}
