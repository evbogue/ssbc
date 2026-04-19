'use strict'

var Prism = require('prismjs')

// Load languages
require('prismjs/components/prism-javascript')
require('prismjs/components/prism-typescript')
require('prismjs/components/prism-python')
require('prismjs/components/prism-ruby')
require('prismjs/components/prism-go')
require('prismjs/components/prism-rust')
require('prismjs/components/prism-c')
require('prismjs/components/prism-cpp')
require('prismjs/components/prism-css')
require('prismjs/components/prism-bash')
require('prismjs/components/prism-sql')
require('prismjs/components/prism-markdown')
require('prismjs/components/prism-json')
require('prismjs/components/prism-yaml')

var EXT_LANG = {
  js: 'javascript', ts: 'typescript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  json: 'json',
  py: 'python', pyw: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hh: 'cpp',
  css: 'css', less: 'css', scss: 'css',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  sql: 'sql',
  html: 'markup', xml: 'markup', svg: 'markup',
  md: 'markdown', markdown: 'markdown',
  yml: 'yaml', yaml: 'yaml'
}

function langFor(filename) {
  if (!filename) return null
  var ext  = (filename.match(/\.(\w+)$/) || [])[1] || ''
  var lang = EXT_LANG[ext.toLowerCase()]
  if (!lang || !Prism.languages[lang]) return null
  return lang
}

module.exports = function highlight(code, filename) {
  var lang = langFor(filename)
  if (!lang) return Prism.util.encode(code)

  try {
    return Prism.highlight(code, Prism.languages[lang], lang)
  } catch (err) {
    console.error('highlight error:', err)
    return Prism.util.encode(code)
  }
}

// Returns Array<Array<Node>> — one inner array of DOM nodes per source line.
// Nested tokens are flattened (their classes concatenated); acceptable for our
// target languages where multi-line tokens are single-level (block comments,
// template literals, docstrings). Preserves Prism's `.token.<type>` classes so
// the existing light palette applies.
module.exports.intoLines = function intoLines(code, filename) {
  var lang = langFor(filename)
  var tokens = lang
    ? Prism.tokenize(code, Prism.languages[lang])
    : [code]
  var lines = [[]]

  function emit(text, classes) {
    var parts = text.split('\n')
    for (var i = 0; i < parts.length; i++) {
      if (i > 0) lines.push([])
      if (!parts[i].length) continue
      if (classes.length) {
        var span = document.createElement('span')
        span.className = classes.join(' ')
        span.textContent = parts[i]
        lines[lines.length - 1].push(span)
      } else {
        lines[lines.length - 1].push(document.createTextNode(parts[i]))
      }
    }
  }

  function walk(ts, classes) {
    for (var i = 0; i < ts.length; i++) {
      var t = ts[i]
      if (typeof t === 'string') {
        emit(t, classes)
      } else {
        var cls = classes.concat(['token', t.type])
        if (t.alias) {
          var aliases = typeof t.alias === 'string' ? [t.alias] : t.alias
          cls = cls.concat(aliases)
        }
        if (typeof t.content === 'string') {
          emit(t.content, cls)
        } else if (Array.isArray(t.content)) {
          walk(t.content, cls)
        } else {
          walk([t.content], cls)
        }
      }
    }
  }

  walk(tokens, [])
  return lines
}
