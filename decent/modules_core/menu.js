var h = require('hyperscript')

module.exports = {
  needs: {},
  gives: {connection_status: true, menu: true},
  create: function () {
    var status = h('span.menu', h('span.status.error')) //start off disconnected

    return {
      connection_status: function (err) {
        var dot = status.firstChild
        if (err) dot.classList.add('error')
        else dot.classList.remove('error')
      },
      menu: function () {
        return status
      }
    }
  }
}




