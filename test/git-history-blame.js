'use strict'

// End-to-end test for the per-path history and blame JSON endpoints, which run
// native git against an on-disk repo materialized from the SSB-stored objects.

const fs   = require('fs')
const os   = require('os')
const net  = require('net')
const http = require('http')
const test = require('tape')
const { join } = require('path')
const { spawn, execFile } = require('child_process')
const { promisify } = require('util')

const bin   = join(__dirname, '../bin.js')
const pexec = promisify(execFile)

function tmpDir(name) { return fs.mkdtempSync(join(os.tmpdir(), name)) }

function getPort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer()
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)) })
    s.on('error', reject)
  })
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (c) => { body += c })
      res.on('end', () => resolve({ status: res.statusCode, body }))
    }).on('error', reject)
  })
}

function waitForHttp(url, tries) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      http.get(url, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 500) return resolve()
        retry(n)
      }).on('error', () => retry(n))
    }
    const retry = (n) => {
      if (!n) return reject(new Error('timeout waiting for ' + url))
      setTimeout(() => attempt(n - 1), 200)
    }
    attempt(tries)
  })
}

test('git json history and blame endpoints', async (t) => {
  const home     = tmpDir('ssb-git-hb-home-')
  const appPath  = join(home, 'app')
  const workPath = tmpDir('ssb-git-hb-work-')
  const env = Object.assign({}, process.env, { HOME: home, ssb_appname: 'test' })

  let child
  t.teardown(() => { if (child && !child.killed) child.kill('SIGKILL') })

  try {
    const sbotPort   = await getPort()
    const decentPort = await getPort()
    const wsPort     = await getPort()

    child = spawn(process.execPath, [
      bin, 'start',
      '--path', appPath,
      '--host=127.0.0.1',
      '--port=' + sbotPort,
      '--ws.port=' + wsPort,
      '--decent.host=127.0.0.1',
      '--decent.port=' + decentPort,
      '--ssbski.port=0'
    ], { env })
    child.once('exit', (code, signal) => {
      if (signal !== 'SIGKILL') t.fail('server exited early: ' + (signal || code))
    })

    await waitForHttp('http://127.0.0.1:' + decentPort + '/', 30)

    const conf = ['--', '--path', appPath, '--host', '127.0.0.1', '--port', String(sbotPort)]
    const { stdout } = await pexec(process.execPath, [bin, 'git.create', '{"name":"hb-test"}', ...conf], { env })
    const remoteUrl = JSON.parse(stdout.trim())
    t.ok(/\/git\//.test(remoteUrl), 'git.create returns a repo url')

    const git = (args) => pexec('git', args, { cwd: workPath, env })
    await git(['init'])
    await git(['config', 'user.name', 'Hist Test'])
    await git(['config', 'user.email', 'hist@example.invalid'])

    // Commit 1: one line. Commit 2: append a second line to the same file.
    fs.writeFileSync(join(workPath, 'file.txt'), 'line one\n')
    await git(['add', 'file.txt'])
    await git(['commit', '-m', 'First commit'])
    await git(['branch', '-M', 'main'])

    fs.writeFileSync(join(workPath, 'file.txt'), 'line one\nline two\n')
    await git(['add', 'file.txt'])
    await git(['commit', '-m', 'Second commit'])

    await git(['remote', 'add', 'ssb', remoteUrl])
    await git(['push', 'ssb', 'main'])

    // ── history ──────────────────────────────────────────────────────────────
    const histRes = await getJson(remoteUrl + '/json/history/main/file.txt')
    t.equal(histRes.status, 200, 'history returns 200')
    const hist = JSON.parse(histRes.body)
    t.equal(hist.path, 'file.txt', 'history echoes the path')
    t.equal(hist.commits.length, 2, 'history lists both commits that touched the file')
    t.equal(hist.commits[0].title, 'Second commit', 'newest commit first')
    t.equal(hist.commits[1].title, 'First commit', 'oldest commit last')
    t.equal(hist.commits[0].author.email, 'hist@example.invalid', 'author email present')
    t.ok(hist.commits[0].author.date, 'author date present')

    const histNone = await getJson(remoteUrl + '/json/history/main/does-not-exist.txt')
    t.equal(histNone.status, 200, 'history for unknown path still 200')
    t.equal(JSON.parse(histNone.body).commits.length, 0, 'history empty for unknown path')

    // ── blame ────────────────────────────────────────────────────────────────
    const blameRes = await getJson(remoteUrl + '/json/blame/main/file.txt')
    t.equal(blameRes.status, 200, 'blame returns 200')
    const blame = JSON.parse(blameRes.body)
    t.equal(blame.lines.length, 2, 'blame has one record per source line')
    t.equal(blame.lines[0].content, 'line one', 'blame line 1 content')
    t.equal(blame.lines[1].content, 'line two', 'blame line 2 content')
    t.equal(blame.lines[0].summary, 'First commit', 'line 1 attributed to the first commit')
    t.equal(blame.lines[1].summary, 'Second commit', 'line 2 attributed to the second commit')
    t.notEqual(blame.lines[0].sha1, blame.lines[1].sha1, 'the two lines come from different commits')
    t.ok(blame.lines[0].date, 'blame carries a commit date')

    // ── error cases ──────────────────────────────────────────────────────────
    const blameNoPath = await getJson(remoteUrl + '/json/blame/main/')
    t.ok(blameNoPath.status >= 400, 'blame without a path errors')

    const histBadRef = await getJson(remoteUrl + '/json/history/no-such-ref/file.txt')
    t.equal(histBadRef.status, 404, 'history for unknown ref is 404')
  } catch (err) {
    t.fail(err.message)
  }

  if (child && !child.killed) child.kill('SIGKILL')
  t.end()
})
