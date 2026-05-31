'use strict'
const fs   = require('fs')
const path = require('path')

const buildDir   = path.join(__dirname, '..', 'build')
const srcCss     = path.join(__dirname, '..', 'src', 'style.css')
const destCss    = path.join(buildDir, 'style.css')
const srcSsbskiCss  = path.join(__dirname, '..', 'src', 'ssbski-style.css')
const destSsbskiCss = path.join(buildDir, 'ssbski-style.css')
// app.js requires ../../style.css.json to inline styles as a fallback when
// no <link rel="stylesheet"> is present. Generate it from the source CSS.
const destCssJson = path.join(__dirname, '..', 'src', 'style.css.json')

if (!fs.existsSync(buildDir))
  fs.mkdirSync(buildDir, { recursive: true })

if (fs.existsSync(srcCss)) {
  // Copy CSS for standalone serving
  fs.copyFileSync(srcCss, destCss)
  // Write JSON representation for the browserify inline-fallback in app.js
  fs.writeFileSync(destCssJson, JSON.stringify(fs.readFileSync(srcCss, 'utf8')))
}

if (fs.existsSync(srcSsbskiCss))
  fs.copyFileSync(srcSsbskiCss, destSsbskiCss)
