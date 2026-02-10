require('depject')(
  // from more specialized to more general
  require('../patchbay/modules_embedded'),
  require('../patchbay/modules_basic'),
  require('../patchbay/modules_extra')
).app[0]()
