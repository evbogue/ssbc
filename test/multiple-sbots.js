var tape = require('tape')

tape('createSsbServer method allows creating multiple servers with the same plugins', function (t) {
  var createSsbServer = require('../').createSsbServer

  // server1
  createSsbServer()
    .use(require('../lib/vendor/ssb-replicate-stub'))

  // server2
  createSsbServer()
    .use(require('../lib/vendor/ssb-replicate-stub'))
    .use(require('ssb-gossip'))

  t.pass()
  t.end()
})
