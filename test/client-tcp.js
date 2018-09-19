const jsonrpc = require('../lib/index')
const TcpTransport = jsonrpc.transports.client.tcp
const shared = require('../lib/transports/shared/tcp')
const net = require('net')

const Server = jsonrpc.server
const ServerTcp = jsonrpc.transports.server.tcp
const Client = jsonrpc.client
const ClientTcp = jsonrpc.transports.client.tcp

exports.loopback = (test) => {
  test.expect(1)
  const server = net.createServer((con) => {
    let buffer = new Buffer('')
    let messageLen = 0
    con.on('data', (data) => {
      buffer = Buffer.concat([buffer, data])
      if (messageLen === 0) messageLen = shared.getMessageLen([data])
      if (buffer.length === messageLen + 4) {
        con.write(buffer)
        con.end()
      }
    })
  })
  server.listen(23456)
  const tcpTransport = new TcpTransport({ host: 'localhost', port: 23456 }, {
    // eslint-disable-next-line no-console
    logger: console.log
  })
  tcpTransport.request('foo', (result) => {
    test.equal('foo', result, 'loopback worked correctly')
    tcpTransport.shutdown(() => {
      server.close(test.done.bind(test))
    })
  })
}

exports.sweep = (test) => {
  test.expect(2)
  const server = net.createServer((con) => {
    let buffer = new Buffer('')
    let messageLen = 0
    con.on('data', (data) => {
      buffer = Buffer.concat([buffer, data])
      if (messageLen === 0) messageLen = shared.getMessageLen([data])
      if (buffer.length === messageLen + 4) {
        setTimeout(() => {
          con.write(buffer)
          con.end()
        }, 400)
      }
    })
  })
  server.listen(23457)
  const tcpTransport = new TcpTransport({ host: 'localhost', port: 23457 }, { timeout: 100 })
  tcpTransport.request('foo', (err, result) => {
    test.ok(!!err, 'should receive a timeout error')
    if (result) test.ok(false, 'this should never run')
  })
  setTimeout(() => {
    test.ok(true, 'this should always run')
    tcpTransport.shutdown(() => {
      server.close(test.done.bind(test))
    })
  }, 1000)
}

exports.glitchedConnection = (test) => {
  test.expect(3)
  let con
  const serverFunc = (c) => {
    con = c
    let buffer = new Buffer('')
    let messageLen = 0
    c.on('data', (data) => {
      buffer = Buffer.concat([buffer, data])
      if (messageLen === 0) messageLen = shared.getMessageLen([data])
      if (buffer.length === messageLen + 4) {
        setTimeout(() => {
          if (con) {
            con.write(buffer)
            con.end()
          }
        }, 400)
      }
    })
    c.on('end', () => {
      con = undefined
    })
  }
  let server = net.createServer(serverFunc)
  server.listen(23458)
  const tcpTransport = new TcpTransport({ host: 'localhost', port: 23458 })
  tcpTransport.request({'id': 'foo'}, (result) => {
    test.equal(JSON.stringify({'id': 'foo'}), JSON.stringify(result), 'eventually received the response')
    tcpTransport.shutdown(() => {
      server.close(test.done.bind(test))
    })
  })

  // Kill the original server to simulate an error
  setTimeout(() => {
    test.ok(true, 'server was killed')
    con.destroy()
    con = undefined
    server.close()
  }, 50)

  // Start a new server to reconnect to
  setTimeout(() => {
    test.ok(true, 'new server created to actually handle the request')
    server = net.createServer(serverFunc)
    server.listen(23458)
  }, 100)
}

exports.stopBuffering = (test) => {
  test.expect(6)
  let con, server
  // Create a client pointed to nowhere, telling it to stop trying requests after a while
  // (but continue attempting to connect to the server)
  const tcpTransport = new TcpTransport({ host: 'localhost', port: 23459 }, {
    timeout: 2*1000,
    stopBufferingAfter: 5*1000
  })
  // Early messages will be attempted and eventually time out
  tcpTransport.request({id: 'foo'}, function(result) {
    test.ok(!!result.error, 'Couldn\'t connect to the (nonexistent) server')
    test.equal(result.error, 'Request Timed Out', 'time out error message received')
  })
  // Later messages will be immediately killed
  setTimeout(() => {
    tcpTransport.request({id: 'foo'}, (result) => {
      test.ok(!!result.error, 'Still can\'t connect to the nonexistent server')
      test.equal(result.error, 'Connection Unavailable', 'immediately blocked by the maximum timeout time for the server')
      const serverFunc = (c) => {
        con = c
        let buffer = new Buffer('')
        let messageLen = 0
        c.on('data', (data) => {
          buffer = Buffer.concat([buffer, data])
          if (messageLen === 0) messageLen = shared.getMessageLen([data])
          if (buffer.length === messageLen + 4) {
            if (con) {
              con.write(buffer)
              con.end()
            }
          }
        })
        c.on('end', () => {
          con = undefined
        })
      }
      server = net.createServer(serverFunc)
      server.listen(23459)
    })
  }, 6*1000)
  // After the server is started, messages will go through as expected
  setTimeout(() => {
    tcpTransport.request({id: 'foo'}, (result) => {
      test.ok(result instanceof Object, 'got a result')
      test.equal(result.id, 'foo', 'got the expected result')
      tcpTransport.shutdown(() => {
        server.close(test.done.bind(test))
      })
    })
  }, 8*1000)
}

exports.dontStopBuffering = (test) => {
  test.expect(6)
  // This test tests a modification of the above test,
  // if its told to stop buffering after a period of time of
  // being disconnected, but then reconnects *before* that period
  // the stopBuffering code shouldn't interfere with regular requests
  let server
  const tcpTransport = new TcpTransport({ host: 'localhost', port: 23460 }, {
    timeout: 2*1000,
    stopBufferingAfter: 8*1000
  })
  tcpTransport.request({id: 'foo'}, (result) => {
    test.ok(!!result.error)
    test.equal(result.error, 'Request Timed Out')
  })
  setTimeout(() => {
    tcpTransport.request({id: 'foo'}, (result) => {
      test.ok(result instanceof Object)
      test.equal(result.id, 'foo')
    })
    const serverFunc = (c) => {
      let buffer = new Buffer('')
      let messageLen = 0
      c.on('data', (data) => {
        buffer = Buffer.concat([buffer, data])
        if (messageLen === 0) messageLen = shared.getMessageLen([data])
        if (buffer.length === messageLen + 4) {
          c.write(buffer)
          c.end()
        }
      })
    }
    server = net.createServer(serverFunc)
    server.listen(23460)
  }, 6*1000)
  setTimeout(() => {
    tcpTransport.request({id: 'foo'}, (result) => {
      test.ok(result instanceof Object)
      test.equal(result.id, 'foo')
      tcpTransport.shutdown(() => {
        server.close(test.done.bind(test))
      })
    })
  }, 10*1000)
}

exports.reconnect = async (test) => {
  test.expect(4)

  let tcpServer
  let tcpClient
  const sendRequest = () => new Promise((resolve) => {
    if (!tcpClient) {
      tcpClient = new Client(new ClientTcp({ host: 'localhost', port: 23458 }, {
        stopBufferingAfter: 30*1000,
        // eslint-disable-next-line no-console
        logger: console.log.bind(console)
      }))
      tcpClient.register('loopback')
    }
    tcpClient.loopback({'id': 'foo'}, (err, result) => {
      // eslint-disable-next-line no-console
      console.log('got response')
      // eslint-disable-next-line no-console
      console.dir(arguments)
      test.equal(JSON.stringify({'id': 'foo'}), JSON.stringify(result), 'received the response')
      resolve()
    })
  })

  const createServer = () => new Promise((resolve) => {
    // eslint-disable-next-line no-console
    console.log('create server')
    tcpServer = new Server(new ServerTcp(23458), {
      loopback: (arg, callback) => callback(null, arg),
    })
    tcpServer.transport.on('listening', resolve)
  })
  const killServer = () => new Promise((resolve) => {
    // eslint-disable-next-line no-console
    console.log('kill server')
    tcpServer.shutdown(resolve)
  })

  const wait = (sec) => new Promise((resolve) => setTimeout(() => resolve(), sec * 1000))

  try {
    await wait(Math.random() * 5)
    await createServer()
    await sendRequest()
    await killServer()
    await wait(Math.random() * 5)
    await createServer()
    await sendRequest()
    await killServer()
    await wait(Math.random() * 5)
    await createServer()
    await sendRequest()
    await killServer()
    await wait(Math.random() * 5)
    await createServer()
    await sendRequest()
    await killServer()
  } catch (err) {
    // eslint-disable-next-line no-console
    console.dir(err)
    tcpClient.shutdown()
    test.done()
  }
  tcpClient.shutdown()
  test.done()
}

exports.nullresponse = (test) => {
  test.expect(1)
  const server = net.createServer((con) => con.end())
  server.listen(23456)
  const tcpTransport = new TcpTransport({ host: 'localhost', port: 23456 }, {
    // eslint-disable-next-line no-console
    logger: console.log,
    reconnects: 1
  })
  setTimeout(() => {
    test.equal(tcpTransport.con, undefined, 'should not have a connection')
    tcpTransport.shutdown(() => {
      server.close(test.done.bind(test))
    })
  }, 100)
}

exports.reconnectclearing = (test) => {
  test.expect(2)
  let server = net.createServer((con) => con.end())
  server.listen(23456)

  const tcpTransport = new TcpTransport({ host: 'localhost', port: 23456 }, {
    // eslint-disable-next-line no-console
    logger: console.log,
    reconnects: 1,
    reconnectClearInterval: 110
  })

  setTimeout(() => {
    test.equal(tcpTransport.con, undefined, 'should not have a connection')

    // Pretend the service came back to life
    server.close(() => {
      server = net.createServer()
      server.listen(23456)

      setTimeout(() => {
        test.ok(tcpTransport.con, 'should have a connection')

        tcpTransport.shutdown(() => {
          server.close(test.done.bind(test))
        })
      }, 100)
    })
  }, 100)
}
