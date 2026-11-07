// Versioned, deterministic game rules. No clocks, DOM, networking or randomness.
var map = require('./map')
var movement = require('./movement-preview')
var stats = {
  worker: {cost: 20, hp: 2, move: 1, range: 0, damage: 0, siege: 0},
  infantry: {cost: 15, hp: 3, move: 1, range: 1, damage: 1, siege: 1},
  hovercraft: {cost: 35, hp: 5, move: 3, range: 1, damage: 2, siege: 1},
  walker: {cost: 70, hp: 10, move: 1, range: 2, damage: 3, siege: 5},
  factory: {cost: 40, hp: 10, move: 0, range: 0, damage: 0, siege: 0},
  hq: {cost: 0, hp: 20, move: 0, range: 0, damage: 0, siege: 0}
}
function clone (value) { return JSON.parse(JSON.stringify(value)) }
function distance (a,b) { return Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y)) }
function inside (x,y) { return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < 12 && y < 12 }
function at (state,x,y) { return state.entities.filter(function (e) { return e.x === x && e.y === y })[0] }
function entity (state,id) { return state.entities.filter(function (e) { return e.id === id })[0] }
function isUnit (e) { return !!(e && stats[e.type] && stats[e.type].move) }
function initial (ids,world,hostFaction) {
  var factions = hostFaction === 'bloom' ? ['bloom','expedition'] : ['expedition','bloom']
  var state = {v: 1, rules: 'colony-1', round: 1, world: world === 'bloom' ? 'bloom' : 'expedition',
    players: (ids || ['local-expedition','local-bloom']).map(function (id,i) { return {id: id, faction: factions[i], minerals: 60} }),
    entities: [], deposits: map.deposits.map(function (d) { return {x: d[0],y: d[1],remaining: d[2]} }), outcome: null}
  ;[[[1,1],[1,2],[2,1]],[[10,10],[10,9],[9,10]]].forEach(function (positions,owner) {
    positions.forEach(function (p,i) {
      var type = i ? 'worker' : 'hq'
      state.entities.push({id: 'p'+owner+'-'+(i ? 'w'+(i-1) : 'hq'),owner: owner,type: type,x: p[0],y: p[1],hp: stats[type].hp,facing: owner ? 5 : 1})
    })
  })
  return state
}
function validate (state,owner,orders) {
  var cost = 0, units = 0, factories = 0, previous = ''
  function bad (error) { return {ok: false,error: error,cost: 0} }
  if (state.outcome) return bad('The match has ended.')
  if ((owner !== 0 && owner !== 1) || !Array.isArray(orders) || orders.length > 21) return bad('Invalid order batch.')
  state.entities.forEach(function (e) { if (e.owner === owner) { if (isUnit(e)) units++; else if (e.type === 'factory') factories++ } })
  for (var i = 0; i < orders.length; i++) {
    var o = orders[i]
    if (!Array.isArray(o) || typeof o[0] !== 'string' || o[0] <= previous) return bad('Orders must have unique, sorted entity IDs.')
    previous = o[0]
    var e = entity(state,o[0]), verb = o[1], s = e && stats[e.type]
    if (!e || e.owner !== owner) return bad('Only your own pieces can receive orders.')
    if (verb === 'hold' && o.length === 2) continue
    if (verb === 'mine' && o.length === 2 && e.type === 'worker' && state.deposits.some(function (d) { return d.x === e.x && d.y === e.y })) continue
    if (verb === 'move' && o.length === 3 && isUnit(e)) {
      if (!Array.isArray(o[2]) || !o[2].length || o[2].length > s.move) return bad('Movement exceeds this unit’s allowance.')
      var point = e, visited = {}
      for (var j = 0; j < o[2].length; j++) {
        var p = o[2][j]
        if (!Array.isArray(p) || p.length !== 2 || !inside(p[0],p[1])) return bad('Movement must stay on the map.')
        var next = {x: p[0],y: p[1]}, occupant = at(state,next.x,next.y), key = next.x+','+next.y
        if (distance(point,next) !== 1 || (occupant && occupant.id !== e.id) || visited[key]) return bad('Movement path is blocked or invalid.')
        visited[key] = true; point = next
      }
      continue
    }
    if (verb === 'attack' && o.length === 4 && s.range && inside(o[2],o[3]) && distance(e,{x:o[2],y:o[3]}) >= 1 && distance(e,{x:o[2],y:o[3]}) <= s.range) continue
    if (verb === 'build' && o.length === 4 && e.type === 'worker') {
      if (!inside(o[2],o[3]) || distance(e,{x:o[2],y:o[3]}) !== 1 || at(state,o[2],o[3]) || state.deposits.some(function (d) { return d.x === o[2] && d.y === o[3] })) return bad('Build beside your worker on empty ground without a deposit.')
      cost += stats.factory.cost; factories++
      continue
    }
    if (verb === 'train' && o.length === 5 && ((e.type === 'hq' && o[2] === 'worker') || (e.type === 'factory' && ['infantry','hovercraft','walker'].indexOf(o[2]) !== -1))) {
      if (!inside(o[3],o[4]) || distance(e,{x:o[3],y:o[4]}) !== 1 || at(state,o[3],o[4])) return bad('Choose an empty spawn tile beside the producer.')
      cost += stats[o[2]].cost; units++
      continue
    }
    return bad('Invalid action, target or unit type.')
  }
  if (units > 16 || factories > 4) return bad('Limit: 16 units and 4 factories per player.')
  if (cost > state.players[owner].minerals) return bad('Not enough minerals. Income arrives after production.')
  return {ok: true,error: null,cost: cost}
}
function resolve (opening,batches) {
  if (opening.outcome) throw new Error('The match has ended.')
  var state = clone(opening), events = [], orders = [], validations = []
  ;[0,1].forEach(function (owner) {
    var batch = batches && batches[owner], checked = validate(opening,owner,batch)
    validations.push(checked)
    if (!checked.ok) { events.push({kind:'invalid',owner:owner,text:checked.error}); batch = [] }
    state.players[owner].minerals -= checked.cost
    batch.forEach(function (o) { orders.push({order: o,owner: owner}) })
  })
  orders.sort(function (a,b) { return a.order[0] < b.order[0] ? -1 : 1 })
  var moves = orders.filter(function (a) { return a.order[1] === 'move' }), failed = {}
  moves.forEach(function (a,i) {
    moves.slice(i+1).forEach(function (b) {
      if (a.order[2].some(function (p) { return b.order[2].some(function (q) { return p[0] === q[0] && p[1] === q[1] }) })) {
        failed[a.order[0]] = failed[b.order[0]] = true
      }
    })
  })
  moves.forEach(function (a) {
    var e = entity(state,a.order[0]), path = a.order[2]
    if (failed[e.id]) { events.push({kind:'blocked',id:e.id,text:'Conflicting movement: '+e.id+' holds.'}); return }
    path.forEach(function (p) { e.facing = movement.facing(p[0]-e.x,p[1]-e.y,e.facing); e.x = p[0]; e.y = p[1] })
    events.push({kind:'move',id:e.id,path:clone(path),text:e.id+' moved.'})
  })
  var damage = {}
  orders.forEach(function (a) {
    var o = a.order
    if (o[1] !== 'attack') return
    var e = entity(state,o[0]), target = at(state,o[2],o[3]), s = stats[e.type]
    e.facing = movement.facing(o[2]-e.x,o[3]-e.y,e.facing)
    if (!target || target.owner === e.owner) { events.push({kind:'miss',id:e.id,text:e.id+' missed.'}); return }
    var amount = isUnit(target) ? s.damage : s.siege
    damage[target.id] = (damage[target.id] || 0)+amount
    events.push({kind:'attack',id:e.id,target:target.id,damage:amount,text:e.id+' hit '+target.id+' for '+amount+'.'})
  })
  state.entities = state.entities.filter(function (e) {
    e.hp -= damage[e.id] || 0
    if (e.hp > 0) return true
    events.push({kind:'destroy',id:e.id,text:e.id+' destroyed.'}); return false
  })
  var placements = orders.filter(function (a) { return a.order[1] === 'build' || a.order[1] === 'train' })
  var targets = {}
  placements.forEach(function (a) { var o = a.order, key = o[o.length-2]+','+o[o.length-1]; targets[key] = (targets[key] || 0)+1 })
  placements.forEach(function (a,index) {
    var o = a.order, type = o[1] === 'build' ? 'factory' : o[2], x = o[o.length-2], y = o[o.length-1]
    if (!entity(state,o[0]) || at(state,x,y) || targets[x+','+y] > 1) {
      state.players[a.owner].minerals += stats[type].cost
      events.push({kind:'refund',id:o[0],text:o[0]+' placement failed; '+stats[type].cost+' minerals refunded.'}); return
    }
    var id = 'r'+opening.round+'-p'+a.owner+'-n'+index
    state.entities.push({id:id,owner:a.owner,type:type,x:x,y:y,hp:stats[type].hp,facing:a.owner ? 5 : 1})
    events.push({kind:'create',id:id,text:type+' completed at ['+x+', '+y+'].'})
  })
  opening.entities.filter(function (e) { return e.type === 'worker' }).forEach(function (worker) {
    var alive = entity(state,worker.id), commanded = orders.filter(function (a) { return a.order[0] === worker.id })[0]
    if (!alive || (commanded && commanded.order[1] !== 'mine')) return
    var deposit = state.deposits.filter(function (d) { return d.x === worker.x && d.y === worker.y })[0]
    if (!deposit || !deposit.remaining) return
    var mined = Math.min(10,deposit.remaining)
    deposit.remaining -= mined; state.players[worker.owner].minerals += mined
    events.push({kind:'mine',id:worker.id,amount:mined,text:worker.id+' mined '+mined+' minerals.'})
  })
  var hqs = [0,1].map(function (owner) { return state.entities.some(function (e) { return e.owner === owner && e.type === 'hq' }) })
  if (!hqs[0] || !hqs[1]) state.outcome = {winner:hqs[0] ? 0 : hqs[1] ? 1 : null,reason:'HQ destroyed'}
  else if (opening.round >= 40) state.outcome = {winner:null,reason:'Round limit'}
  if (!state.outcome) state.round++
  state.entities.sort(function (a,b) { return a.id < b.id ? -1 : 1 })
  return {state:state,events:events,validations:validations}
}
function pathTo (state,id,x,y) {
  var e = entity(state,id)
  if (!e || !isUnit(e)) return null
  var pieces = state.entities.map(function (p) { return [p.x,p.y,p.type,state.players[p.owner].faction] })
  var path = movement.findPath(pieces,state.entities.indexOf(e),x,y)
  return path && path.length <= stats[e.type].move ? path : null
}
function encode (state) {
  return JSON.stringify([state.v,state.rules,state.round,state.world,
    state.players.map(function (p) { return [p.id,p.faction,p.minerals] }),
    state.deposits.map(function (d) { return [d.x,d.y,d.remaining] }).sort(function (a,b) { return a[0]-b[0] || a[1]-b[1] }),
    state.entities.map(function (e) { return [e.id,e.owner,e.type,e.x,e.y,e.hp,e.facing] }).sort(function (a,b) { return a[0] < b[0] ? -1 : 1 }),
    state.outcome ? [state.outcome.winner,state.outcome.reason] : null])
}
module.exports = {stats:stats,initial:initial,validate:validate,resolve:resolve,pathTo:pathTo,encode:encode,
  at:at,entity:entity,isUnit:isUnit,distance:distance,inside:inside,clone:clone}
