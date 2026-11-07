var h = require('hyperscript')
var createMap = require('../../scuttlegrounds/map-preview')
var openGame = require('../../scuttlegrounds/game-view')
var localSession = require('../../scuttlegrounds/local-session')

exports.needs = {}
exports.gives = {screen_view: true, message_content: true}

function makeCard (worldName) {
  worldName = worldName === 'bloom' ? 'bloom' : 'expedition'
  var card = h('section.sg-card')
  var preview = h('div.sg-map-preview')
  var expand = h('button.sg-button.sg-button-primary', {type: 'button', onclick: open}, 'Expand map')
  card.appendChild(h('div.sg-card-heading',
    h('div', h('span.sg-eyebrow', 'STRANGE SCUTTLE BATTLEGROUNDS'), h('h2', worldName === 'bloom' ? 'The Bloom homeworld.' : 'An Expedition frontier.')),
    h('span.sg-badge', 'Map preview')
  ))
  card.appendChild(preview)
  card.appendChild(h('div.sg-card-footer',
    h('div', h('strong', 'The Expedition × The Bloom'),
      h('p', '12 × 12 alien terrain · finite mineral deposits · two colonies')),
    h('div.sg-card-buttons',expand,h('button.sg-button.sg-button-primary',{type:'button',onclick:function () {
      openGame(localSession(worldName,window.localStorage))
    }},'Local match'))
  ))
  card.appendChild(h('p.sg-preview-note', 'Local match: plan both sides, gather minerals, build and battle. Progress saves in this browser. Expand map opens the art sandbox.'))
  createMap(preview, {world: worldName})

  function open () {
    if (document.querySelector('.sg-fullscreen')) return
    var previousFocus = document.activeElement
    var previousOverflow = document.body.style.overflow
    var status = h('div.sg-inspector', 'Select a tile to inspect terrain, minerals or colony pieces.')
    status.setAttribute('aria-live', 'polite')
    var assetStatus = h('p.sg-asset-status', 'Loading directional sprites…')
    assetStatus.setAttribute('role', 'status')
    var roster = h('select.sg-unit-picker', {onchange: function () {
      if (roster.value !== '') scene.selectUnit(Number(roster.value))
    }}, h('option', {value: ''}, 'Choose a unit'))
    roster.setAttribute('aria-label', 'Choose a unit')
    var turnLeft = h('button.sg-button', {type: 'button', disabled: true, onclick: function () { scene.turn(-1) }}, '↶')
    var turnRight = h('button.sg-button', {type: 'button', disabled: true, onclick: function () { scene.turn(1) }}, '↷')
    turnLeft.setAttribute('aria-label', 'Turn unit counterclockwise')
    turnRight.setAttribute('aria-label', 'Turn unit clockwise')
    var facing = h('span.sg-facing', '8 facings')
    var worldPicker = h('select.sg-world-picker', {onchange: function () { scene.setWorld(worldPicker.value) }},
      h('option', {value: 'expedition'}, 'Expedition world'), h('option', {value: 'bloom'}, 'Bloom world'))
    worldPicker.value = worldName
    worldPicker.setAttribute('aria-label', 'World')
    var exhausted = h('input', {type: 'checkbox', onchange: function () { scene.setDepleted(exhausted.checked) }})
    var world = h('div.sg-world')
    var closeButton = h('button.sg-button', {type: 'button', onclick: close}, 'Close')
    closeButton.setAttribute('aria-label', 'Close map')
    var modal = h('div.sg-fullscreen', {role: 'dialog'},
      h('header.sg-map-header',
        h('div', h('span.sg-eyebrow', 'SCUTTLEGROUNDS'), h('h1', 'Strange ground. Two colonies.')),
        closeButton),
      world,
      h('footer.sg-map-controls',
        h('div.sg-map-legend',
          h('span.sg-legend-expedition', '◆ Expedition'),
          h('span.sg-legend-bloom', '● Bloom'),
          h('span.sg-legend-minerals', '♦ Minerals')),
        h('div.sg-world-controls', worldPicker, h('label.sg-exhausted-toggle', exhausted, 'Exhausted deposits')),
        assetStatus,
        status,
        h('div.sg-unit-controls', roster, turnLeft, facing, turnRight),
        h('div.sg-map-toolbar',
          h('span.sg-map-hint', 'Drag to pan · pinch / scroll to zoom'),
          h('button.sg-button.sg-zoom-out', {type: 'button', onclick: function () { scene.zoom(0.8) }}, '−'),
          h('button.sg-button.sg-zoom-in', {type: 'button', onclick: function () { scene.zoom(1.25) }}, '+'),
          h('button.sg-button', {type: 'button', onclick: function () { scene.fit() }}, 'Fit map')))
    )
    modal.setAttribute('aria-modal', 'true')
    modal.setAttribute('aria-label', 'Scuttlegrounds map preview')
    modal.querySelector('.sg-zoom-out').setAttribute('aria-label', 'Zoom out')
    modal.querySelector('.sg-zoom-in').setAttribute('aria-label', 'Zoom in')
    document.body.appendChild(modal)
    document.body.style.overflow = 'hidden'
    var scene = createMap(world, {interactive: true, world: worldName,
      onAssetStatus: function (text) { assetStatus.textContent = text },
      onSelect: function (text, info) {
        status.textContent = text
        roster.value = info ? String(info.unitIndex) : ''
        roster.disabled = !!(info && info.moving)
        turnLeft.disabled = turnRight.disabled = !info || info.moving
        facing.textContent = info ? info.facing : '8 facings'
      }})
    scene.units.forEach(function (unit) {
      roster.appendChild(h('option', {value: String(unit.index)}, unit.label))
    })
    closeButton.focus()
    document.addEventListener('decent:route-change', close)
    document.addEventListener('keydown', keydown)

    function keydown (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return }
      if (e.key !== 'Tab') return
      var focusable = modal.querySelectorAll('button, canvas[tabindex]')
      var first = focusable[0], last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    function close () {
      document.removeEventListener('decent:route-change', close)
      document.removeEventListener('keydown', keydown)
      scene.destroy()
      modal.remove()
      document.body.style.overflow = previousOverflow
      if (previousFocus && previousFocus.isConnected) previousFocus.focus()
    }
  }
  return card
}

exports.create = function () {
  return {
    screen_view: function (route) {
      if (route !== 'scuttlegrounds') return
      var view = h('div.column.scroller.sg-preview-page',
        h('div.scroller__wrapper',
          h('div.sg-page-heading', h('span.sg-eyebrow', 'LAN JAM · COLONY CONQUEST'),
            h('h1', 'Scuttlegrounds'),
            h('p', 'Two sprite worlds, Expedition mech suits and faceless Bloom monsters. Expand either map to explore and preview movement.')),
          h('article.sg-demo-message', makeCard('expedition')),
          h('article.sg-demo-message', makeCard('bloom'))))
      view.title = 'Scuttlegrounds'
      return view
    },
    message_content: function (msg) {
      var c = msg && msg.value && msg.value.content
      if (c && c.type === 'scuttlegrounds' && c.v === 1 && c.op === 'create') return makeCard()
    }
  }
}
