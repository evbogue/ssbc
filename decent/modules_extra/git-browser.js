'use strict'
var h         = require('hyperscript')
var pull      = require('pull-stream')
var human     = require('human-time')
var highlight = require('../highlight')
var selfId    = require('../keys').id

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

      var tabs = [
        h('a.git-forge-tab', {
          href: gitBrowseRoute(repoId),
          className: (!sub || sub === 'tree' || sub === 'blob') ? 'active' : ''
        }, h('span.git-forge-tab-icon', '📄'), ' Code'),
        h('a.git-forge-tab', {
          href: gitBrowseRoute(repoId, 'log'),
          className: (sub === 'log' || sub === 'commit') ? 'active' : ''
        }, h('span.git-forge-tab-icon', '🕒'), ' Commits'),
        h('a.git-forge-tab', {
          href: gitBrowseRoute(repoId, 'issues'),
          className: sub === 'issues' ? 'active' : ''
        }, h('span.git-forge-tab-icon', '⊙'), ' Issues'),
        h('a.git-forge-tab', {
          href: gitBrowseRoute(repoId, 'pulls'),
          className: sub === 'pulls' ? 'active' : ''
        }, h('span.git-forge-tab-icon', '⇅'), ' Pull Requests'),
        h('a.git-forge-tab', {
          href: gitBrowseRoute(repoId, 'activity'),
          className: sub === 'activity' ? 'active' : ''
        }, h('span.git-forge-tab-icon', '📈'), ' Activity')
      ]

      if (author === selfId) {
        tabs.push(h('a.git-forge-tab', {
          href: gitBrowseRoute(repoId, 'settings'),
          className: sub === 'settings' ? 'active' : ''
        }, h('span.git-forge-tab-icon', '⚙'), ' Settings'))
      }

      header.appendChild(h('div',
        h('div.git-forge-repo-title',
          h('span', api.avatar_image(author, 'thumbnail')),
          h('span', api.avatar_name(author)),
          h('span.git-forge-sep', ' / '),
          h('a', {href: gitBrowseRoute(repoId)}, h('strong', name))
        ),
        h('div.git-forge-tabs', tabs)
      ))
    })

    return wrapper
  }

  function renderSidebar(repoId, ref, currentPathParts) {
    var sidebar = h('div.git-forge-sidebar', 
      h('div.git-sidebar-header', 'Files'),
      h('div.git-sidebar-tree', 'Loading…')
    )
    var treeEl = sidebar.querySelector('.git-sidebar-tree')

    fetchJson(gitApiUrl(repoId, 'tree/' + encodeURIComponent(ref)), function (err, data) {
      if (err) { treeEl.textContent = 'Error loading tree'; return }
      treeEl.innerHTML = ''
      var entries = (data && data.entries) || []
      
      entries.forEach(function (e) {
        var href = e.isDir
          ? gitBrowseRoute(repoId, 'tree', ref, [e.name])
          : gitBrowseRoute(repoId, 'blob', ref, [e.name])
        
        var isActive = currentPathParts && currentPathParts[0] === e.name
        
        treeEl.appendChild(h('a.git-sidebar-item', {
          href: href,
          className: isActive ? 'active' : ''
        }, 
          h('span.git-sidebar-icon', e.isDir ? '📁' : '📄'),
          e.name
        ))
      })
    })

    return sidebar
  }

  function renderCommitRow(repoId, c) {
    var author = c && c.author ? c.author : {}
    var sha1 = (c && c.sha1) || ''
    var date = author.date ? new Date(author.date) : null
    
    var status = h('span.git-mesh-status', '...')
    fetchJson(gitApiUrl(repoId, 'commit/' + sha1), function (err) {
      if (err) {
        status.textContent = 'Syncing'
        status.className = 'git-mesh-status remote'
      } else {
        status.textContent = 'Local'
        status.className = 'git-mesh-status local'
      }
    })

    return h('div.git-commit',
      h('a', {href: gitBrowseRoute(repoId, 'commit', sha1)},
        h('code.git-sha', sha1.substr(0, 7))),
      h('span.git-commit-title', ' ' + (c.title || '')),
      status,
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
      var defaultRef = 'HEAD'
      var symHead = (data && data.symrefs && data.symrefs.find(r => r.name === 'HEAD'))
      if (symHead && symHead.ref) {
        defaultRef = symHead.ref.replace(/^refs\/heads\//, '')
      } else {
        var firstHead = refs.find(r => /^refs\/heads\/(.+)$/.test(r.name))
        if (firstHead) defaultRef = firstHead.name.replace(/^refs\/heads\//, '')
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
      var main = h('div.git-forge-main',
        renderSidebar(repoId, defaultRef, []),
        h('div.git-forge-content',
          h('div.git-browser',
            h('div.git-forge-repo-meta',
              h('span.git-forge-repo-meta-item', h('strong', 'Default Branch: '), h('span.git-branch-badge', defaultRef)),
              h('span.git-forge-repo-meta-item', h('strong', 'Clone locally: '), h('code.git-clone-input', 'git clone ' + window.location.origin + '/git/' + encodeURIComponent(repoId)))
            ),
            readmeEl,
            h('h4.git-section-title', 'Latest Activity'),
            logEl
          )
        )
      )
      container.appendChild(main)
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
        var icon  = e.isDir ? '📁' : '📄'
        var href  = e.isDir
          ? gitBrowseRoute(repoId, 'tree', ref, pathParts.concat([e.name]))
          : gitBrowseRoute(repoId, 'blob', ref, pathParts.concat([e.name]))
        return h('tr',
          h('td.git-tree-icon', icon),
          h('td.git-tree-name', h('a', {href: href}, e.name)),
          h('td.git-tree-meta', ' '))
      })
      
      container.innerHTML = ''
      var main = h('div.git-forge-main',
        renderSidebar(repoId, ref, pathParts),
        h('div.git-forge-content',
          h('div.git-browser',
            renderBranchBar(repoId, ref),
            breadcrumbs(repoId, ref, pathParts),
            h('table.git-tree-table', h('tbody', rows))
          )
        )
      )
      container.appendChild(main)
    })
  }

  var IMAGE_EXTS = /\.(png|jpg|jpeg|gif|svg|webp|ico|bmp)$/i

  function rawBlobUrl(repoId, ref, pathParts) {
    return window.location.origin + '/git/' + encodeURIComponent(repoId) +
      '/raw/' + encodeURIComponent(ref) + '/' + pathParts.map(encodeURIComponent).join('/')
  }

  function renderBlobScreen(repoId, ref, pathParts, container) {
    var fileName = pathParts[pathParts.length - 1] || ''

    if (IMAGE_EXTS.test(fileName)) {
      container.innerHTML = ''
      var main = h('div.git-forge-main',
        renderSidebar(repoId, ref, pathParts),
        h('div.git-forge-content',
          h('div.git-browser',
            breadcrumbs(repoId, ref, pathParts),
            h('div.git-image-view',
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
      var contentEl

      if (isMarkdown) {
        contentEl = h('div.git-readme')
        var md = null
        try { md = api.markdown({text: data.content}) } catch (_) {}
        contentEl.appendChild(md || h('pre.git-blob-content', data.content))
      } else {
        var pre = h('pre.git-blob-content.git-highlighted')
        var code = h('code')
        code.innerHTML = highlight(data.content || '', fileName)
        pre.appendChild(code)
        contentEl = pre
      }

      container.innerHTML = ''
      var main = h('div.git-forge-main',
        renderSidebar(repoId, ref, pathParts),
        h('div.git-forge-content',
          h('div.git-browser',
            breadcrumbs(repoId, ref, pathParts),
            contentEl
          )
        )
      )
      container.appendChild(main)
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
        rows.push(h('tr.git-diff-hunk-header', h('td', {colspan: '4'}, '@@ -' + hunk.oldStart + ' +' + hunk.newStart + ' @@')))
        
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
              rows.push(h('tr.git-diff-inline-comment-row', h('td', {colspan: 4},
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
            var composerRow = h('tr.git-diff-inline-comment-row', h('td', {colspan: 4}, composerWrap))
            lineRow.parentNode.insertBefore(composerRow, lineRow.nextSibling)
            
            composerWrap.appendChild(api.message_compose(
              { type: 'git-comment', repo: repoId, commit: sha1, path: file.path, line: line.newLn || line.oldLn },
              function (v) { return v },
              function (err, msg) {
                if (err) { alert(err); composerRow.remove(); return }
                if (!msg) { composerRow.remove(); return }
                var lc = msg.value.content
                var newComment = h('tr.git-diff-inline-comment-row', h('td', {colspan: 4},
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
        diffEl
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
        if (count === 0) list.innerHTML = h('div.git-forge-list-empty', 'No ' + (isPR ? 'pull requests' : 'issues') + ' found.')
      })
    )
  }

  function renderActivityScreen(repoId, container) {
    container.innerHTML = h('div.git-forge-list-empty', 'Fetching mesh activity…')
    
    var count = 0
    pull(
      api.sbot_links({dest: repoId, values: true, reverse: true}),
      pull.filter(function (link) {
        var t = link.value.content.type
        return ['git-update', 'git-comment', 'issue', 'pull-request'].indexOf(t) !== -1
      }),
      pull.drain(function (link) {
        if (count === 0) container.innerHTML = ''
        count++

        var c = link.value.content
        var type = c.type === 'git-update' ? 'push' : (c.type === 'git-comment' ? 'comment' : 'issue')
        var author = link.value.author
        var date = new Date(link.value.timestamp)
        
        var summary = ''
        if (c.type === 'git-update') summary = 'pushed new commits'
        else if (c.type === 'git-comment') summary = 'commented on code'
        else if (c.type === 'issue') summary = 'opened an issue'
        else if (c.type === 'pull-request') summary = 'opened a pull request'

        container.appendChild(h('div.git-forge-activity-item', {className: type},
          h('div',
            h('strong', api.avatar_name(author)),
            ' ' + summary + ' ',
            h('span.git-forge-list-item-meta', human(date))
          ),
          h('div.git-forge-list-item-meta', h('small', '#' + link.key.substr(1, 10)))
        ))
      }, function (err) {
        if (err) console.error(err)
        if (count === 0) container.innerHTML = h('div.git-forge-list-empty', 'No mesh activity recorded for this repo yet.')
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

      var repoId
      try { repoId = decodeURIComponent(parts[1]) } catch (_) { return }

      var sub = parts[2]
      var content = h('div')
      var outer = h('div.column.scroller', {style: {overflow: 'auto'}},
        h('div.scroller__wrapper', layout(repoId, sub, content))
      )

      if (!sub) {
        renderRepoScreen(repoId, content)
      } else if (sub === 'tree') {
        var treeRef   = parts[3] ? decodeURIComponent(parts[3]) : 'HEAD'
        var treePath  = parts.slice(4).map(decodeURIComponent)
        renderTreeScreen(repoId, treeRef, treePath, content)
      } else if (sub === 'blob') {
        var blobRef   = parts[3] ? decodeURIComponent(parts[3]) : 'HEAD'
        var blobPath  = parts.slice(4).map(decodeURIComponent)
        renderBlobScreen(repoId, blobRef, blobPath, content)
      } else if (sub === 'commit') {
        renderCommitScreen(repoId, parts[3] || '', content)
      } else if (sub === 'log') {
        var logRef = parts[3] ? decodeURIComponent(parts[3]) : 'HEAD'
        content.textContent = 'Loading log…'
        fetchJson(gitApiUrl(repoId, 'log/' + encodeURIComponent(logRef)), function (err, data) {
          content.innerHTML = ''
          if (err) {
            content.appendChild(h('div.git-browser', h('em', 'Error: ' + err.message)))
          } else {
            content.appendChild(h('div.git-browser',
              h('h4.git-section-title', 'Log: ', h('span.git-branch-badge', logRef)),
              renderLog(repoId, (data && data.commits) || [])
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
