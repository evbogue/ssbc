'use strict'
var getAvatar = require('ssb-avatar')
var h = require('hyperscript')
var ref = require('ssb-ref')
var path = require('path')
var visualize = require('visualize-buffer')

var pull = require('pull-stream')

var self_id = require('../keys').id

//var plugs = require('../plugs')
//var sbot_query = plugs.first(exports.sbot_query = [])
//var blob_url = require('../plugs').first(exports.blob_url = [])
//

exports.needs = {
  sbot_messagesByType: 'first',
  blob_url: 'first'
}

exports.gives = {
  connection_status: true, avatar_image: true
}


function isFunction (f) {
  return 'function' === typeof f
}


var ready = false
var waiting = []

var last = 0

exports.create = function (api) {
  var avatars  = {}
  // Registry of live img elements per author so the live query can update
  // them when a new avatar message arrives after initial render.
  var imgRegistry = {}

  function updateImgs (id) {
    var list = imgRegistry[id]
    if (!list) return
    var blobSrc = api.blob_url(avatars[id].image)
    for (var i = list.length - 1; i >= 0; i--) {
      var el = list[i]
      // Drop detached elements from the registry to avoid leaks
      if (!document.contains(el)) { list.splice(i, 1); continue }
      el.src = blobSrc
    }
  }

  //blah blah
  return {
    connection_status: function (err) {
      if (err) return
      pull(
        api.sbot_messagesByType({type: 'about', live: true}),
        pull.drain(function (msg) {
          if (msg.sync) {
            ready = true
            while (waiting.length) waiting.shift()()
            return
          }

          var c  = msg.value && msg.value.content
          var by = msg.value && msg.value.author
          if (!c || !c.about) return

          var image = c.image
          if (image && 'object' === typeof image && 'string' === typeof image.link)
            image = image.link

          if (!ref.isBlob(image)) return

          var a = { id: c.about, image: image, by: by, ts: msg.timestamp }

          //set image for avatar.
          //overwrite another avatar you picked.
          if (
            (!avatars[a.id]) ||
            (a.by == self_id) ||
            (a.by === a.id && avatars[a.id].by != self_id)
          ) {
            avatars[a.id] = a
            // Push the new avatar to any already-rendered img elements
            updateImgs(a.id)
          }
        })
      )
    },

    avatar_image: function (author, classes) {
      classes = classes || ''
      if(classes && 'string' === typeof classes) classes = '.avatar--'+classes

      var img = visualize(new Buffer(author.substring(1), 'base64'), 256)
      ;(classes || '').split('.').filter(Boolean).forEach(function (c) {
        img.classList.add(c)
      })

      // Register this element so future live-query updates can reach it
      if (!imgRegistry[author]) imgRegistry[author] = []
      imgRegistry[author].push(img)

      function go () {
        if(avatars[author]) img.src = api.blob_url(avatars[author].image)
      }

      if(!ready)
        waiting.push(go)
      else go()

      return img
    }
  }
}
