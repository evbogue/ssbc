'use strict'

const test = require('tape')
const http = require('http')
const path = require('path')
const { createUiServer } = require('../lib/ui-server')

function get(port, urlPath) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: urlPath }, (res) => {
      let body = ''
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => resolve({
        status: res.statusCode,
        body,
        type: res.headers['content-type'],
        cache: res.headers['cache-control']
      }))
    }).on('error', reject)
  })
}

function createSkin(stylesheetName, appName, themeColor) {
  return createUiServer({ id: '@pwa-test.ed25519' }, { pwa: { port: 0 } }, {
    pluginName: 'pwa-test',
    configNamespace: 'pwa',
    defaultPort: 0,
    stylesheetName,
    buildDir: path.join(__dirname, '..', 'decent', 'build'),
    launchMessage: 'pwa-test launched at',
    appName,
    themeColor
  })
}

function checkSkin(t, stylesheetName, appName, skin, themeColor) {
  const ui = createSkin(stylesheetName, appName, themeColor)
  ui.server.on('listening', async () => {
    const port = ui.server.address().port
    try {
      const index = await get(port, '/')
      t.equal(index.status, 200, skin + ' index is served')
      t.ok(index.body.includes('rel="manifest" href="/manifest.webmanifest"'), skin + ' injects manifest link')
      t.ok(index.body.includes('navigator.serviceWorker.register("/sw.js")'), skin + ' registers service worker')
      t.ok(index.body.includes('name="theme-color" content="' + themeColor + '"'), skin + ' injects theme color')

      const manifestResponse = await get(port, '/manifest.webmanifest')
      const manifest = JSON.parse(manifestResponse.body)
      t.equal(manifestResponse.type, 'application/manifest+json; charset=utf-8', skin + ' manifest has correct type')
      t.equal(manifest.name, appName, skin + ' manifest has per-skin name')
      t.equal(manifest.theme_color, themeColor, skin + ' manifest has per-skin theme')
      t.equal(manifest.icons[0].src, '/icons/' + skin + '-192.png', skin + ' manifest has per-skin icon')

      const sw = await get(port, '/sw.js')
      t.equal(sw.status, 200, skin + ' service worker is served')
      t.equal(sw.cache, 'no-cache', skin + ' service worker is never stale-cached')
      t.ok(sw.body.includes('notificationclick'), skin + ' service worker handles notification clicks')
      t.ok(sw.body.includes('self.location.origin+"/"+route'), skin + ' notification clicks navigate from origin root')
      t.ok(!sw.body.includes('caches.open'), skin + ' service worker does not cache app shell')
    } catch (err) {
      t.fail(err.message)
    }
    ui.close(() => t.end())
  })
}

test('Decent serves its installable PWA shell', (t) => {
  checkSkin(t, 'style.css', 'Decent', 'decent', '#243447')
})

test('ssbski serves its installable PWA shell', (t) => {
  checkSkin(t, 'ssbski-style.css', 'ssbski', 'ssbski', '#1185fe')
})
