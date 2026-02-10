require('depject')(
  // from more specialized to more general
  require('../patchbay/modules_extra'),
  require('../patchbay/modules_basic'),
  require('./modules_core')
).app[0]()
