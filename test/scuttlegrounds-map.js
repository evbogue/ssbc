'use strict'

const test = require('tape')
const map = require('../decent/src/scuttlegrounds/map')

test('isometric picking returns the displayed tile across the entire map', (t) => {
  for (let x = 0; x < map.size; x++) {
    for (let y = 0; y < map.size; y++) {
      const point = map.project(x, y)
      // Interior points near all four diamond edges still belong to this tile.
      for (const [dx, dy] of [[0, 0], [-40, 0], [40, 0], [0, -20], [0, 20]]) {
        const tile = map.unproject(point.x + dx, point.y + dy)
        if (tile.x !== x || tile.y !== y) t.fail(`wrong pick for ${x},${y} at ${dx},${dy}`)
      }
    }
  }
  t.pass('all tile interiors project and pick consistently')
  t.end()
})

test('map preview gives both colonies symmetric deposits and distinct piece locations', (t) => {
  const occupied = new Set()
  for (const piece of map.pieces) {
    const [x, y] = piece
    t.ok(x >= 0 && x < map.size && y >= 0 && y < map.size, 'piece is on the map')
    t.notOk(occupied.has(`${x},${y}`), 'pieces do not overlap')
    t.notOk(map.at(map.deposits, x, y), 'piece does not obscure a deposit')
    occupied.add(`${x},${y}`)
  }
  for (const [x, y, minerals] of map.deposits) {
    const mirrored = map.at(map.deposits, 11 - x, 11 - y)
    t.equal(mirrored && mirrored[2], minerals, 'mirrored deposit has equal resources')
  }
  t.equal(map.describe(1, 1), 'The Expedition · Colony HQ', 'humanoid HQ can be inspected')
  t.equal(map.describe(10, 10), 'The Bloom · Colony HQ', 'Bloom HQ can be inspected')
  t.equal(map.describe(5, 4), 'Mineral deposit · 180 minerals', 'minerals can be inspected')
  t.end()
})
