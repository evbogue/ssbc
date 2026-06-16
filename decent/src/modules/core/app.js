var plugs = require('../../wire')
var h = require('hyperscript')
var pull = require('pull-stream')

module.exports = {
  needs: {
    screen_view: 'first',
    menu: 'first',
    avatar_image: 'first',
    avatar_name: 'first',
    sbot_log: 'first',
    sbot_messagesByType: 'first',
    notify_start: 'first'
  },
  gives: 'app',
  create: function (api) {
    return function () {
      var hasStylesheet = document.querySelector('link[rel="stylesheet"][href*="style.css"]')
      if (!hasStylesheet) {
        document.head.appendChild(
          h('style', {'data-decent-style': 'true'}, require('../../style.css.json'))
        )
      }
      var isSsbski = !!document.querySelector('link[rel="stylesheet"][href*="ssbski-style.css"]')

      window.addEventListener('error', window.onError = function (e) {
        // "ResizeObserver loop completed with undelivered notifications" is a
        // benign browser notification (no Error object), not an app fault —
        // Chrome dispatches it as a window 'error'. Don't paint a banner for it.
        if (e && e.message && /ResizeObserver loop/.test(e.message)) return
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
        if (!isSsbski) return fallback
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
            isSsbski ? h('span.nav__label', item.label) : null
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

      // ssbski fills the bottom-of-rail pill with a Bluesky-style account chip
      // (avatar + display name + short handle); Decent keeps the bare avatar in
      // its horizontal header, so the name/handle only render for the skin.
      var profileLink = h('a.navbar-avatar', {
        href: '#' + selfId,
        title: 'Profile',
        'aria-label': 'Profile'
      }, [
        api.avatar_image(selfId, 'thumbnail'),
        isSsbski ? h('span.navbar-avatar__meta',
          h('span.navbar-avatar__name', api.avatar_name(selfId)),
          h('span.navbar-avatar__handle', selfId.slice(0, 9) + '…')
        ) : null
      ])

      // ssbski brand: hermit-crab logo + wordmark at the top of the rail. Decent
      // keeps its own header, so this only renders for the ssbski skin.
      var brand = isSsbski ? h('a.navbar-brand', {
        href: '#/',
        'aria-label': 'ssbski home'
      }, [
        h('img.navbar-brand__logo', {src: '/ssbski-logo.png', alt: ''}),
        h('span.navbar-brand__name', 'ssbski')
      ]) : null

      // Right-column card built from real SSB data. Prefer channel/hashtag
      // trends; fall back to active recent posters so the Bluesky-style column
      // does not disappear on quieter local datasets.
      function buildTrendingCard () {
        var list = h('div.trending__list')
        var card = h('div.trending-card', {style: {display: 'none'}},
          h('div.trending-card__head', 'Trending'),
          list
        )
        var counts = {}
        var authorCounts = {}
        function bump (raw) {
          if (!raw) return
          var name = String(raw).toLowerCase().replace(/^#/, '').trim()
          if (!name || name.length > 40) return
          counts[name] = (counts[name] || 0) + 1
        }
        function bumpAuthor (id) {
          if (!id) return
          authorCounts[id] = (authorCounts[id] || 0) + 1
        }

        function renderCard () {
          var entries = Object.keys(counts)
            .map(function (k) { return [k, counts[k]] })
            .sort(function (a, b) { return b[1] - a[1] })
            .slice(0, 7)
          if (entries.length) {
            entries.forEach(function (e) {
              list.appendChild(
                h('a.trending__item', {href: '#channel/' + encodeURIComponent(e[0])},
                  h('span.trending__topic', '#' + e[0]),
                  h('span.trending__count', e[1] + (e[1] === 1 ? ' post' : ' posts'))
                )
              )
            })
            card.style.display = ''
            return
          }

          card.querySelector('.trending-card__head').textContent = 'Active people'
          Object.keys(authorCounts)
            .map(function (k) { return [k, authorCounts[k]] })
            .sort(function (a, b) { return b[1] - a[1] })
            .slice(0, 5)
            .forEach(function (e) {
              list.appendChild(
                h('a.trending__item.trending__item--person', {href: '#' + e[0]},
                  api.avatar_image(e[0], 'thumbnail'),
                  h('span.trending__body',
                    h('span.trending__topic', api.avatar_name(e[0])),
                    h('span.trending__count', e[1] + (e[1] === 1 ? ' recent update' : ' recent updates'))
                  )
                )
              )
            })
          if (!list.childNodes.length) {
            list.appendChild(
              h('div.trending__empty', 'Recent public activity will show here.')
            )
          }
          card.style.display = ''
        }

        // Query each activity type directly so the limit budget is spent on
        // messages we actually rank, instead of sampling the generic log (all
        // types) and filtering — on a busy node that wastes the budget on
        // votes/contacts and misses the genuinely most-active people.
        // People ranking counts posts plus git activity (pushes/repos) so the
        // infrastructure accounts that drive the network surface alongside
        // chatty posters; hashtag/channel trends stay post-only.
        var activityTypes = ['post', 'git-update', 'git-repo']
        var pending = activityTypes.length
        activityTypes.forEach(function (type) {
          pull(
            api.sbot_messagesByType({type: type, reverse: true, limit: 500, old: true, live: false}),
            pull.drain(function (msg) {
              var v = msg && msg.value
              var c = v && v.content
              if (!c || typeof c !== 'object' || c.type !== type) return
              if (v.private || c.private || Array.isArray(c.recps)) return
              bumpAuthor(v.author)
              if (type === 'post') {
                if (typeof c.channel === 'string') bump(c.channel)
                if (typeof c.text === 'string') {
                  var tags = c.text.match(/#[a-zA-Z0-9][a-zA-Z0-9_-]*/g)
                  if (tags) tags.forEach(bump)
                }
              }
            }, function (err) {
              if (err && err !== true) console.error(err)
              if (--pending > 0) return
              renderCard()
            })
          )
        })
        return card
      }

      var header = h('div.navbar',
        h('div.navbar-inner',
          h('div.container-fluid',
            brand,
            profileLink,
            nav,
            h('div.pull-right', searchInput, api.menu(),
              isSsbski ? buildTrendingCard() : null,
              isSsbski ? h('div.right-footer', [
                h('a.right-footer__link', {href: '#repos'}, 'Repositories'),
                h('a.right-footer__link', {href: '/docs'}, 'Docs'),
                h('a.right-footer__link', {href: '#key'}, 'Keys'),
                h('span.right-footer__tag', 'ssbski · SSB')
              ]) : null
            )
          )
        )
      )

      var content = h('div.screen__content.column')
      // ssbski shows a sticky, Bluesky-style header (feed tabs / section title)
      // at the top of the centre column; the route view renders below it. The
      // view host is a separate node so renderRoute can replace the view
      // without wiping the persistent header.
      var feedHeader = null
      var renderTarget = content
      if (isSsbski) {
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
          else if (route.indexOf('code-search/') === 0) suffix = 'Search'
          else if (route.indexOf('dm/') === 0) suffix = 'Chat'
          else if (route.indexOf('channel/') === 0) suffix = 'Channel ' + route.slice(8)
          else if (route[0] === '@') suffix = 'Profile'
          else if (route[0] === '%') suffix = 'Thread'
          else if (route[0] === '#') suffix = 'Message'
        }
        return suffix
      }

      function setTitle (route, view) {
        var base = isSsbski ? 'ssbski' : 'Decent SSB'
        var suffix = suffixForRoute(route, view)
        document.title = suffix ? base + ' — ' + suffix : base
      }

      // Root routes own a slot in the nav rail and never show a back chevron;
      // everything else is a drill-in (thread, profile, channel, search, a repo
      // page, …) and gets one.
      function isRootRoute (route) {
        return route === 'public' || route === 'friends' || route === 'private' ||
          route === 'notifications' || route === 'key' || route === 'repos'
      }

      // Drilled in (depth > 0) → step back through browser history; on the entry
      // page or a deep link (depth 0) → fall back to the home feed so the chevron
      // never walks the reader out of the app.
      function goBack () {
        if (navDepth > 0 && window.history.length > 1) window.history.back()
        else window.location.hash = '#/'
      }

      function makeBackButton () {
        // hyperscript doesn't reliably set aria-* from the attribute object
        // (see the tabindex/aria workarounds elsewhere), so set it explicitly —
        // otherwise a screen reader announces the "arrow_back" ligature text.
        var btn = h('button.feed-header__back', {
          type: 'button',
          title: 'Back',
          onclick: function (ev) { ev.preventDefault(); goBack() }
        }, h('span.material-symbols-outlined', {'aria-hidden': 'true'}, 'arrow_back'))
        btn.setAttribute('aria-label', 'Back')
        return btn
      }

      // Bluesky-style centre-column header: the two primary feeds render as a
      // tab switcher (Discover / Following); every other route shows its title.
      function renderFeedHeader (route, view) {
        if (!feedHeader) return
        feedHeader.innerHTML = ''
        feedHeader.style.display = ''
        if (route === 'public' || route === 'friends') {
          [
            {route: 'public', href: '#/', label: 'Discover'},
            {route: 'friends', href: '#friends', label: 'Following'}
          ].forEach(function (t) {
            var tab = h('a.feed-header__tab', {href: t.href}, h('span', t.label))
            if (t.route === route) tab.classList.add('feed-header__tab--active')
            feedHeader.appendChild(tab)
          })
          return
        }
        var title = suffixForRoute(route, view)
        if (title) {
          if (!isRootRoute(route)) feedHeader.appendChild(makeBackButton())
          feedHeader.appendChild(h('div.feed-header__title', title))
        } else {
          // No title for this route — don't leave an empty bar.
          feedHeader.style.display = 'none'
        }
      }

      // ── Navigation stack: back affordance + scroll restoration ────────────
      // Hash navigations already create browser history entries, so back/forward
      // (and the header chevron, via goBack) all route through onhashchange. We
      // stamp each entry with a depth via history.state so a drilled-in screen
      // (depth > 0) can be told apart from the entry page / a deep link (depth 0).
      // Per-route scrollTop is captured leaving a screen and restored returning
      // to it — best-effort while a live feed streams back in — so "back" lands
      // the reader where they were.
      var navDepth = 0
      var currentRoute = null
      var scrollByRoute = {}

      function currentScrollEl () {
        return renderTarget.querySelector('.column.scroller') || renderTarget
      }

      function restoreScroll (route) {
        var saved = scrollByRoute[route]
        if (!saved) return
        var deadline = Date.now() + 1500
        requestAnimationFrame(function step () {
          var el = currentScrollEl()
          el.scrollTop = saved
          // Keep nudging until the content has streamed in tall enough to hold
          // the offset (or we give up), then stop feeding the scroller.
          if (Math.abs(el.scrollTop - saved) > 2 && Date.now() < deadline)
            requestAnimationFrame(step)
        })
      }

      function navigate (route) {
        if (currentRoute != null)
          scrollByRoute[currentRoute] = currentScrollEl().scrollTop
        renderRoute(route, renderTarget)
        currentRoute = route
        restoreScroll(route)
      }

      try { window.history.replaceState({navDepth: 0}, '') } catch (err) {}
      navigate(getRoute())

      window.onhashchange = function () {
        var st = window.history.state
        if (st && typeof st.navDepth === 'number') {
          // Back/forward to an entry we've already stamped.
          navDepth = st.navDepth
        } else {
          // A fresh forward navigation (anchor / hash set) lands with null state.
          navDepth += 1
          try { window.history.replaceState({navDepth: navDepth}, '') } catch (err) {}
        }
        navigate(getRoute())
      }

      document.body.appendChild(screen)

      // Start foreground notifications for both skins. This remains dormant
      // until the user grants permission from the notifications tab.
      api.notify_start()

      // Shell is mounted — fade out the ssbski launch splash (no-op elsewhere).
      if (isSsbski && typeof window.__ssbskiHideSplash === 'function')
        window.__ssbskiHideSplash()

      return screen
    }
  }
}
