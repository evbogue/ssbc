'use strict'
var ref     = require('ssb-ref')
var keys    = require('../keys')
var ssbKeys = require('ssb-keys')
var ssbVal  = require('ssb-validate')
var config  = require('ssb-config/inject')(process.env.ssb_appname)

function unbox_value (msg) {
  var plaintext = ssbKeys.unbox(msg.content, keys)
  if (!plaintext) return null
  return {
    previous:  msg.previous,
    author:    msg.author,
    sequence:  msg.sequence,
    timestamp: msg.timestamp,
    hash:      msg.hash,
    content:   plaintext,
    private:   true
  }
}

module.exports = {
  needs: { sbot_add: 'first', sbot_getLatest: 'first' },
  gives: { message_unbox: true, message_box: true, publish: true },
  create: function (api) {
    var out = {}

    out.message_unbox = function (msg) {
      if (msg.value) {
        var value = unbox_value(msg.value)
        if (value)
          return { key: msg.key, value: value, timestamp: msg.timestamp }
      } else {
        return unbox_value(msg)
      }
    }

    out.message_box = function (content) {
      return ssbKeys.box(content, content.recps.map(function (e) {
        return ref.isFeed(e) ? e : e.link
      }))
    }

    out.sign_message = function (content, cb) {
      api.sbot_getLatest(keys.id, function (err, latest) {
        if (err) return cb(err)

        var feedState = latest
          ? {
              id: latest.key,
              sequence: latest.value.sequence,
              timestamp: latest.value.timestamp,
              queue: []
            }
          : null

        try {
          cb(null, ssbVal.create(feedState, keys, config.caps && config.caps.sign, content, Date.now()))
        } catch (signErr) {
          cb(signErr)
        }
      })
    }

    out.publish = function (content, cb) {
      if (content.recps) content = out.message_box(content)
      out.sign_message(content, function (err, msgValue) {
        if (err) {
          if (cb) cb(err)
          else throw err
          return
        }
        api.sbot_add(msgValue, function (addErr, msg) {
          if (addErr) {
            if (cb) cb(addErr)
            else throw addErr
            return
          }
          if (cb) cb(null, msg)
        })
      })
    }

    return out
  }
}
