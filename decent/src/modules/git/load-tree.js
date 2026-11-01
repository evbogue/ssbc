'use strict'

// Only the repository landing page supplies alternatives. Explicit branch and
// path URLs must keep reporting errors for the ref the visitor requested.
module.exports = function loadTree(ref, alternatives, fetchTree, cb) {
  var remaining = (alternatives || []).filter(function (name, index, names) {
    return name !== ref && names.indexOf(name) === index
  })
  fetchTree(ref, function (err, data) {
    if (err && err.status === 404 && remaining.length) {
      return loadTree(remaining.shift(), remaining, fetchTree, cb)
    }
    cb(err, data, ref)
  })
}
