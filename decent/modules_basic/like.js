
var h = require('hyperscript')
var pull = require('pull-stream')
var selfId = require('../keys').id

exports.needs = {
  avatar_name:     'first',
  message_confirm: 'first',
  message_link:    'first',
  sbot_links:      'first'
}

exports.gives = {
  message_content:      true,
  message_content_mini: true,
  message_meta:         true,
  message_action:       true
}

exports.create = function (api) {
  var x = {}

  function getCache () {
    return typeof window !== 'undefined' && window.CACHE ? window.CACHE : {}
  }

  x.message_content =
  x.message_content_mini = function (msg) {
    if (msg.value.content.type !== 'vote') return
    var vote = msg.value.content.vote
    return [
      vote.value > 0 ? '♥ liked' : 'unliked',
      ' ', api.message_link(vote.link)
    ]
  }

  x.message_meta = function (msg) {
    var cache = getCache()
    var votes = []
    for (var k in cache) {
      var c = cache[k].content
      if (c && c.type === 'vote' &&
          (c.vote === msg.key || (c.vote && c.vote.link === msg.key)))
        votes.push({ source: cache[k].author })
    }
    if (!votes.length) return null

    var el = h('span.action-liked-meta',
      h('span.material-symbols-outlined.action-icon', 'favorite'),
      h('span.action-count', String(votes.length))
    )
    pull(
      pull.values(votes.map(function (v) { return api.avatar_name(v.source) })),
      pull.collect(function (err, ary) {
        el.title = ary.map(function (x) {
          return x && x.textContent ? x.textContent : String(x)
        }).join(', ')
      })
    )
    return el
  }

  x.message_action = function (msg) {
    if (msg.value.content.type === 'vote') return
    var cache = getCache()

    var likeCount = 0
    var alreadyLiked = false
    for (var k in cache) {
      var c = cache[k].content
      if (c && c.type === 'vote' &&
          (c.vote === msg.key || (c.vote && c.vote.link === msg.key))) {
        likeCount++
        if (cache[k].author === selfId && c.vote && c.vote.value > 0)
          alreadyLiked = true
      }
    }

    var iconEl  = h('span.material-symbols-outlined.action-icon',
      alreadyLiked ? 'favorite' : 'favorite_border')
    var countEl = h('span.action-count', likeCount > 0 ? String(likeCount) : '')
    var btn = h('button.action-btn.action-btn--like' + (alreadyLiked ? '.action-btn--liked' : ''), {
      type: 'button',
      title: alreadyLiked ? 'Unlike' : 'Like',
      onclick: function (e) {
        e.preventDefault()
        var newVal = alreadyLiked ? 0 : 1
        var vote = {
          type: 'vote',
          vote: { link: msg.key, value: newVal, expression: newVal ? 'Like' : 'Unlike' }
        }
        if (msg.value.content.recps) {
          vote.recps = msg.value.content.recps.map(function (r) {
            return r && typeof r !== 'string' ? r.link : r
          })
          vote.private = true
        }
        api.message_confirm(vote)
      }
    }, iconEl, countEl)

    return btn
  }

  return x
}
