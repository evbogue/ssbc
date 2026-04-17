if (typeof process !== 'undefined' && process.env)
  process.env.CHLORIDE_JS = process.env.CHLORIDE_JS || '1'

require('depject')(
  // from more specialized to more general
  require('../modules_extra'),
  require('../modules_basic'),
  require('../modules_core')
).app[0]()
