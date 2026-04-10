'use strict'
// Vendored from ssb-logging@1.0.0
// Subscribes to log:* events on the server and prints them to stdout.
// bash-color replaced with ANSI escape codes; isString bug fixed.

const LOG_LEVELS   = ['error', 'warning', 'notice', 'info']
const DEFAULT_LEVEL = LOG_LEVELS.indexOf('notice')

// ANSI colour helpers
const cyan   = (s) => '\x1b[36m' + s + '\x1b[0m'
const green  = (s) => '\x1b[32m' + s + '\x1b[0m'
const blue   = (s) => '\x1b[34m' + s + '\x1b[0m'
const yellow = (s) => '\x1b[33m' + s + '\x1b[0m'
const red    = (s) => '\x1b[31m' + s + '\x1b[0m'

function isString(s) {
  return typeof s === 'string'
}

function indent(o) {
  return o.split('\n').map((e) => '  ' + e).join('\n')
}

function formatter(id, levelLabel) {
  const b = id.substring(0, 4)
  return function (ary) {
    const plug  = ary[0].substring(0, 4).toUpperCase()
    const msgId = ary[1]
    const verb  = ary[2]
    const data  = ary.length > 4 ? ary.slice(3) : ary[3]
    const _data = (isString(data) ? data : JSON.stringify(data)) || ''

    const pre    = [plug, msgId, cyan(verb)].join(' ')
    const length = 5 + pre.length + 1 + _data.length
    const lines  = isString(data) && data.split('\n').length > 1

    if (process.stdout.columns > length && !lines) {
      console.log([levelLabel, b, pre, _data].join(' '))
    } else {
      console.log([levelLabel, b, pre].join(' '))
      if (lines)
        console.log(indent(data))
      else if (data && data.stack)
        console.log(indent(data.stack))
      else if (data)
        console.log(indent(JSON.stringify(data, null, 2)))
    }
  }
}

function logging(server, conf) {
  let level
  if (conf.logging && conf.logging.level) {
    level = LOG_LEVELS.indexOf(conf.logging.level)
  } else {
    level = DEFAULT_LEVEL
  }

  if (level === -1) {
    console.log('Warning, logging.level configured to an invalid value:', conf.logging.level)
    console.log('Should be one of:', LOG_LEVELS.join(', '))
    level = DEFAULT_LEVEL
  }

  const id = server.id
  if (level >= LOG_LEVELS.indexOf('info'))
    server.on('log:info',    formatter(id, green('info')))
  if (level >= LOG_LEVELS.indexOf('notice'))
    server.on('log:notice',  formatter(id, blue('note')))
  if (level >= LOG_LEVELS.indexOf('warning'))
    server.on('log:warning', formatter(id, yellow('warn')))
  if (level >= LOG_LEVELS.indexOf('error'))
    server.on('log:error',   formatter(id, red('err!')))
}

module.exports      = logging
module.exports.init = logging
