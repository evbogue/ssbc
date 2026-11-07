// Read-only art study. No game state, signing or network operations live here.
var size = 12
var deposits = [[2, 2, 120], [9, 9, 120], [3, 2, 120], [8, 9, 120],
  [5, 4, 180], [6, 7, 180], [4, 6, 180], [7, 5, 180]]
var pieces = [
  [1, 1, 'hq', 'expedition'], [3, 1, 'factory', 'expedition'],
  [1, 2, 'worker', 'expedition'], [2, 1, 'worker', 'expedition'],
  [4, 1, 'infantry', 'expedition'], [3, 3, 'hovercraft', 'expedition'],
  [1, 4, 'walker', 'expedition'],
  [10, 10, 'hq', 'bloom'], [8, 10, 'factory', 'bloom'],
  [10, 9, 'worker', 'bloom'], [9, 10, 'worker', 'bloom'],
  [7, 10, 'infantry', 'bloom'], [8, 8, 'hovercraft', 'bloom'],
  [10, 7, 'walker', 'bloom']
]

function project (x, y) { return {x: 600 + (x - y) * 48, y: 95 + (x + y) * 24} }
function unproject (x, y) {
  return {x: Math.round(((x - 600) / 48 + (y - 95) / 24) / 2),
    y: Math.round(((y - 95) / 24 - (x - 600) / 48) / 2)}
}
function at (list, x, y) {
  return list.filter(function (item) { return item[0] === x && item[1] === y })[0]
}
function describe (x, y) {
  var piece = at(pieces, x, y)
  var deposit = at(deposits, x, y)
  if (piece) return (piece[3] === 'bloom' ? 'The Bloom' : 'The Expedition') + ' · ' +
    ({hq: 'Colony HQ', factory: 'Factory', worker: 'Worker', infantry: 'Infantry',
      hovercraft: 'Hovercraft', walker: 'Siege walker'})[piece[2]]
  if (deposit) return 'Mineral deposit · ' + deposit[2] + ' minerals'
  return 'Open terrain · buildable ground'
}
module.exports = {size: size, deposits: deposits, pieces: pieces, at: at,
  project: project, unproject: unproject, describe: describe}
