'use strict'

const test = require('tape')
const fs = require('fs')
const path = require('path')
const map = require('../decent/src/scuttlegrounds/map')
const movement = require('../decent/src/scuttlegrounds/movement-preview')
const units = require('../decent/src/scuttlegrounds/assets/sprites-v1.json')
const worlds = require('../decent/src/scuttlegrounds/assets/worlds-v1.json')

test('isometric movement chooses all eight screen facings and keeps facing at rest', (t) => {
  const cases = [[1, -1, 'E'], [1, 0, 'SE'], [1, 1, 'S'], [0, 1, 'SW'],
    [-1, 1, 'W'], [-1, 0, 'NW'], [-1, -1, 'N'], [0, -1, 'NE']]
  for (const [dx, dy, name] of cases) {
    t.equal(movement.directions[movement.facing(dx, dy)], name, `world ${dx},${dy} faces screen ${name}`)
  }
  t.equal(movement.facing(0, 0, 6), 6, 'resting does not turn north into another view')
  t.end()
})

test('local movement preview routes around pieces without mutating the shared map', (t) => {
  const before = JSON.stringify(map.pieces)
  const route = movement.findPath(map.pieces, 2, 5, 5)
  t.ok(route && route.length, 'a path across open terrain exists')
  let previous = map.pieces[2]
  for (const step of route) {
    t.equal(Math.max(Math.abs(step[0] - previous[0]), Math.abs(step[1] - previous[1])), 1, 'each step is adjacent')
    t.notOk(map.at(map.pieces, step[0], step[1]), 'path avoids buildings and units')
    previous = step
  }
  t.deepEqual(route[route.length - 1], [5, 5], 'path ends at the requested destination')
  t.equal(movement.findPath(map.pieces, 2, 1, 1), null, 'cannot enter the HQ')
  t.equal(movement.findPath(map.pieces, 0, 5, 5), null, 'HQ cannot move')
  t.equal(movement.findPath(map.pieces, 2, -1, 5), null, 'cannot leave the map')
  t.equal(movement.findPath(map.pieces, 2, 3.5, 5), null, 'cannot move to fractional tiles')
  const surrounded = [[5, 5, 'worker', 'expedition']].concat(movement.steps.map(([x, y]) => [5 + x, 5 + y, 'factory', 'bloom']))
  t.equal(movement.findPath(surrounded, 0, 9, 9), null, 'surrounded unit has no route')
  t.equal(JSON.stringify(map.pieces), before, 'preview planning leaves the shared fixture unchanged')
  t.end()
})

test('all 80 sprite frames stay inside their shipped PNG atlases', (t) => {
  let count = 0
  for (const [collection, directional] of [[units.factions, true], [worlds.worlds, false]]) {
    for (const data of Object.values(collection)) {
      const bytes = fs.readFileSync(path.join(__dirname, '../decent/src/scuttlegrounds/assets', data.file))
      t.equal(bytes.subarray(1, 4).toString(), 'PNG', 'source is a PNG')
      t.equal(bytes.readUInt32BE(16), data.width, 'atlas width matches frame metadata')
      t.equal(bytes.readUInt32BE(20), data.height, 'atlas height matches frame metadata')
      t.equal(bytes[25], 6, 'PNG preserves RGBA transparency')
      const frames = directional ? data.frames.flat() : data.frames
      t.equal(frames.length, directional ? 32 : 8, 'atlas has every required view or world object')
      for (const [x, y, w, h] of frames) {
        t.ok(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= data.width && y + h <= data.height, 'frame is fully inside source image')
        count++
      }
    }
  }
  t.equal(count, 80, '64 directional units and 16 world objects are indexed')
  t.end()
})
