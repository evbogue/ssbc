var plugs = require('../../wire')
var h = require('hyperscript')
var pull = require('pull-stream')
var hyperlightbox = require('hyperlightbox')
var QRCode = require('qrcode')
var ssbRef = require('ssb-ref')

module.exports = {
  needs: {
    screen_view: 'first',
    menu: 'first',
    avatar_image: 'first',
    avatar_name: 'first',
    message_confirm: 'first',
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
      var isSsbpro = !!document.querySelector('link[rel="stylesheet"][href*="ssbpro-style.css"]')
      var isNetworkSkin = isSsbski || isSsbpro
      var ssbproTheme = readSsbproTheme()
      applySsbproTheme(ssbproTheme)

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
      var topbarLightbox = null

      function profileUrlFor (id) {
        return window.location.origin + window.location.pathname + '#' + id
      }

      function parseProfileCode (text) {
        var candidate = ssbRef.extract(String(text || '').trim())
        return ssbRef.isFeed(candidate) ? candidate : null
      }

      function getTopbarLightbox () {
        if (!topbarLightbox) {
          topbarLightbox = hyperlightbox()
          document.body.appendChild(topbarLightbox)
        }
        return topbarLightbox
      }

      function copyText (text, statusEl, doneText) {
        function done () {
          if (statusEl) statusEl.textContent = doneText || 'Copied'
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, function () {
            window.prompt('Copy this profile code:', text)
            done()
          })
        } else {
          window.prompt('Copy this profile code:', text)
          done()
        }
      }

      function showConnectModal () {
        var profileLink = profileUrlFor(selfId)
        var tabs = h('div.qr-connect-tabs')
        var body = h('div.qr-connect-body')
        var footer = h('div.qr-connect-footer')
        var tabButtons = {}
        var modal = h('div.qr-connect-modal',
          h('div.qr-connect-header',
            h('div',
              h('div.qr-connect-title', 'Connect'),
              h('div.qr-connect-subtitle', 'Share your profile or subscribe from a code.')
            ),
            h('button.bio-improve-close', {type: 'button', title: 'Close', onclick: function () { getTopbarLightbox().close() }},
              h('span.material-symbols-outlined', 'close'))
          ),
          tabs,
          body,
          footer
        )

        function setMode (mode) {
          Object.keys(tabButtons).forEach(function (key) {
            tabButtons[key].classList.toggle('qr-connect-tab--active', key === mode)
          })
          body.innerHTML = ''
          footer.innerHTML = ''
          if (mode === 'paste') renderPaste()
          else renderQr()
        }

        function addTab (mode, label, icon) {
          var button = h('button.qr-connect-tab', {
            type: 'button',
            onclick: function () { setMode(mode) }
          }, [
            h('span.material-symbols-outlined', {'aria-hidden': 'true'}, icon),
            h('span', label)
          ])
          tabButtons[mode] = button
          tabs.appendChild(button)
        }

        function renderQr () {
          var status = h('div.qr-connect-status')
          var canvas = h('canvas.qr-connect-code')
          var profileCode = h('input.qr-connect-copy', {
            type: 'text',
            readonly: true,
            value: selfId
          })
          var profileLinkInput = h('input.qr-connect-copy', {
            type: 'text',
            readonly: true,
            value: profileLink
          })

          body.appendChild(h('div.qr-connect-card',
            canvas,
            h('div.qr-connect-person',
              api.avatar_image(selfId, 'thumbnail'),
              h('div',
                h('strong', api.avatar_name(selfId)),
                h('span', 'Scan to view and subscribe.')
              )
            )
          ))
          body.appendChild(h('label.qr-connect-label', 'Profile code'))
          body.appendChild(profileCode)
          body.appendChild(h('label.qr-connect-label', 'Profile link'))
          body.appendChild(profileLinkInput)
          body.appendChild(status)

          footer.appendChild(
            h('button.btn', {type: 'button', onclick: function () { copyText(selfId, status, 'Profile code copied') }}, 'Copy code')
          )
          footer.appendChild(
            h('button.btn', {type: 'button', onclick: function () { copyText(profileLink, status, 'Profile link copied') }}, 'Copy link')
          )
          footer.appendChild(
            h('button.btn.btn-primary', {type: 'button', onclick: function () {
              var a = document.createElement('a')
              a.href = canvas.toDataURL('image/png')
              a.download = 'ssbpro-profile-qr.png'
              a.click()
            }}, 'Download QR')
          )

          QRCode.toCanvas(canvas, profileLink, {
            errorCorrectionLevel: 'M',
            margin: 1,
            scale: 8,
            color: {
              dark: '#0a66c2',
              light: '#ffffff'
            }
          }, function (err) {
            if (err) {
              status.textContent = 'Could not create QR code.'
              console.error(err)
            }
          })
          profileCode.select()
        }

        function renderPaste () {
          var targetId = null
          var status = h('div.qr-connect-status')
          var input = h('textarea.qr-connect-paste', {
            rows: 4,
            placeholder: 'Paste a profile link or @feed.ed25519 code...'
          })
          var preview = h('div.qr-connect-preview', {style: {display: 'none'}})
          var subscribeBtn = h('button.btn.btn-primary', {type: 'button', disabled: true}, 'Subscribe')

          body.appendChild(h('label.qr-connect-label', 'Profile code or link'))
          body.appendChild(input)
          body.appendChild(preview)
          body.appendChild(status)
          footer.appendChild(h('button.btn', {type: 'button', onclick: function () { getTopbarLightbox().close() }}, 'Cancel'))
          footer.appendChild(subscribeBtn)

          function renderPreview () {
            targetId = parseProfileCode(input.value)
            preview.innerHTML = ''
            if (!input.value.trim()) {
              status.textContent = ''
              preview.style.display = 'none'
              subscribeBtn.disabled = true
              return
            }
            if (!targetId) {
              status.textContent = 'That does not look like an SSB profile code.'
              preview.style.display = 'none'
              subscribeBtn.disabled = true
              return
            }
            if (targetId === selfId) {
              status.textContent = 'That is your own profile.'
              preview.style.display = 'none'
              subscribeBtn.disabled = true
              return
            }
            status.textContent = ''
            preview.style.display = ''
            preview.appendChild(api.avatar_image(targetId, 'thumbnail'))
            preview.appendChild(h('div',
              h('strong', api.avatar_name(targetId)),
              h('span', targetId)
            ))
            subscribeBtn.disabled = false
          }

          subscribeBtn.onclick = function () {
            if (!targetId) return
            subscribeBtn.disabled = true
            api.message_confirm({
              type: 'contact',
              contact: targetId,
              following: true
            }, function (err, msg) {
              subscribeBtn.disabled = false
              if (err) {
                status.textContent = err.message
                return
              }
              if (msg) {
                getTopbarLightbox().close()
                window.location.hash = '#' + targetId
              }
            })
          }

          input.addEventListener('input', renderPreview)
          input.focus()
        }

        addTab('qr', 'My QR', 'qr_code_2')
        addTab('paste', 'Paste code', 'content_paste')
        getTopbarLightbox().show(modal)
        setMode('qr')
      }

      function readSsbproTheme () {
        if (!isSsbpro) return 'system'
        try {
          var stored = window.localStorage.getItem('ssbpro:theme')
          if (stored === 'light' || stored === 'dark') return stored
        } catch (e) {}
        return 'system'
      }

      function applySsbproTheme (theme) {
        if (!isSsbpro) return
        if (theme === 'light' || theme === 'dark') {
          document.documentElement.setAttribute('data-ssbpro-theme', theme)
        } else {
          document.documentElement.removeAttribute('data-ssbpro-theme')
        }
      }

      function getResolvedSsbproTheme () {
        var explicit = document.documentElement.getAttribute('data-ssbpro-theme')
        if (explicit === 'light' || explicit === 'dark') return explicit
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
        return 'light'
      }

      function rememberSsbproTheme (theme) {
        ssbproTheme = theme
        applySsbproTheme(theme)
        try {
          window.localStorage.setItem('ssbpro:theme', theme)
        } catch (e) {}
      }

      function readPopularPeopleHidden () {
        try {
          return window.localStorage.getItem('network:hidePopularPeople') === '1'
        } catch (e) {}
        return false
      }

      function rememberPopularPeopleHidden (hidden) {
        try {
          if (hidden) window.localStorage.setItem('network:hidePopularPeople', '1')
          else window.localStorage.removeItem('network:hidePopularPeople')
        } catch (e) {}
      }

      function makeThemeToggle () {
        var icon = h('span.material-symbols-outlined.theme-toggle__icon', {
          'aria-hidden': 'true'
        })
        var label = h('span.theme-toggle__label')
        var button = h('button.theme-toggle', {
          type: 'button',
          title: 'Toggle light/dark mode',
          onclick: function () {
            rememberSsbproTheme(getResolvedSsbproTheme() === 'dark' ? 'light' : 'dark')
            render()
          }
        }, icon, label)

        function render () {
          var next = getResolvedSsbproTheme() === 'dark' ? 'light' : 'dark'
          icon.textContent = next === 'dark' ? 'dark_mode' : 'light_mode'
          label.textContent = next === 'dark' ? 'Dark' : 'Light'
          button.setAttribute('aria-label', 'Switch to ' + next + ' mode')
        }

        render()
        return button
      }

      function makeConnectButton () {
        return h('button.nav-connect-btn', {
          type: 'button',
          title: 'Connect with people',
          'aria-label': 'Connect with people',
          onclick: showConnectModal
        }, [
          h('span.material-symbols-outlined.nav-connect-btn__icon', {
            'aria-hidden': 'true'
          }, 'qr_code_2'),
          h('span.nav-connect-btn__label', 'Connect')
        ])
      }

      function labelForRoute (route, fallback) {
        if (!isNetworkSkin) return fallback
        if (isSsbpro) {
          if (route === 'public') return 'Feed'
          if (route === 'friends') return 'Network'
          if (route === 'private') return 'Messaging'
        } else {
          if (route === 'public') return 'Discover'
          if (route === 'friends') return 'Following'
          if (route === 'private') return 'Chat'
        }
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
            isNetworkSkin ? h('span.nav__label', item.label) : null
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
        isNetworkSkin ? makeProfileMeta() : null
      ])

      // When no display name is set, avatar_name falls back to the truncated
      // feed id — identical to the handle — so the key would render twice. Hide
      // the handle in that case and reveal it once a real name resolves.
      function makeProfileMeta () {
        var nameEl = api.avatar_name(selfId)
        var handleEl = h('span.navbar-avatar__handle', selfId.slice(0, 9) + '…')
        function syncHandle () {
          var nm = (nameEl.textContent || '').trim()
          handleEl.style.display = nm === selfId.substring(0, 10) ? 'none' : ''
        }
        syncHandle()
        new MutationObserver(syncHandle).observe(nameEl, {
          childList: true, characterData: true, subtree: true
        })
        return h('span.navbar-avatar__meta', h('span.navbar-avatar__name', nameEl), handleEl)
      }

      // Network skins render a large brand tile at the bottom of the right
      // column. Decent keeps its own header, so this only renders for skins.
      var rightBrand = isNetworkSkin ? h('a.right-brand', {
        href: '#/',
        'aria-label': isSsbpro ? 'ssbpro home' : 'ssbski home'
      }, [
        h('img.right-brand__logo', {
          src: isSsbpro ? '/icons/ssbpro-512.png' : '/ssbski-logo.png',
          alt: isSsbpro ? 'ssbpro' : 'ssbski'
        }),
        h('span.right-brand__word', isSsbpro ? 'SSBPRO' : 'SSBSKI')
      ]) : null

      // Right-column card built from real SSB data. Prefer channel/hashtag
      // trends; fall back to active recent posters so the Bluesky-style column
      // does not disappear on quieter local datasets.
      function buildTrendingCard (onHide) {
        var list = h('div.trending__list')
        var title = h('span.trending-card__title', 'Trending')
        var hideIcon = h('span.material-symbols-outlined', 'visibility_off')
        hideIcon.setAttribute('aria-hidden', 'true')
        var hideButton = h('button.trending-card__hide', {
          type: 'button',
          title: 'Hide popular people',
          onclick: onHide
        }, hideIcon)
        hideButton.setAttribute('aria-label', 'Hide popular people')
        var card = h('div.trending-card', {style: {display: 'none'}},
          h('div.trending-card__head',
            h('span.trending-card__copy',
              title,
              h('span.trending-card__subtitle', 'People and topics from your local network')
            ),
            hideButton
          ),
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

          title.textContent = 'Active people'
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

      function buildDiscoveryPanel () {
        var hidden = readPopularPeopleHidden()
        var panel = h('div.discovery-panel')
        var card = buildTrendingCard(function () {
          hidden = true
          rememberPopularPeopleHidden(true)
          render()
        })
        var showIcon = h('span.material-symbols-outlined.discovery-toggle__icon', 'visibility')
        showIcon.setAttribute('aria-hidden', 'true')
        var showButton = h('button.discovery-toggle', {
          type: 'button',
          onclick: function () {
            hidden = false
            rememberPopularPeopleHidden(false)
            render()
          }
        },
          showIcon,
          h('span.discovery-toggle__copy',
            h('span.discovery-toggle__title', 'Popular people hidden'),
            h('span.discovery-toggle__subtitle', 'Show this area')
          ),
          h('span.discovery-toggle__action', 'Show')
        )
        showButton.setAttribute('aria-label', 'Show popular people')

        function render () {
          panel.innerHTML = ''
          panel.appendChild(hidden ? showButton : card)
        }

        render()
        return panel
      }

      var header = h('div.navbar',
        h('div.navbar-inner',
          h('div.container-fluid',
            profileLink,
            nav,
            isSsbpro ? h('div.topbar-actions',
              makeConnectButton(),
              makeThemeToggle()
            ) : null,
            h('div.pull-right', searchInput, isNetworkSkin ? null : api.menu(),
              isNetworkSkin ? buildDiscoveryPanel() : null,
              isNetworkSkin ? h('div.right-footer', [
                h('a.right-footer__link', {href: '#repos'}, 'Repositories'),
                h('a.right-footer__link', {href: '/docs'}, 'Docs'),
                h('a.right-footer__link', {href: '#key'}, 'Keys'),
                h('span.right-footer__tag', isSsbpro ? 'ssbpro · SSB' : 'ssbski · SSB')
              ]) : null,
              rightBrand
            )
          )
        )
      )

      var content = h('div.screen__content.column')
      // Network skins show a sticky header (feed tabs / section title) at the
      // top of the centre column; the route view renders below it. The
      // view host is a separate node so renderRoute can replace the view
      // without wiping the persistent header.
      var feedHeader = null
      var renderTarget = content
      if (isNetworkSkin) {
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
        var base = isSsbpro ? 'ssbpro' : isSsbski ? 'ssbski' : 'Decent SSB'
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

      // Network-skin centre-column header: the two primary feeds render as a
      // tab switcher; every other route shows its title.
      function renderFeedHeader (route, view) {
        if (!feedHeader) return
        feedHeader.innerHTML = ''
        feedHeader.style.display = ''
        if (route === 'public' || route === 'friends') {
          [
            {route: 'public', href: '#/', label: labelForRoute('public', 'Public')},
            {route: 'friends', href: '#friends', label: labelForRoute('friends', 'Friends')}
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
