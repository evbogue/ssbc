'use strict'
// Shared app-level toggle for desktop notifications. Browsers only let us
// request permission, never revoke it, so this localStorage flag lets the user
// mute notifications without touching browser settings. Both the emitter
// (notify.js) and the in-app card (notifications.js) read it. Default is on:
// granting permission is already an explicit opt-in.
var STORAGE_KEY = 'notifications-muted'

function hasStorage () {
  return typeof window !== 'undefined' && !!window.localStorage
}

exports.isEnabled = function () {
  if (!hasStorage()) return true
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== '1'
  } catch (_) {
    return true
  }
}

exports.setEnabled = function (enabled) {
  if (!hasStorage()) return
  try {
    if (enabled) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, '1')
  } catch (_) {}
}
