var plugs = require('../../wire')
var h = require('hyperscript')

module.exports = {
  needs: {screen_view: 'first', menu: 'first', avatar_image: 'first'},
  gives: 'app',
  create: function (api) {
    return function () {
      var hasStylesheet = document.querySelector('link[rel="stylesheet"][href*="style.css"]')
      if (!hasStylesheet) {
        document.head.appendChild(
          h('style', {'data-decent-style': 'true'}, require('../../style.css.json'))
        )
      }
      var isSsbsky = !!document.querySelector('link[rel="stylesheet"][href*="ssbsky-style.css"]')

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
        renderFeedHeader(route, view)
      }

      var selfId = require('../../keys').id
      function labelForRoute (route, fallback) {
        if (!isSsbsky) return fallback
        if (route === 'public') return 'Discover'
        if (route === 'friends') return 'Following'
        if (route === 'private') return 'Chat'
        return fallback
      }

      var navItems = [
        {route: 'public', label: labelForRoute('public', 'Public'), icon: 'newspaper'},
        {route: 'friends', label: labelForRoute('friends', 'Friends'), icon: 'groups'},
        {route: 'private', label: labelForRoute('private', 'Private'), icon: 'mail_lock'},
        {route: 'notifications', label: 'Notifications', icon: 'notifications_active'},
        {route: 'key', label: 'Keys', icon: 'vpn_key'}
      ]

      var nav = h('ul.nav.pull-left', navItems.map(function (item) {
        var href = item.route === 'public' ? '#/' : '#' + item.route
        return h('li', {'data-route': item.route},
          h('a', {
            href: href,
            title: item.label,
            'aria-label': item.label
          }, [
            h('span.material-symbols-outlined.nav__icon', {
              'aria-hidden': 'true'
            }, item.icon),
            isSsbsky ? h('span.nav__label', item.label) : null
          ])
        )
      }))

      var searchInput = h('input.nav-search', {
        placeholder: 'Search',
        onkeydown: function (e) {
          if (e.keyCode === 13) { // Enter
            window.location.hash = '#code-search/' + encodeURIComponent(this.value)
            this.value = ''
          }
        }
      })

      var profileLink = h('a.navbar-avatar', {
        href: '#' + selfId,
        title: 'Profile',
        'aria-label': 'Profile'
      }, api.avatar_image(selfId, 'thumbnail'))

      var header = h('div.navbar',
        h('div.navbar-inner',
          h('div.container-fluid',
            profileLink,
            nav,
            h('div.pull-right', searchInput, api.menu(),
              isSsbsky ? h('div.right-footer', [
                h('a.right-footer__link', {href: '#repos'}, 'Repositories'),
                h('a.right-footer__link', {href: '/docs'}, 'Docs'),
                h('a.right-footer__link', {href: '#key'}, 'Keys'),
                h('span.right-footer__tag', 'ssbsky · SSB')
              ]) : null
            )
          )
        )
      )

      var content = h('div.screen__content.column')
      // ssbsky shows a sticky, Bluesky-style header (feed tabs / section title)
      // at the top of the centre column; the route view renders below it. The
      // view host is a separate node so renderRoute can replace the view
      // without wiping the persistent header.
      var feedHeader = null
      var renderTarget = content
      if (isSsbsky) {
        feedHeader = h('div.feed-header')
        var feedHost = h('div.feed-host')
        content.appendChild(feedHeader)
        content.appendChild(feedHost)
        renderTarget = feedHost
      }
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

      function suffixForRoute (route, view) {
        var suffix = (view && view.title) || null
        if (!suffix) {
          if (route === 'public') suffix = labelForRoute(route, 'Public')
          else if (route === 'friends') suffix = labelForRoute(route, 'Friends')
          else if (route === 'private') suffix = labelForRoute(route, 'Private')
          else if (route === 'repos') suffix = 'Repositories'
          else if (route === 'notifications') suffix = 'Notifications'
          else if (route === 'key') suffix = 'Key'
          else if (route.indexOf('channel/') === 0) suffix = 'Channel ' + route.slice(8)
          else if (route[0] === '@') suffix = 'Profile'
          else if (route[0] === '%') suffix = 'Thread'
          else if (route[0] === '#') suffix = 'Message'
        }
        return suffix
      }

      function setTitle (route, view) {
        var base = isSsbsky ? 'ssbsky' : 'Decent SSB'
        var suffix = suffixForRoute(route, view)
        document.title = suffix ? base + ' — ' + suffix : base
      }

      // Bluesky-style centre-column header: the two primary feeds render as a
      // tab switcher (Discover / Following); every other route shows its title.
      function renderFeedHeader (route, view) {
        if (!feedHeader) return
        feedHeader.innerHTML = ''
        if (route === 'public' || route === 'friends') {
          [
            {route: 'public', href: '#/', label: 'Discover'},
            {route: 'friends', href: '#friends', label: 'Following'}
          ].forEach(function (t) {
            var tab = h('a.feed-header__tab', {href: t.href}, h('span', t.label))
            if (t.route === route) tab.classList.add('feed-header__tab--active')
            feedHeader.appendChild(tab)
          })
        } else {
          feedHeader.appendChild(
            h('div.feed-header__title', suffixForRoute(route, view) || '')
          )
        }
      }

      renderRoute(getRoute(), renderTarget)

      window.onhashchange = function () {
        renderRoute(getRoute(), renderTarget)
      }

      document.body.appendChild(screen)

      return screen
    }
  }
}
