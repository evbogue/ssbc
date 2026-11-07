'use strict'
const test = require('tape')
const rules = require('../decent/src/scuttlegrounds/rules')
const localSession = require('../decent/src/scuttlegrounds/local-session')

function fixture (entities) {
  const s = rules.initial()
  s.entities = s.entities.filter(e => e.type === 'hq').concat(entities.map(e => Object.assign({hp:rules.stats[e.type].hp,facing:1},e)))
  return s
}
test('complete local campaign mines finite resources, builds, trains and destroys an HQ', t => {
  let s = rules.initial()
  const original = JSON.stringify(s)
  let result = rules.resolve(s,[[['p0-w0','build',2,3],['p0-w1','move',[[2,2]]]],[]])
  t.equal(JSON.stringify(s),original,'resolution does not mutate the opening state')
  s = result.state
  t.equal(s.players[0].minerals,20,'factory paid upfront; arriving worker does not mine')
  const factory = s.entities.find(e => e.type === 'factory')
  for (let i=0;i<6;i++) s = rules.resolve(s,[[],[]]).state
  t.equal(s.players[0].minerals,80,'stationary worker mines by default')
  t.equal(s.deposits.find(d=>d.x===2&&d.y===2).remaining,60,'deposit depletes')
  s = rules.resolve(s,[[[factory.id,'train','walker',3,3]],[]]).state
  const walker = s.entities.find(e=>e.type==='walker')
  t.ok(walker,'factory produces a walker in one round')
  for (let i=4;i<=8;i++) s = rules.resolve(s,[[[walker.id,'move',[[i,i]]]],[]]).state
  for (let i=0;i<4;i++) s = rules.resolve(s,[[[walker.id,'attack',10,10]],[]]).state
  t.deepEqual(s.outcome,{winner:0,reason:'HQ destroyed'},'siege damage wins a complete match')
  t.equal(s.deposits.find(d=>d.x===2&&d.y===2).remaining,0,'mining stops at exhaustion')
  t.throws(()=>rules.resolve(s,[[],[]]),/ended/,'no rounds after victory')
  t.end()
})
test('order validation rejects overspending, duplicate orders, enemy control and illegal placements', t => {
  const s = rules.initial()
  t.notOk(rules.validate(s,0,[['p0-w0','build',0,2],['p0-w1','build',3,1]]).ok,'cannot fund two factories')
  t.notOk(rules.validate(s,0,[['p0-w0','hold'],['p0-w0','mine']]).ok,'no duplicate commands')
  t.notOk(rules.validate(s,0,[['p1-w0','hold']]).ok,'cannot control enemy')
  t.notOk(rules.validate(s,0,[['p0-w0','build',2,2]]).ok,'no factory on a deposit')
  t.notOk(rules.validate(s,0,[['p0-w0','move',[[0,2],[0,3]]]]).ok,'worker only moves one step')
  t.notOk(rules.validate(s,0,[['p0-hq','train','walker',0,1]]).ok,'HQ produces workers only')
  t.notOk(rules.validate(s,0,[['p0-w0','attack',2,2]]).ok,'workers do not attack')
  const invalid = rules.resolve(s,[[['p0-w0','hold'],['p1-w0','hold']],[]])
  t.equal(invalid.validations[0].ok,false,'malformed batch is visibly invalid')
  t.equal(invalid.state.players[0].minerals,60,'entire invalid batch falls back without costs')
  t.end()
})
test('conflicting paths hold, including friendly moves, and vacated opening cells stay blocked', t => {
  const s = fixture([{id:'a',owner:0,type:'hovercraft',x:3,y:3},{id:'b',owner:1,type:'infantry',x:5,y:3}])
  let r = rules.resolve(s,[[['a','move',[[4,3]]]], [['b','move',[[4,3]]]]])
  t.equal(rules.entity(r.state,'a').x,3,'first mover holds')
  t.equal(rules.entity(r.state,'b').x,5,'second mover holds')
  rules.entity(s,'b').owner=0
  r=rules.resolve(s,[[['a','move',[[4,3]]],['b','move',[[4,3]]]],[]])
  t.equal(rules.entity(r.state,'a').x,3,'friendly collision also holds')
  t.notOk(rules.validate(s,0,[['a','move',[[4,3],[5,3]]],['b','move',[[6,3]]]]).ok,'cannot enter a cell occupied at opening')
  t.end()
})
test('combat is simultaneous, attacks hit tiles after movement, and placements refund on conflicts', t => {
  let s=fixture([{id:'a',owner:0,type:'infantry',x:4,y:4,hp:1},{id:'b',owner:1,type:'infantry',x:5,y:4,hp:1}])
  let r=rules.resolve(s,[[['a','attack',5,4]],[['b','attack',4,4]]])
  t.notOk(rules.entity(r.state,'a'),'first attacker dies')
  t.notOk(rules.entity(r.state,'b'),'dead attacker still fires')
  s=fixture([{id:'a',owner:0,type:'infantry',x:4,y:4},{id:'b',owner:1,type:'infantry',x:5,y:4}])
  r=rules.resolve(s,[[['a','attack',5,4]],[['b','move',[[6,4]]]]])
  t.equal(rules.entity(r.state,'b').hp,3,'moving away dodges a tile attack')
  s=fixture([{id:'a',owner:0,type:'worker',x:4,y:4},{id:'b',owner:1,type:'worker',x:6,y:4}])
  r=rules.resolve(s,[[['a','build',5,5]],[['b','build',5,5]]])
  t.equal(r.state.entities.filter(e=>e.type==='factory').length,0,'shared build target fails both placements')
  t.deepEqual(r.state.players.map(p=>p.minerals),[60,60],'both construction costs refunded')
  s=fixture([{id:'a',owner:0,type:'worker',x:4,y:4},{id:'b',owner:1,type:'infantry',x:6,y:5}])
  r=rules.resolve(s,[[['a','build',5,5]],[['b','move',[[5,5]]]]])
  t.equal(r.state.entities.filter(e=>e.type==='factory').length,0,'movement wins over placement')
  t.equal(r.state.players[0].minerals,60,'blocked builder refunded')
  t.end()
})
test('mining and production timing, mutual HQ destruction, canonical replay and round limit', t => {
  let s=fixture([{id:'a',owner:0,type:'worker',x:2,y:2}]); s.deposits[0].remaining=3
  let r=rules.resolve(s,[[],[]]); t.equal(r.state.players[0].minerals,63,'last small mineral remainder is exact')
  r=rules.resolve(s,[[['a','hold']],[]]); t.equal(r.state.players[0].minerals,60,'hold replaces automatic mining')
  r=rules.resolve(s,[[['p0-hq','train','worker',0,1]],[]]); t.equal(r.state.entities.filter(e=>e.type==='worker').length,2,'new worker completes')
  s=fixture([{id:'a',owner:0,type:'walker',x:9,y:9},{id:'b',owner:1,type:'walker',x:2,y:2}])
  s.entities.filter(e=>e.type==='hq').forEach(e=>{e.hp=5})
  r=rules.resolve(s,[[['a','attack',10,10]],[['b','attack',1,1]]])
  t.deepEqual(r.state.outcome,{winner:null,reason:'HQ destroyed'},'mutual HQ destruction draws')
  const reverse=rules.clone(s); reverse.entities.reverse()
  t.equal(rules.encode(r.state),rules.encode(rules.resolve(reverse,[[['a','attack',10,10]],[['b','attack',1,1]]]).state),'entity insertion order cannot change state hash input')
  s=rules.initial();s.round=40
  t.deepEqual(rules.resolve(s,[[],[]]).state.outcome,{winner:null,reason:'Round limit'},'40 round cap draws')
  t.end()
})
test('local match saves submitted orders, resumes rounds and records resignation', t => {
  const data={};const storage={getItem:k=>data[k],setItem:(k,v)=>{data[k]=v}}
  let local=localSession('expedition',storage)
  t.equal(local.draft([['p0-w1','move',[[2,2]]]]),null,'queues a legal local move')
  local.submit();t.equal(local.get().owner,1,'ready passes planning to other side')
  local=localSession('expedition',storage);t.equal(local.get().ready[0],true,'submitted orders survive reload')
  local.submit();t.equal(local.get().state.round,2,'two ready players resolve one round')
  local=localSession('expedition',storage);t.equal(rules.entity(local.get().state,'p0-w1').y,2,'reload replays movement')
  local.resign();local=localSession('expedition',storage);t.ok(local.get().state.outcome,'resignation survives reload')
  t.end()
})
