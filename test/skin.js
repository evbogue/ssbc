'use strict'

const test = require('tape')
const skin = require('../decent/src/skin')

test('Plain participates in live switching and saved skin selection', t => {
  const links = []
  const makeLink = href => ({
    href,
    getAttribute () { return this.href },
    remove () { links.splice(links.indexOf(this), 1) }
  })
  let saved
  const defaultLink = makeLink('/decent2-style.css?v=1')
  links.push(defaultLink)
  global.document = {
    createElement: () => makeLink(),
    documentElement: { setAttribute () {}, getAttribute: () => 'decent2' },
    head: { appendChild: link => links.push(link) },
    querySelector: selector => selector.includes('link[') ? links[0] : null
  }
  global.window = {
    localStorage: {
      getItem: () => saved,
      setItem: (key, value) => { saved = value }
    }
  }
  t.teardown(() => {
    delete global.document
    delete global.window
  })

  t.ok(skin.list().includes('plain'), 'Plain is available in the picker')
  skin.set('plain', { persist: false })
  const abandoned = links[1]
  t.equal(skin.get(), 'decent2', 'preview selection does not change the saved skin')
  skin.set('ssbpro')
  abandoned.onload()
  t.equal(links[0], defaultLink, 'a superseded load leaves the current stylesheet alone')
  t.equal(links.length, 2, 'only one replacement can be pending')
  links[1].onload()

  skin.set('plain')
  const plain = links[1]
  plain.onload()
  t.deepEqual(links, [plain], 'Plain replaces the previous skin stylesheet')
  t.equal(skin.get(), 'plain', 'Plain is restored from storage')
  t.end()
})
