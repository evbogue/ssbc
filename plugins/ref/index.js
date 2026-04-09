'use strict'

const net = require('net')

// SSB IDs are 32-byte values base64-encoded with a sigil prefix and algorithm suffix.
// 32 bytes → 43 base64 chars + 1 '=' pad char.
const feedIdRegex = exports.feedIdRegex = /^@[A-Za-z0-9/+]{43}=\.(?:sha256|ed25519)$/
const blobIdRegex = exports.blobIdRegex = /^&[A-Za-z0-9/+]{43}=\.sha256$/
const msgIdRegex  = exports.msgIdRegex  = /^%[A-Za-z0-9/+]{43}=\.sha256$/

const parseLinkRegex = /^((@|%|&)[A-Za-z0-9/+]{43}=\.[\w\d]+)(\?(.+))?$/
const linkRegex = exports.linkRegex = /^(@|%|&)[A-Za-z0-9/+]{43}=\.[\w\d]+$/
const extractRegex = /([@%&][A-Za-z0-9/+]{43}=\.[\w\d]+)/

const DEFAULT_PORT = 8008

function isString(s) { return typeof s === 'string' }
function isObject(o) { return o && typeof o === 'object' && !Array.isArray(o) }
function isInteger(n) { return Number.isInteger(n) }

function isIPAddress(s) {
  return net.isIPv4(s) || net.isIPv6(s)
}

function isDomain(s) {
  if (!isString(s)) return false
  // simple hostname check: labels separated by dots, each 1-63 chars, alphanumeric + hyphens
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(s)
}

const isHost = function (addr) {
  if (!isString(addr)) return false
  addr = addr.replace(/^wss?:\/\//, '')
  return isIPAddress(addr) || isDomain(addr) || addr === 'localhost'
}

const isPort = (p) => isInteger(p) && p <= 65536

const isFeedId = exports.isFeed = exports.isFeedId =
  (data) => isString(data) && feedIdRegex.test(data)

const isMsgId = exports.isMsg = exports.isMsgId =
  (data) => isString(data) && msgIdRegex.test(data)

const isBlobId = exports.isBlob = exports.isBlobId =
  (data) => isString(data) && blobIdRegex.test(data)

const isLink = exports.isLink = function (data) {
  if (!isString(data)) return false
  const idx = data.indexOf('?')
  const clean = idx !== -1 ? data.substring(0, idx) : data
  return isFeedId(clean) || isMsgId(clean) || isBlobId(clean)
}

exports.isBlobLink = (s) => s[0] === '&' && isLink(s)
exports.isMsgLink  = (s) => s[0] === '%' && isLink(s)

const normalizeChannel = exports.normalizeChannel = function (data) {
  if (typeof data === 'string') {
    data = data.toLowerCase().replace(/\s|,|\.|\?|!|<|>|\(|\)|\[|\]|"|#/g, '')
    if (data.length > 0 && data.length < 30) return data
  }
}

// ── Multiserver address helpers ────────────────────────────────────────────

// Check that a string looks like a multiserver address (has at least one unescaped ~)
function isMultiServerAddressStr(str) {
  return isString(str) && str.indexOf('~') !== -1 && !/^[^~]+$/.test(str)
}

// Decode a multiserver address string into transport/transform pairs
// Format: "transport:data~transform:data;transport:data~transform:data"
function decodeMultiServerAddress(str) {
  if (!isString(str)) return null
  return str.split(';').map(addr => {
    const parts = addr.split('~')
    return parts.map(part => {
      const colon = part.indexOf(':')
      if (colon === -1) return { name: part, data: [] }
      return { name: part.slice(0, colon), data: part.slice(colon + 1).split(':') }
    })
  })
}

function checkMultiServerAddress(str) {
  if (!isString(str)) return false
  // must have at least one address with transport and transform separated by ~
  return /[^!]~/.test(str)
}

const parseMultiServerAddress = function (data) {
  if (!isString(data)) return false
  if (!checkMultiServerAddress(data)) return false

  const decoded = decodeMultiServerAddress(data)
  if (!decoded) return false

  const addr = decoded.find(address =>
    address[0] && address[1] &&
    /^(net|wss?|onion)$/.test(address[0].name) &&
    /^shs/.test(address[1].name)
  )

  if (!Array.isArray(addr)) return false

  const portStr = addr[0].data[addr[0].data.length - 1]
  const port = +portStr
  const hostParts = addr[0].data.slice(0, addr[0].data.length - 1)
  const hostPrefix = /^wss?$/.test(addr[0].name) ? addr[0].name + ':' :
                     /^onion$/.test(addr[0].name) ? '' : ''
  const host = hostPrefix + hostParts.join(':')
  const key = '@' + addr[1].data[0] + '.ed25519'
  const seed = addr[1].data[2]

  if (!(isHost(host || addr[0].name) || /^wss?:/.test(host)) ||
      !isPort(port) || !isFeedId(key)) return false

  const address = { host, port, key }
  if (seed) address.seed = seed
  return address
}

const toLegacyAddress = parseMultiServerAddress
exports.toLegacyAddress = toLegacyAddress

const isLegacyAddress = exports.isLegacyAddress =
  (addr) => isObject(addr) && isHost(addr.host) && isPort(addr.port) && isFeedId(addr.key)

const toMultiServerAddress = exports.toMultiServerAddress = function (addr) {
  if (checkMultiServerAddress(addr)) return addr
  if (!isPort(addr.port)) throw new Error('ssb-ref.toMultiServerAddress - invalid port:' + addr.port)
  if (!isHost(addr.host)) throw new Error('ssb-ref.toMultiServerAddress - invalid host:' + addr.host)
  if (!isFeedId(addr.key)) throw new Error('ssb-ref.toMultiServerAddress - invalid key:' + addr.key)

  return (
    /^wss?:/.test(addr.host) ? addr.host
      : /\.onion$/.test(addr.host) ? 'onion:' + addr.host
        : 'net:' + addr.host
  ) + ':' + addr.port + '~shs:' + addr.key.substring(1, addr.key.indexOf('.'))
}

const isAddress = exports.isAddress = function (data) {
  if (isObject(data)) {
    return isFeedId(data.key) && isPort(data.port) && isHost(data.host)
  }
  if (!isString(data)) return false
  if (checkMultiServerAddress(data)) return true
  const parts = data.split(':')
  const id = parts.pop(), port = parts.pop(), host = parts.join(':')
  return isFeedId(id) && isPort(+port) && isHost(host)
}

const getKeyFromAddress = exports.getKeyFromAddress = function (addr) {
  if (addr.key) return addr.key
  const data = decodeMultiServerAddress(addr)
  if (!data) return
  for (const address of data) {
    for (const protocol of address) {
      if (/^shs/.test(protocol.name))
        return '@' + protocol.data[0] + '.ed25519'
    }
  }
}

const parseAddress = function (e) {
  if (isString(e)) {
    if (e.indexOf('~') !== -1) return parseMultiServerAddress(e)
    const parts = e.split(':')
    const id = parts.pop(), port = parts.pop(), host = parts.join(':')
    return { host, port: +(port || DEFAULT_PORT), key: id }
  }
  return e
}
exports.parseAddress = parseAddress

const toAddress = exports.toAddress = function (e) {
  e = parseAddress(e)
  e.port = e.port || DEFAULT_PORT
  e.host = e.host || 'localhost'
  return e
}

// ── Invite helpers ────────────────────────────────────────────────────────

const legacyInviteRegex = /^[A-Za-z0-9/+]{43}=$/
const legacyInviteFixerRegex = /#.*$/

const isLegacyInvite = exports.isLegacyInvite = function (data) {
  if (!isString(data)) return false
  data = data.replace(legacyInviteFixerRegex, '')
  const parts = data.split('~')
  return parts.length === 2 && isAddress(parts[0]) && legacyInviteRegex.test(parts[1])
}

const isMultiServerInvite = exports.isMultiServerInvite = function (data) {
  if (!isString(data)) return false
  return !!parseMultiServerInvite(data)
}

const isInvite = exports.isInvite = function (data) {
  if (!isString(data)) return false
  return isLegacyInvite(data) || isMultiServerInvite(data)
}

exports.parseLink = function parseLink(ref) {
  const match = parseLinkRegex.exec(ref)
  if (match && match[1]) {
    if (match[3]) {
      const query = Object.fromEntries(new URLSearchParams(match[4]))
      // unbox keys have '+' converted to ' ' by URLSearchParams; restore
      if (typeof query.unbox === 'string') query.unbox = query.unbox.replace(/ /g, '+')
      return { link: match[1], query }
    }
    return { link: match[1] }
  }
}

function parseLegacyInvite(invite) {
  const redirect = invite.split('#')
  invite = redirect.shift()
  const parts = invite.split('~')
  const addr = toAddress(parts[0])
  const remote = toMultiServerAddress(addr)
  return {
    invite: remote + ':' + parts[1],
    key: addr.key,
    redirect: redirect.length ? '#' + redirect.join('#') : null
  }
}

function parseMultiServerInvite(invite) {
  const redirect = invite.split('#')
  if (!redirect.length) return null
  invite = redirect.shift()
  const addr = toLegacyAddress(invite)
  if (!addr) return null
  delete addr.seed
  return {
    invite,
    remote: toMultiServerAddress(addr),
    key: addr.key,
    redirect: redirect.length ? '#' + redirect.join('#') : null
  }
}

exports.parseLegacyInvite = parseLegacyInvite
exports.parseMultiServerInvite = parseMultiServerInvite

exports.parseInvite = function (invite) {
  return isLegacyInvite(invite)
    ? parseLegacyInvite(invite)
    : isMultiServerInvite(invite)
      ? parseMultiServerInvite(invite)
      : null
}

exports.type = function (id) {
  if (!isString(id)) return false
  const c = id.charAt(0)
  if (c === '@' && isFeedId(id))   return 'feed'
  if (c === '%' && isMsgId(id))    return 'msg'
  if (c === '&' && isBlobId(id))   return 'blob'
  if (isAddress(id))               return 'address'
  if (isInvite(id))                return 'invite'
  return false
}

exports.extract = function (data) {
  if (!isString(data)) return false
  let res = extractRegex.exec(data)
  if (res) return res[0]
  try { data = decodeURIComponent(data) } catch (_) {}
  data = data.replace(/&amp;/g, '&')
  res = extractRegex.exec(data)
  return res && res[0]
}
