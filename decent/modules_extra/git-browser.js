'use strict'
var h         = require('hyperscript')
var pull      = require('pull-stream')
var human     = require('human-time')
var highlight = require('../highlight')

exports.needs = {
  markdown:            'first',
  message_compose:     'first',
  message_render:      'first',
  sbot_links:          'first',
  sbot_messagesByType: 'first',
  avatar_name:         'first'
}

exports.gives = {
  screen_view: true
}

exports.create = function (api) {

  function fetchJson(url, cb) {
    var xhr = new XMLHttpRequest()
    xhr.open('GET', url)
    xhr.onload = function () {
      if (xhr.status !== 200) return cb(new Error('HTTP ' + xhr.status))
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

  function breadcrumbs(repoId, ref, pathParts) {
    var crumbs = [h('a', {href: gitBrowseRoute(repoId)}, 'repo')]
    crumbs.push(h('span.git-bc-sep', ' / '))
    crumbs.push(h('a', {href: gitBrowseRoute(repoId, 'tree', ref, [])}, ref))
    for (var i = 0; i < pathParts.length; i++) {
      crumbs.push(h('span.git-bc-sep', ' / '))
      crumbs.push(h('a', {href: gitBrowseRoute(repoId, 'tree', ref, pathParts.slice(0, i + 1))}, pathParts[i]))
    }
    return h('div.git-breadcrumbs', crumbs)
  }

  function renderCommitRow(repoId, c) {
    var author = c && c.author ? c.author : {}
    var sha1 = (c && c.sha1) || ''
    var date = author.date ? new Date(author.date) : null
    return h('div.git-commit',
      h('a', {href: gitBrowseRoute(repoId, 'commit', sha1)},
        h('code.git-sha', sha1.substr(0, 7))),
      h('span.git-commit-title', ' ' + (c.title || '')),
      h('span.git-commit-meta',
        ' — ', author.name || '',
        date ? [', ', human(date)] : ''))
  }

  function renderLog(repoId, commits) {
    return h('div.git-commits', commits.map(function (c) {
      return renderCommitRow(repoId, c)
    }))
  }

  function renderReadme(content) {
    var div = h('div.git-readme-content')
    try {
      var md = api.markdown({text: content})
      if (md) { div.appendChild(md); return div }
    } catch (_) {}
    div.appendChild(h('pre', content))
    return div
  }

  function fetchReadme(repoId, ref, cb) {
    var candidates = ['README.md', 'readme.md', 'Readme.md', 'README.txt', 'README']
    var i = 0
    function tryNext() {
      if (i >= candidates.length) return cb(null, null)
      var name = candidates[i++]
      fetchJson(gitApiUrl(repoId, 'blob/' + encodeURIComponent(ref) + '/' + name), function (err, data) {
        if (!err && data && data.content != null) return cb(null, data.content)
        tryNext()
      })
    }
    tryNext()
  }

  function renderRepoScreen(repoId, container) {
    container.textContent = 'Loading…'

    fetchJson(gitApiUrl(repoId, 'refs'), function (err, data) {
      if (err) { container.textContent = 'Error: ' + err.message; return }

      var refs     = (data && data.refs)    || []
      var symrefs  = (data && data.symrefs) || []
      var defaultRef = 'HEAD'
      var symHead = null
      for (var i = 0; i < symrefs.length; i++) {
        if (symrefs[i].name === 'HEAD') { symHead = symrefs[i]; break }
      }
      if (symHead && symHead.ref) {
        defaultRef = symHead.ref.replace(/^refs\/heads\//, '')
      } else {
        for (var j = 0; j < refs.length; j++) {
          var m = /^refs\/heads\/(.+)$/.exec(refs[j].name)
          if (m) { defaultRef = m[1]; break }
        }
      }

      var headPills = []
      for (var k = 0; k < refs.length; k++) {
        var bm = /^refs\/heads\/(.+)$/.exec(refs[k].name)
        if (bm) headPills.push(h('a.git-branch-badge',
          {href: gitBrowseRoute(repoId, 'tree', bm[1])}, bm[1]))
      }

      var logEl  = h('div', 'Loading log…')
      var readmeEl = h('div')

      fetchJson(gitApiUrl(repoId, 'log/' + encodeURIComponent(defaultRef)), function (err, logData) {
        logEl.innerHTML = ''
        if (err) {
          logEl.appendChild(h('em', 'Could not load log'))
        } else {
          logEl.appendChild(renderLog(repoId, (logData && logData.commits) || []))
        }
      })

      fetchReadme(repoId, defaultRef, function (err, content) {
        if (content) {
          readmeEl.className = 'git-readme'
          readmeEl.appendChild(renderReadme(content))
        }
      })

      container.innerHTML = ''
      container.appendChild(h('div.git-browser',
        h('div.git-browser-header',
          headPills.length ? headPills : h('em', 'No branches'),
          ' ',
          h('a.git-browse-link', {href: gitBrowseRoute(repoId, 'tree', defaultRef)}, 'Browse ▸')
        ),
        readmeEl,
        h('h4.git-section-title', 'Recent commits on ', h('span.git-branch-badge', defaultRef)),
        logEl
      ))
    })
  }

  function renderBranchBar(repoId, currentRef) {
    var bar = h('div.git-branch-bar')
    fetchJson(gitApiUrl(repoId, 'refs'), function (err, data) {
      if (err) return
      var refs = ((data && data.refs) || []).filter(function (r) {
        return /^refs\/heads\//.test(r.name)
      })
      if (!refs.length) return
      bar.appendChild(h('span.git-label', 'Branch: '))
      refs.slice(0, 10).forEach(function (r) {
        var branch = r.name.replace(/^refs\/heads\//, '')
        var active = branch === currentRef
        bar.appendChild(h('a' + (active ? '.git-branch-badge.git-branch-active' : '.git-branch-badge'), {
          href: gitBrowseRoute(repoId, 'tree', branch, [])
        }, branch))
        bar.appendChild(document.createTextNode(' '))
      })
    })
    return bar
  }

  function renderTreeScreen(repoId, ref, pathParts, container) {
    container.textContent = 'Loading…'
    var apiPath = 'tree/' + encodeURIComponent(ref) +
      (pathParts.length ? '/' + pathParts.join('/') : '')
    fetchJson(gitApiUrl(repoId, apiPath), function (err, data) {
      if (err) { container.textContent = 'Error: ' + err.message; return }
      var entries = (data && data.entries) || []
      var rows = entries.map(function (e) {
        var icon  = e.isDir ? '▸' : ' '
        var href  = e.isDir
          ? gitBrowseRoute(repoId, 'tree', ref, pathParts.concat([e.name]))
          : gitBrowseRoute(repoId, 'blob', ref, pathParts.concat([e.name]))
        return h('tr',
          h('td.git-tree-icon', icon),
          h('td.git-tree-name', h('a', {href: href}, e.name)))
      })
      container.innerHTML = ''
      container.appendChild(h('div.git-browser',
        renderBranchBar(repoId, ref),
        breadcrumbs(repoId, ref, pathParts),
        h('table.git-tree-table', h('tbody', rows))
      ))
    })
  }

  var IMAGE_EXTS = /\.(png|jpg|jpeg|gif|svg|webp|ico|bmp)$/i

  function rawBlobUrl(repoId, ref, pathParts) {
    return window.location.origin + '/git/' + encodeURIComponent(repoId) +
      '/raw/' + encodeURIComponent(ref) + '/' + pathParts.map(encodeURIComponent).join('/')
  }

  function renderBlobScreen(repoId, ref, pathParts, container) {
    var fileName = pathParts[pathParts.length - 1] || ''

    // Images: serve via raw endpoint, no JSON fetch needed
    if (IMAGE_EXTS.test(fileName)) {
      container.innerHTML = ''
      container.appendChild(h('div.git-browser',
        breadcrumbs(repoId, ref, pathParts),
        h('div.git-image-view',
          h('img.git-blob-image', {
            src: rawBlobUrl(repoId, ref, pathParts),
            alt: fileName
          })
        )
      ))
      return
    }

    container.textContent = 'Loading…'
    var apiPath = 'blob/' + encodeURIComponent(ref) + '/' + pathParts.join('/')
    fetchJson(gitApiUrl(repoId, apiPath), function (err, data) {
      if (err) { container.textContent = 'Error: ' + err.message; return }
      var isMarkdown = /\.(md|markdown)$/i.test(fileName)
      var contentEl

      if (isMarkdown) {
        contentEl = h('div.git-readme')
        var md = null
        try { md = api.markdown({text: data.content}) } catch (_) {}
        contentEl.appendChild(md || h('pre.git-blob-content', data.content))
      } else {
        // Syntax-highlighted code view
        var pre = h('pre.git-blob-content.git-highlighted')
        var code = h('code')
        code.innerHTML = highlight(data.content || '', fileName)
        pre.appendChild(code)
        contentEl = pre
      }

      container.innerHTML = ''
      container.appendChild(h('div.git-browser',
        breadcrumbs(repoId, ref, pathParts),
        contentEl
      ))
    })
  }

  function renderDiffFile(file) {
    var statusLabel = {added: '+', deleted: '−', modified: '~', renamed: '→'}[file.status] || '~'
    var statusClass = 'git-diff-status-' + (file.status || 'modified')

    var body
    if (file.binary) {
      body = h('div.git-diff-binary', 'Binary file')
    } else if (!file.hunks || !file.hunks.length) {
      body = h('div.git-diff-empty', 'No changes')
    } else {
        var hunkEls = file.hunks.map(function (hunk) {
          var lineEls = hunk.lines.map(function (line) {
            var cls = 'git-diff-line git-diff-line-' + line.type
            var oldLn = line.oldLn != null ? String(line.oldLn) : ''
            var newLn = line.newLn != null ? String(line.newLn) : ''
            var prefix = line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '
            return h('tr', {className: cls},
              h('td.git-diff-ln', oldLn),
              h('td.git-diff-ln', newLn),
              h('td.git-diff-prefix', prefix),
            h('td.git-diff-code', line.text))
        })
        var hunkHeader = '@@ -' + hunk.oldStart + ' +' + hunk.newStart + ' @@'
        return [
          h('tr.git-diff-hunk-header', h('td', {colspan: '4'}, hunkHeader)),
          lineEls
        ]
      })
      body = h('table.git-diff-table', h('tbody', hunkEls))
    }

    var header = h('div.git-diff-file-header',
      h('span.git-diff-status.' + statusClass, statusLabel),
      h('code.git-diff-path', file.path),
      file.truncated ? h('span.git-diff-truncated', ' (truncated)') : null
    )

    var details = h('details.git-diff-file', {open: true}, h('summary', header), body)
    return details
  }

  function renderCommitScreen(repoId, sha1, container) {
    container.textContent = 'Loading…'

    var commitData = null
    var diffData   = null
    var pending    = 2

    function tryRender() {
      if (--pending !== 0) return
      if (!commitData) return  // error already shown

      var c    = commitData
      var date = (c.author && c.author.date) ? new Date(c.author.date) : null

      // Diff section
      var diffEl = h('div.git-diff')
      if (diffData && diffData.files && diffData.files.length) {
        var stats = diffData.files.reduce(function (acc, f) {
          if (f.hunks) f.hunks.forEach(function (hunk) {
            hunk.lines.forEach(function (l) {
              if (l.type === 'add') acc.add++
              else if (l.type === 'del') acc.del++
            })
          })
          return acc
        }, {add: 0, del: 0})
        diffEl.appendChild(h('div.git-diff-stats',
          h('span.git-diff-stat-files', diffData.files.length + ' file' + (diffData.files.length !== 1 ? 's' : '') + ' changed'),
          ' ',
          stats.add ? h('span.git-diff-stat-add', '+' + stats.add) : null,
          stats.del ? h('span.git-diff-stat-del', ' −' + stats.del) : null
        ))
        diffData.files.forEach(function (f) {
          diffEl.appendChild(renderDiffFile(f))
        })
      } else {
        diffEl.appendChild(h('em', 'Diff not available'))
      }

      // Comment section
      var commentsEl   = h('div.git-review-comments')
      var commentFormEl = h('div.git-review-compose')

      pull(
        api.sbot_links({dest: repoId, rel: 'repo', values: true, reverse: true}),
        pull.filter(function (link) {
          return link.value.content.type === 'git-comment' &&
                 link.value.content.commit === sha1
        }),
        pull.drain(function (link) {
          var lc = link.value.content
          var commentDate = new Date(link.value.timestamp)
          var locLabel = lc.path
            ? h('code.git-sha', lc.path + (lc.line != null ? ':' + lc.line : ''))
            : null
          commentsEl.appendChild(h('div.git-review-comment',
            h('div.git-review-comment-header',
              h('strong', api.avatar_name(link.value.author)),
              locLabel ? [' ', locLabel] : '',
              ' · ', human(commentDate)
            ),
            h('div.git-review-comment-body', lc.text || '')
          ))
        }, function (err) {
          if (err) console.error('git-comment load error', err)
        })
      )

      commentFormEl.appendChild(h('div',
        h('a.git-review-add-comment', {
          href: '#',
          onclick: function (e) {
            e.preventDefault()
            var el = this
            el.style.display = 'none'
            commentFormEl.appendChild(api.message_compose(
              {type: 'git-comment', repo: repoId, commit: sha1},
              function (value) { return value },
              function (err, msg) {
                if (err) { alert(err); el.style.display = ''; return }
                if (!msg) { el.style.display = ''; return }
                var lc = msg.value.content
                commentsEl.appendChild(h('div.git-review-comment',
                  h('div.git-review-comment-header',
                    h('strong', api.avatar_name(msg.value.author)),
                    lc.path ? [' ', h('code.git-sha', lc.path + (lc.line != null ? ':' + lc.line : ''))] : ''
                  ),
                  h('div.git-review-comment-body', lc.text || '')
                ))
                el.style.display = ''
              }
            ))
          }
        }, 'Add review comment…')
      ))

      container.innerHTML = ''
      container.appendChild(h('div.git-browser',
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
        diffEl,
        h('h4.git-section-title', 'Review comments'),
        commentsEl,
        commentFormEl
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
  }

  return {
    screen_view: function (route) {
      if (route.indexOf('git/') !== 0) return

      var parts = route.split('/')
      if (parts.length < 2) return

      var repoId
      try { repoId = decodeURIComponent(parts[1]) } catch (_) { return }

      var sub = parts[2]

      var wrapper = h('div.scroller__wrapper')
      var outer   = h('div.column.scroller', {style: {overflow: 'auto'}}, wrapper)

      if (!sub) {
        renderRepoScreen(repoId, wrapper)
      } else if (sub === 'tree') {
        var treeRef   = parts[3] ? decodeURIComponent(parts[3]) : 'HEAD'
        var treePath  = parts.slice(4).map(decodeURIComponent)
        renderTreeScreen(repoId, treeRef, treePath, wrapper)
      } else if (sub === 'blob') {
        var blobRef   = parts[3] ? decodeURIComponent(parts[3]) : 'HEAD'
        var blobPath  = parts.slice(4).map(decodeURIComponent)
        renderBlobScreen(repoId, blobRef, blobPath, wrapper)
      } else if (sub === 'commit') {
        renderCommitScreen(repoId, parts[3] || '', wrapper)
      } else if (sub === 'log') {
        var logRef = parts[3] ? decodeURIComponent(parts[3]) : 'HEAD'
        // Full log view — just render a log screen
        var logWrapper = wrapper
        logWrapper.textContent = 'Loading…'
        fetchJson(gitApiUrl(repoId, 'log/' + encodeURIComponent(logRef)), function (err, data) {
          logWrapper.innerHTML = ''
          if (err) {
            logWrapper.appendChild(h('div.git-browser', h('em', 'Error: ' + err.message)))
          } else {
            logWrapper.appendChild(h('div.git-browser',
              h('h4.git-section-title', 'Log: ', h('span.git-branch-badge', logRef)),
              renderLog(repoId, (data && data.commits) || [])
            ))
          }
        })
      }

      return outer
    }
  }
}
