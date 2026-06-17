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

          var importKey = h('textarea', {placeholder: 'import an existing public/private key', name: 'textarea'})
          var content = h('div.column.scroller__content')
          var div = h('div.column.scroller',
            {style: {'overflow':'auto'}},
            h('div.scroller__wrapper',
              h('div.column.scroller__content',
                h('div.message.message-card',
                  h('p', {innerHTML: 'Your secret key is: <pre><code>' + (storedSecret || '') + '</code></pre>'}),
                  h('form',
                    importKey,
                    h('button.btn.btn-primary', {title: 'Replace your identity with the pasted secret key', onclick: function (e){
                      localStorage[BROWSER_SECRET_KEY] = importKey.value.replace(/\s+/g, ' ')
                      alert('Your public/private key has been updated')
                      e.preventDefault()
                    }}, 'Import'),
                    h('button.btn.btn-danger', {title: 'Permanently delete your secret key from this browser', onclick: function (e){
                      e.preventDefault()
                      if(!confirm('Delete your keys? This permanently removes your identity from this browser. Make sure you have a backup of your secret key — without it this identity cannot be recovered.')) return
                      try { delete localStorage[BROWSER_SECRET_KEY] } catch (_) {}
                      alert('Your keys have been deleted from this browser.')
                      location.reload()
                    }}, 'Delete keys')
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
