'use strict'
const fs   = require('fs')
const path = require('path')

const buildDir   = path.join(__dirname, '..', 'build')
const srcCss     = path.join(__dirname, '..', 'src', 'style.css')
const destCss    = path.join(buildDir, 'style.css')
const srcBaseCss    = path.join(__dirname, '..', 'src', 'base.css')
const destBaseCss   = path.join(buildDir, 'base.css')
const srcSsbskiCss  = path.join(__dirname, '..', 'src', 'ssbski-style.css')
const destSsbskiCss = path.join(buildDir, 'ssbski-style.css')
const srcSsbproCss  = path.join(__dirname, '..', 'src', 'ssbpro-style.css')
const destSsbproCss = path.join(buildDir, 'ssbpro-style.css')
const srcDecent2Css  = path.join(__dirname, '..', 'src', 'decent2-style.css')
const destDecent2Css = path.join(buildDir, 'decent2-style.css')
const srcSsbskiLogo  = path.join(__dirname, '..', 'src', 'ssbski-logo.png')
const destSsbskiLogo = path.join(buildDir, 'ssbski-logo.png')
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

// Shared structural skin, @imported by ssbski-style.css and ssbpro-style.css.
// Reached only through @import, so it must live in the build dir to be served.
if (fs.existsSync(srcBaseCss))
  fs.copyFileSync(srcBaseCss, destBaseCss)

if (fs.existsSync(srcSsbskiCss))
  fs.copyFileSync(srcSsbskiCss, destSsbskiCss)

if (fs.existsSync(srcSsbproCss))
  fs.copyFileSync(srcSsbproCss, destSsbproCss)

if (fs.existsSync(srcDecent2Css))
  fs.copyFileSync(srcDecent2Css, destDecent2Css)

// ssbski brand logo (rail wordmark + favicon), served from the build dir
if (fs.existsSync(srcSsbskiLogo))
  fs.copyFileSync(srcSsbskiLogo, destSsbskiLogo)
