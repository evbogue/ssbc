// Local visual preview only; not the game's turn or movement rules.
var map = require('./map')
var directions = require('./assets/sprites-v1.json').directions
var steps = [[1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1]]

function isUnit (piece) { return piece && piece[2] !== 'hq' && piece[2] !== 'factory' }
function facing (dx, dy, previous) {
  dx = Math.sign(dx); dy = Math.sign(dy)
  for (var i = 0; i < steps.length; i++) if (steps[i][0] === dx && steps[i][1] === dy) return i
  return previous == null ? 1 : previous
}
function findPath (pieces, index, tx, ty) {
  var unit = pieces[index]
  if (!isUnit(unit) || !Number.isInteger(tx) || !Number.isInteger(ty) || tx < 0 || ty < 0 || tx >= map.size || ty >= map.size) return null
  if (map.at(pieces, tx, ty)) return null
  var queue = [[unit[0], unit[1], []]], seen = {}
  seen[unit[0] + ',' + unit[1]] = true
  for (var cursor = 0; cursor < queue.length; cursor++) {
    var node = queue[cursor]
    for (var i = 0; i < steps.length; i++) {
      var x = node[0] + steps[i][0], y = node[1] + steps[i][1], key = x + ',' + y
      if (x < 0 || y < 0 || x >= map.size || y >= map.size || seen[key] || map.at(pieces, x, y)) continue
      var path = node[2].concat([[x, y]])
      if (x === tx && y === ty) return path
      seen[key] = true; queue.push([x, y, path])
    }
  }
  return null
}
module.exports = {directions: directions, steps: steps, isUnit: isUnit, facing: facing, findPath: findPath}
