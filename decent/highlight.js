'use strict'

// Minimal syntax highlighter — no dependencies, ~120 lines.
// Produces HTML string with <span class="hl-*"> tokens.

var EXT_LANG = {
  js: 'js', ts: 'js', jsx: 'js', mjs: 'js', cjs: 'js',
  json: 'json',
  py: 'python', pyw: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  c: 'c', h: 'c', cpp: 'c', cc: 'c', hh: 'c',
  css: 'css', less: 'css', scss: 'css',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  sql: 'sql',
  html: 'html', xml: 'html', svg: 'html'
}

var KEYWORDS = {
  js:     'const let var function return if else for while do break continue class extends import export default from async await new this typeof void delete null undefined true false try catch finally throw switch case of in instanceof static super yield'.split(' '),
  json:   'true false null'.split(' '),
  python: 'def class return if elif else for while import from as try except finally with pass break continue lambda yield None True False and or not in is raise del global nonlocal assert'.split(' '),
  ruby:   'def class module do end if elsif else unless case when return yield require attr_accessor nil true false and or not'.split(' '),
  go:     'func var const type struct interface map chan go defer select case range break continue return import package for if else switch nil true false'.split(' '),
  rust:   'fn let mut const struct enum impl trait use pub mod match if else for while loop return true false None Some Ok Err self Self super crate async await'.split(' '),
  c:      'if else for while do return struct typedef enum void int char float double long short unsigned signed static const sizeof NULL break continue switch case default extern inline'.split(' '),
  css:    [],
  shell:  'if then else elif fi for do done while case esac in export echo read'.split(' '),
  sql:    'SELECT FROM WHERE JOIN LEFT RIGHT INNER OUTER ON AS ORDER BY GROUP HAVING LIMIT OFFSET INSERT INTO UPDATE SET DELETE CREATE TABLE INDEX DROP ALTER AND OR NOT NULL IS IN LIKE BETWEEN DISTINCT COUNT SUM AVG MIN MAX'.split(' ')
}

// Line comment prefix per language (null = none)
var LINE_CMT = {
  js: '//', json: null, python: '#', ruby: '#', go: '//',
  rust: '//', c: '//', css: null, shell: '#', sql: '--', html: null
}

// Block comment [open, close] per language (null = none)
var BLOCK_CMT = {
  js: ['/*', '*/'], go: ['/*', '*/'], rust: ['/*', '*/'],
  c: ['/*', '*/'], css: ['/*', '*/'], html: ['<!--', '-->'],
  json: null, python: null, ruby: null, shell: null, sql: null
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function span(cls, text) {
  return '<span class="hl-' + cls + '">' + esc(text) + '</span>'
}

module.exports = function highlight(code, filename) {
  if (!filename) return esc(code)

  var ext  = (filename.match(/\.(\w+)$/) || [])[1] || ''
  var lang = EXT_LANG[ext.toLowerCase()]
  if (!lang) return esc(code)

  var kwSet    = new Set(KEYWORDS[lang] || [])
  var lineCmt  = LINE_CMT[lang]
  var blockCmt = BLOCK_CMT[lang]

  var out = ''
  var i   = 0
  var n   = code.length

  while (i < n) {
    // Block comment
    if (blockCmt && code.startsWith(blockCmt[0], i)) {
      var end = code.indexOf(blockCmt[1], i + blockCmt[0].length)
      end = end === -1 ? n : end + blockCmt[1].length
      out += span('comment', code.slice(i, end))
      i = end
      continue
    }

    // Line comment
    if (lineCmt && code.startsWith(lineCmt, i)) {
      var nl = code.indexOf('\n', i)
      nl = nl === -1 ? n : nl
      out += span('comment', code.slice(i, nl))
      i = nl
      continue
    }

    var ch = code[i]

    // Strings: double, single, backtick
    if (ch === '"' || ch === "'" || ch === '`') {
      var j = i + 1
      while (j < n) {
        if (code[j] === '\\') { j += 2; continue }
        if (code[j] === ch)   { j++; break }
        j++
      }
      out += span('string', code.slice(i, j))
      i = j
      continue
    }

    // Numbers (simple: digit at non-word boundary)
    if (/\d/.test(ch) && (i === 0 || /\W/.test(code[i - 1]))) {
      var k = i
      while (k < n && /[\d._xXa-fA-FbBoO]/.test(code[k])) k++
      out += span('number', code.slice(i, k))
      i = k
      continue
    }

    // Identifiers / keywords
    if (/[a-zA-Z_$]/.test(ch)) {
      var m = i
      while (m < n && /[\w$]/.test(code[m])) m++
      var word = code.slice(i, m)
      out += kwSet.has(word) ? span('keyword', word) : esc(word)
      i = m
      continue
    }

    // Punctuation / operators — highlight common ones
    if ('(){}[]'.indexOf(ch) !== -1) {
      out += span('punct', ch); i++; continue
    }

    out += esc(ch)
    i++
  }

  return out
}
