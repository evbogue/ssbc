'use strict'
// Minimal stub so ssb-ebt's backward-compat hook has a target to attach to.
// ssb-ebt hooks replicate.request to forward those calls into EBT.
// The stub itself does nothing — EBT's hook does all the work.
module.exports = {
  name: 'replicate',
  version: '1.0.0',
  manifest: { request: 'sync', block: 'sync' },
  init: function () {
    return {
      request: function (id, replicate) {},
      block:   function (id, blocked)   {}
    }
  }
}
