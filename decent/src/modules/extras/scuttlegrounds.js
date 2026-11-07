var h = require('hyperscript')
var createMap = require('../../scuttlegrounds/map-preview')

exports.needs = {}
exports.gives = {screen_view: true, message_content: true}

function makeCard () {
  var card = h('section.sg-card')
  var preview = h('div.sg-map-preview')
  var expand = h('button.sg-button.sg-button-primary', {type: 'button', onclick: open}, 'Expand map')
  card.appendChild(h('div.sg-card-heading',
    h('div', h('span.sg-eyebrow', 'STRANGE SCUTTLE BATTLEGROUNDS'), h('h2', 'A foothold on strange ground.')),
    h('span.sg-badge', 'Map preview')
  ))
  card.appendChild(preview)
  card.appendChild(h('div.sg-card-footer',
    h('div', h('strong', 'The Expedition × The Bloom'),
      h('p', '12 × 12 alien terrain · finite mineral deposits · two colonies')),
    expand
  ))
  card.appendChild(h('p.sg-preview-note', 'Visual study with sample buildings and units. Gameplay is not active.'))
  createMap(preview)

  function open () {
    if (document.querySelector('.sg-fullscreen')) return
    var previousFocus = document.activeElement
    var previousOverflow = document.body.style.overflow
    var status = h('div.sg-inspector', 'Select a tile to inspect terrain, minerals or colony pieces.')
    status.setAttribute('aria-live', 'polite')
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
        status,
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
    var scene = createMap(world, {interactive: true, onSelect: function (text) { status.textContent = text }})
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
          h('div.sg-page-heading', h('span.sg-eyebrow', 'LAN JAM · MAP STUDY'),
            h('h1', 'Scuttlegrounds'),
            h('p', 'Explore the first colony-conquest landscape. Expand the map to look around.')),
          h('article.sg-demo-message', makeCard())))
      view.title = 'Scuttlegrounds'
      return view
    },
    message_content: function (msg) {
      var c = msg && msg.value && msg.value.content
      if (c && c.type === 'scuttlegrounds' && c.v === 1 && c.op === 'create') return makeCard()
    }
  }
}
