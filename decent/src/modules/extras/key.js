var h = require('hyperscript')
var u = require('../../util')
var pull = require('pull-stream')
var Scroller = require('../../scroller')
var keys
try { keys = require('../../keys') } catch (_) {}
var BROWSER_SECRET_KEY = 'decent/.ssb/secret'

//var plugs = require('../../wire')
// var message_render = plugs.first(exports.message_render = [])
// var message_compose = plugs.first(exports.message_compose = [])
// var sbot_log = plugs.first(exports.sbot_log = [])


exports.gives = {
  menu_items: true, screen_view: true
}

exports.create = function (api) {
  return {
    menu_items: function () {
      return h('a', {href: '#key'}, 'Key')
    },
    screen_view: function (path, sbot) {
      if(path === 'key') {
        if(process.title === 'browser') {
          var storedSecret = null
          try { storedSecret = localStorage[BROWSER_SECRET_KEY] } catch (_) {}

          if((!storedSecret || storedSecret === 'undefined') && keys && keys.id) {
            try {
              storedSecret = JSON.stringify(keys, null, 2)
              localStorage[BROWSER_SECRET_KEY] = storedSecret
            } catch (_) {}
          }

          var importKey = h('textarea.key-import', {placeholder: 'Paste an existing public/private key…', name: 'textarea'})

          var secretBlock = h('pre.key-secret', h('code', storedSecret || ''))

          var copyBtn = h('button.btn.key-copy', {type: 'button', title: 'Copy your secret key to the clipboard', onclick: function (e){
            e.preventDefault()
            function done () { copyBtn.textContent = 'Copied!'; setTimeout(function () { copyBtn.textContent = 'Copy' }, 1500) }
            try {
              if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(storedSecret || '').then(done, function () {})
            } catch (_) {}
          }}, 'Copy')

          var importBtn = h('button.btn.btn-primary', {title: 'Replace your identity with the pasted secret key', onclick: function (e){
            e.preventDefault()
            if(!importKey.value.trim()) return
            localStorage[BROWSER_SECRET_KEY] = importKey.value.replace(/\s+/g, ' ')
            alert('Your public/private key has been updated')
          }}, 'Import')

          var deleteBtn = h('button.btn.btn-danger', {title: 'Permanently delete your secret key from this browser', onclick: function (e){
            e.preventDefault()
            if(!confirm('Delete your keys? This permanently removes your identity from this browser. Make sure you have a backup of your secret key — without it this identity cannot be recovered.')) return
            try { delete localStorage[BROWSER_SECRET_KEY] } catch (_) {}
            alert('Your keys have been deleted from this browser.')
            location.reload()
          }}, 'Delete keys')

          var div = h('div.column.scroller',
            {style: {'overflow':'auto'}},
            h('div.scroller__wrapper',
              h('div.column.scroller__content',
                h('div.message.message-card.key-card',
                  h('section.key-section',
                    h('h2.key-card__title', 'Your keys'),
                    h('p.key-card__hint', 'This secret key is your identity. Anyone who has it controls your account — keep it private and never share it.'),
                    h('div.key-secret-wrap', secretBlock, h('div.key-actions', copyBtn))
                  ),
                  h('section.key-section',
                    h('h3.key-section__title', 'Import a different identity'),
                    h('p.key-card__hint', 'Replace the keys in this browser with a secret key you paste below.'),
                    h('form.key-form',
                      importKey,
                      h('div.key-actions', importBtn)
                    )
                  ),
                  h('section.key-section.key-danger',
                    h('h3.key-section__title', 'Danger zone'),
                    h('p.key-card__hint', 'Remove your keys from this browser. Without a backup, this identity cannot be recovered.'),
                    h('div.key-actions', deleteBtn)
                  )
                )
              )
            )
          )
          return div
        } else { 
          return h('div.message.message-card', 'Your key is saved at .ssb/secret')
        }
      }
    }
  }
}
