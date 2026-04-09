'use strict'

const valid = require('muxrpc-validation')
const ref   = require('../plugins/ref')

// Inline replacements for zerr('Usage', template) error factories.
// Each factory takes the param name + filler values and returns an Error.
function missingAttr(paramName, attr, type) {
  return new Error(`Usage: Param ${paramName} must have a .${attr} of type "${type}"`)
}
function attrType(paramName, attr, type) {
  return new Error(`Usage: .${attr} of param ${paramName} must be of type "${type}"`)
}

function isFilter(v) {
  return v === '@' || v === '%' || v === '&'
}

module.exports = valid({
  msgId(v) {
    if (!ref.isMsg(v)) return 'type'
  },

  msgLink(v) {
    if (!ref.isMsgLink(v)) return 'type'
  },

  feedId(v) {
    if (!ref.isFeed(v)) return 'type'
  },

  blobId(v) {
    if (!ref.isBlob(v)) return 'type'
  },

  msgContent(v, n) {
    const err = this.get('object')(v, n)
    if (err) return err
    if (!v.type || typeof v.type !== 'string')
      return missingAttr(n, 'type', 'string')
  },

  msg(v, n) {
    const err = this.get('object')(v, n)
    if (err) return err

    if (!v.content)
      return missingAttr(n, 'content', 'object|string')
    else if (typeof v.content === 'string')
      ; // encrypted — skip further content checks
    else if (typeof v.content === 'object') {
      if (!v.content.type || typeof v.content.type !== 'string')
        return missingAttr(n, 'content.type', 'string')
    } else
      return missingAttr(n, 'content', 'object|string')

    if (!ref.isFeed(v.author))
      return missingAttr(n, 'author', 'feedId')

    if (typeof v.sequence !== 'number')
      return missingAttr(n, 'sequence', 'number')

    if (v.sequence > 1 && !ref.isMsg(v.previous))
      return missingAttr(n, 'previous', 'msgId')
    else if (v.sequence === 1 && v.previous !== null)
      return missingAttr(n, 'previous', 'null')

    if (typeof v.timestamp !== 'number')
      return missingAttr(n, 'timestamp', 'number')

    if (v.hash !== 'sha256')
      return new Error(`Usage: Param ${n} must have .hash set to "sha256"`)

    if (typeof v.signature !== 'string')
      return missingAttr(n, 'signature', 'string')
  },

  readStreamOpts(v, n) {
    const err = this.get('object')(v, n)
    if (err) return err

    if (v.live && typeof v.live !== 'boolean' && typeof v.live !== 'number')
      return attrType(n, 'live', 'boolean')

    if (v.reverse && typeof v.reverse !== 'boolean' && typeof v.reverse !== 'number')
      return attrType(n, 'reverse', 'boolean')

    if (v.keys && typeof v.keys !== 'boolean' && typeof v.keys !== 'number')
      return attrType(n, 'keys', 'boolean')

    if (v.values && typeof v.values !== 'boolean' && typeof v.values !== 'number')
      return attrType(n, 'values', 'boolean')

    if (v.limit && typeof v.limit !== 'number')
      return attrType(n, 'limit', 'number')

    if (v.fillCache && typeof v.fillCache !== 'boolean' && typeof v.fillCache !== 'number')
      return attrType(n, 'fillCache', 'boolean')
  },

  createHistoryStreamOpts(v, n) {
    if (!ref.isFeed(v.id))
      return missingAttr(n, 'id', 'feedId')

    if (v.seq && typeof v.seq !== 'number')
      return attrType(n, 'seq', 'number')

    if (v.live && typeof v.live !== 'boolean' && typeof v.live !== 'number')
      return attrType(n, 'live', 'boolean')

    if (v.limit && typeof v.limit !== 'number')
      return attrType(n, 'limit', 'number')

    if (v.keys && typeof v.keys !== 'boolean' && typeof v.keys !== 'number')
      return attrType(n, 'keys', 'boolean')

    if (v.values && typeof v.values !== 'boolean' && typeof v.values !== 'number')
      return attrType(n, 'values', 'boolean')
  },

  createUserStreamOpts(v, n) {
    const err = this.get('readStreamOpts')(v, n)
    if (err) return err

    if (!ref.isFeed(v.id))
      return missingAttr(n, 'id', 'feedId')
  },

  messagesByTypeOpts(v, n) {
    const err = this.get('readStreamOpts')(v, n)
    if (err) return err

    if (typeof v.type !== 'string')
      return missingAttr(n, 'type', 'string')
  },

  linksOpts(v, n) {
    const err = this.get('object')(v, n)
    if (err) return err

    if (v.source && !ref.isLink(v.source) && !isFilter(v.source))
      return attrType(n, 'source', 'id|filter')

    if (v.dest && !ref.isLink(v.dest) && !isFilter(v.dest))
      return attrType(n, 'dest', 'id|filter')

    if (v.rel && typeof v.rel !== 'string')
      return attrType(n, 'rel', 'string')

    if (v.live && typeof v.live !== 'boolean' && typeof v.live !== 'number')
      return attrType(n, 'live', 'boolean')

    if (v.reverse && typeof v.reverse !== 'boolean' && typeof v.reverse !== 'number')
      return attrType(n, 'reverse', 'boolean')

    if (v.keys && typeof v.keys !== 'boolean' && typeof v.keys !== 'number')
      return attrType(n, 'keys', 'boolean')

    if (v.values && typeof v.values !== 'boolean' && typeof v.values !== 'number')
      return attrType(n, 'values', 'boolean')
  },

  isBlockedOpts(v, n) {
    const err = this.get('object')(v, n)
    if (err) return err

    if (v.source && !ref.isFeed(v.source))
      return attrType(n, 'source', 'feedId')

    if (v.dest && !ref.isFeed(v.dest))
      return attrType(n, 'dest', 'feedId')
  },

  createFriendStreamOpts(v, n) {
    const err = this.get('object')(v, n)
    if (err) return err

    if (v.start && !ref.isFeed(v.start))
      return attrType(n, 'start', 'feedId')

    if (v.graph && typeof v.graph !== 'string')
      return attrType(n, 'graph', 'string')

    if (v.dunbar && typeof v.dunbar !== 'number')
      return attrType(n, 'dunbar', 'number')

    if (v.hops && typeof v.hops !== 'number')
      return attrType(n, 'hops', 'number')
  }
})
