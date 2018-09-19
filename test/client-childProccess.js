const jsonrpc = require('../lib/index')
const ChildProcessTransport = jsonrpc.transports.client.childProcess
const JsonRpcClient = jsonrpc.client
const childProcess = require('child_process')

const child = childProcess.fork(__dirname + '/child/child.js')
const jsonRpcClient = new JsonRpcClient(new ChildProcessTransport(child))
jsonRpcClient.register(['loopback', 'failure'])

exports.loopback = (test) => {
  test.expect(2)
  jsonRpcClient.loopback({foo: 'bar'}, (err, result) => {
    test.ok(!!result, 'result exists')
    test.equal(result.foo, 'bar', 'Looped back correctly')
    test.done()
  })
}

exports.failureTcp = (test) => {
  test.expect(3)
  jsonRpcClient.failure({foo: 'bar'}, (err) => {
    test.ok(!!err, 'error exists')
    test.equal('Whatchoo talkin\' \'bout, Willis?', err.message, 'The error message was received correctly')
    test.equal(1, err.prop, 'The error message was received correctly')
    child.kill()
    test.done()
  })
}
