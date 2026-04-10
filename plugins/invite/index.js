'use strict'

const valid   = require('muxrpc-validation')({})
const crypto  = require('crypto')
const net     = require('net')
const ssbKeys = require('ssb-keys')
const fs      = require('fs')
const ref     = require('../ref')
const path    = require('path')
const { promisify } = require('util')

const createClient = require('ssb-client/client')

// invite plugin
// adds methods for producing invite-codes,
// which peers can use to command your server to follow them.

function isString(s) { return typeof s === 'string' }
function isObject(o) { return o && typeof o === 'object' }
function isNumber(n) { return typeof n === 'number' && !isNaN(n) }

function createJsonStore(filename) {
  fs.mkdirSync(path.dirname(filename), { recursive: true })

  let state = {}
  if (fs.existsSync(filename)) {
    try {
      state = JSON.parse(fs.readFileSync(filename, 'utf8'))
    } catch (_) {
      state = {}
    }
  }

  function flush(cb) {
    fs.writeFile(filename, JSON.stringify(state, null, 2), cb)
  }

  return {
    get(key, cb) {
      const value = state[key]
      if (value === undefined) return cb(new Error('NotFound'))
      cb(null, value)
    },
    put(key, value, cb) {
      state[key] = value
      flush(cb)
    }
  }
}

function isPrivateIP(host) {
  if (!isString(host)) return false
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true
  // IPv4 private ranges
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host)
  if (v4) {
    const [, a, b] = v4.map(Number)
    if (a === 10) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true
    if (a === 127) return true
  }
  if (net.isIPv6(host)) {
    if (host === '::1') return true
    if (/^fe80:/i.test(host)) return true
    if (/^fc00:/i.test(host) || /^fd/i.test(host)) return true
  }
  return false
}

module.exports = {
  name: 'invite',
  version: '1.0.0',
  manifest: require('./manifest.json'),
  permissions: {
    master: { allow: ['create'] }
  },
  init(server, config) {
    let codesDB
    if (server.sublevel) {
      codesDB = server.sublevel('codes')
    } else {
      codesDB = createJsonStore(path.join(config.path, 'invite-codes.json'))
    }

    // auth hook: allow invite codes to authenticate
    server.auth.hook(function (fn, args) {
      const [pubkey, cb] = args
      fn(pubkey, (err, auth) => {
        if (err || auth) return cb(err, auth)
        codesDB.get(pubkey, (_, code) => {
          if (code && code.used >= code.total) cb()
          else cb(null, code && code.permissions)
        })
      })
    })

    function getInviteAddress() {
      return config.allowPrivate
        ? server.getAddress('public') || server.getAddress('local') || server.getAddress('private')
        : server.getAddress('public')
    }

    return {
      create: valid.async(function (opts, cb) {
        opts = opts || {}
        if (isNumber(opts))
          opts = { uses: opts }
        else if (isObject(opts)) {
          if (opts.modern) opts.uses = 1
        } else if (typeof opts === 'function') {
          cb = opts; opts = {}
        }

        const addr = getInviteAddress()
        if (!addr) return cb(new Error(
          'no address available for creating an invite,' +
          'configuration needed for server.\n' +
          'see: https://github.com/ssbc/ssb-config/#connections'
        ))

        const firstAddr = addr.split(';').shift()
        const host = ref.parseAddress(firstAddr).host
        if (typeof host !== 'string')
          return cb(new Error('Could not parse host portion from server address:' + firstAddr))

        if (opts.external) {
          // use explicitly provided external host
        } else if (!config.allowPrivate && (isPrivateIP(host) || host === '')) {
          return cb(new Error('Server has no public ip address, cannot create useable invitation'))
        }

        const seed = crypto.randomBytes(32)
        const keyCap = ssbKeys.generate('ed25519', seed)
        const owner = server.id

        codesDB.put(keyCap.id, {
          id: keyCap.id,
          total: +opts.uses || 1,
          note: opts.note,
          used: 0,
          permissions: { allow: ['invite.use', 'getAddress'], deny: null }
        }, (err) => {
          if (err) return cb(err)

          if (opts.modern) {
            const ws_addr = getInviteAddress().split(';').sort((a, b) =>
              +/^ws/.test(b) - +/^ws/.test(a)
            ).shift()
            if (!/^ws/.test(ws_addr)) throw new Error('not a ws address:' + ws_addr)
            cb(null, ws_addr + ':' + seed.toString('base64'))
          } else {
            const parsedAddr = ref.parseAddress(opts.external
              ? opts.external + ':' + ref.parseAddress(firstAddr).port + ':' + ref.parseAddress(firstAddr).key
              : firstAddr)
            cb(null, [
              opts.external || parsedAddr.host,
              parsedAddr.port,
              parsedAddr.key
            ].join(':') + '~' + seed.toString('base64'))
          }
        })
      }, 'number|object', 'string?'),

      use: valid.async(function (req, cb) {
        const rpc = this
        codesDB.get(rpc.id, (err, invite) => {
          if (err) return cb(err)

          server.friends.get((err, follows) => {
            if (follows && follows[server.id] && follows[server.id][req.feed])
              return cb(new Error('already following'))

            if (!req.feed) return cb(new Error('feed to follow is missing'))
            if (invite.used >= invite.total) return cb(new Error('invite has expired'))

            invite.used++
            if (invite.used >= invite.total)
              invite.permissions = { allow: [], deny: null }

            codesDB.put(rpc.id, invite, (err) => {
              server.emit('log:info', ['invite', rpc.id, 'use', req])
              server.publish({
                type: 'contact',
                contact: req.feed,
                following: true,
                pub: true,
                note: invite.note || undefined
              }, cb)
            })
          })
        })
      }, 'object'),

      accept: valid.async(function (invite, cb) {
        if (isObject(invite)) invite = invite.invite
        if (invite.charAt(0) === '"' && invite.charAt(invite.length - 1) === '"')
          invite = invite.slice(1, -1)

        let modern = false
        if (ref.isInvite(invite)) {
          if (ref.isLegacyInvite(invite)) {
            const parts = invite.split('~')
            const opts = ref.parseAddress(parts[0])
            const protocol = opts.host.endsWith('.onion') ? 'onion:' : 'net:'
            invite = protocol + opts.host + ':' + opts.port + '~shs:' + opts.key.slice(1, -8) + ':' + parts[1]
          } else {
            modern = true
          }
        }

        const opts = ref.parseAddress(ref.parseInvite(invite).remote)

        function connect(cb) {
          createClient({
            keys: true,
            remote: invite,
            config,
            manifest: { invite: { use: 'async' }, getAddress: 'async' }
          }, cb)
        }

        // retry up to 3 times with short backoff
        function retry(fn, cb) {
          let n = 0;
          (function next() {
            const start = Date.now()
            fn((err, value) => {
              n++
              if (n >= 3) cb(err, value)
              else if (err) setTimeout(next, 500 + (Date.now() - start) * n)
              else cb(null, value)
            })
          })()
        }

        retry(connect, (err, rpc) => {
          if (err) return cb(new Error('could not connect to server: ' + err.message))

          rpc.invite.use({ feed: server.id }, (err, msg) => {
            if (err) return cb(new Error('invite not accepted: ' + err.message))

            const publishFollow = promisify(server.publish.bind(server))
            const publishPub = opts.host
              ? promisify(server.publish.bind(server))
              : null

            const tasks = [publishFollow({
              type: 'contact',
              following: true,
              autofollow: true,
              contact: opts.key
            })]

            if (publishPub) {
              tasks.push(publishPub({ type: 'pub', address: opts }))
            }

            Promise.all(tasks).then((results) => {
              rpc.close()
              if (server.gossip) server.gossip.add(ref.parseInvite(invite).remote, 'seed')
              cb(null, results)
            }).catch(cb)
          })
        })
      }, 'string')
    }
  }
}
