var map = require('./map')

module.exports = function createMapPreview (host, options) {
  options = options || {}
  var canvas = document.createElement('canvas')
  canvas.className = 'sg-map-canvas'
  canvas.setAttribute('aria-label', 'Isometric alien colony map: Expedition in the north, Bloom in the south. Eight mineral deposits between them.')
  canvas.setAttribute('role', 'img')
  if (options.interactive) {
    canvas.tabIndex = 0
    canvas.setAttribute('aria-label', 'Alien colony map. Drag to pan, pinch or use buttons to zoom. Arrow keys pan; plus and minus zoom; 0 fits the map.')
  }
  host.appendChild(canvas)
  var ctx = canvas.getContext('2d')
  var width = 0, height = 0, scale = 1, fitScale = 1, offsetX = 0, offsetY = 0
  var selected = null, destroyed = false, pointers = {}, gesture = null, moved = false

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
  function line (points, color, weight) {
    ctx.beginPath()
    points.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]) })
    ctx.strokeStyle = color; ctx.lineWidth = weight || 2; ctx.stroke()
  }
  function block (x, y, w, d, h, top, left, right) {
    poly([[x-w,y], [x,y+d/2], [x,y+d/2-h], [x-w,y-h]], left)
    poly([[x,y+d/2], [x+w,y], [x+w,y-h], [x,y+d/2-h]], right)
    poly([[x-w,y-h], [x,y-d/2-h], [x+w,y-h], [x,y+d/2-h]], top, '#ffffff25')
  }
  function crystal (x, y, n) {
    var h = 14 + n * 4
    poly([[x-5,y], [x-7,y-h+5], [x,y-h-4], [x+6,y-h+3], [x+5,y+2]], '#4cd8ca', '#b5ffe0')
    poly([[x,y-h-4], [x+6,y-h+3], [x+5,y+2], [x,y-1]], '#278f96')
    line([[x-3,y-h+3], [x-2,y-3]], '#d6fff3', 1)
  }
  function terrain (x, y) {
    var p = map.project(x, y), px = p.x, py = p.y
    var n = (x * 37 + y * 17 + x * y * 3) % 11
    var colors = ['#5b526c', '#61566f', '#655a76', '#584f67', '#6a5c78']
    // Individual tile faces give the terrain an old isometric-game silhouette.
    poly([[px-48,py], [px,py+24], [px,py+35], [px-48,py+11]], '#302e43')
    poly([[px,py+24], [px+48,py], [px+48,py+11], [px,py+35]], '#24283b')
    poly([[px,py-24], [px+48,py], [px,py+24], [px-48,py]], colors[n % 5], '#8e80902b')
    // Mineral seams, small stones and vegetation, all fixed rather than random.
    poly([[px-27,py+1], [px-12,py-7], [px+13,py+3], [px-4,py+12]], n % 3 ? '#79708630' : '#9fb09b35')
    if (!map.at(map.pieces, x, y) && !map.at(map.deposits, x, y)) {
      if (n === 2 || n === 8) {
        ellipse(px+7, py, 17, 8, '#49455e', '#756982')
        ellipse(px+7, py-1, 10, 4, '#3d3d55')
        line([[px-5,py-6], [px+5,py-10], [px+18,py-6]], '#ab98ae65', 2)
      } else if (n === 1 || n === 7) {
        for (var i = 0; i < 3; i++) {
          var sx = px - 14 + i * 13, sy = py + i % 2 * 5
          line([[sx,sy], [sx-2,sy-10-i*3], [sx+3,sy-17-i*2]], '#284c53', 3)
          ellipse(sx+2, sy-15-i*2, 5, 3, '#89b6ae')
        }
      } else if (n === 5) {
        block(px+8, py+2, 9, 10, 5, '#918297', '#65566e', '#49485d')
      }
    }
    if (map.at(map.deposits, x, y)) {
      ellipse(px, py+3, 26, 12, '#214d5f70', '#5fbbb38a')
      crystal(px-12, py+2, 1); crystal(px+9, py-1, 3); crystal(px+1, py+8, 0)
    }
    var piece = map.at(map.pieces, x, y)
    if (piece) drawPiece(px, py, piece[2], piece[3])
    if (selected && selected.x === x && selected.y === y) {
      poly([[px,py-23], [px+47,py], [px,py+23], [px-47,py]], '#b8f0d51a', '#e4ffe5')
    }
  }
  function drawPiece (x, y, type, faction) {
    var bloom = faction === 'bloom', color = bloom ? '#e8a2da' : '#81c7ef'
    ellipse(x, y+7, type === 'hq' ? 33 : 23, type === 'hq' ? 14 : 10, '#1b203969')
    ellipse(x, y+4, type === 'hq' || type === 'factory' ? 32 : 18, 10, null, bloom ? '#ed8bce85' : '#86d3f085')
    if (bloom) {
      if (type === 'hq' || type === 'factory') {
        for (var j = 0; j < 5; j++) {
          var angle = j * Math.PI * 2 / 5
          line([[x,y], [x+Math.cos(angle)*23,y+Math.sin(angle)*11],
            [x+Math.cos(angle)*37,y+Math.sin(angle)*17]], '#986694', 5)
        }
        ellipse(x, y-9, 29, 19, '#76537d', '#e8a2da')
        ellipse(x-4, y-20, 21, type === 'hq' ? 29 : 17, '#ac76ab', '#f3bcdf')
        ellipse(x-10, y-28, 9, 13, '#e2a6c8aa')
        ellipse(x+3, y-16, 8, 11, '#80e8cd', '#cbfff2')
        if (type === 'factory') {
          ellipse(x+19, y-5, 13, 10, '#cf99c4', '#f1c0e5')
          ellipse(x+20, y-7, 5, 4, '#73e6b8')
        } else {
          line([[x+12,y-34], [x+20,y-53], [x+17,y-64]], '#d0a2ce', 3)
          ellipse(x+17,y-64,4,4,'#9affd7')
        }
      } else if (type === 'walker') {
        ;[-1,1].forEach(function (side) {
          line([[x+side*8,y-19], [x+side*23,y-7], [x+side*28,y+6]], '#b383b3', 7)
          line([[x+side*6,y-23], [x+side*17,y-16], [x+side*20,y-3]], '#d5a3cc', 6)
        })
        ellipse(x,y-30,22,21,'#ac76ab','#f1bbdf')
        ellipse(x-7,y-38,7,9,'#e1abcba0')
        poly([[x+2,y-32],[x+23,y-42],[x+28,y-35],[x+7,y-23]],'#7ae6c3','#d1ffdf')
      } else if (type === 'hovercraft') {
        line([[x-12,y-4],[x-19,y+7],[x-14,y+14]],'#d9a3d0',2)
        line([[x+8,y-3],[x+17,y+8],[x+11,y+15]],'#d9a3d0',2)
        ellipse(x,y-17,23,13,'#b78ebc','#f4c4e5')
        ellipse(x-7,y-21,9,5,'#eed0e7')
        ellipse(x+10,y-14,5,4,'#82efd0')
      } else {
        ellipse(x,y-4,12,7,'#9b6b9f','#e8b1d9')
        ellipse(x-1,y-12,8,type === 'worker' ? 8 : 12,'#c991bd','#f4c3df')
        ellipse(x+2,y-15,3,3,'#aaffdb')
        if (type === 'infantry') line([[x+4,y-10],[x+15,y-17]],'#78edd2',4)
      }
      return
    }
    if (type === 'hq') {
      block(x, y+4, 34, 37, 7, '#9db2bc', '#566b82', '#34495f')
      ellipse(x,y-5,27,13,'#365471','#a2d9eb')
      ctx.beginPath(); ctx.ellipse(x,y-9,25,26,0,Math.PI,Math.PI*2)
      ctx.fillStyle = '#669db7'; ctx.fill(); ctx.strokeStyle = '#b7e8ee'; ctx.stroke()
      line([[x-22,y-13],[x,y-8],[x+23,y-13]],'#bce7ed',2)
      line([[x,y-34],[x,y-9]],'#a9dce7',2)
      block(x+14,y+12,9,11,12,'#d3d8d7','#879aa9','#58738c')
      ctx.fillStyle = '#87f2da'; ctx.fillRect(x+11,y-1,6,5)
      line([[x-25,y-9],[x-25,y-49]],'#c7d8df',2)
      poly([[x-24,y-49],[x-9,y-44],[x-24,y-40]],'#80d3f1')
    } else if (type === 'factory') {
      block(x,y+5,32,34,25,'#b6bcc8','#7d859c','#4d617e')
      block(x-9,y-20,16,17,12,'#d7d9dc','#97a4b4','#617a95')
      block(x+17,y-9,5,6,35,'#a5b6c8','#657a92','#3f5971')
      line([[x+6,y+8],[x+6,y-7],[x+24,y-16]],'#182d4c',5)
      for (var k = 0; k < 3; k++) line([[x-24+k*7,y-14+k*3],[x-24+k*7,y-7+k*3]],'#98eddf',2)
    } else if (type === 'walker') {
      ;[-1,1].forEach(function (side) {
        line([[x+side*8,y-25],[x+side*21,y-11],[x+side*26,y+5]],'#a5bac9',6)
        line([[x+side*4,y-28],[x+side*15,y-20],[x+side*19,y-3]],'#708da8',5)
        block(x+side*26,y+6,6,6,3,'#b9cad4','#5b738e','#36546e')
      })
      block(x,y-18,19,21,18,'#d2dae0','#8b9fb4','#4f708b')
      line([[x+1,y-35],[x+29,y-45]],'#7c9bb0',7)
      line([[x+24,y-43],[x+32,y-46]],'#bafde5',4)
      line([[x-10,y-28],[x-3,y-25]],'#93f4e4',3)
    } else if (type === 'hovercraft') {
      ellipse(x,y+1,23,9,'#83d9f04a','#80d8eb')
      poly([[x-27,y-8],[x+8,y-21],[x+27,y-6],[x-4,y+4]],'#8ebbd0','#d6edf2')
      poly([[x-27,y-8],[x-4,y+4],[x-4,y+9],[x-25,y-3]],'#3e607f')
      block(x,y-9,9,10,8,'#c3d7e1','#6c96b5','#456785')
      line([[x+5,y-17],[x+20,y-22]],'#c3e7ed',3)
    } else {
      line([[x-3,y-6],[x-5,y+2]],'#cedce2',3)
      line([[x+3,y-6],[x+5,y+2]],'#8ca5bb',3)
      block(x,y-8,5,7,9,color,'#739cb7','#456780')
      ellipse(x,y-22,5,6,'#d7e4e8')
      line([[x-3,y-23],[x+3,y-22]],'#315779',3)
      if (type === 'infantry') line([[x+5,y-12],[x+16,y-18]],'#cee6e7',3)
      else block(x-8,y-3,4,5,5,'#e1b66b','#a78059','#74624f')
    }
  }
  function draw () {
    if (destroyed || !ctx || !width || !height) return
    var dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr)
    ctx.setTransform(dpr,0,0,dpr,0,0)
    var gradient = ctx.createLinearGradient(0,0,width,height)
    gradient.addColorStop(0,'#141e32'); gradient.addColorStop(1,'#29213b')
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
    width = rect.width; height = rect.height; fit()
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
      if (!moved && Object.keys(pointers).length === 1) {
        var tile = map.unproject((p.x-offsetX)/scale,(p.y-offsetY)/scale)
        if (tile.x >= 0 && tile.x < 12 && tile.y >= 0 && tile.y < 12) {
          selected = tile
          if (options.onSelect) options.onSelect(map.describe(tile.x,tile.y) + ' · [' + tile.x + ', ' + tile.y + ']')
          draw()
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
  var observer = null
  if (options.interactive) {
    observer = new ResizeObserver(resize)
    observer.observe(host)
  } else {
    width = 1230; height = 740; fit()
  }
  return {fit: fit, zoom: zoom, destroy: function () {
    destroyed = true
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
