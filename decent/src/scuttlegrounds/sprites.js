var atlas = require('./assets/sprites-v1.json')
var worlds = require('./assets/worlds-v1.json')
var terrain = require('./assets/terrain-v2.json')
var cache = null

module.exports = function createSprites (onLoad) {
  if (!cache) {
    cache = {images: {}, pending: 5, failed: false, listeners: []}
    var files = {terrain: terrain.file}
    Object.keys(atlas.factions).forEach(function (faction) {
      files[faction] = atlas.factions[faction].file
      files[faction+'-world'] = worlds.worlds[faction].file
    })
    Object.keys(files).forEach(function (key) {
      var img = new Image()
      cache.images[key] = img
      img.onload = function () { settled() }
      img.onerror = function () { cache.failed = true; settled() }
      img.src = '/scuttlegrounds/' + files[key]
    })
  }
  function settled () {
    cache.pending--
    if (cache.pending) return
    var listeners = cache.listeners.slice(); cache.listeners.length = 0
    listeners.forEach(function (fn) { fn(cache.failed) })
  }
  if (cache.pending) cache.listeners.push(onLoad)
  else Promise.resolve().then(function () { if (onLoad) onLoad(cache.failed) })
  return {
    world: function (ctx, faction, type, x, y, variant) {
      var ground = type === 'terrain'
      var img = cache.images[ground ? 'terrain' : faction+'-world']
      if (!img.complete || !img.naturalWidth) return
      var frame = ground ? terrain.frames[faction] : worlds.worlds[faction].frames[worlds.types.indexOf(type)]
      var w = ground ? 98 : ({hq: 108, factory: 102, resource: 76, exhausted: 72})[type]
      var h = w*frame[3]/frame[2]
      var top = ground ? y-24 : y+16-h
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img,frame[0],frame[1],frame[2],frame[3],Math.round(x-w/2),Math.round(top),Math.round(w),Math.round(h))
      if (ground) {
        // Keep the quiet base, with a subdued layer of the original world texture.
        // Clip to the top face so the grid and tile silhouette remain precise.
        var detail = cache.images[faction+'-world']
        if (!detail.complete || !detail.naturalWidth) return
        var texture = worlds.worlds[faction].frames[variant || 0]
        ctx.save()
        ctx.beginPath()
        ctx.moveTo(x,y-24); ctx.lineTo(x+48,y)
        ctx.lineTo(x,y+24); ctx.lineTo(x-48,y); ctx.closePath()
        ctx.clip()
        ctx.globalAlpha *= 0.32
        ctx.drawImage(detail,texture[0],texture[1],texture[2],texture[3],
          Math.round(x-w/2),Math.round(y-24),Math.round(w),Math.round(w*texture[3]/texture[2]))
        ctx.restore()
      }
    },
    draw: function (ctx, piece, x, y) {
      var img = cache.images[piece[3]], row = atlas.types.indexOf(piece[2])
      if (row < 0 || !img.complete || !img.naturalWidth) return null
      var frames = atlas.factions[piece[3]].frames[row]
      var frame = frames[piece[4] == null ? 1 : piece[4]]
      var maxWidth = Math.max.apply(null, frames.map(function (f) { return f[2] }))
      var ratio = ({worker: 84, infantry: 84, hovercraft: 96, walker: 108})[piece[2]] / maxWidth
      var w = frame[2] * ratio, h = frame[3] * ratio
      var bottom = y + (piece[2] === 'hovercraft' ? -5 : 12)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, frame[0], frame[1], frame[2], frame[3], Math.round(x-w/2), Math.round(bottom-h), Math.round(w), Math.round(h))
      return {x: x-w/2, y: bottom-h, width: w, height: h}
    },
    dispose: function () {
      cache.listeners = cache.listeners.filter(function (fn) { return fn !== onLoad })
      onLoad = null
    }
  }
}
