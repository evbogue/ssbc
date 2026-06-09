'use strict'
// Profile "send" actions: on another user's profile, offer two ways to reach
// them — a public Mention (a normal post that @-mentions them, which lands in
// their notifications) and a private Message (an encrypted post addressed to
// them via recps). Both reuse the existing composer (message_compose) shown in
// a lightbox; nothing here re-implements posting or boxing.
var h        = require('hyperscript')
var ref      = require('ssb-ref')
var lightbox = require('hyperlightbox')
var selfId   = require('../../keys').id

exports.needs = {
  message_compose: 'first',
  signifier:       'first'
}

exports.gives = {
  avatar_action: true
}

exports.create = function (api) {

  // Open a composer in a modal lightbox; close it once a message is published,
  // on backdrop click, on Escape, or via the explicit Close button.
  function openComposer (title, meta, opts) {
    var lb = lightbox()
    lb.classList.add('profile-compose-lightbox')
    document.body.appendChild(lb)
    function close () {
      document.removeEventListener('keydown', onKey)
      lb.close()
      if (lb.parentNode) lb.parentNode.removeChild(lb)
    }
    function onKey (ev) { if (ev.keyCode === 27) close() }
    document.addEventListener('keydown', onKey)

    var composer = api.message_compose(meta, opts, function (err, msg) {
      if (msg) close()        // published — dismiss
    })
    lb.addEventListener('click', function (ev) { if (ev.target === lb) close() })
    lb.show(h('div.profile-compose',
      h('div.profile-compose__header',
        h('div.profile-compose__title', title),
        h('button.btn.profile-compose__close',
          {type: 'button', title: 'Close the composer without sending', onclick: close}, 'Close')
      ),
      composer
    ))
  }

  // Public post that mentions the target. The mention is seeded as visible,
  // editable markdown so the user sees who they're addressing; ssb-mentions
  // parses it into content.mentions at publish, which drives notifications.
  function composeMention (id, name) {
    openComposer('Mention ' + name, {type: 'post'}, {
      shrink: false,
      initialText: '[' + name + '](' + id + ') ',
      placeholder: 'Write a public post mentioning ' + name
    })
  }

  // Private (encrypted) post addressed to the target. recps is pre-set; the
  // prepublish keeps it and folds in any extra @mentions the user adds.
  function composeMessage (id, name) {
    openComposer('Message ' + name + ' privately', {type: 'post', recps: [selfId, id], private: true}, {
      shrink: false,
      placeholder: 'Send a private message to ' + name,
      prepublish: function (msg) {
        var recps = (msg.recps || []).concat(msg.mentions || [])
          .map(function (e) { return 'string' === typeof e ? e : (e && e.link) })
          .filter(function (e) { return ref.isFeed(e) })
        msg.recps = recps.filter(function (e, i) { return recps.indexOf(e) === i })
        if (!msg.recps.length)
          throw new Error('cannot send a private message without a recipient')
        return msg
      }
    })
  }

  return {
    avatar_action: function (id) {
      if (id === selfId) return            // no self-messaging from your own profile

      // Resolve a display name for the labels/seed text; fall back to the id.
      var name = id.slice(0, 10)
      api.signifier(id, function (_, names) {
        if (names && names.length) name = names[0].name
      })

      var messageBtn = h('button.btn.btn-primary.profile-action-btn',
        {type: 'button', title: 'Send this person a private (encrypted) message',
         onclick: function () { composeMessage(id, name) }},
        h('span.material-symbols-outlined', {style: {fontSize: '16px'}}, 'mail'),
        h('span.profile-action-btn__label', 'Message'))

      var mentionBtn = h('button.btn.profile-action-btn',
        {type: 'button', title: 'Write a public post that mentions this person',
         onclick: function () { composeMention(id, name) }},
        h('span.material-symbols-outlined', {style: {fontSize: '16px'}}, 'alternate_email'),
        h('span.profile-action-btn__label', 'Mention'))

      return h('div.profile-send-actions', messageBtn, mentionBtn)
    }
  }
}
