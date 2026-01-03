var plugs = require('../plugs')
var h = require('hyperscript')

module.exports = {
  needs: {screen_view: 'first', menu: 'first'},
  gives: 'app',
  create: function (api) {
    return function () {
      var hasStylesheet = document.querySelector('link[rel="stylesheet"][href$="style.css"]')
      if (!hasStylesheet) {
        document.head.appendChild(
          h('style', {'data-decent-style': 'true'}, require('../style.css.json'))
        )
      }

      window.addEventListener('error', window.onError = function (e) {
        document.body.appendChild(h('div.error',
          h('h1', e.message),
          h('big', h('code', e.filename + ':' + e.lineno)),
          h('pre', e.error ? (e.error.stack || e.error.toString()) : e.toString())))
      })

      function getRoute () {
        var raw = window.location.hash.substring(1).trim()
        if (!raw || raw === 'tabs' || raw === '/') return 'public'
        if (raw[0] === '@' || raw[0] === '%' || raw[0] === '#') return raw
        if (raw[0] === '/') return raw.slice(1)
        return raw
      }

      function renderRoute (route, container) {
        var view = api.screen_view(route)
        if (!view) {
          view = h('div.scroller__wrapper',
            h('div.message',
              h('strong', 'Unknown route'),
              h('div', 'No screen available for ', h('code', route))
            )
          )
        }
        container.innerHTML = ''
        container.appendChild(view)
        setActive(route)
        setTitle(route, view)
      }

      var selfId = require('../keys').id
      var navItems = [
        {route: 'public', label: 'Public', icon: 'public'},
        {route: selfId, label: 'Profile', icon: 'person'},
        {route: 'private', label: 'Private', icon: 'lock'},
        {route: 'notifications', label: 'Notifications', icon: 'notifications'},
        {route: 'key', label: 'Key', icon: 'key'}
      ]

      var nav = h('ul.nav.pull-left', navItems.map(function (item) {
        var href = item.route === 'public' ? '#/' : '#' + item.route
        return h('li', {'data-route': item.route},
          h('a', {href: href}, [
            h('span.material-symbols-outlined.nav__icon', item.icon),
            h('span', item.label)
          ])
        )
      }))

      var header = h('div.navbar',
        h('div.navbar-inner',
          h('div.container-fluid',
            h('a.brand', {href: '#/'}, 'Decent'),
            nav,
            h('div.pull-right', api.menu())
          )
        )
      )

      var content = h('div.screen__content.column')
      var screen = h('div.screen.column', header, content)

      function setActive (route) {
        var items = nav.querySelectorAll('li[data-route]')
        Array.prototype.forEach.call(items, function (el) {
          if (el.getAttribute('data-route') === route)
            el.classList.add('active')
          else
            el.classList.remove('active')
        })
      }

      function setTitle (route, view) {
        var base = 'Decent SSB'
        var suffix = (view && view.title) || null
        if (!suffix) {
          if (route === 'public') suffix = 'Public'
          else if (route === 'private') suffix = 'Private'
          else if (route === 'notifications') suffix = 'Notifications'
          else if (route === 'key') suffix = 'Key'
          else if (route.indexOf('channel/') === 0) suffix = 'Channel ' + route.slice(8)
          else if (route[0] === '@') suffix = 'Profile'
          else if (route[0] === '%') suffix = 'Thread'
          else if (route[0] === '#') suffix = 'Message'
        }
        document.title = suffix ? base + ' — ' + suffix : base
      }

      renderRoute(getRoute(), content)

      window.onhashchange = function () {
        renderRoute(getRoute(), content)
      }

      document.body.appendChild(screen)

      return screen
    }
  }
}
