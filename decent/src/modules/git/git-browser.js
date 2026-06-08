'use strict'
var h         = require('hyperscript')
var pull      = require('pull-stream')
var human     = require('human-time')
var highlight = require('../../highlight')
var selfId    = require('../../keys').id

exports.needs = {
  markdown:            'first',
  message_compose:     'first',
  message_render:      'first',
  message_confirm:     'first',
  sbot_links:          'first',
  sbot_messagesByType: 'first',
  avatar_name:         'first',
  avatar_image:        'first',
  sbot_get:            'first'
}

exports.gives = {
  screen_view: true
}

exports.create = function (api) {
  var refsCache = {}
  var repoNames = {}

  function fetchJson(url, cb) {
    var xhr = new XMLHttpRequest()
    xhr.open('GET', url)
    xhr.onload = function () {
      if (xhr.status !== 200) {
        var e = new Error('HTTP ' + xhr.status)
        e.status = xhr.status
        return cb(e)
      }
      try { cb(null, JSON.parse(xhr.responseText)) }
      catch (e) { cb(e) }
    }
    xhr.onerror = function () { cb(new Error('Network error')) }
    xhr.send()
  }

  function gitApiUrl(repoId, sub) {
    return window.location.origin + '/git/' + encodeURIComponent(repoId) + '/json/' + sub
  }

  function gitBrowseRoute(repoId, sub, ref, pathParts) {
    var r = 'git/' + encodeURIComponent(repoId)
    if (sub)       r += '/' + sub
    if (ref)       r += '/' + encodeURIComponent(ref)
    if (pathParts && pathParts.length) r += '/' + pathParts.map(encodeURIComponent).join('/')
    return '#' + r
  }

  function shortRefName(ref) {
    return (ref || '').replace(/^refs\/(heads|tags)\//, '')
  }

  function getDefaultRef(data) {
    var refs = (data && data.refs) || []
    var heads = refs.filter(function (r) {
      return /^refs\/heads\/(.+)$/.test(r.name)
    }).map(function (r) { return shortRefName(r.name) })

    var symHead = (data && data.symrefs && data.symrefs.filter(function (r) {
      return r.name === 'HEAD'
    })[0])
    var head = symHead && symHead.ref ? shortRefName(symHead.ref) : null

    // Trust HEAD when it already points to a conventional default branch.
    if (head === 'main' || head === 'master') return head

    // Otherwise prefer main/master when the repo has one. This heals repos
    // pushed before the server recorded HEAD, where HEAD was guessed and may
    // point at an arbitrary branch (see plugins/git-server.js resolveHead).
    if (heads.indexOf('main') !== -1) return 'main'
    if (heads.indexOf('master') !== -1) return 'master'

    // Fall back to the recorded HEAD, then the first branch.
    if (head) return head
    return heads[0] || 'HEAD'
  }

  function getRepoRefs(repoId, cb) {
    if (refsCache[repoId] && refsCache[repoId].status === 'ready') {
      return cb(null, refsCache[repoId].data)
    }

    if (refsCache[repoId] && refsCache[repoId].status === 'error') {
      return cb(refsCache[repoId].error)
    }

    if (refsCache[repoId] && refsCache[repoId].status === 'loading') {
      refsCache[repoId].waiters.push(cb)
      return
    }

    refsCache[repoId] = {status: 'loading', waiters: [cb]}
    fetchJson(gitApiUrl(repoId, 'refs'), function (err, data) {
      var waiters = refsCache[repoId].waiters
      if (err) {
        refsCache[repoId] = {status: 'error', error: err}
        waiters.forEach(function (waiter) { waiter(err) })
        return
      }

      refsCache[repoId] = {status: 'ready', data: data}
      waiters.forEach(function (waiter) { waiter(null, data) })
    })
  }

  function getRepoName(repoId) {
    return repoNames[repoId] || 'repo'
  }

  function breadcrumbs(repoId, ref, pathParts) {
    var crumbs = [h('a', {href: gitBrowseRoute(repoId)}, getRepoName(repoId))]
    crumbs.push(h('span.git-bc-sep', ' / '))
    crumbs.push(h('a', {href: gitBrowseRoute(repoId, 'tree', ref, [])}, ref))
    for (var i = 0; i < pathParts.length; i++) {
      crumbs.push(h('span.git-bc-sep', ' / '))
      crumbs.push(h('a', {href: gitBrowseRoute(repoId, 'tree', ref, pathParts.slice(0, i + 1))}, pathParts[i]))
    }
    return h('div.git-breadcrumbs', crumbs)
  }

  function getIssueState(id, cb) {
    pull(
      api.sbot_links({dest: id, rel: 'issues', values: true, reverse: true}),
      pull.map(function (msg) {
        return msg.value.content.issues
      }),
      pull.flatten(),
      pull.filter(function (issue) {
        return issue && (issue.link === id)
      }),
      pull.map(function (issue) {
        return issue.merged ? 'merged' : issue.open === false ? 'closed' : 'open'
      }),
      pull.take(1),
      pull.collect(function (err, updates) {
        cb(err, (updates && updates[0]) || 'open')
      })
    )
  }

  function makeRefTarget(repoId, screen, ref, pathParts) {
    if (screen === 'blob') return gitBrowseRoute(repoId, 'blob', ref, pathParts)
    if (screen === 'tree') return gitBrowseRoute(repoId, 'tree', ref, pathParts)
    if (screen === 'log') return gitBrowseRoute(repoId, 'log', ref, [])
    if (screen === 'commit') return gitBrowseRoute(repoId, 'log', ref, [])
    return gitBrowseRoute(repoId, 'tree', ref, [])
  }

  function renderRefPicker(repoId, opts) {
    var picker = h('div.git-ref-picker')
    var button = h('button.git-ref-picker-button', {
      type: 'button',
      disabled: true,
      title: 'Loading refs…'
    }, h('span.git-ref-picker-icon', '⎇'), ' ', opts.ref || 'HEAD')
    var popover = h('div.git-ref-picker-popover')
    var state = {
      kind: 'branches',
      query: '',
      items: [],
      index: 0,
      open: false,
      refs: null,
      defaultRef: opts.ref || 'HEAD',
      disposeOutside: null
    }

    function closePopover() {
      if (!state.open) return
      state.open = false
      picker.classList.remove('is-open')
      popover.innerHTML = ''
      if (state.disposeOutside) {
        document.removeEventListener('click', state.disposeOutside, true)
        state.disposeOutside = null
      }
    }

    function navigateToRef(ref) {
      window.location.hash = makeRefTarget(repoId, opts.screen, ref, opts.pathParts || [])
    }

    function getVisibleItems() {
      var refs = (state.refs && state.refs.refs) || []
      var query = state.query.toLowerCase()
      var prefix = state.kind === 'tags' ? /^refs\/tags\// : /^refs\/heads\//
      var items = refs.filter(function (entry) {
        return prefix.test(entry.name)
      }).map(function (entry) {
        var name = shortRefName(entry.name)
        return {
          name: name,
          isDefault: state.kind === 'branches' && name === state.defaultRef
        }
      })

      items.sort(function (a, b) {
        if (a.isDefault && !b.isDefault) return -1
        if (!a.isDefault && b.isDefault) return 1
        return a.name.localeCompare(b.name)
      })

      if (!query) return items
      return items.filter(function (item) {
        return item.name.toLowerCase().indexOf(query) !== -1
      })
    }

    function renderPopover() {
      var input
      var list

      state.items = getVisibleItems()
      if (state.index >= state.items.length) state.index = 0

      popover.innerHTML = ''
      popover.appendChild(h('div.git-ref-picker-tabs',
        h('button.git-ref-picker-tab', {
          type: 'button',
          title: 'List branches',
          className: state.kind === 'branches' ? 'active' : '',
          onclick: function () {
            state.kind = 'branches'
            state.index = 0
            renderPopover()
          }
        }, 'Branches'),
        h('button.git-ref-picker-tab', {
          type: 'button',
          title: 'List tags',
          className: state.kind === 'tags' ? 'active' : '',
          onclick: function () {
            state.kind = 'tags'
            state.index = 0
            renderPopover()
          }
        }, 'Tags')
      ))

      input = h('input.git-ref-picker-search', {
        type: 'text',
        placeholder: state.kind === 'tags' ? 'Filter tags…' : 'Filter branches…',
        value: state.query,
        oninput: function () {
          state.query = this.value
          state.index = 0
          renderPopover()
          if (popover.querySelector('.git-ref-picker-search')) {
            popover.querySelector('.git-ref-picker-search').focus()
            popover.querySelector('.git-ref-picker-search').setSelectionRange(state.query.length, state.query.length)
          }
        },
        onkeydown: function (ev) {
          if (ev.key === 'Escape') {
            ev.preventDefault()
            closePopover()
            button.focus()
          } else if (ev.key === 'ArrowDown') {
            ev.preventDefault()
            if (state.items.length) {
              state.index = Math.min(state.items.length - 1, state.index + 1)
              renderPopover()
            }
          } else if (ev.key === 'ArrowUp') {
            ev.preventDefault()
            if (state.items.length) {
              state.index = Math.max(0, state.index - 1)
              renderPopover()
            }
          } else if (ev.key === 'Enter') {
            ev.preventDefault()
            if (state.items[0]) navigateToRef(state.items[state.index] ? state.items[state.index].name : state.items[0].name)
          }
        }
      })

      popover.appendChild(input)
      list = h('div.git-ref-picker-list')

      if (!state.items.length) {
        list.appendChild(h('div.git-ref-picker-empty', 'No matches'))
      } else {
        state.items.forEach(function (item, index) {
          list.appendChild(h('button.git-ref-picker-item', {
            type: 'button',
            title: 'Browse this repository at ' + item.name,
            className: index === state.index ? 'active' : '',
            onclick: function () {
              navigateToRef(item.name)
            },
            onmouseenter: function () {
              state.index = index
            }
          },
          h('span.git-ref-picker-item-name', item.name),
          item.isDefault ? h('span.git-ref-picker-item-meta', 'default') : null
          ))
        })
      }

      popover.appendChild(list)
      setTimeout(function () {
        var search = popover.querySelector('.git-ref-picker-search')
        if (search) search.focus()
      }, 0)
    }

    button.onclick = function (ev) {
      ev.preventDefault()
      ev.stopPropagation()
      if (button.disabled) return
      if (state.open) {
        closePopover()
        return
      }

      state.open = true
      picker.classList.add('is-open')
      renderPopover()
      state.disposeOutside = function (event) {
        if (!picker.contains(event.target)) closePopover()
      }
      document.addEventListener('click', state.disposeOutside, true)
    }

    picker.appendChild(button)
    picker.appendChild(popover)

    getRepoRefs(repoId, function (err, data) {
      if (err) {
        button.disabled = true
        button.title = 'refs unavailable'
        button.textContent = '⎇ ' + (opts.ref || 'HEAD')
        picker.classList.add('is-disabled')
        return
      }

      state.refs = data
      state.defaultRef = getDefaultRef(data)
      button.disabled = false
      button.title = 'Switch branch or tag'
      button.textContent = '⎇ ' + (opts.ref || state.defaultRef)
    })

    return picker
  }

  function renderRepoSubheader(repoId, opts) {
    var ref = opts.ref || 'HEAD'
    var pathParts = opts.pathParts || []
    var crumbs = pathParts.length ? breadcrumbs(repoId, ref, pathParts) : null
    var right = h('div.git-repo-subheader-right', crumbs)
    var root = h('div.git-repo-subheader',
      h('div.git-repo-subheader-left',
        renderRefPicker(repoId, opts)
      ),
      right
    )

    if (opts.hint) {
      right.insertBefore(h('div.git-repo-subheader-hint', opts.hint), crumbs)
    }

    if (!opts.ref && pathParts.length) {
      getRepoRefs(repoId, function (err, data) {
        if (err) return
        right.replaceChild(
          breadcrumbs(repoId, getDefaultRef(data), pathParts),
          crumbs
        )
      })
    }

    return root
  }

  function layout(repoId, sub, container) {
    var header = h('div.git-forge-header', 'Loading repo info…')
    var wrapper = h('div.git-forge-layout', header, h('div.git-forge-container', container))

    api.sbot_get(repoId, function (err, msg) {
      header.innerHTML = ''
      if (err) {
        header.appendChild(h('div.git-forge-repo-title', 'Error: ' + err.message))
        return
      }

      var name = (msg && msg.content && msg.content.name) || repoId.substr(0, 10) + '…'
      var author = msg.author
      repoNames[repoId] = name

      function tabIcon(name) {
        return h('span.git-forge-tab-icon.material-symbols-outlined', name)
      }

      function tab(active, route, icon, label) {
        return h('a.git-forge-tab' + (active ? '.active' : ''),
          {
            href: route,
            'aria-label': label,
            title: label
          },
          tabIcon(icon),
          h('span.git-forge-tab-label', label))
      }

      var tabs = [
        tab(!sub || sub === 'tree' || sub === 'blob', gitBrowseRoute(repoId),             'code',       'Code'),
        tab(sub === 'log' || sub === 'commit',       gitBrowseRoute(repoId, 'log'),       'history',    'Commits'),
        tab(sub === 'issues',                         gitBrowseRoute(repoId, 'issues'),    'error',      'Issues'),
        tab(sub === 'pulls',                          gitBrowseRoute(repoId, 'pulls'),     'merge_type', 'Pull Requests'),
        tab(sub === 'activity',                       gitBrowseRoute(repoId, 'activity'),  'timeline',   'Activity')
      ]

      if (author === selfId) {
        tabs.push(tab(sub === 'settings', gitBrowseRoute(repoId, 'settings'), 'settings', 'Settings'))
      }

      header.appendChild(h('div',
        h('div.git-forge-repo-title',
          h('a', {href: '#' + author},
            h('span', api.avatar_image(author, 'thumbnail')),
            h('span', api.avatar_name(author))
          ),
          h('span.git-forge-sep', ' / '),
          h('a', {href: gitBrowseRoute(repoId)}, h('strong', name))
        ),
        h('div.git-forge-tabs', tabs)
      ))
    })

    return wrapper
  }

  var COAUTHOR_RE = /^\s*co-authored-by:\s*(.+?)\s*<[^>]+>\s*$/i

  function collectAuthors(c) {
    var author = c && c.author ? c.author : {}
    var names = []
    var seen = {}
    function add(name) {
      if (!name) return
      var key = name.toLowerCase()
      if (seen[key]) return
      seen[key] = true
      names.push(name)
    }
    add(author.name)
    var body = (c && c.body) || ''
    body.split(/\r?\n/).forEach(function (line) {
      var m = line.match(COAUTHOR_RE)
      if (m) add(m[1])
    })
    return names
  }

  function renderCommitRow(repoId, c) {
    var sha1 = (c && c.sha1) || ''
    var author = c && c.author ? c.author : {}
    var date = author.date ? new Date(author.date) : null
    var authors = collectAuthors(c)

    return h('div.git-log-row',
      h('a', {href: gitBrowseRoute(repoId, 'commit', sha1)},
        h('code.git-sha', sha1.substr(0, 7))),
      h('a.git-log-title', {href: gitBrowseRoute(repoId, 'commit', sha1)}, c.title || '(no title)'),
      authors.length
        ? h('span.git-log-authors', {title: authors.join(', ')}, authors.join(', '))
        : null,
      date ? h('span.git-log-time', {title: date.toISOString()}, human(date)) : null
    )
  }

  function renderLog(repoId, commits) {
    return h('div.git-commits', commits.map(function (c) {
      return renderCommitRow(repoId, c)
    }))
  }

  function slugifyHeading(text) {
    return String(text || '')
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  }

  function addHeadingAnchors(root) {
    if (!root || !root.querySelectorAll) return
    var headings = root.querySelectorAll('h1, h2, h3, h4, h5, h6')
    var used = {}
    for (var i = 0; i < headings.length; i++) {
      var heading = headings[i]
      if (heading.id) continue
      var base = slugifyHeading(heading.textContent)
      if (!base) continue
      var slug = base
      var n = 1
      while (used[slug]) { slug = base + '-' + (++n) }
      used[slug] = true
      heading.id = slug
      heading.classList.add('git-md-heading')
      var link = h('a.git-md-heading-anchor', {
        href: '#' + slug,
        'aria-label': 'Permalink to ' + heading.textContent,
        title: 'Permalink'
      }, '#')
      heading.insertBefore(link, heading.firstChild)
    }
  }

  function renderReadme(content) {
    var div = h('div.git-readme-content')
    try {
      var md = api.markdown({text: content})
      if (md) { addHeadingAnchors(md); div.appendChild(md); return div }
    } catch (_) {}
    div.appendChild(h('pre', content))
    return div
  }

  // Pick the README from the already-loaded tree entries (preferring .md) and
  // fetch only that blob. Probing fixed filenames logged a 404 for every repo
  // without a README and for each casing that missed.
  var README_ORDER = ['readme.md', 'readme.txt', 'readme']
  function fetchReadme(repoId, ref, entries, cb) {
    var name = null, rank = Infinity
    ;(entries || []).forEach(function (e) {
      if (!e || e.isDir) return
      var r = README_ORDER.indexOf(String(e.name).toLowerCase())
      if (r !== -1 && r < rank) { rank = r; name = e.name }
    })
    if (!name) return cb(null, null)
    fetchJson(gitApiUrl(repoId, 'blob/' + encodeURIComponent(ref) + '/' + name), function (err, data) {
      if (!err && data && data.content != null) return cb(null, data.content)
      cb(null, null)
    })
  }

  // Clone URL lives inside a popover (GitHub-style) so the toolbar stays tidy.
  // One click on the button → reveals the URL + a copy action.
  function renderCloneButton(repoId) {
    var wrapper = h('div.git-clone-button')
    var cloneUrl = window.location.origin + '/git/' + encodeURIComponent(repoId)
    var cloneText = 'git clone ' + cloneUrl

    var copyIcon = h('span.material-symbols-outlined', 'content_copy')
    var copyBtn = h('button.git-clone-popover-copy', {
      type: 'button',
      title: 'Copy clone command',
      'aria-label': 'Copy clone command'
    }, copyIcon)
    copyBtn.addEventListener('click', function () {
      navigator.clipboard.writeText(cloneText).then(function () {
        copyIcon.textContent = 'check'
        setTimeout(function () { copyIcon.textContent = 'content_copy' }, 1000)
      })
    })

    var input = h('input.git-clone-popover-input', {
      type: 'text',
      readonly: true,
      value: cloneUrl,
      spellcheck: 'false',
      onclick: function () { this.select() }
    })

    var popover = h('div.git-clone-popover',
      h('label.git-clone-popover-label', 'Clone with HTTP'),
      h('div.git-clone-popover-row', input, copyBtn))

    var trigger = h('button.git-clone-button-trigger', {
      type: 'button',
      title: 'Show the command to clone this repository',
      'aria-expanded': 'false'
    },
      h('span.material-symbols-outlined.git-clone-button-icon', 'content_copy'),
      h('span.git-clone-button-label', 'Clone'),
      h('span.material-symbols-outlined.git-clone-caret', 'arrow_drop_down'))

    var disposeOutside = null
    function close() {
      if (!wrapper.classList.contains('is-open')) return
      wrapper.classList.remove('is-open')
      trigger.setAttribute('aria-expanded', 'false')
      if (disposeOutside) {
        document.removeEventListener('click', disposeOutside, true)
        disposeOutside = null
      }
    }
    function open() {
      wrapper.classList.add('is-open')
      trigger.setAttribute('aria-expanded', 'true')
      setTimeout(function () { input.focus(); input.select() }, 0)
      disposeOutside = function (ev) {
        if (!wrapper.contains(ev.target)) close()
      }
      document.addEventListener('click', disposeOutside, true)
    }

    trigger.addEventListener('click', function (ev) {
      ev.preventDefault()
      ev.stopPropagation()
      if (wrapper.classList.contains('is-open')) close()
      else open()
    })

    popover.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { close(); trigger.focus() }
    })

    wrapper.appendChild(trigger)
    wrapper.appendChild(popover)
    return wrapper
  }

  function renderRepoToolbar(repoId, ref) {
    return h('div.git-forge-toolbar',
      h('div.git-forge-toolbar-left',
        renderRefPicker(repoId, {screen: 'tree', ref: ref, pathParts: []})),
      h('div.git-forge-toolbar-right',
        renderCloneButton(repoId)))
  }

  // Branch-wide "latest commit" banner. Uses the first entry of `log/<ref>`.
  // TODO: per-directory last-commit requires a log-per-path endpoint on git-server.
  function renderLatestCommitBanner(repoId, ref) {
    var banner = h('div.git-tree-latest-commit')
    fetchJson(gitApiUrl(repoId, 'log/' + encodeURIComponent(ref)), function (err, data) {
      if (err) return
      var c = data && data.commits && data.commits[0]
      if (!c) return
      var sha1 = c.sha1 || ''
      var author = c.author || {}
      var date = author.date ? new Date(author.date) : null
      banner.appendChild(h('a.git-tree-latest-sha',
        {href: gitBrowseRoute(repoId, 'commit', sha1)},
        h('code.git-sha', sha1.substr(0, 7))))
      banner.appendChild(h('a.git-tree-latest-title',
        {href: gitBrowseRoute(repoId, 'commit', sha1), title: c.title || ''},
        c.title || '(no title)'))
      if (author.name) {
        banner.appendChild(h('span.git-tree-latest-author', author.name))
      }
      if (date) {
        banner.appendChild(h('span.git-tree-latest-time',
          {title: date.toISOString()}, human(date)))
      }
    })
    return banner
  }

  // Centered placeholder reusing the feed's empty-state styles. Used when a
  // tree fetch 404s — most often a repo whose objects haven't been replicated
  // to this node yet, or one with no commits at all — so we explain that
  // instead of dumping a raw "Error: HTTP 404".
  function gitEmptyState(opts) {
    return h('div.feed-empty',
      h('span.feed-empty__icon.material-symbols-outlined', opts.icon || 'inventory_2'),
      h('div.feed-empty__title', opts.title),
      opts.body ? h('div.feed-empty__body', opts.body) : null,
      opts.extra || null)
  }

  function renderTreeScreen(repoId, ref, pathParts, container) {
    container.textContent = 'Loading…'
    var apiPath = 'tree/' + encodeURIComponent(ref) +
      (pathParts.length ? '/' + pathParts.join('/') : '')
    fetchJson(gitApiUrl(repoId, apiPath), function (err, data) {
      if (err) {
        container.innerHTML = ''
        if (err.status === 404 && pathParts.length === 0) {
          // Whole repo has nothing browsable at this ref.
          container.appendChild(gitEmptyState({
            icon: 'cloud_off',
            title: 'Nothing to show here yet',
            body: 'This repository has no files at ' + ref + ' on this node — it may ' +
                  'be empty, or its history hasn’t been replicated here yet.',
            extra: renderCloneButton(repoId)
          }))
        } else if (err.status === 404) {
          // A subpath that doesn't exist at this ref.
          container.appendChild(gitEmptyState({
            icon: 'folder_off',
            title: 'Path not found',
            body: 'There’s no “' + pathParts.join('/') + '” at ' + ref + '.'
          }))
        } else {
          container.appendChild(gitEmptyState({
            icon: 'error',
            title: 'Couldn’t load this tree',
            body: err.message
          }))
        }
        return
      }
      var entries = ((data && data.entries) || []).slice().sort(function (a, b) {
        if (a.isDir && !b.isDir) return -1
        if (!a.isDir && b.isDir) return 1
        return a.name.localeCompare(b.name)
      })
      var metaCells = {}
      var rows = entries.map(function (e) {
        var icon  = e.isDir ? 'folder' : 'description'
        var href  = e.isDir
          ? gitBrowseRoute(repoId, 'tree', ref, pathParts.concat([e.name]))
          : gitBrowseRoute(repoId, 'blob', ref, pathParts.concat([e.name]))
        // Message + age cells start empty; populated by the log-per-path fetch below.
        var msgCell = h('td.git-tree-commit')
        var ageCell = h('td.git-tree-age')
        metaCells[e.name] = {msg: msgCell, age: ageCell}
        return h('tr',
          h('td.git-tree-icon', h('span.material-symbols-outlined', icon)),
          h('td.git-tree-name', h('a', {href: href}, e.name)),
          msgCell,
          ageCell)
      })

      // Last commit per direct entry — served by a native git walk on the
      // server, so it can lag the tree listing without blocking it.
      var lpPath = 'log-per-path/' + encodeURIComponent(ref) +
        (pathParts.length ? '/' + pathParts.join('/') : '')
      fetchJson(gitApiUrl(repoId, lpPath), function (err, data) {
        if (err || !data || !data.entries) return
        Object.keys(metaCells).forEach(function (name) {
          var info = data.entries[name]
          if (!info) return
          var cell  = metaCells[name]
          var title = info.title || ''
          var short = title.length > 60 ? title.slice(0, 57) + '…' : title
          cell.msg.appendChild(h('a.git-tree-commit-link', {
            href: gitBrowseRoute(repoId, 'commit', info.sha1),
            title: title
          }, short))
          if (info.date) {
            var d = new Date(info.date)
            cell.age.appendChild(h('span', {title: d.toISOString()}, human(d)))
          }
        })
      })

      var atRoot = pathParts.length === 0
      var browser = h('div.git-browser')

      if (atRoot) {
        browser.appendChild(renderRepoToolbar(repoId, ref))
        browser.appendChild(h('div.git-forge-home-card',
          renderLatestCommitBanner(repoId, ref),
          h('table.git-tree-table', h('tbody', rows))))
      } else {
        browser.appendChild(renderRepoSubheader(repoId, {
          screen: 'tree',
          ref: ref,
          pathParts: pathParts
        }))
        browser.appendChild(renderLatestCommitBanner(repoId, ref))
        browser.appendChild(h('table.git-tree-table', h('tbody', rows)))
      }

      if (atRoot) {
        var readmeEl = h('div')
        fetchReadme(repoId, ref, entries, function (err, content) {
          if (content) {
            readmeEl.className = 'git-readme'
            readmeEl.appendChild(renderReadme(content))
          }
        })
        browser.appendChild(readmeEl)
      }

      container.innerHTML = ''
      container.appendChild(h('div.git-forge-main',
        h('div.git-forge-content', browser)
      ))
    })
  }

  var IMAGE_EXTS = /\.(png|jpg|jpeg|gif|svg|webp|ico|bmp)$/i

  // Line-range selection for blob views lives in the document's `?lines=`
  // query param (the route itself is hash-based, so we can't use `#L12-20`).
  // Format: `?lines=N` or `?lines=N-M`. Updated via history.replaceState so
  // the SPA router (which listens on hashchange) stays quiet.
  function parseLinesParam() {
    var m = (window.location.search || '').match(/[?&]lines=(\d+)(?:-(\d+))?/)
    if (!m) return null
    var a = parseInt(m[1], 10)
    var b = m[2] ? parseInt(m[2], 10) : a
    if (!a) return null
    return { start: Math.min(a, b), end: Math.max(a, b) }
  }

  function writeLinesParam(range) {
    var search = (window.location.search || '').replace(/([?&])lines=[^&]*(&|$)/, function (_, pre, post) {
      return post === '&' ? pre : pre === '?' ? '' : ''
    })
    if (range) {
      var value = range.start === range.end
        ? String(range.start)
        : range.start + '-' + range.end
      search = search ? search + '&lines=' + value : '?lines=' + value
    }
    var url = window.location.pathname + search + window.location.hash
    window.history.replaceState(null, '', url)
  }

  function applyLineHighlight(pre, range) {
    var lines = pre.querySelectorAll('.git-blob-line')
    for (var i = 0; i < lines.length; i++) {
      var n = parseInt(lines[i].getAttribute('data-line'), 10)
      lines[i].classList.toggle('is-highlighted',
        !!(range && n >= range.start && n <= range.end))
    }
  }

  function scrollToLine(pre, n) {
    var el = pre.querySelector('#L' + n)
    if (el && el.scrollIntoView) {
      el.scrollIntoView({ block: 'center' })
    }
  }

  function renderHighlightedBlob(content, fileName) {
    var pre = h('pre.git-blob-content.git-highlighted.git-blob-pane')
    var lines = highlight.intoLines(content, fileName)

    // A trailing newline produces an extra empty line at the end; drop it so
    // line count matches editor expectations.
    if (lines.length > 1 && lines[lines.length - 1].length === 0) {
      lines.pop()
    }

    var currentAnchor = null  // last clicked line, used as shift-click pivot

    lines.forEach(function (nodes, i) {
      var n = i + 1
      var code = h('code.git-blob-line-code')
      nodes.forEach(function (node) { code.appendChild(node) })
      var lineNo = h('a.git-blob-line-no', {
        href: '?lines=' + n + (window.location.hash || ''),
        'data-line': String(n),
        title: 'Shift-click to select range'
      }, String(n))
      lineNo.addEventListener('click', function (ev) {
        ev.preventDefault()
        var range
        if (ev.shiftKey && currentAnchor != null) {
          range = { start: Math.min(currentAnchor, n), end: Math.max(currentAnchor, n) }
        } else {
          currentAnchor = n
          range = { start: n, end: n }
        }
        writeLinesParam(range)
        applyLineHighlight(pre, range)
      })
      var row = h('div.git-blob-line', {
        id: 'L' + n,
        'data-line': String(n)
      }, lineNo, code)
      pre.appendChild(row)
    })

    var range = parseLinesParam()
    if (range) {
      currentAnchor = range.start
      // Apply after the element is in the DOM so scrollIntoView has a layout.
      setTimeout(function () {
        applyLineHighlight(pre, range)
        scrollToLine(pre, range.start)
      }, 0)
    }

    return pre
  }

  function rawBlobUrl(repoId, ref, pathParts) {
    return window.location.origin + '/git/' + encodeURIComponent(repoId) +
      '/raw/' + encodeURIComponent(ref) + '/' + pathParts.map(encodeURIComponent).join('/')
  }

  function formatBytes(n) {
    if (n < 1024) return n + ' B'
    var kb = n / 1024
    if (kb < 100) return kb.toFixed(1) + ' KB'
    if (kb < 1024) return Math.round(kb) + ' KB'
    return (kb / 1024).toFixed(1) + ' MB'
  }

  function byteSize(content) {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(content).length
    }
    return unescape(encodeURIComponent(content)).length
  }

  function renderBlobActionRow(repoId, ref, pathParts, opts) {
    var isImage = opts.variant === 'image'
    var rawHref = rawBlobUrl(repoId, ref, pathParts)
    var meta = null

    if (opts.withMeta && !isImage) {
      meta = h('div.git-blob-meta',
        opts.lineCount + ' lines · ' + formatBytes(opts.byteSize))
    }

    var rawBtn = h('a.git-blob-action', {
      href: rawHref,
      target: '_blank',
      rel: 'noopener'
    },
    h('span.material-symbols-outlined', 'open_in_new'),
    h('span.git-blob-action-label', 'Raw'))

    var copyIcon = h('span.material-symbols-outlined', 'content_copy')
    var copyLabel = h('span.git-blob-action-label', 'Copy path')
    var copyReset = null
    var copyBtn = h('button.git-blob-action', {type: 'button', title: 'Copy this file path to the clipboard'},
      copyIcon,
      copyLabel)
    copyBtn.addEventListener('click', function () {
      var clipboard = navigator.clipboard
      if (!clipboard || !clipboard.writeText) return
      clipboard.writeText(pathParts.join('/')).then(function () {
        if (copyReset) clearTimeout(copyReset)
        copyBtn.classList.add('is-copied')
        copyIcon.textContent = 'check'
        copyLabel.textContent = 'Copied'
        copyReset = setTimeout(function () {
          copyBtn.classList.remove('is-copied')
          copyIcon.textContent = 'content_copy'
          copyLabel.textContent = 'Copy path'
          copyReset = null
        }, 1200)
      }, function () {
        copyBtn.classList.remove('is-copied')
        copyIcon.textContent = 'content_copy'
        copyLabel.textContent = 'Copy path'
      })
    })

    var buttons = [rawBtn]

    // History and Blame are backed by native git on the server and only make
    // sense for text/markdown blobs, not images.
    if (!isImage) {
      buttons.push(h('a.git-blob-action', {
        href: gitBrowseRoute(repoId, 'history', ref, pathParts),
        title: 'Commit history for this file'
      },
      h('span.material-symbols-outlined', 'history'),
      h('span.git-blob-action-label', 'History')))

      buttons.push(h('a.git-blob-action', {
        href: gitBrowseRoute(repoId, 'blame', ref, pathParts),
        title: 'Blame — who last changed each line'
      },
      h('span.material-symbols-outlined', 'manage_search'),
      h('span.git-blob-action-label', 'Blame')))
    }

    buttons.push(copyBtn)

    return h('div.git-blob-actions',
      meta,
      h('div.git-blob-actions-buttons', buttons))
  }

  function renderBlobScreen(repoId, ref, pathParts, container) {
    var fileName = pathParts[pathParts.length - 1] || ''

    if (IMAGE_EXTS.test(fileName)) {
      container.innerHTML = ''
      var main = h('div.git-forge-main',
          h('div.git-forge-content',
          h('div.git-browser',
            renderRepoSubheader(repoId, {
              screen: 'blob',
              ref: ref,
              pathParts: pathParts
            }),
            renderBlobActionRow(repoId, ref, pathParts, {
              variant: 'image',
              withMeta: false
            }),
            h('div.git-image-view.git-blob-pane',
              h('img.git-blob-image', {
                src: rawBlobUrl(repoId, ref, pathParts),
                alt: fileName
              })
            )
          )
        )
      )
      container.appendChild(main)
      return
    }

    container.textContent = 'Loading…'
    var apiPath = 'blob/' + encodeURIComponent(ref) + '/' + pathParts.join('/')
    fetchJson(gitApiUrl(repoId, apiPath), function (err, data) {
      if (err) { container.textContent = 'Error: ' + err.message; return }
      var isMarkdown = /\.(md|markdown)$/i.test(fileName)
      var content = data.content || ''
      var lineCount = content ? content.split('\n').length : 0
      var size = byteSize(content)
      var contentEl

      if (isMarkdown) {
        contentEl = h('div.git-readme.git-blob-pane.git-blob-readme')
        var md = null
        try { md = api.markdown({text: content}) } catch (_) {}
        if (md) addHeadingAnchors(md)
        contentEl.appendChild(md || h('pre.git-blob-content', content))
      } else {
        contentEl = renderHighlightedBlob(content, fileName)
      }

      container.innerHTML = ''
      var main = h('div.git-forge-main',
        h('div.git-forge-content',
          h('div.git-browser',
            renderRepoSubheader(repoId, {
              screen: 'blob',
              ref: ref,
              pathParts: pathParts
            }),
            renderBlobActionRow(repoId, ref, pathParts, {
              variant: isMarkdown ? 'markdown' : 'text',
              withMeta: true,
              lineCount: lineCount,
              byteSize: size
            }),
            contentEl
          )
        )
      )
      container.appendChild(main)
    })
  }

  // Per-path commit history (server runs native `git log -- path`).
  function renderHistoryScreen(repoId, ref, pathParts, container) {
    container.textContent = 'Loading history…'
    var pathStr = pathParts.join('/')
    var apiPath = 'history/' + encodeURIComponent(ref) + '/' + pathParts.join('/')
    fetchJson(gitApiUrl(repoId, apiPath), function (err, data) {
      container.innerHTML = ''
      var inner
      if (err) {
        inner = h('div.git-browser', h('em', 'Error: ' + err.message))
      } else {
        var commits = (data && data.commits) || []
        inner = h('div.git-browser',
          renderRepoSubheader(repoId, {screen: 'blob', ref: ref, pathParts: pathParts}),
          h('div.git-path-head',
            h('span.material-symbols-outlined', 'history'),
            h('span', 'History for '),
            h('a', {href: gitBrowseRoute(repoId, 'blob', ref, pathParts)}, h('code', pathStr))
          ),
          commits.length
            ? renderLog(repoId, commits)
            : h('div.git-empty', 'No history for this path.')
        )
      }
      container.appendChild(h('div.git-forge-main', h('div.git-forge-content', inner)))
    })
  }

  // Per-line blame (server runs native `git blame --porcelain`).
  function renderBlameScreen(repoId, ref, pathParts, container) {
    container.textContent = 'Loading blame…'
    var pathStr = pathParts.join('/')
    var apiPath = 'blame/' + encodeURIComponent(ref) + '/' + pathParts.join('/')
    fetchJson(gitApiUrl(repoId, apiPath), function (err, data) {
      container.innerHTML = ''
      var inner
      if (err) {
        inner = h('div.git-browser', h('em', 'Error: ' + err.message))
      } else {
        var lines = (data && data.lines) || []
        var rows = []
        var prevSha = null
        lines.forEach(function (ln) {
          var newGroup = ln.sha1 !== prevSha
          prevSha = ln.sha1
          var date = ln.date ? new Date(ln.date) : null
          var commitCell = newGroup
            ? h('td.git-blame-commit', {title: ln.summary || ''},
                h('a', {href: gitBrowseRoute(repoId, 'commit', ln.sha1)},
                  h('code.git-sha', (ln.sha1 || '').substr(0, 7))),
                date ? h('span.git-blame-age', human(date)) : null)
            : h('td.git-blame-commit.git-blame-commit-cont')
          rows.push(h('tr.git-blame-row' + (newGroup ? '.git-blame-group-start' : ''),
            commitCell,
            h('td.git-blame-lineno', String(ln.line)),
            h('td.git-blame-code', ln.content)
          ))
        })
        inner = h('div.git-browser',
          renderRepoSubheader(repoId, {screen: 'blob', ref: ref, pathParts: pathParts}),
          h('div.git-path-head',
            h('span.material-symbols-outlined', 'manage_search'),
            h('span', 'Blame for '),
            h('a', {href: gitBrowseRoute(repoId, 'blob', ref, pathParts)}, h('code', pathStr)),
            h('span.git-path-head-sep', ' · '),
            h('a', {href: gitBrowseRoute(repoId, 'history', ref, pathParts)}, 'History')
          ),
          lines.length
            ? h('table.git-blame-table', h('tbody', rows))
            : h('div.git-empty', 'No blame data for this path.')
        )
      }
      container.appendChild(h('div.git-forge-main', h('div.git-forge-content', inner)))
    })
  }

  function renderDiffFile(repoId, sha1, file, commentsMap) {
    var statusLabel = {added: '+', deleted: '−', modified: '~', renamed: '→'}[file.status] || '~'
    var statusClass = 'git-diff-status-' + (file.status || 'modified')

    var body
    if (file.binary) {
      body = h('div.git-diff-binary', 'Binary file')
    } else if (!file.hunks || !file.hunks.length) {
      body = h('div.git-diff-empty', 'No changes')
    } else {
      var rows = []
      file.hunks.forEach(function (hunk) {
        rows.push(h('tr.git-diff-hunk-header', h('td', {colSpan: 4}, '@@ -' + hunk.oldStart + ' +' + hunk.newStart + ' @@')))
        
        hunk.lines.forEach(function (line) {
          var cls = 'git-diff-line git-diff-line-' + line.type
          var oldLn = line.oldLn != null ? String(line.oldLn) : ''
          var newLn = line.newLn != null ? String(line.newLn) : ''
          var prefix = line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '
          
          var addCommentBtn = h('span.git-diff-add-comment-btn', '+')
          
          var lineRow = h('tr', {className: cls},
            h('td.git-diff-ln', oldLn),
            h('td.git-diff-ln', newLn, addCommentBtn),
            h('td.git-diff-prefix', prefix),
            h('td.git-diff-code', line.text)
          )
          
          rows.push(lineRow)

          var lineKey = file.path + ':' + (line.newLn || line.oldLn)
          if (commentsMap && commentsMap[lineKey]) {
            commentsMap[lineKey].forEach(function (link) {
              var lc = link.value.content
              rows.push(h('tr.git-diff-inline-comment-row', h('td', {colSpan: 4},
                h('div.git-diff-inline-comment',
                  h('div.git-diff-inline-comment-header',
                    h('strong', api.avatar_name(link.value.author)),
                    ' · ', human(new Date(link.value.timestamp))
                  ),
                  h('div.git-diff-inline-comment-body', lc.text || '')
                )
              )))
            })
          }

          addCommentBtn.onclick = function () {
            var composerWrap = h('div.git-diff-inline-compose')
            var composerRow = h('tr.git-diff-inline-comment-row', h('td', {colSpan: 4}, composerWrap))
            lineRow.parentNode.insertBefore(composerRow, lineRow.nextSibling)
            
            composerWrap.appendChild(api.message_compose(
              { type: 'git-comment', repo: repoId, commit: sha1, path: file.path, line: line.newLn || line.oldLn },
              function (v) { return v },
              function (err, msg) {
                if (err) { alert(err); composerRow.remove(); return }
                if (!msg) { composerRow.remove(); return }
                var lc = msg.value.content
                var newComment = h('tr.git-diff-inline-comment-row', h('td', {colSpan: 4},
                  h('div.git-diff-inline-comment',
                    h('div.git-diff-inline-comment-header',
                      h('strong', api.avatar_name(msg.value.author)),
                      ' · just now'
                    ),
                    h('div.git-diff-inline-comment-body', lc.text || '')
                  )
                ))
                composerRow.parentNode.replaceChild(newComment, composerRow)
              }
            ))
          }
        })
      })
      body = h('table.git-diff-table', h('tbody', rows))
    }

    var header = h('div.git-diff-file-header',
      h('span.git-diff-status.' + statusClass, statusLabel),
      h('code.git-diff-path', file.path),
      file.truncated ? h('span.git-diff-truncated', ' (truncated)') : null
    )

    return h('details.git-diff-file', {open: true}, h('summary', header), body)
  }

  function renderCommitScreen(repoId, sha1, container) {
    container.textContent = 'Loading…'

    var commitData = null
    var diffData   = null
    var commentsMap = {}
    var pending    = 3

    function tryRender() {
      if (--pending !== 0) return
      if (!commitData) return

      var c    = commitData
      var date = (c.author && c.author.date) ? new Date(c.author.date) : null

      var diffEl = h('div.git-diff')
      if (diffData && diffData.files && diffData.files.length) {
        diffData.files.forEach(function (f) {
          diffEl.appendChild(renderDiffFile(repoId, sha1, f, commentsMap))
        })
      } else {
        diffEl.appendChild(h('em', 'Diff not available'))
      }

      container.innerHTML = ''
      container.appendChild(h('div.git-forge-main',
        h('div.git-forge-content',
          h('div.git-browser',
            renderRepoSubheader(repoId, {
              screen: 'commit',
              pathParts: []
            }),
            h('h4.git-section-title', c.title || ''),
            h('div.git-commit-meta',
              h('code.git-sha', sha1.substr(0, 7)),
              ' by ', (c.author && c.author.name) || '',
              date ? [' · ', human(date)] : '',
              c.parents && c.parents.length
                ? [' · parent: ', h('a', {
                    href: gitBrowseRoute(repoId, 'commit', c.parents[0])
                  }, c.parents[0].substr(0, 7))]
                : ''
            ),
            c.body ? h('pre.git-commit-body', c.body) : null,
            h('h4.git-section-title', 'Changes'),
            diffEl
          ))
      ))
    }

    fetchJson(gitApiUrl(repoId, 'commit/' + sha1), function (err, data) {
      if (err) { container.textContent = 'Error: ' + err.message; pending = 0; return }
      commitData = data
      tryRender()
    })

    fetchJson(gitApiUrl(repoId, 'diff/' + sha1), function (err, data) {
      diffData = err ? null : data
      tryRender()
    })

    pull(
      api.sbot_links({dest: repoId, rel: 'repo', values: true, reverse: true}),
      pull.filter(function (link) {
        return link.value.content.type === 'git-comment' &&
               link.value.content.commit === sha1
      }),
      pull.collect(function (err, links) {
        if (!err && links) {
          links.forEach(function (link) {
            var lc = link.value.content
            if (lc.path && lc.line) {
              var key = lc.path + ':' + lc.line
              if (!commentsMap[key]) commentsMap[key] = []
              commentsMap[key].push(link)
            }
          })
        }
        tryRender()
      })
    )
  }

  function renderListScreen(repoId, type, container) {
    var isPR = type === 'pull-request'
    var btnText = isPR ? 'New Pull Request' : 'New Issue'
    
    var list = h('div.git-forge-list', h('div.git-forge-list-empty', 'Loading ' + (isPR ? 'pull requests' : 'issues') + '…'))
    var composerWrap = h('div')

    container.innerHTML = ''
    container.appendChild(h('div',
      h('div.git-forge-list-actions',
        h('button.git-forge-btn-primary', {
          title: isPR ? 'Open a new pull request' : 'Open a new issue',
          onclick: function () {
            this.style.display = 'none'
            composerWrap.appendChild(api.message_compose(
              { type: type, project: repoId },
              function (val) { return val },
              function (err, msg) {
                if (err) { alert(err); this.style.display = ''; return }
                if (!msg) { this.style.display = ''; return }
                renderListScreen(repoId, type, container)
              }
            ))
          }
        }, btnText)
      ),
      composerWrap,
      list
    ))

    var count = 0
    pull(
      api.sbot_links({dest: repoId, rel: 'project', values: true, reverse: true}),
      pull.filter(function (link) {
        return link.value.content.type === type
      }),
      pull.drain(function (link) {
        if (count === 0) list.innerHTML = ''
        count++

        var c = link.value.content
        var title = c.title || (c.text ? (c.text.length > 80 ? c.text.substr(0, 80) + '…' : c.text) : link.key)
        var author = link.value.author
        var date = new Date(link.value.timestamp)
        
        var stateEl = h('span.git-state-badge', '...')
        getIssueState(link.key, function (err, state) {
          if (!err) {
            stateEl.textContent = state
            stateEl.className = 'git-state-badge git-state-' + state
          }
        })

        list.appendChild(h('div.git-forge-list-item',
          api.avatar_image(author, 'thumbnail'),
          h('div.git-forge-list-item-main',
            h('a.git-forge-list-item-title', {href: '#' + link.key}, title),
            h('div.git-forge-list-item-meta',
              stateEl,
              ' #', link.key.substr(1, 6),
              ' opened ', human(date), ' by ', api.avatar_name(author)
            )
          )
        ))
      }, function (err) {
        if (err) console.error(err)
        if (count === 0) { list.innerHTML = ''; list.appendChild(h('div.git-forge-list-empty', 'No ' + (isPR ? 'pull requests' : 'issues') + ' found.')) }
      })
    )
  }

  function renderActivityScreen(repoId, container) {
    container.innerHTML = ''
    container.appendChild(h('div.git-forge-list-empty', 'Fetching mesh activity…'))

    var count = 0
    pull(
      api.sbot_links({dest: repoId, values: true, reverse: true}),
      pull.filter(function (link) {
        return link && link.value && link.value.content && link.value.content.type
      }),
      pull.drain(function (link) {
        var rendered = api.message_render(link)
        if (!rendered) return
        if (count === 0) container.innerHTML = ''
        count++
        container.appendChild(rendered)
      }, function (err) {
        if (err) console.error(err)
        if (count === 0) {
          container.innerHTML = ''
          container.appendChild(h('div.git-forge-list-empty', 'No mesh activity recorded for this repo yet.'))
        }
      })
    )
  }

  function renderSettingsScreen(repoId, container) {
    container.innerHTML = ''
    container.appendChild(h('div.git-forge-card',
      h('div.git-forge-card-header', 'Repository Settings'),
      h('div.git-forge-card-body',
        h('p', 'As the owner of this repository, you can manage its metadata here.'),
        h('hr'),
        h('div',
          h('h4', 'Update Name'),
          api.message_compose({ type: 'about', about: repoId }, function (val) {
            return { type: 'about', about: repoId, name: val.text }
          }, function (err, msg) {
            if (err) alert(err)
            if (msg) alert('Name updated on the mesh!')
          })
        ),
        h('hr', {style: {margin: '24px 0'}}),
        h('div',
          h('h4', {style: {color: '#cf222e'}}, 'Danger Zone'),
          h('p', 'Currently, repositories cannot be deleted from the SSB log, but you can signal that it is archived.'),
          h('button.git-forge-btn-primary', {
            style: {background: '#cf222e'},
            title: 'Signal that this repository is archived',
            onclick: function () { alert('Archiving logic will be implemented in a future update.') }
          }, 'Archive Repository')
        )
      )
    ))
  }

  return {
    screen_view: function (route) {
      if (route.indexOf('git/') !== 0) return

      var parts = route.split('/')
      if (parts.length < 2) return

      var repoId = parts[1]
      try {
        repoId = decodeURIComponent(repoId)
      } catch (err) {
        return
      }
      if (!repoId) return

      var sub = parts[2]
      var content = h('div')
      var outer = h('div.column.scroller', {style: {overflow: 'auto'}},
        h('div.scroller__wrapper', layout(repoId, sub, content))
      )

      if (!sub) {
        content.textContent = 'Loading…'
        getRepoRefs(repoId, function (err, data) {
          if (err) {
            content.innerHTML = ''
            content.appendChild(gitEmptyState({
              icon: err.status === 404 ? 'cloud_off' : 'error',
              title: err.status === 404 ? 'Nothing to show here yet' : 'Couldn’t load this repository',
              body: err.status === 404
                ? 'This repository hasn’t been replicated to this node yet, so there’s nothing to browse.'
                : err.message,
              extra: renderCloneButton(repoId)
            }))
            return
          }
          renderTreeScreen(repoId, getDefaultRef(data), [], content)
        })
      } else if (sub === 'tree') {
        var treeRef   = parts[3] ? decodeURIComponent(parts[3]) : 'HEAD'
        var treePath  = parts.slice(4).map(decodeURIComponent)
        renderTreeScreen(repoId, treeRef, treePath, content)
      } else if (sub === 'blob') {
        var blobRef   = parts[3] ? decodeURIComponent(parts[3]) : 'HEAD'
        var blobPath  = parts.slice(4).map(decodeURIComponent)
        renderBlobScreen(repoId, blobRef, blobPath, content)
      } else if (sub === 'history') {
        var histRef  = parts[3] ? decodeURIComponent(parts[3]) : 'HEAD'
        var histPath = parts.slice(4).map(decodeURIComponent)
        renderHistoryScreen(repoId, histRef, histPath, content)
      } else if (sub === 'blame') {
        var blameRef  = parts[3] ? decodeURIComponent(parts[3]) : 'HEAD'
        var blamePath = parts.slice(4).map(decodeURIComponent)
        renderBlameScreen(repoId, blameRef, blamePath, content)
      } else if (sub === 'commit') {
        renderCommitScreen(repoId, parts[3] || '', content)
      } else if (sub === 'log') {
        var logRef = parts[3] ? decodeURIComponent(parts[3]) : 'HEAD'
        content.textContent = 'Loading log…'
        fetchJson(gitApiUrl(repoId, 'log/' + encodeURIComponent(logRef)), function (err, data) {
          content.innerHTML = ''
          if (err) {
            content.appendChild(h('div.git-forge-main',
              h('div.git-forge-content',
                h('div.git-browser', h('em', 'Error: ' + err.message))
              )
            ))
          } else {
            content.appendChild(h('div.git-forge-main',
              h('div.git-forge-content',
                h('div.git-browser',
                  renderRepoSubheader(repoId, {
                    screen: 'log',
                    ref: logRef === 'HEAD' ? null : logRef,
                    pathParts: []
                  }),
                  renderLog(repoId, (data && data.commits) || [])
                )
              )
            ))
          }
        })
      } else if (sub === 'issues') {
        renderListScreen(repoId, 'issue', content)
      } else if (sub === 'pulls') {
        renderListScreen(repoId, 'pull-request', content)
      } else if (sub === 'activity') {
        renderActivityScreen(repoId, content)
      } else if (sub === 'settings') {
        renderSettingsScreen(repoId, content)
      }

      return outer
    }
  }
}
