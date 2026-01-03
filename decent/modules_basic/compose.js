'use strict'
var h = require('hyperscript')
var selfId = require('../keys').id
var suggest = require('suggest-box')
var mentions = require('ssb-mentions')
var lightbox = require('hyperlightbox')
var cont = require('cont')

//var plugs = require('../plugs')
//var suggest_mentions= plugs.asyncConcat(exports.suggest_mentions = [])
//var publish         = plugs.first(exports.sbot_publish = [])
//var message_content = plugs.first(exports.message_content = [])
//var message_confirm = plugs.first(exports.message_confirm = [])
//var file_input      = plugs.first(exports.file_input = [])

exports.needs = {
  suggest_mentions: 'map', //<-- THIS MUST BE REWRITTEN
  publish: 'first',
  message_content: 'first',
  message_confirm: 'first',
  file_input: 'first',
  message_link: 'first',
  avatar: 'first'
}

exports.gives = 'message_compose'

function id (e) { return e }

/*
  opts can take

    placeholder: string. placeholder text, defaults to "Write a message"
    prepublish: function. called before publishing a message.
    shrink: boolean. set to false, to make composer not shrink (or hide controls) when unfocused.
*/

exports.create = function (api) {

  return function (meta, opts, cb) {
    if('function' === typeof cb) {
      if('function' === typeof opts)
        opts = {prepublish: opts}
      }

    if(!opts) opts = {}
    opts.prepublish = opts.prepublish || id

    var accessories
    meta = meta || {}
    if(!meta.type) throw new Error('message must have type')
    var modal = !!opts.modal
    var lb = null
    var modalContent = null
    var replyHintEls = []
    var modalTimer = null
    var onKeydown = null
    var trigger = null
    var baseSnapshot = null
    var replyActive = false
    var lastReplyMsg = null
    var inlineReplyHint = null

    function cloneMeta (src) {
      var out = {}
      for (var k in src) out[k] = src[k]
      return out
    }

    function applyMeta (target, source) {
      for (var k in target) delete target[k]
      for (var key in source) target[key] = source[key]
    }

    function captureBaseMeta () {
      baseSnapshot = cloneMeta(meta)
    }

    function clearReply () {
      if (replyActive && baseSnapshot) {
        applyMeta(meta, baseSnapshot)
      }
      replyActive = false
      lastReplyMsg = null
      updateReplyHint(null)
    }
    function createReplyHintEl (className) {
      var selector = 'div' + (className ? '.' + className : '')
      var el = h(selector, {style: {display: 'none'}})
      replyHintEls.push(el)
      return el
    }
    if (!modal) {
      inlineReplyHint = h('div.compose-reply-hint', {style: {display: 'none'}})
      replyHintEls.push(inlineReplyHint)
    }
    var ta = h('textarea', {
      placeholder: opts.placeholder || 'Write a message',
      style: {height: opts.shrink === false ? '200px' : ''}
    })

    if(opts.shrink !== false) {
      var blur
      ta.addEventListener('focus', function () {
        clearTimeout(blur)
        if(!ta.value) {
          ta.style.height = '200px'
        }
        accessories.style.display = 'block'
      })
      ta.addEventListener('blur', function () {
        //don't shrink right away, so there is time
        //to click the publish button.
        clearTimeout(blur)
        blur = setTimeout(function () {
          if(ta.value) return
          ta.style.height = '50px'
          accessories.style.display = 'none'
        }, 200)
      })
    }

    ta.addEventListener('keydown', function (ev) {
      if(ev.keyCode === 13 && ev.ctrlKey) publish()
    })

    var files = []
    var filesById = {}

    function ensureLightbox () {
      if (lb) return
      lb = lightbox()
      document.body.appendChild(lb)
      lb.addEventListener('click', function (ev) {
        if (ev.target === lb) closeModal()
      })
    }

    function showModal (fromEl) {
      if (!modal) return
      ensureLightbox()
      if (trigger) trigger.style.display = 'none'
      if (!modalContent) {
        modalContent = h('div.compose-modal',
          h('div.compose-modal__header',
            h('div.compose-modal__title', h('div.avatar',
              api.avatar(selfId, 'thumbnail')
            )),
            h('button.btn.compose-modal__close', 'Close', {onclick: closeModal})
          ),
          createReplyHintEl('compose-modal__hint'),
          composer
        )
        if (lastReplyMsg) updateReplyHint(lastReplyMsg)
      }

      lb.show(modalContent)
      document.body.classList.add('lightbox-open')
      window.requestAnimationFrame(function () {
        modalContent.classList.add('compose-modal--animate')
        ta.focus()
      })

      onKeydown = function (ev) {
        if (ev.keyCode === 27) closeModal()
      }
      document.addEventListener('keydown', onKeydown)
    }

    function closeModal () {
      if (!lb || !modalContent) return
      modalContent.classList.remove('compose-modal--animate')
      if (modalTimer) clearTimeout(modalTimer)
      modalTimer = setTimeout(function () {
        if (lb) lb.close()
        document.body.classList.remove('lightbox-open')
        if (trigger) trigger.style.display = ''
      }, 160)
      if (onKeydown) {
        document.removeEventListener('keydown', onKeydown)
        onKeydown = null
      }
    }

    function publish() {
      publishBtn.disabled = true
      var content
      try {
        content = JSON.parse(ta.value)
      } catch (err) {
        meta.text = ta.value
        meta.mentions = mentions(ta.value).map(function (mention) {
          // merge markdown-detected mention with file info
          var file = filesById[mention.link]
          if (file) {
            if (file.type) mention.type = file.type
            if (file.size) mention.size = file.size
          }
          return mention
        })
        try {
          meta = opts.prepublish(meta)
        } catch (err) {
          publishBtn.disabled = false
          if (cb) cb(err)
          else alert(err.message)
        }
          if (modal) closeModal()
          return api.message_confirm(meta, done)
      }

      if (modal) closeModal()
      api.message_confirm(content, done)

      function done (err, msg) {
        publishBtn.disabled = false
        if(err) return alert(err.stack)
        else if (msg) {
          ta.value = ''
          clearReply()
        }
        else if (modal) showModal(trigger)

        if (cb) cb(err, msg)
      }
    }


    var publishBtn = h('button.btn.btn-primary', 'Preview', {onclick: publish})
    var composerChildren = [ta,
      accessories = h('div.row.compose__controls',
        //hidden until you focus the textarea
        {style: {display: opts.shrink === false ? '' : 'none'}},
        api.file_input(function (file) {
          files.push(file)
          filesById[file.link] = file

          var embed = file.type.indexOf('image/') === 0 ? '!' : ''
          ta.value += embed + '['+file.name+']('+file.link+')'
          console.log('added:', file)
        }),
        publishBtn)
    ]
    if (inlineReplyHint) composerChildren.unshift(inlineReplyHint)
    var composer =
      h('div.message.message-card.compose', h('div.column', composerChildren))

    suggest(ta, function (name, cb) {
      cont.para(api.suggest_mentions(name))
        (function (err, ary) {
          cb(null, ary.reduce(function (a, b) {
            if(!b) return a
            return a.concat(b)
          }, []))
        })
    }, {})

    function applyReply (msg) {
      if (!msg || !msg.key || !msg.value || !msg.value.content) return
      if (!replyActive) captureBaseMeta()
      var nextMeta = cloneMeta(baseSnapshot || meta)
      nextMeta.type = meta.type || 'post'
      var content = msg.value.content
      nextMeta.root = content.root || msg.key
      nextMeta.branch = msg.key
      if (content.channel) nextMeta.channel = content.channel
      else delete nextMeta.channel

      if (msg.value.private) {
        var selfId = require('../keys').id
        var recps = content.recps
        if (recps) nextMeta.recps = recps
        else nextMeta.recps = [msg.value.author, selfId]
      } else delete nextMeta.recps

      applyMeta(meta, nextMeta)
      replyActive = true
      lastReplyMsg = msg
      updateReplyHint(msg)
    }

    function updateReplyHint (msg) {
      if (!replyHintEls.length) return
      if (!msg || !msg.value || !msg.value.content) {
        replyHintEls.forEach(function (el) {
          el.textContent = ''
          el.style.display = 'none'
        })
        return
      }
      var root = msg.value.content.root || msg.key
      var re = h('span', 're: ', api.message_link(root))
      replyHintEls.forEach(function (el) {
        while (el.firstChild) el.removeChild(el.firstChild)
        el.appendChild(h('div.message_content', re))
        el.style.display = ''
      })
    }

    function handleReplyEvent (ev) {
      if (!trigger || !document.body.contains(trigger)) return
      var detail = ev && ev.detail
      var replyMsg = detail && detail.msg
      applyReply(replyMsg)
      showModal(trigger)
    }

    if (modal && opts.listenReplyEvents) {
      window.addEventListener('decent:reply', handleReplyEvent)
    }

    if (modal) {
      var label = opts.triggerLabel || 'Compose'
      trigger = h('button.btn.btn-primary.compose-trigger__button', {
        'aria-label': label,
        title: label,
        onclick: function () {
          clearReply()
          showModal(trigger)
        }
      }, h('span.compose-trigger__icon.material-symbols-outlined', {
        'aria-hidden': 'true'
      }, 'edit'))
      if (opts.autoOpen) {
        var attempts = 0
        var tryOpen = function () {
          if (document.body.contains(trigger) || attempts > 8) {
            showModal(trigger)
            return
          }
          attempts += 1
          setTimeout(tryOpen, 50)
        }
        setTimeout(tryOpen, 0)
      }
      return h('div.compose-trigger', trigger)
    }

    return composer

  }

}
