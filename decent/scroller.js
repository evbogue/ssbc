'use strict'

var pull = require('pull-stream')
var Pause = require('pull-pause')
var isVisible = require('is-visible').isVisible

var next = 'undefined' === typeof setImmediate ? setTimeout : setImmediate

function isBottom (scroller, buffer) {
  var rect = scroller.getBoundingClientRect()
  var topmax = scroller.scrollTopMax || (scroller.scrollHeight - rect.height)
  return scroller.scrollTop >= +((topmax) - (buffer || 0))
}

function isTop (scroller, buffer) {
  return scroller.scrollTop <= (buffer || 0)
}

function isFilled (content) {
  return !isVisible(content) && content.children.length > 10
}

function isEnd (scroller, buffer, top) {
  return (top ? isTop : isBottom)(scroller, buffer)
}

function append (list, el, top, sticky) {
  if (!el) return
  var s = list.scrollHeight
  if (top && list.firstChild) list.insertBefore(el, list.firstChild)
  else list.appendChild(el)

  if (top !== sticky) {
    var d = (list.scrollHeight - s) + 1
    list.scrollTop = list.scrollTop + d
  }
}

function overflow (el) {
  return el.style.overflowY || el.style.overflow || (function () {
    var style = getComputedStyle(el)
    return style.overflowY || el.style.overflow
  })()
}

function isPullStreamDone (err) {
  return err === true || err == null
}

var buffer = 100

module.exports = function Scroller (scroller, content, render, top, sticky, cb) {
  if ('function' === typeof content) {
    cb = sticky
    top = render
    render = content
    content = scroller
  }

  var f = overflow(scroller)
  if (!/auto|scroll/.test(f))
    throw new Error('scroller.style.overflowY must be scroll or auto, was:' + f + '!')

  scroller.addEventListener('scroll', scroll)

  var pause = Pause(function () {})
  var queue = []

  function add () {
    if (queue.length)
      append(content, render(queue.shift()), top, sticky)
  }

  function scroll () {
    if (isEnd(scroller, buffer, top) || isFilled(content)) {
      pause.resume()
      add()
    }
  }

  pause.pause()

  next(function retry () {
    if (scroller.parentElement) pause.resume()
    else setTimeout(retry, 100)
  })

  return pull(
    pause,
    pull.drain(function (e) {
      queue.push(e)
      if (!isVisible(content)) {
        if (content.children.length < 10) add()
      } else if (isEnd(scroller, buffer, top)) add()

      if (queue.length > 5) pause.pause()
    }, function (err) {
      if (isPullStreamDone(err)) {
        if (cb) cb(null)
        return
      }
      if (cb) cb(err)
      else console.error(err)
    })
  )
}
