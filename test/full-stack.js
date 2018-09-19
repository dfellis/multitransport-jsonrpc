const jsonrpc = require('../lib/index')
const Client = jsonrpc.client
const Server = jsonrpc.server
const ClientHttp = jsonrpc.transports.client.http
const ClientTcp = jsonrpc.transports.client.tcp
const ClientChildProc = jsonrpc.transports.client.childProcess
const ServerHttp = jsonrpc.transports.server.http
const ServerTcp = jsonrpc.transports.server.tcp
const ServerMiddleware = jsonrpc.transports.server.middleware
const Loopback = jsonrpc.transports.shared.loopback
const express = require('express')
const http = require('http')
const net = require('net')
const childProcess = require('child_process')
const child = childProcess.fork(__dirname + '/child/child.js')
const childProcClient = new Client(new ClientChildProc(child))
childProcClient.register('loopback')

exports.loopbackHttp = (test) => {
  test.expect(1)
  const server = new Server(new ServerHttp(33333), {
    loopback: (arg, callback) => callback(null, arg),
  })
  const client = new Client(new ClientHttp('localhost', 33333), {}, (c) =>
    c.loopback('foo', (err, result) => {
      test.equal('foo', result, 'loopback works as expected')
      server.transport.server.close(() => {
        client.shutdown()
        test.done()
      })
    })
  )
}

exports.failureTcp = (test) => {
  test.expect(4)
  const server = new Server(new ServerTcp(44444), {
    failure: (arg, callback) => callback(new Error('I have no idea what I\'m doing.')),
  })
  const client = new Client(new ClientTcp('localhost', 44444), {}, (c) =>
    c.failure('foo', (err) => {
      test.ok(!!err, 'error exists')
      test.equal(err.message, 'I have no idea what I\'m doing.', 'error message transmitted successfully.')
      c.shutdown(() => {
        server.shutdown(test.done.bind(test))
      })
    })
  )
  client.transport.on('message', () => test.ok('received a message')) // should happen twice
}

exports.objectFailureTcp = (test) => {
  test.expect(4)
  const server = new Server(new ServerTcp(44444), {
    failure: (arg, callback) => callback({ foo: 'I have no idea what I\'m doing.' }),
  })
  const client = new Client(new ClientTcp('localhost', 44444), {}, (c) =>
    c.failure('foo', (err) => {
      test.ok(!!err, 'error exists')
      test.equal(err.foo, 'I have no idea what I\'m doing.', 'error message transmitted successfully.')
      c.shutdown(() =>{
        server.shutdown(test.done.bind(test))
      })
    })
  )
  client.transport.on('message', () => test.ok('received a message')) // should happen twice
}

exports.sweepedRequest = (test) => {
  test.expect(2)
  const client = new Client(new ClientTcp('localhost', 44444))
  client.register(['willNeverReachAServer'])
  client.willNeverReachAServer((err) => {
    test.ok(err instanceof Error, 'received an error message')
    test.equal(err.message, 'Request Timed Out', 'received the "sweep" error message')
    client.shutdown()
    test.done()
  })
}

exports.loopbackLoopback = (test) => {
  test.expect(3)
  const loopback = new Loopback()
  const server = new Server(loopback, {
    loopback: (arg, callback) => callback(null, arg),
    failure: (arg, callback) => callback(new Error('I have no idea what I\'m doing.')),
  })
  const client = new Client(loopback)
  client.register(['loopback', 'failure'])
  client.loopback('foo', (err, result) => {
    test.equal('foo', result, 'loopback works as expected')
    client.failure('foo', (err) => {
      test.ok(!!err, 'error exists')
      test.equal(err.message, 'I have no idea what I\'m doing.', 'error message transmitted successfully.')
      server.shutdown()
      test.done()
    })
  })
}

exports.loopbackExpress = (test) => {
  test.expect(2)

  const app = express()
  app.use(express.bodyParser())
  app.get('/foo', (req, res) => res.end('bar'))

  const server = new Server(new ServerMiddleware(), {
    loopback: (arg, callback) => callback(null, arg),
  })
  app.use('/rpc', server.transport.middleware)

  const httpServer = app.listen(55555)

  const client = new Client(new ClientHttp('localhost', 55555, { path: '/rpc' }))
  client.register('loopback')

  http.get({
    port: 55555,
    path: '/foo'
  }, (res) => {
    res.setEncoding('utf8')
    let data = ''
    res.on('data', (chunk) => data += chunk) 
    res.on('end', () => {
      test.equal(data, 'bar', 'regular http requests work')
      client.loopback('bar', (err, result) => {
        test.equal(result, 'bar', 'JSON-RPC as a middleware works')
        httpServer.close(test.done.bind(test))
      })
    })
  })
}

exports.tcpServerEvents1 = (test) => {
  test.expect(10)
  const server = new Server(new ServerTcp(11111), {
    loopback: (arg, callback) => callback(null, arg),
  })
  server.transport.on('connection', (con) => test.ok(con instanceof net.Socket, 'incoming connection is a socket'))
  server.transport.on('closedConnection', (con) => test.ok(con instanceof net.Socket, 'closing connection is a socket'))
  server.transport.on('listening', () => test.ok(true, 'server started correctly'))
  server.transport.on('shutdown', () => {
    test.ok(true, 'the server was shutdown correctly')
    test.done()
  })
  server.transport.on('message', (obj, len) => {
    test.ok(obj instanceof Object, 'object received')
    test.ok(len > 0, 'message length provided')
  })
  server.transport.on('outMessage', (obj, len) => {
    test.ok(obj instanceof Object, 'object ready')
    test.ok(len > 0, 'message length calcuated')
  })
  server.transport.on('retry', () => {
    // Not implemented yet
  })
  server.transport.on('error', () => {
    // Not implemented yet
  })
  const client = new Client(new ClientTcp('localhost', 11111), { autoRegister: false })
  client.register('loopback')
  client.loopback('foo', (err, result) => {
    test.ok(!err, 'no error')
    test.equal(result, 'foo', 'loopback worked')
    client.shutdown(() => setTimeout(server.shutdown.bind(server), 500))
  })
}

exports.tcpServerEvents2 = (test) => {
  test.expect(2)
  const server1 = new Server(new ServerTcp(11112), {
    loopback: (arg, callback) => callback(null, arg),
  })
  server1.transport.on('listening', () => {
    const server2 = new Server(new ServerTcp(11112, { retries: 1 }), {})
    server2.transport.on('retry', () => test.ok(true, 'retried to connect to the specified port'))
    server2.transport.on('error', (e) => {
      test.ok(e instanceof Error, 'received the error object after second retry was denied')
      server1.shutdown(test.done.bind(test))
    })
  })
}

exports.multitransport = async (test) => {
  test.expect(2)
  const server = new Server([new ServerTcp(9999), new ServerHttp(9998)], {
    loopback: (arg, callback) => callback(null, arg),
  })
  const client1 = new Client(new ClientTcp('localhost', 9999))
  const client2 = new Client(new ClientHttp('localhost', 9998))
  client1.registerPromise('loopback')
  client2.registerPromise('loopback')
  const result1 = await client1.loopback('foo')
  test.equal('foo', result1, 'got the result over TCP')
  const result2 = await client2.loopback('bar')
  test.equal('bar', result2, 'got the result of HTTP')
  // TODO: Make shutdown promise capable
  client1.shutdown(() => {
    client2.shutdown(() => { 
      server.shutdown(test.done.bind(test))
    })
  })
}


String.prototype.repeat = function(num) {
  return new Array(num + 1).join(this)
}

const perf = (testString, test) => {
  test.expect(4)
  const numMessages = 250
  const tcpServer = new Server(new ServerTcp(9001), {
    loopback: (arg, callback) => callback(null, arg),
  })
  const httpServer = new Server(new ServerHttp(9002), {
    loopback: (arg, callback) => callback(null, arg),
  })
  const loopback = new Loopback()
  const loopbackServer = new Server(loopback, {
    loopback: (arg, callback) => callback(null, arg),
  })
  const tcpClient = new Client(new ClientTcp('localhost', 9001))

  const last = () => {
    const loopbackClient = new Client(loopback)
    loopbackClient.register('loopback')
    let loopbackCount = 0, loopbackStart = Date.now(), loopbackEnd
    for(let i = 0; i < numMessages; i++) {
      loopbackClient.loopback(i, () => {
        loopbackCount++
        if (loopbackCount === numMessages) {
          test.ok(true, 'loopback finished')
          loopbackEnd = Date.now()
          const loopbackTime = loopbackEnd - loopbackStart
          const loopbackRate = numMessages * 1000 / loopbackTime
          // eslint-disable-next-line no-console
          console.log('Loopback took ' + loopbackTime + 'ms, ' + loopbackRate + ' reqs/sec')
          loopbackClient.shutdown()
          loopbackServer.shutdown()
          test.done()
        }
      })
    }
  }

  const more = () => {
    let childProcCount = 0, childProcStart = Date.now(), childProcEnd
    for(let i = 0; i < numMessages; i++) {
      childProcClient.loopback(i, () => {
        childProcCount++
        if (childProcCount === numMessages) {
          test.ok(true, 'childProc finished')
          childProcEnd = Date.now()
          const childProcTime = childProcEnd - childProcStart
          const childProcRate = numMessages * 1000 / childProcTime
          // eslint-disable-next-line no-console
          console.log('Child Proc IPC took ' + childProcTime + 'ms, ' + childProcRate + ' reqs/sec')
          last()
        }
      })
    }
  }

  const next = () => {
    const httpClient = new Client(new ClientHttp('localhost', 9002))
    httpClient.register('loopback')
    let httpCount = 0, httpStart = new Date().getTime(), httpEnd
    for(let i = 0; i < numMessages; i++) {
      httpClient.loopback(i, () => {
        httpCount++
        if (httpCount === numMessages) {
          test.ok(true, 'http finished')
          httpEnd = new Date().getTime()
          const httpTime = httpEnd - httpStart
          const httpRate = numMessages * 1000 / httpTime
          // eslint-disable-next-line no-console
          console.log('HTTP took ' + httpTime + 'ms, ' + httpRate + ' reqs/sec')
          httpClient.shutdown()
          httpServer.shutdown()
          more()
        }
      })
    }
  }

  tcpClient.register('loopback')
  let tcpCount = 0, tcpStart = new Date().getTime(), tcpEnd
  for(let i = 0; i < numMessages; i++) {
    tcpClient.loopback(testString || i, () => {
      tcpCount++
      if (tcpCount === numMessages) {
        test.ok(true, 'tcp finished')
        tcpEnd = new Date().getTime()
        const tcpTime = tcpEnd - tcpStart
        const tcpRate = numMessages * 1000 / tcpTime
        // eslint-disable-next-line no-console
        console.log('TCP took ' + tcpTime + 'ms, ' + tcpRate + ' reqs/sec')
        tcpClient.shutdown()
        tcpServer.shutdown()
        next()
      }
    })
  }
}

exports.perfSimple = perf.bind(null, null)
exports.perf100 = perf.bind(null, 'a'.repeat(100))
exports.perf1000 = perf.bind(null, 'a'.repeat(1000))
exports.perf10000 = perf.bind(null, 'a'.repeat(10000))
exports.perf100000 = perf.bind(null, 'a'.repeat(100000))

exports.closeChild = (test) => {
  child.kill()
  test.done()
}
