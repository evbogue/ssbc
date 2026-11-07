var h = require('hyperscript')
var rules = require('./rules')
var createMap = require('./map-preview')

function button (text,fn,disabled) { return h('button.sg-button', {type:'button',onclick:fn,disabled:!!disabled},text) }
function name (e) { return ({worker:'Worker',infantry:'Infantry',hovercraft:'Hovercraft',walker:'Siege walker',hq:'HQ',factory:'Factory'})[e.type] }
function faction (state,owner) { return state.players[owner].faction === 'bloom' ? 'Bloom' : 'Expedition' }

module.exports = function openGame (session) {
  if (document.querySelector('.sg-fullscreen')) return
  var previousFocus = document.activeElement, overflow = document.body.style.overflow
  var selected = null, action = null, notice = '', closed = false, lastRound = 0, lastOwner = -1, known = {}
  var title = h('h1'), hud = h('div.sg-game-hud'), board = h('div.sg-world')
  var panel = h('div.sg-game-panel'), status = h('p.sg-game-status'), controls = h('div.sg-game-actions')
  status.setAttribute('role','status')
  var roster = h('select.sg-unit-picker', {onchange:function () { selected = roster.value; action = null; render(); scene.focusEntity(selected) }})
  roster.setAttribute('aria-label','Select a piece')
  var info = h('div.sg-game-info'), orderList = h('div.sg-game-orders'), roundControls = h('div.sg-game-round-controls'), log = h('div.sg-game-log')
  var modal = h('div.sg-fullscreen.sg-game', {role:'dialog'},
    h('header.sg-map-header',h('div',h('span.sg-eyebrow','SCUTTLEGROUNDS'),title),button('Close game',close)),
    hud,board,panel)
  modal.setAttribute('aria-modal','true'); modal.setAttribute('aria-label','Scuttlegrounds match')
  panel.appendChild(status); panel.appendChild(roster); panel.appendChild(info); panel.appendChild(controls)
  panel.appendChild(orderList); panel.appendChild(roundControls); panel.appendChild(log)
  document.body.appendChild(modal); document.body.style.overflow = 'hidden'
  var scene = createMap(board,{interactive:true,state:session.get().state,onTile:tile,
    onAssetStatus:function (text) { if (text) { notice = text; render() } }})
  var unsubscribe = session.subscribe(render)
  document.addEventListener('decent:route-change',close); document.addEventListener('keydown',keydown)
  modal.querySelector('button').focus()
  render()

  function invoke (fn) {
    notice = ''
    try {
      var result = fn()
      if (result && typeof result.then === 'function') result.then(function (err) { notice = err || ''; render() },function (err) { notice = err.message; render() })
      else { notice = result || ''; render() }
    } catch (err) { notice = err.message; render() }
  }
  function sorted (orders) { return orders.slice().sort(function (a,b) { return a[0] < b[0] ? -1 : 1 }) }
  function withOrder (snap,o) { return sorted(snap.orders.filter(function (a) { return a[0] !== o[0] }).concat([o])) }
  function tuple (snap,e,x,y) {
    if (action === 'move') { var path = rules.pathTo(snap.state,e.id,x,y); return path && [e.id,'move',path] }
    if (action === 'attack' || action === 'build') return [e.id,action,x,y]
    if (action && action.indexOf('train:') === 0) return [e.id,'train',action.slice(6),x,y]
    return null
  }
  function editable (snap) { return snap.owner >= 0 && !snap.state.outcome && snap.phase === 'planning' && !snap.ready[snap.owner] }
  function tile (x,y) {
    var snap = session.get(), e = rules.entity(snap.state,selected)
    if (action && e && editable(snap)) {
      var o = tuple(snap,e,x,y)
      if (!o) { notice = 'That tile is outside this unit’s movement range.'; render(); return }
      var checked = rules.validate(snap.state,snap.owner,withOrder(snap,o))
      if (!checked.ok) { notice = checked.error; render(); return }
      action = null; invoke(function () { return session.draft(withOrder(snap,o)) }); return
    }
    var target = rules.at(snap.state,x,y)
    if (target) { selected = target.id; action = null; notice = ''; render(); return }
    var d = snap.state.deposits.filter(function (d) { return d.x === x && d.y === y })[0]
    notice = d ? 'Deposit: '+d.remaining+' minerals remaining.' : 'Empty ground ['+x+', '+y+'].'
    render()
  }
  function direct (verb) {
    var snap = session.get()
    action = null; invoke(function () { return session.draft(withOrder(snap,[selected,verb])) })
  }
  function arm (verb) { action = action === verb ? null : verb; notice = ''; render() }
  function render () {
    if (closed) return
    var snap = session.get(), state = snap.state, owner = snap.owner
    var focus = lastOwner >= 0 && owner !== lastOwner
    state.entities.forEach(function (piece) { known[piece.id] = faction(state,piece.owner)+' '+name(piece) })
    if (state.round !== lastRound || owner !== lastOwner) { action = null; selected = null; notice = ''; lastRound = state.round; lastOwner = owner }
    if (!selected || !rules.entity(state,selected)) {
      var first = state.entities.filter(function (e) { return e.owner === owner })[0]
      selected = first ? first.id : null
    }
    var e = rules.entity(state,selected), canEdit = editable(snap), own = e && e.owner === owner
    var checked = owner >= 0 ? rules.validate(state,owner,snap.orders) : {cost:0}
    title.textContent = 'Round '+state.round+' · '+(snap.local ? 'Local two-player match' : 'SSB match')
    hud.innerHTML = ''
    ;[0,1].forEach(function (i) {
      hud.appendChild(h('span',faction(state,i)+': '+state.players[i].minerals+' minerals · '+(snap.ready[i] ? 'Ready' : 'Planning')))
    })
    if (owner >= 0) hud.appendChild(h('strong',faction(state,owner)+' orders · '+checked.cost+' reserved'))
    roster.innerHTML = ''
    state.entities.forEach(function (piece) {
      roster.appendChild(h('option',{value:piece.id},faction(state,piece.owner)+' '+name(piece)+' ['+piece.x+', '+piece.y+'] · HP '+piece.hp))
    })
    roster.value = selected || ''
    info.textContent = e ? name(e)+' · HP '+e.hp+'/'+rules.stats[e.type].hp+' · Move '+rules.stats[e.type].move+' · Range '+rules.stats[e.type].range : 'No piece selected.'
    controls.innerHTML = ''
    if (own && canEdit) {
      if (rules.isUnit(e)) controls.appendChild(button('Move',function () { arm('move') }))
      if (rules.stats[e.type].range) controls.appendChild(button('Attack',function () { arm('attack') }))
      if (e.type === 'worker') {
        controls.appendChild(button('Mine',function () { direct('mine') }))
        controls.appendChild(button('Build factory · 40',function () { arm('build') }))
      }
      if (e.type === 'hq' || e.type === 'factory') {
        ;(e.type === 'hq' ? ['worker'] : ['infantry','hovercraft','walker']).forEach(function (type) {
          controls.appendChild(button('Train '+name({type:type})+' · '+rules.stats[type].cost,function () { arm('train:'+type) }))
        })
      }
      controls.appendChild(button('Hold / idle',function () { direct('hold') }))
      controls.appendChild(button('Clear order',function () { action = null; invoke(function () { return session.draft(snap.orders.filter(function (o) { return o[0] !== selected })) }) }))
    }
    var legal = []
    if (action && own && canEdit) {
      for (var x = 0; x < 12; x++) for (var y = 0; y < 12; y++) {
        var candidate = tuple(snap,e,x,y)
        if (candidate && rules.validate(state,owner,withOrder(snap,candidate)).ok) legal.push({x:x,y:y})
      }
    }
    status.textContent = notice || snap.error || (state.outcome ? (state.outcome.winner === null ? 'Draw' : faction(state,state.outcome.winner)+' wins')+' · '+state.outcome.reason : action ? 'Choose a highlighted tile for '+action.replace('train:','training ')+'.' : canEdit ? 'Select a piece and queue an action. Workers on deposits mine automatically.' : 'Orders locked. Waiting for the other player / round resolution.')
    orderList.innerHTML = ''
    if (snap.orders.length) orderList.appendChild(h('strong','Queued orders'))
    snap.orders.forEach(function (o) {
      var piece = rules.entity(state,o[0])
      orderList.appendChild(h('div',(piece ? name(piece)+' ['+piece.x+', '+piece.y+']' : o[0])+': '+o[1]+(o.length > 2 ? ' '+JSON.stringify(o.slice(2)) : '')))
    })
    roundControls.innerHTML = ''
    if (snap.local) roundControls.appendChild(button('Plan as '+faction(state,1-owner),function () { action = null; invoke(function () { return session.switchOwner(1-owner) }) }))
    if (!state.outcome && owner >= 0) roundControls.appendChild(button(snap.local ? 'Ready / submit orders' : 'Commit orders',function () { action = null; invoke(session.submit) },!canEdit))
    if (!state.outcome && snap.host) roundControls.appendChild(button('Force round',function () {
      if (window.confirm('Advance with no orders for players who have not submitted? They will hold position and queue no purchases.')) invoke(session.force)
    }))
    if (!state.outcome && owner >= 0) roundControls.appendChild(button('Resign',function () { if (window.confirm('Resign this match?')) invoke(session.resign) }))
    if (snap.local) roundControls.appendChild(button('New local match',function () { if (window.confirm('Replace this saved local match?')) { selected = null; invoke(session.reset) } }))
    roundControls.appendChild(button('−',function () { scene.zoom(0.8) })); roundControls.appendChild(button('+',function () { scene.zoom(1.25) }))
    roundControls.appendChild(button('Fit map',scene.fit))
    log.innerHTML = ''
    ;(snap.events || []).slice(-6).forEach(function (event) {
      var text = event.text
      Object.keys(known).sort(function (a,b) { return b.length-a.length }).forEach(function (id) { text = text.split(id).join(known[id]) })
      log.appendChild(h('div',text))
    })
    scene.setGameState(state,snap.orders,selected,legal)
    if (focus && selected) scene.focusEntity(selected)
  }
  function keydown (event) {
    if (event.key === 'Escape') { event.preventDefault(); close(); return }
    if (event.key !== 'Tab') return
    var elements = Array.prototype.filter.call(modal.querySelectorAll('button,select,canvas[tabindex]'),function (e) { return !e.disabled })
    var first = elements[0], last = elements[elements.length-1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }
  function close () {
    if (closed) return
    closed = true; unsubscribe(); session.close(); scene.destroy(); modal.remove()
    document.body.style.overflow = overflow
    document.removeEventListener('decent:route-change',close); document.removeEventListener('keydown',keydown)
    if (previousFocus && previousFocus.isConnected) previousFocus.focus()
  }
}
