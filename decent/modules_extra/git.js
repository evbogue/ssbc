'use strict'
var h = require('hyperscript')
var pull = require('pull-stream')
var paramap = require('pull-paramap')
var cat = require('pull-cat')
var human = require('human-time')
var combobox = require('hypercombo')

var getAvatar = require('ssb-avatar')
var KVGraph = require('kvgraph')
var mergeRepo = require('ssb-git/merge')

//var plugs = require('../plugs')
//var message_link = plugs.first(exports.message_link = [])
//var message_confirm = plugs.first(exports.message_confirm = [])
//var message_compose = plugs.first(exports.message_compose = [])
//var sbot_links = plugs.first(exports.sbot_links = [])
//var sbot_links2 = plugs.first(exports.sbot_links2 = [])
//var sbot_get = plugs.first(exports.sbot_get = [])
//var avatar_name = plugs.first(exports.avatar_name = [])
//var markdown = plugs.first(exports.markdown = [])

exports.needs = {
  message_link: 'first',
  message_confirm: 'first',
  message_compose: 'first',
  sbot_links: 'first',
  sbot_links2: 'first',
  sbot_get: 'first',
  avatar_name: 'first',
  markdown: 'first'
}

exports.gives = {
  message_action: true,
  message_meta: true,
  message_content: true
}


var self_id = require('../keys').id

function shortRefName(ref) {
  return ref.replace(/^refs\/(heads|tags)\//, '')
}

exports.create = function (api) {

  function getRefs(msg) {
    var updates = new KVGraph('key')
    var _cb, _refs
    pull(
      api.sbot_links({
        reverse: true,
        // source: msg.value.author,
        dest: msg.key,
        rel: 'repo',
        values: true
      }),
      pull.drain(function (link) {
        if (link.value.content.type === 'git-update') {
          updates.add(link)
        }
      }, function (err) {
        var refs = updates.reduceRight(mergeRepo).refs
        var cb = _cb
        if (cb) _cb = null, cb(err, refs)
        else _refs = refs
      })
    )

    return pull(
      function fn(end, cb) {
        if (end || fn.ended) cb(true)
        fn.ended = true
        if (_refs) cb(_refs)
        else _cb = cb
      },
      pull.flatten()
    )
  }

  function getForks(id) {
    return pull(
      api.sbot_links({
        reverse: true,
        dest: id,
        rel: 'upstream'
      }),
      pull.map(function (link) {
        return {
          id: link.key,
          author: link.source
        }
      })
    )
  }

  function repoText(id) {
    var text = document.createTextNode(id.substr(0, 10) + '…')
    getAvatar({links: api.sbot_links, get: api.sbot_get}, self_id, id,
        function (err, avatar) {
      if(err) return console.error(err)
      if (avatar.name[0] !== '%') avatar.name = '%' + avatar.name
      text.nodeValue = avatar.name
    })
    return text
  }

  function repoLink(id) {
    return h('a', {href: '#'+id}, repoText(id))
  }

  function repoName(id) {
    return h('ins', repoText(id))
  }

  function getIssueState(id, cb) {
    pull(
      api.sbot_links({dest: id, rel: 'issues', values: true, reverse: true}),
      pull.map(function (msg) {
        return msg.value.content.issues
      }),
      pull.flatten(),
      pull.filter(function (issue) {
        return issue.link === id
      }),
      pull.map(function (issue) {
        return issue.merged ? 'merged' : issue.open ? 'open' : 'closed'
      }),
      pull.take(1),
      pull.collect(function (err, updates) {
        cb(err, updates && updates[0] || 'open')
      })
    )
  }

  //todo: 
  function messageTimestampLink(msg) {
    var date = new Date(msg.value.timestamp)
    return h('a.timestamp', {
      timestamp: msg.value.timestamp,
      title: date,
      href: '#'+msg.key
    }, human(date))
  }

  // a thead+tbody where the thead only is added when the first row is added
  function tableRows(headerRow) {
    var thead = h('thead'), tbody = h('tbody')
    var first = true
    var t = [thead, tbody]
    t.append = function (row) {
      if (first) {
        first = false
        thead.appendChild(headerRow)
      }
      tbody.appendChild(row)
    }
    return t
  }

  function renderIssueEdit(c) {
    var id = c.issue || c.link
    return [
      c.title ? h('p', 'renamed issue ', api.message_link(id),
        ' to ', h('ins', c.title)) : null,
      c.open === false ? h('p', 'closed issue ', api.message_link(id)) : null,
      c.open === true ? h('p', 'reopened issue ', api.message_link(id)) : null]
  }

  function findMessageContent(el) {
    for(; el; el = el.parentNode) {
      if(el.classList.contains('message')) {
        return el.querySelector('.message_content')
      }
    }
  }

  function issueForm(msg, contentEl) {
    var form = h('form',
      h('strong', 'New Issue:'),
      api.message_compose(
        {type: 'issue', project: msg.key},
        function (value) { return value },
        function (err, issue) {
          if(err) return alert(err)
          if(!issue) return
          var title = issue.value.content.text
          if(title.length > 70) title = title.substr(0, 70) + '…'
          form.appendChild(h('div',
            h('a', {href: '#'+issue.key}, title)
          ))
        }
      )
    )
    return form
  }

  function branchMenu(msg, full) {
    return combobox({
      style: {'max-width': '14ex'},
      placeholder: 'branch…',
      default: 'master',
      read: msg && pull(getRefs(msg), pull.map(function (ref) {
        var m = /^refs\/heads\/(.*)$/.exec(ref.name)
        if(!m) return
        var branch = m[1]
        var label = branch
        if(full) {
          var updated = new Date(ref.link.value.timestamp)
          label = branch +
            ' · ' + human(updated) +
            ' · ' + ref.hash.substr(1, 8) +
            (ref.title ? ' · "' + ref.title + '"' : '')
        }
        return h('option', {value: branch}, label)
      }))
    })
  }

  function newPullRequestButton(msg) {
    return h('div', [
      h('a', {
        href: '#',
        onclick: function (e) {
          e.preventDefault()
          this.parentNode.replaceChild(pullRequestForm(msg), this)
        }},
        'New Pull Request…'
      )
    ])
  }

  function pullRequestForm(msg) {
    var headRepoInput
    var headBranchInput = branchMenu()
    var branchInput = branchMenu(msg)
    var form = h('form',
      h('strong', 'New Pull Request:'),
      h('div',
        'from ',
        headRepoInput = combobox({
          style: {'max-width': '26ex'},
          onchange: function () {
            // list branches for selected repo
            var repoId = this.value
            if(repoId) api.sbot_get(repoId, function (err, value) {
              if(err) console.error(err)
              var msg = value && {key: repoId, value: value}
              headBranchInput = headBranchInput.swap(branchMenu(msg, true))
            })
            else headBranchInput = headBranchInput.swap(branchMenu())
          },
          read: pull(cat([
            pull.once({id: msg.key, author: msg.value.author}),
            getForks(msg.key)
          ]), pull.map(function (fork) {
            return h('option', {value: fork.id},
              repoLink(fork.id), ' by ', api.avatar_name(fork.author))
          }))
        }),
        ':',
        headBranchInput,
        ' to ',
        repoName(msg.key),
        ':',
        branchInput),
      api.message_compose(
        {
          type: 'pull-request',
          project: msg.key,
          repo: msg.key,
        },
        function (value) {
          value.branch = branchInput.value
          value.head_repo = headRepoInput.value
          value.head_branch = headBranchInput.value
          return value
        },
        function (err, issue) {
          if(err) return alert(err)
          if(!issue) return
          var title = issue.value.content.text
          if(title.length > 70) title = title.substr(0, 70) + '…'
          form.appendChild(h('div',
            h('a', {href: '#'+issue.key}, title)
          ))
        }
      )
    )
    return form
  }



  return {
    message_content: function (msg, sbot) {
      var c = msg.value.content

      if(c.type === 'git-repo') {
        var cloneUrl = window.location.origin + '/git/' + encodeURIComponent(msg.key)
        var browseUrl = '#git/' + encodeURIComponent(msg.key)
        var branchesT, tagsT, openIssuesT, closedIssuesT, openPRsT, closedPRsT
        var forksT

        // Async README preview - will be populated after render
        var readmeEl = h('div')
        ;(function fetchReadme() {
          var candidates = ['README.md', 'readme.md', 'Readme.md', 'README']
          var i = 0
          function tryNext() {
            if (i >= candidates.length) return
            var name = candidates[i++]
            var url = window.location.origin + '/git/' + encodeURIComponent(msg.key) +
              '/json/blob/HEAD/' + name
            var xhr = new XMLHttpRequest()
            xhr.open('GET', url)
            xhr.onload = function () {
              if (xhr.status !== 200) return tryNext()
              var data
              try { data = JSON.parse(xhr.responseText) } catch (_) { return tryNext() }
              if (!data || data.content == null) return tryNext()
              // Truncate to first ~500 chars to avoid huge inline previews
              var preview = data.content.length > 500
                ? data.content.substr(0, 500) + '\n…'
                : data.content
              readmeEl.className = 'git-readme'
              readmeEl.appendChild(h('pre', preview))
            }
            xhr.onerror = tryNext
            xhr.send()
          }
          tryNext()
        }())

        var div = h('div',
          h('h3.git-repo-name',
            h('a', {href: browseUrl}, c.name ? c.name : repoName(msg.key))),
          c.upstream ? h('p', 'fork of ', repoLink(c.upstream)) : '',
          h('p.git-clone-url',
            h('span.git-label', 'Clone:'),
            h('code.git-clone-input', cloneUrl)),
          readmeEl,
          h('div.git-table-wrapper', {style: {'max-height': '12em'}},
            h('table',
              branchesT = tableRows(h('tr',
                h('th', 'branch'),
                h('th', 'commit'),
                h('th', 'last update'))),
              tagsT = tableRows(h('tr',
                h('th', 'tag'),
                h('th', 'commit'),
                h('th', 'last update'))))),
          h('div.git-table-wrapper', {style: {'max-height': '16em'}},
            h('table',
              openIssuesT = tableRows(h('tr',
                h('th', 'open issues'))),
              closedIssuesT = tableRows(h('tr',
                h('th', 'closed issues'))))),
          h('div.git-table-wrapper', {style: {'max-height': '16em'}},
            h('table',
              openPRsT = tableRows(h('tr',
                h('th', 'open pull requests'))),
              closedPRsT = tableRows(h('tr',
                h('th', 'closed pull requests'))))),
          h('div.git-table-wrapper',
            h('table',
              forksT = tableRows(h('tr',
                h('th', 'forks'))))),
          h('div', h('a', {href: '#', onclick: function (e) {
            e.preventDefault()
            this.parentNode.replaceChild(issueForm(msg), this)
          }}, 'New Issue…')),
          newPullRequestButton.call(this, msg)
        )

        pull(getRefs(msg), pull.drain(function (ref) {
          var name = ref.realname || ref.name
          var author = ref.link && ref.link.value.author
          var parts = /^refs\/(heads|tags)\/(.*)$/.exec(name) || []
          var shortName = parts[2]
          var t
          if(parts[1] === 'heads') t = branchesT
          else if(parts[1] === 'tags') t = tagsT
          if(t) t.append(h('tr',
            h('td', shortName,
              ref.conflict ? [
                h('br'),
                h('a', {href: '#'+author}, api.avatar_name(author))
              ] : ''),
            h('td', h('code.git-sha', ref.hash.substr(0, 7))),
            h('td', messageTimestampLink(ref.link))))
        }, function (err) {
          if(err) console.error(err)
        }))

        // list issues and pull requests
        pull(
          api.sbot_links({
            reverse: true,
            dest: msg.key,
            rel: 'project',
            values: true
          }),
          paramap(function (link, cb) {
            getIssueState(link.key, function (err, state) {
              if(err) return cb(err)
              link.state = state
              cb(null, link)
            })
          }),
          pull.drain(function (link) {
            var c = link.value.content
            var title = c.title || (c.text ? c.text.length > 70
              ? c.text.substr(0, 70) + '…'
              : c.text : link.key)
            var author = link.value.author
            var t = c.type === 'pull-request'
              ? link.state === 'open' ? openPRsT : closedPRsT
              : link.state === 'open' ? openIssuesT : closedIssuesT
            t.append(h('tr',
              h('td',
                h('a', {href: '#'+link.key}, title), h('br'),
                h('small',
                  'opened ', messageTimestampLink(link),
                  ' by ', h('a', {href: '#'+author}, api.avatar_name(author))))))
          }, function (err) {
            if (err) console.error(err)
          })
        )

        // list forks
        pull(
          getForks(msg.key),
          pull.drain(function (fork) {
            forksT.append(h('tr', h('td',
              repoLink(fork.id),
              ' by ', h('a', {href: '#'+fork.author}, api.avatar_name(fork.author)))))
          }, function (err) {
            if (err) console.error(err)
          })
        )

        return div
      }

      if(c.type === 'git-update') {
        function renderUpdateCommit(commit, repoId) {
          if (typeof commit.sha1 !== 'string') return h('div.git-commit')
          var browseHref = '#git/' + encodeURIComponent(repoId) +
            '/commit/' + commit.sha1

          // Lazy-load +/- line stats from the diff endpoint
          var statsEl = h('span.git-commit-stats')
          ;(function () {
            var url = window.location.origin + '/git/' +
              encodeURIComponent(repoId) + '/json/diff/' + commit.sha1
            var xhr = new XMLHttpRequest()
            xhr.open('GET', url)
            xhr.onload = function () {
              if (xhr.status !== 200) return
              var data
              try { data = JSON.parse(xhr.responseText) } catch (_) { return }
              var add = 0, del = 0, files = 0
              if (data && data.files) {
                files = data.files.length
                data.files.forEach(function (f) {
                  if (f.hunks) f.hunks.forEach(function (hunk) {
                    hunk.lines.forEach(function (l) {
                      if (l.type === 'add') add++
                      else if (l.type === 'del') del++
                    })
                  })
                })
              }
              var parts = []
              if (files) parts.push(files + ' file' + (files !== 1 ? 's' : ''))
              if (add)   parts.push(h('span.git-stat-add', '+' + add))
              if (del)   parts.push(h('span.git-stat-del', '−' + del))
              parts.forEach(function (p) {
                if (statsEl.childNodes.length) statsEl.appendChild(document.createTextNode(' '))
                if (typeof p === 'string') statsEl.appendChild(document.createTextNode(p))
                else statsEl.appendChild(p)
              })
            }
            xhr.send()
          }())

          var authorName = commit.author && commit.author.name
            ? commit.author.name : null

          // commit.body is the multi-line description below the title
          var bodyText = typeof commit.body === 'string' && commit.body.trim()
            ? commit.body.trim().slice(0, 300) +
              (commit.body.trim().length > 300 ? '…' : '')
            : null

          return h('div.git-commit',
            h('div.git-commit-row',
              h('a', {href: browseHref}, h('code.git-sha', commit.sha1.substr(0, 7))),
              commit.title ? h('span.git-commit-title', commit.title) : null,
              h('span.git-commit-byline',
                authorName ? h('span.git-commit-author', authorName) : null,
                statsEl
              )
            ),
            bodyText ? h('div.git-commit-body-preview', bodyText) : null
          )
        }

        var repoId = c.repo
        return [
          h('p', 'pushed to ', repoLink(repoId)),
          c.refs ? h('div.git-refs', Object.keys(c.refs).map(function (ref) {
            var rev = c.refs[ref]
            var shortName = shortRefName(ref)
            var branchHref = rev
              ? '#git/' + encodeURIComponent(repoId) + '/tree/' + encodeURIComponent(shortName)
              : null
            return h('div.git-ref',
              branchHref
                ? h('a.git-branch-badge', {href: branchHref}, shortName)
                : h('span.git-branch-badge', shortName),
              rev
                ? h('code.git-sha', rev.substr(0, 7))
                : h('em.git-ref-deleted', 'deleted'))
          })) : null,
          Array.isArray(c.commits) ? [
            h('div.git-commits',
              c.commits.map(function (commit) {
                return renderUpdateCommit(commit, repoId)
              }),
              c.commits_more > 0
                ? h('div.git-commit.git-commits-more', '+ ', c.commits_more, ' more') : null)
          ] : null,
          Array.isArray(c.issues) ? c.issues.map(function (issue) {
            if (issue.merged === true)
              return h('p', 'Merged ', api.message_link(issue.link), ' in ',
                h('code.git-sha', issue.object), ' ', h('q', issue.label))
            if (issue.open === false)
              return h('p', 'Closed ', api.message_link(issue.link), ' in ',
                h('code.git-sha', issue.object), ' ', h('q', issue.label))
          }) : null,
          newPullRequestButton.call(this, msg)
        ]
      }

      if(c.type === 'issue-edit'
       || (c.type === 'post' && c.text === '')) {
        return h('div',
          c.issue ? renderIssueEdit(c) : null,
          c.issues ? c.issues.map(renderIssueEdit) : null)
      }

      if(c.type === 'issue') {
        return h('div',
          h('p', 'opened issue on ', repoLink(c.project)),
          c.title ? h('h4', c.title) : '',
          api.markdown(c)
        )
      }

      if(c.type === 'pull-request') {
        return h('div',
          h('p', 'opened pull-request ',
            'to ', repoLink(c.repo), ':', c.branch, ' ',
            'from ', repoLink(c.head_repo), ':', c.head_branch),
          c.title ? h('h4', c.title) : '',
          api.markdown(c)
        )
      }

      if(c.type === 'git-comment') {
        var commitHref = c.repo && c.commit
          ? '#git/' + encodeURIComponent(c.repo) + '/commit/' + c.commit
          : null
        return h('div',
          h('p',
            'commented on ',
            commitHref
              ? h('a', {href: commitHref}, h('code.git-sha', (c.commit || '').substr(0, 7)))
              : (c.commit ? h('code.git-sha', c.commit.substr(0, 7)) : 'a commit'),
            c.repo ? [' in ', repoLink(c.repo)] : ''
          ),
          c.path ? h('p', h('code.git-sha',
            c.path + (c.line != null ? ':' + c.line : ''))) : null,
          api.markdown(c)
        )
      }
    },

    message_meta: function (msg, sbot) {
      var type = msg.value.content.type
      if (type === 'issue' || type === 'pull-request') {
        var el = h('em.git-state-badge', '...')
        getIssueState(msg.key, function (err, state) {
          if (err) return console.error(err)
          el.textContent = state
          el.className = 'git-state-badge git-state-' + state
        })
        return el
      }
    },

    message_action: function (msg, sbot) {
      var c = msg.value.content
      if(c.type === 'issue' || c.type === 'pull-request') {
        var isOpen
        var a = h('a', {href: '#', onclick: function (e) {
          e.preventDefault()
          api.message_confirm({
            type: 'issue-edit',
            root: msg.key,
            issues: [{
              link: msg.key,
              open: !isOpen
            }]
          }, function (err, msg) {
            if(err) return alert(err)
            if(!msg) return
            isOpen = msg.value.content.open
            update()
          })
        }})
        getIssueState(msg.key, function (err, state) {
          if (err) return console.error(err)
          isOpen = state === 'open'
          update()
        })
        function update() {
          a.textContent = c.type === 'pull-request'
            ? isOpen ? 'Close Pull Request' : 'Reopen Pull Request'
            : isOpen ? 'Close Issue' : 'Reopen Issue'
        }
        return a
      }
    }
  }
}


