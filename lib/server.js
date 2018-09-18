const util = require('util')

const errorCode = require('./errorcode')

const setDefaultProperty = (data) => {
  const outObj = {}
  if (data.hasOwnProperty('jsonrpc')) {
    outObj.jsonrpc = data.jsonrpc
  }
  outObj.id = data.hasOwnProperty('id') ? data.id : undefined
  return outObj
}

const batchCallback = (response, size, callback) => {
  return (obj) => {
    response.push(obj)
    if (response.length === size) {
      callback(response)
    }
  }
}

class JSONRPC {
  // ## The JSONRPC constructor
  // Each JSON-RPC object is tied to a *scope*, an object containing functions to
  // call. If not passed an explicit scope, *Node.js*' *root* scope will be used.
  // Also, unlike the Javascript running in web browsers, functions not explicitly
  // assigned to a scope are attached to the anonymous scope block only and cannot
  // be accessed even from the *root* scope.
  constructor(transports, scope) {
    this.transports = Array.isArray(transports) ? transports : [transports]
    this.transport = this.transports[0] // For compatibility with existing code; TODO: Remove with 1.0.0
    this.scope = scope

    // The actual object initialization occurs here. If the *scope* is not
    // defined, the *root* scope is used, and then the object is returned to
    // the developer.
    // TODO: Remove this on 1.0.0 release, was a very bad idea
    if(!scope || typeof(scope) !== 'object') {
      /* global root: false */
      scope = root
    }
    // ### The *rpc.methodList* method
    // is a JSON-RPC extension that returns a list of all methods in the scope
    scope['rpc.methodList'] = callback => callback(null, Object.keys(scope))

    this.transports.forEach(transport => transport.handler = this.handleJSON.bind(this))
  }

  // ### The *handleJSON* function
  // makes up the majority of the JSON-RPC server logic, handling the requests
  // from clients, passing the call to the correct function, catching any
  // errors the function may throw, and calling the function to return the
  // results back to the client.
  handleJSON(data, callback) {
    if (Array.isArray(data)) {
      const response = []
      const len = data.length
      for (let i = 0; i < len; i++) {
        const x = data[i]
        this.handleJSON(x, batchCallback(response, len, callback))
      }
    } else if (data instanceof Object) {
      if (data.method) {
        // If the method is defined in the scope and is not marked as a
        // blocking function, then a callback must be defined for
        // the function. The callback takes two parameters: the
        // *result* of the function, and an *error* message.
        const arglen = data.params && data.params instanceof Array ? data.params.length : data.params ? 1 : 0
        if (this.scope[data.method] && (!(this.scope[data.method].length === arglen) || this.scope[data.method].blocking)) {
          const next = function(error, result) {
            const outObj = setDefaultProperty(data)
            if(error) {
              if(error instanceof Error) {
                outObj.error = Object.assign({}, error)
                outObj.error.code = errorCode.internalError
                outObj.error.message = error.message
              } else {
                outObj.error = error
              }
            } else {
              outObj.result = result
            }
            callback(outObj)
          }

          if (!(data.params instanceof Array)) {
            data.params = data.params ? [data.params] : []
          }

          const paramsMissing = this.scope[data.method].length - (arglen + 1)

          for (let j = 0; j < paramsMissing; j++) {
            data.params.push(undefined)
          }

          data.params.push(next)

          // This *try-catch* block is for catching errors in an asynchronous server method.
          // Since the async methods are supposed to return an error in the callback, this
          // is assumed to be an unintended mistake, so we catch the error, send a JSON-RPC
          // error response, and then re-throw the error so the server code gets the error
          // and can deal with it appropriately (which could be "crash because this isn't
          // expected to happen").
          try {
            this.scope[data.method].apply(this.scope, data.params)
          } catch(e) {
            const outErr = {
              code: errorCode.internalError,
              message: e.message,
              stack: e.stack,
            }
            const outObj = setDefaultProperty(data)
            outObj.error = outErr
            callback(outObj)
            throw e
          }
        } else {
          const errObj1 = setDefaultProperty(data)
          errObj1.error = {
            code: errorCode.methodNotFound,
            message: 'Requested method does not exist.',
          }
          callback(errObj1)
        }
      } else {
        const errObj2 = setDefaultProperty(data)
        errObj2.error = {
          code: errorCode.invalidRequest,
          message: 'Did not receive valid JSON-RPC data.',
        }
        callback(errObj2)
      }
    } else {
      const errObj3 = setDefaultProperty(data)
      errObj3.error = {
        code: errorCode.parseError,
        message: 'Did not receive valid JSON-RPC data.',
      }
      callback(errObj3)
    } // TODO: Try to un-nest this
  }

  // ### The *register* method 
  // allows one to attach a function to the current scope after the scope has
  // been attached to the JSON-RPC server, for similar possible shenanigans as
  // described above. This method in particular, though, by attaching new
  // functions to the current scope, could be used for caching purposes or
  // self-modifying code that rewrites its own definition.
  register(methodName, method) {
    if (!this.scope || typeof(this.scope) !== 'object') {
      this.scope = {}
    } // TODO: Remove this behavior by 1.0.0
    this.scope[methodName] = method
  }

  // ### The *registerPromise* method 
  // allows async functions (and functions that return promises) to be registered as
  // a server function. This will become the default path in 1.0.0
  registerPromise(methodName, method) {
    const callbackMethod = util.callbackify(method)
    callbackMethod.blocking = true // Abuse this flag because wrapped methods will match arg length
    this.scope[methodName] = callbackMethod
  }

  // ### The *registerCallback* method 
  // is currently an alias for the *register* method. Added to make the transition to
  // 1.0.0 smoother (can write server code compatible with 1.0.0 before unsupported code is
  // dropped
  registerCallback(methodName, method) {
    this.register(methodName, method)
  }

  // Make a ``blocking`` helper method to callback-ify them; will be deprecated in 1.0.0 as
  // unnecessary (but kept for transitioning users)
  blocking(func) {
    const blockedFunc = (...args) => {
      const callback = args.pop()
      try {
        callback(null, func.apply(this, args))
      } catch (e) {
        callback(e)
      }
    }
    blockedFunc.blocking = true
    return blockedFunc
  }

  // Cleanly shut down the JSONRPC server
  shutdown(done) {
    let closed = 0
    const transports = this.transports
    transports.forEach((transport) => {
      transport.shutdown(() => {
        closed++
        if (closed === transports.length && typeof done === 'function') done()
      })
    })
  }
}

// Export the server constructor
module.exports = JSONRPC
