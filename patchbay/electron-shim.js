function Menu () {}

Menu.prototype.append = function () {}
Menu.prototype.popup = function () {}

function MenuItem () {}

module.exports = {
  remote: {
    Menu: Menu,
    MenuItem: MenuItem,
    getCurrentWindow: function () {
      return {
        inspectElement: function () {}
      }
    }
  }
}

