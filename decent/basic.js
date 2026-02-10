require('depject')(
  // from more specialized to more general
  require('../patchbay/modules_core'),
  require('../patchbay/modules_basic')
).app[0]()
