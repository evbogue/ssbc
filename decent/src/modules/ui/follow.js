var h = require('hyperscript')
var u = require('../../util')
var pull = require('pull-stream')

//var plugs = require('../../wire')
//var avatar = plugs.first(exports.avatar = [])
//var avatar_name = plugs.first(exports.avatar_name = [])
//var avatar_link = plugs.first(exports.avatar_link = [])
//var message_confirm = plugs.first(exports.message_confirm = [])
//var follower_of = plugs.first(exports.follower_of = [])

//render a message when someone follows someone,
//so you see new users
function isRelated(value, name) {
  return value ? name : value === false ? 'un'+name : ''
}

function isSsbproSkin () {
  return typeof document !== 'undefined' &&
    !!document.querySelector('link[rel="stylesheet"][href*="ssbpro-style.css"]')
}

function contactRelation (content) {
  if (isSsbproSkin()) {
    if (content.blocking) return 'mutes'
    if (content.following) return 'subscribes to'
    if (content.following === false) return 'unsubscribes from'
    return ''
  }
  var relation = isRelated(content.following, 'follows')
  if (content.blocking) relation = 'blocks'
  return relation
}

exports.needs = {
  avatar: 'first',
  avatar_name: 'first',
  avatar_link: 'first',
  message_confirm: 'first',
  follower_of: 'first'
}

exports.gives = {
  message_content: true,
  message_content_mini: true,
  avatar_action: true,
}

exports.create = function (api) {
  var exports = {}
  exports.message_content =
  exports.message_content_mini = function (msg) {
    var content = msg.value.content
    if(content.type == 'contact' && content.contact) {
      var relation = contactRelation(content)
      return [
        relation, ' ',
        api.avatar_link(content.contact, api.avatar_name(content.contact), '')
      ]
    }
  }

  exports.message_content = function (msg) {

    var content = msg.value.content
    if(content.type == 'contact' && content.contact) {
      var relation = contactRelation(content)
      return h('div.contact', relation, api.avatar(msg.value.content.contact, 'thumbnail'))
    }
  }

  exports.avatar_action = function (id) {
    var follows_you, you_follow
    var state = h('label')
    var label = h('span')
    var actionLink

    var self_id = require('../../keys').id
    api.follower_of(self_id, id, function (err, f) {
      you_follow = f
      update()
    })
    api.follower_of(id, self_id, function (err, f) {
      follows_you = f
      update()
    })

    function update () {
      var pro = isSsbproSkin()
      state.textContent = pro
        ? (
          follows_you && you_follow ? 'mutual subscription'
        : follows_you               ? 'subscribed to you'
        : you_follow                ? 'subscribed'
        :                             ''
        )
        : (
          follows_you && you_follow ? 'friend'
        : follows_you               ? 'follows you'
        : you_follow                ? 'you follow'
        :                             ''
        )

      label.textContent = pro
        ? you_follow ? 'unsubscribe' : 'subscribe'
        : you_follow ? 'unfollow' : 'follow'
      if (actionLink)
        actionLink.title = you_follow
          ? pro
            ? 'Stop subscribing to this person (publishes a public unfollow)'
            : 'Stop following this person (publishes a public unfollow)'
          : pro
            ? 'Subscribe to this person to replicate their posts (publishes a public follow)'
            : 'Follow this person to replicate their posts (publishes a public follow)'
    }

    return h('div', state,
      actionLink = h('a', {href:'#', title: 'Follow or unfollow this person', onclick: function () {
        api.message_confirm({
          type: 'contact',
          contact: id,
          following: !you_follow
        }, function (err, msg) {
          if (err) return console.error(err)
          you_follow = msg.value.content.following
          update()
        })
      }}, h('br'), label)
    )
  }
  return exports
}
