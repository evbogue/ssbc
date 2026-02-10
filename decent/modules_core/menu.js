var h = require('hyperscript')

module.exports = {
  needs: {},
  gives: {connection_status: true, menu: true},
  create: function () {
    var dot = h('span.status.error', {title: 'Disconnected'})
    var message = h('span.status-message')
    var status = h('span.menu', [dot, message]) //start off disconnected

    return {
      connection_status: function (err) {
        if (err) {
          var reason = err.message || String(err)
          dot.classList.add('error')
          dot.title = reason
          message.textContent = 'Disconnected: ' + reason
          return
        }

        dot.classList.remove('error')
        dot.title = 'Connected'
        message.textContent = ''
      },
      menu: function () {
        return status
      }
    }
  }
}



