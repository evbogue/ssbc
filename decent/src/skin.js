'use strict'

// Active skin as a runtime value rather than a one-time stylesheet sniff, so it
// can be switched live (see the Themes page, Phase 4). Resolution order:
//   1. localStorage['decent:skin'] — a deliberate user choice
//   2. <html data-skin="…"> — injected by the UI server as the per-port default
//   3. the linked stylesheet href — back-compat for pages without data-skin
//   4. 'decent' — the legacy single-column skin (plain style.css, no skin link)
//
// 'decent' is the legacy skin: still *detectable* while its port is served, but
// not a *selectable* option. The selectable skins are listed below.

var SKINS = ['decent2', 'ssbpro', 'ssbski', 'plain']
var ALL = ['decent'].concat(SKINS)
var STORE_KEY = 'decent:skin'

function hasLink (name) {
  return typeof document !== 'undefined' &&
    !!document.querySelector('link[rel="stylesheet"][href*="' + name + '-style.css"]')
}

function detectDefault () {
  if (typeof document !== 'undefined') {
    var attr = document.documentElement.getAttribute('data-skin')
    if (ALL.indexOf(attr) !== -1) return attr
    if (hasLink('ssbski')) return 'ssbski'
    if (hasLink('ssbpro')) return 'ssbpro'
    if (hasLink('decent2')) return 'decent2'
    if (hasLink('plain')) return 'plain'
  }
  return 'decent'
}

function get () {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      var stored = window.localStorage.getItem(STORE_KEY)
      if (SKINS.indexOf(stored) !== -1) return stored
    } catch (e) {}
  }
  return detectDefault()
}

var pendingStylesheet

function swapStylesheet (name) {
  if (SKINS.indexOf(name) === -1) return
  if (typeof document === 'undefined') return
  var current = document.querySelector('link[rel="stylesheet"][href*="-style.css"]') ||
    document.querySelector('link[rel="stylesheet"][href*="style.css"]')
  var href = '/' + name + '-style.css'
  if (pendingStylesheet) {
    if (pendingStylesheet.getAttribute('href').split('?')[0] === href) return
    pendingStylesheet.remove()
    pendingStylesheet = null
  }
  if (current && (current.getAttribute('href') || '').split('?')[0] === href) return
  var fresh = document.createElement('link')
  fresh.rel = 'stylesheet'
  fresh.href = href + '?v=' + Date.now()
  pendingStylesheet = fresh
  fresh.onload = function () {
    if (pendingStylesheet !== fresh) return
    pendingStylesheet = null
    if (current) current.remove()
    var fallback = document.querySelector('style[data-decent-style]')
    if (fallback) fallback.remove()
  }
  fresh.onerror = function () {
    if (pendingStylesheet === fresh) pendingStylesheet = null
    fresh.remove()
  }
  document.head.appendChild(fresh)
}

exports.get = get
exports.list = function () { return SKINS.slice() }
exports.is = function (name) { return get() === name }
exports.swapStylesheet = swapStylesheet

// Convenience predicates mirroring the historical app.js flags.
exports.isNetwork = function () { return get() !== 'decent' }
exports.isTopbar = function () { var s = get(); return s === 'ssbpro' || s === 'decent2' || s === 'plain' }

// Persist + reflect a skin choice, then swap the active stylesheet. Passing
// {persist:false} lets preview frames use a skin without overwriting the user's
// saved choice.
exports.set = function (name, opts) {
  if (SKINS.indexOf(name) === -1) return
  opts = opts || {}
  try {
    if (opts.persist !== false && typeof window !== 'undefined' && window.localStorage)
      window.localStorage.setItem(STORE_KEY, name)
  } catch (e) {}
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-skin', name)
    swapStylesheet(name)
  }
}
