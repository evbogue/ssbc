var rules = require('./rules')

module.exports = function localSession (world,storage) {
  var key = 'scuttlegrounds:local-v1:'+world
  var data = {history:[],drafts:[[],[]],ready:[false,false],owner:0}, error = null, listeners = [], state, events = []
  try {
    var saved = storage && storage.getItem(key)
    if (saved) {
      var parsed = JSON.parse(saved)
      if (!Array.isArray(parsed.history) || parsed.history.length > 40 || !Array.isArray(parsed.drafts) || !Array.isArray(parsed.ready) || (parsed.owner !== 0 && parsed.owner !== 1)) throw new Error('Invalid saved local match.')
      data = parsed
    }
    rebuild()
  } catch (err) { data = {history:[],drafts:[[],[]],ready:[false,false],owner:0}; rebuild(); error = 'Saved match could not be restored; starting a new local match.' }
  function rebuild () {
    state = rules.initial(null,world)
    data.history.forEach(function (batches) { var result = rules.resolve(state,batches); state = result.state; events = result.events })
    if (data.resigned === 0 || data.resigned === 1) state.outcome = {winner:1-data.resigned,reason:'Resignation'}
    ;[0,1].forEach(function (owner) { if (!state.outcome && !rules.validate(state,owner,data.drafts[owner]).ok) throw new Error('Invalid saved orders.') })
  }
  function change (fn) {
    var previous = rules.clone(data), oldState = state, oldEvents = events
    try {
      fn()
      if (storage) storage.setItem(key,JSON.stringify(data))
      error = null
    } catch (err) { data = previous; state = oldState; events = oldEvents; error = err.message }
    listeners.slice().forEach(function (fn) { fn() })
    return error
  }
  function advance () {
    var batches = data.drafts.map(function (d,i) { return data.ready[i] ? d : [] })
    var result = rules.resolve(state,batches)
    state = result.state; events = result.events; data.history.push(batches)
    data.drafts = [[],[]]; data.ready = [false,false]
  }
  return {
    get: function () { return {state:state,owner:data.owner,orders:data.drafts[data.owner],ready:data.ready,events:events,error:error,local:true,host:true,phase:state.outcome ? 'ended' : 'planning'} },
    subscribe: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (e) { return e !== fn }) } },
    draft: function (orders) {
      if (data.ready[data.owner]) return 'These orders are already submitted.'
      var checked = rules.validate(state,data.owner,orders)
      if (!checked.ok) return checked.error
      return change(function () { data.drafts[data.owner] = rules.clone(orders) })
    },
    switchOwner: function (owner) { if (owner === 0 || owner === 1) return change(function () { data.owner = owner }) },
    submit: function () {
      if (state.outcome || data.ready[data.owner]) return 'Cannot submit now.'
      return change(function () {
        data.ready[data.owner] = true
        if (data.ready.every(Boolean)) advance()
        else data.owner = 1-data.owner
      })
    },
    force: function () { if (!state.outcome) return change(advance) },
    resign: function () { if (!state.outcome) return change(function () { state = rules.clone(state); state.outcome = {winner:1-data.owner,reason:'Resignation'}; data.resigned = data.owner }) },
    reset: function () { return change(function () { data = {history:[],drafts:[[],[]],ready:[false,false],owner:0}; events = []; rebuild() }) },
    close: function () { listeners.length = 0 }
  }
}
