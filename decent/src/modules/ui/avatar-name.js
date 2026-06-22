
var h = require('hyperscript')

exports.needs = {
  signifier: 'first',
  signifier_watch: 'first'
}

exports.gives = 'avatar_name'

exports.create = function (api) {

  return function name (id) {
    var n = h('span.avatar_name', id ? id.substring(0, 10) : "")

    //choose the most popular name for this person.
    //for anything like this you'll see I have used sbot.links2
    //which is the ssb-links plugin. as you'll see the query interface
    //is pretty powerful!
    //TODO: "most popular" name is easily gameable.
    //must come up with something better than this.

    function refresh () {
      api.signifier(id, function (_, names) {
        if(names.length) n.textContent = names[0].name
      })
    }

    refresh()

    if (api.signifier_watch) {
      api.signifier_watch(id, refresh, function () {
        return typeof document !== 'undefined' && !document.contains(n)
      })
    }

    return n
  }

}
