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

module.exports = function highlight(code, filename) {
  if (!filename) return Prism.util.encode(code)

  var ext  = (filename.match(/\.(\w+)$/) || [])[1] || ''
  var lang = EXT_LANG[ext.toLowerCase()]
  
  if (!lang || !Prism.languages[lang]) {
    return Prism.util.encode(code)
  }

  try {
    return Prism.highlight(code, Prism.languages[lang], lang)
  } catch (err) {
    console.error('highlight error:', err)
    return Prism.util.encode(code)
  }
}
