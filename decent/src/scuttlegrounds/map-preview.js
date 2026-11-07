var map = require('./map')
var movement = require('./movement-preview')
var createSprites = require('./sprites')

module.exports = function createMapPreview (host, options) {
  options = options || {}
  var canvas = document.createElement('canvas')
  canvas.className = 'sg-map-canvas'
  canvas.setAttribute('aria-label', 'Isometric alien colony map: Expedition in the north, Bloom in the south. Eight mineral deposits between them.')
  canvas.setAttribute('role', 'img')
  if (options.interactive) {
    canvas.tabIndex = 0
    canvas.setAttribute('aria-label', 'Alien colony map. Drag to pan, pinch or use buttons to zoom. Select a unit then tap empty ground to preview movement. Arrow keys pan; plus and minus zoom; 0 fits the map.')
  }
  host.appendChild(canvas)
  var ctx = canvas.getContext('2d')
  var width = 0, height = 0, scale = 1, fitScale = 1, offsetX = 0, offsetY = 0
  var selected = null, destroyed = false, pointers = {}, gesture = null, moved = false
  var pieces = map.pieces.map(function (p) { return p.concat([p[3] === 'bloom' ? 5 : 1]) })
  var selectedUnit = -1, animation = null, animationFrame = 0, hitBoxes = []
  var world = options.world === 'bloom' ? 'bloom' : 'expedition'
  var depleted = false
  var sprites = createSprites(function (failed) {
    if (destroyed) return
    canvas.setAttribute('data-sprites', failed ? 'failed' : 'ready')
    if (options.onAssetStatus) options.onAssetStatus(failed ? 'Sprite images could not load. Reload to retry.' : '')
    draw()
  })

  function poly (points, fill, stroke) {
    ctx.beginPath()
    points.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]) })
    ctx.closePath()
    if (fill) { ctx.fillStyle = fill; ctx.fill() }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke() }
  }
  function ellipse (x, y, rx, ry, fill, stroke) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
    if (fill) { ctx.fillStyle = fill; ctx.fill() }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke() }
  }
  function terrain (x, y) {
    var p = map.project(x,y)
    var detail = (x*37+y*17+x*y*3)%11
    sprites.world(ctx,world,'terrain',p.x,p.y,detail < 8 ? 0 : detail-7)
  }
  function drawGrid () {
    ctx.beginPath()
    // Boundaries use the same half-tile coordinates as picking, not sprite edges.
    for (var i = 0; i <= map.size; i++) {
      var a = map.project(i-0.5,-0.5), b = map.project(i-0.5,map.size-0.5)
      ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y)
      a = map.project(-0.5,i-0.5); b = map.project(map.size-0.5,i-0.5)
      ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y)
    }
    ctx.strokeStyle = world === 'bloom' ? '#251c35b3' : '#302a2fb3'
    ctx.lineWidth = (options.interactive ? 1.25 : 2)/scale
    ctx.stroke()
  }
  function label (piece) {
    return (piece[3] === 'bloom' ? 'Bloom' : 'Expedition') + ' ' +
      ({hq: 'HQ', factory: 'factory', worker: 'worker', infantry: 'infantry', hovercraft: 'hovercraft', walker: 'siege walker'})[piece[2]]
  }
  function notify (extra) {
    if (!options.onSelect) return
    var unit = pieces[selectedUnit]
    if (!unit) return
    var info = {unitIndex: selectedUnit, facing: movement.directions[unit[4]], moving: !!animation,
      x: unit[0], y: unit[1], label: label(unit)}
    canvas.setAttribute('data-selected-unit', String(selectedUnit))
    canvas.setAttribute('data-facing', info.facing)
    canvas.setAttribute('data-unit-position', unit[0] + ',' + unit[1])
    canvas.setAttribute('data-moving', info.moving ? 'true' : 'false')
    options.onSelect(info.label + ' · facing ' + info.facing + ' · [' + info.x + ', ' + info.y + ']' + (extra ? ' · ' + extra : ''), info)
  }
  function selectUnit (index, focus) {
    if (animation || !movement.isUnit(pieces[index])) return
    selectedUnit = index; selected = null
    if (focus) {
      var p = map.project(pieces[index][0],pieces[index][1])
      scale = Math.max(scale,fitScale*2)
      offsetX = width/2-p.x*scale; offsetY = height/2-(p.y-35)*scale
    }
    notify('tap empty ground to preview movement'); draw()
  }
  function turn (amount) {
    if (animation || selectedUnit < 0) return
    pieces[selectedUnit][4] = (pieces[selectedUnit][4]+amount+8)%8
    notify(); draw()
  }
  function moveSelected (x, y) {
    if (animation || selectedUnit < 0) return
    var path = movement.findPath(pieces,selectedUnit,x,y)
    if (!path) { notify('no clear path to that tile'); return }
    var unit = pieces[selectedUnit]
    animation = {index: selectedUnit, path: path, step: 0, started: null, x: unit[0], y: unit[1]}
    unit[4] = movement.facing(path[0][0]-unit[0],path[0][1]-unit[1],unit[4])
    notify('moving locally'); animationFrame = requestAnimationFrame(animate)
  }
  function animate (now) {
    animationFrame = 0
    if (destroyed || !animation) return
    if (animation.started === null) animation.started = now
    var unit = pieces[animation.index], target = animation.path[animation.step]
    var progress = Math.min(1,(now-animation.started)/220)
    animation.x = unit[0]+(target[0]-unit[0])*progress
    animation.y = unit[1]+(target[1]-unit[1])*progress
    if (progress === 1) {
      unit[0] = target[0]; unit[1] = target[1]; animation.step++
      if (animation.step === animation.path.length) { animation = null; notify('movement preview complete') }
      else {
        var next = animation.path[animation.step]
        unit[4] = movement.facing(next[0]-unit[0],next[1]-unit[1],unit[4])
        animation.started = now; notify('moving locally')
      }
    }
    draw()
    if (animation) animationFrame = requestAnimationFrame(animate)
  }
  function draw () {
    if (destroyed || !ctx || !width || !height) return
    canvas.setAttribute('data-zoom', (scale/fitScale).toFixed(3))
    var dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr)
    ctx.setTransform(dpr,0,0,dpr,0,0)
    var gradient = ctx.createLinearGradient(0,0,width,height)
    gradient.addColorStop(0,world === 'bloom' ? '#24162e' : '#161e29'); gradient.addColorStop(1,world === 'bloom' ? '#39233e' : '#302a29')
    ctx.fillStyle = gradient; ctx.fillRect(0,0,width,height)
    for (var i = 0; i < 70; i++) {
      ctx.fillStyle = i % 3 ? '#a9c6dc35' : '#d4c8ee60'
      ctx.fillRect((i*137.7)%width,(i*i*17.3)%height,1,1)
    }
    ctx.save(); ctx.translate(offsetX,offsetY); ctx.scale(scale,scale)
    ellipse(600,400,550,257,'#070d2059')
    for (var depth = 0; depth < 23; depth++) {
      for (var x = 0; x < map.size; x++) {
        var y = depth - x
        if (y >= 0 && y < map.size) terrain(x,y)
      }
    }
    drawGrid()
    hitBoxes = []
    var objects = map.deposits.map(function (d) { return {deposit: true, x: d[0], y: d[1], index: -1} })
    objects = objects.concat(pieces.map(function (piece, index) {
      var moving = animation && animation.index === index
      return {piece: piece, index: index, x: moving ? animation.x : piece[0], y: moving ? animation.y : piece[1]}
    }))
    objects.sort(function (a,b) { return (a.x+a.y)-(b.x+b.y) || a.index-b.index }).forEach(function (item) {
      var p = map.project(item.x,item.y), piece = item.piece
      if (item.deposit) { sprites.world(ctx,world,depleted ? 'exhausted' : 'resource',p.x,p.y); return }
      if (!movement.isUnit(piece)) { sprites.world(ctx,piece[3],piece[2],p.x,p.y); return }
      ellipse(p.x,p.y+7,35,14,'#11192c77')
      ellipse(p.x,p.y+7,36,15,null,piece[3] === 'bloom' ? '#e9a6d1aa' : '#85d9f0aa')
      if (item.index === selectedUnit) {
        poly([[p.x,p.y-23],[p.x+47,p.y],[p.x,p.y+23],[p.x-47,p.y]],'#d0ffdb22','#e4ffe5')
      }
      var bounds = sprites.draw(ctx,piece,p.x,p.y)
      if (bounds) { bounds.index = item.index; hitBoxes.push(bounds) }
    })
    if (selected) {
      var sp = map.project(selected.x,selected.y)
      poly([[sp.x,sp.y-23],[sp.x+47,sp.y],[sp.x,sp.y+23],[sp.x-47,sp.y]],'#b8f0d51a','#e4ffe5')
    }
    ctx.font = '600 12px monospace'; ctx.textAlign = 'center'
    ctx.fillStyle = '#a8d6ef'; ctx.fillText('THE EXPEDITION',600,23)
    ctx.fillStyle = '#ecb8dd'; ctx.fillText('THE BLOOM',600,697)
    ctx.restore()
  }
  function fit () {
    fitScale = Math.min(width / 1230, height / 740)
    scale = fitScale
    offsetX = width / 2 - 600 * scale; offsetY = height / 2 - 360 * scale
    draw()
  }
  function resize () {
    var rect = host.getBoundingClientRect()
    if (!rect.width || !rect.height || destroyed) return
    if (!width || !height) { width = rect.width; height = rect.height; fit(); return }
    // Inspector text can resize the map on phones. Keep the selected unit in view
    // rather than resetting the camera whenever a control wraps to another line.
    var centerX = (width/2-offsetX)/scale, centerY = (height/2-offsetY)/scale
    var relativeZoom = scale/fitScale
    width = rect.width; height = rect.height
    fitScale = Math.min(width/1230,height/740)
    scale = fitScale*relativeZoom
    offsetX = width/2-centerX*scale; offsetY = height/2-centerY*scale
    draw()
  }
  function zoom (factor, cx, cy) {
    cx = cx == null ? width / 2 : cx; cy = cy == null ? height / 2 : cy
    var next = Math.max(fitScale * 0.8, Math.min(fitScale * 5, scale * factor))
    offsetX = cx - (cx - offsetX) * next / scale
    offsetY = cy - (cy - offsetY) * next / scale
    scale = next; draw()
  }
  function coords (e) {
    var rect = canvas.getBoundingClientRect()
    return {x: e.clientX - rect.left, y: e.clientY - rect.top}
  }
  function beginGesture () {
    var ids = Object.keys(pointers), a = pointers[ids[0]], b = pointers[ids[1]]
    gesture = a ? {x: b ? (a.x+b.x)/2 : a.x, y: b ? (a.y+b.y)/2 : a.y,
      distance: b ? Math.hypot(a.x-b.x,a.y-b.y) : 0, scale: scale, ox: offsetX, oy: offsetY} : null
  }
  if (options.interactive) {
    canvas.onpointerdown = function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (!Object.keys(pointers).length) moved = false
      pointers[e.pointerId] = coords(e); canvas.setPointerCapture(e.pointerId)
      if (Object.keys(pointers).length > 1) moved = true
      beginGesture()
    }
    canvas.onpointermove = function (e) {
      if (!pointers[e.pointerId] || !gesture) return
      pointers[e.pointerId] = coords(e)
      var ids = Object.keys(pointers), a = pointers[ids[0]], b = pointers[ids[1]]
      var cx = b ? (a.x+b.x)/2 : a.x, cy = b ? (a.y+b.y)/2 : a.y
      if (Math.hypot(cx-gesture.x,cy-gesture.y) > 5 || b) moved = true
      if (!moved) return
      var next = b && gesture.distance > 0 ? gesture.scale * Math.hypot(a.x-b.x,a.y-b.y) / gesture.distance : gesture.scale
      next = Math.max(fitScale * 0.8, Math.min(fitScale * 5, next))
      offsetX = cx - (gesture.x - gesture.ox) * next / gesture.scale
      offsetY = cy - (gesture.y - gesture.oy) * next / gesture.scale
      scale = next; draw()
    }
    canvas.onpointerup = function (e) {
      if (!pointers[e.pointerId]) return
      var p = coords(e)
      if (!moved && !animation && Object.keys(pointers).length === 1) {
        var wx = (p.x-offsetX)/scale, wy = (p.y-offsetY)/scale
        var tile = map.unproject(wx,wy)
        if (tile.x >= 0 && tile.x < 12 && tile.y >= 0 && tile.y < 12) {
          var piece = map.at(pieces,tile.x,tile.y)
          if (movement.isUnit(piece)) selectUnit(pieces.indexOf(piece),false)
          else if (selectedUnit >= 0 && !piece) moveSelected(tile.x,tile.y)
          else {
            var hit = hitBoxes.slice().reverse().filter(function (box) {
              return wx >= box.x && wx <= box.x+box.width && wy >= box.y && wy <= box.y+box.height
            })[0]
            if (hit && !piece) selectUnit(hit.index,false)
            else {
              selectedUnit = -1; selected = tile
              var deposit = map.at(map.deposits,tile.x,tile.y)
              if (options.onSelect) options.onSelect(piece ? label(piece) : deposit ? (depleted ? 'Exhausted mineral deposit · visual preview' : 'Mineral deposit · ' + deposit[2] + ' minerals') : 'Open terrain · buildable ground', null)
              draw()
            }
          }
        }
      }
      delete pointers[e.pointerId]; beginGesture()
    }
    canvas.onpointercancel = function (e) { delete pointers[e.pointerId]; moved = true; beginGesture() }
    canvas.onlostpointercapture = function (e) { delete pointers[e.pointerId]; beginGesture() }
    canvas.onwheel = function (e) { e.preventDefault(); var p = coords(e); zoom(e.deltaY < 0 ? 1.12 : 1/1.12,p.x,p.y) }
    canvas.onkeydown = function (e) {
      if (e.key === '+' || e.key === '=') zoom(1.25)
      else if (e.key === '-') zoom(0.8)
      else if (e.key === '0') fit()
      else if (e.key.indexOf('Arrow') === 0) {
        offsetX += e.key === 'ArrowLeft' ? 40 : e.key === 'ArrowRight' ? -40 : 0
        offsetY += e.key === 'ArrowUp' ? 40 : e.key === 'ArrowDown' ? -40 : 0
        draw()
      } else return
      e.preventDefault()
    }
  }
  // Cards use a fixed-size drawing scaled by CSS, with no observers or live loop.
  canvas.setAttribute('data-world',world)
  var observer = null
  if (options.interactive) {
    observer = new ResizeObserver(resize)
    observer.observe(host)
  } else {
    width = 1230; height = 740; fit()
  }
  return {fit: fit, zoom: zoom, turn: turn,
    setWorld: function (name) {
      if (name !== 'expedition' && name !== 'bloom') return
      world = name; canvas.setAttribute('data-world',name); draw()
    },
    setDepleted: function (value) { depleted = !!value; draw() }, selectUnit: function (index) { selectUnit(index,true) },
    units: pieces.map(function (piece,index) { return movement.isUnit(piece) ? {index: index, label: label(piece) + ' [' + piece[0] + ', ' + piece[1] + ']'} : null }).filter(Boolean),
    destroy: function () {
    destroyed = true
    if (animationFrame) cancelAnimationFrame(animationFrame)
    animation = null; sprites.dispose()
    if (observer) observer.disconnect()
    Object.keys(pointers).forEach(function (id) {
      if (canvas.hasPointerCapture(Number(id))) canvas.releasePointerCapture(Number(id))
    })
    canvas.onpointerdown = canvas.onpointermove = canvas.onpointerup = canvas.onpointercancel = null
    canvas.onlostpointercapture = canvas.onwheel = canvas.onkeydown = null
    canvas.width = canvas.height = 0
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas)
  }}
}
