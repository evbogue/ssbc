var h = require('hyperscript')

module.exports = {
  needs: {},
  gives: {connection_status: true, menu: true},
  create: function () {
    var dot = h('span.status.error', {title: 'Disconnected'})
    var status = h('span.menu', [dot])

    return {
      connection_status: function (err) {
        if (err) {
          var reason = err.message || String(err)
          dot.classList.add('error')
          dot.title = reason
          return
        }

        dot.classList.remove('error')
        dot.title = 'Connected'
      },
      menu: function () {
        return status
      }
    }
  }
}


