'use strict'

// Poll the progress() function and display a simple ASCII progress bar.
module.exports = function (progress) {
  function bar(r) {
    const M = 50
    let s = '\r'
    for (let i = 0; i < M; i++) s += i < M * r ? '*' : '.'
    return s
  }

  function round(n, p) { return Math.round(n * p) / p }
  function percent(n)   { return (round(n, 1000) * 100).toString().substring(0, 4) + '%' }

  function rate(prog) {
    if (prog.target === prog.current) return 1
    return (prog.current - prog.start) / (prog.target - prog.start)
  }

  let prog = -1
  const int = setInterval(() => {
    const p = progress()
    let r = 1
    const tasks = []
    for (const k in p) {
      const _r = rate(p[k])
      if (_r < 1) tasks.push(k + ':' + percent(_r))
      r = Math.min(_r, r)
    }
    if (r !== prog) {
      prog = r
      const msg = tasks.join(', ')
      process.stdout.write('\r' + bar(prog) + ' (' + msg + ')\x1b[K\r')
    }
  }, 333)

  if (int.unref) int.unref()
}
