'use strict'

const fs = require('fs')
const os = require('os')
const net = require('net')
const http = require('http')
const test = require('tape')
const { join } = require('path')
const { spawn, execFile } = require('child_process')

const bin = join(__dirname, '../bin.js')

function tmpDir(name) {
  return fs.mkdtempSync(join(os.tmpdir(), name))
}

function getPort(cb) {
  const server = net.createServer()
  server.listen(0, '127.0.0.1', function () {
    const port = server.address().port
    server.close(function () {
      cb(null, port)
    })
  })
  server.on('error', cb)
}

function run(file, args, opts, cb) {
  execFile(file, args, opts, function (err, stdout, stderr) {
    if (err) {
      err.stdout = stdout
      err.stderr = stderr
      return cb(err)
    }
    cb(null, stdout, stderr)
  })
}

function getText(url, cb) {
  http.get(url, function (res) {
    let body = ''
    res.setEncoding('utf8')
    res.on('data', function (chunk) {
      body += chunk
    })
    res.on('end', function () {
      cb(null, res, body)
    })
  }).on('error', cb)
}

function waitForHttp(url, tries, cb) {
  getText(url, function (err, res) {
    if (!err && res.statusCode >= 200 && res.statusCode < 500) return cb()
    if (!tries) return cb(err || new Error('timeout waiting for ' + url))
    setTimeout(function () {
      waitForHttp(url, tries - 1, cb)
    }, 200)
  })
}

test('git smart http server supports create push clone and json api', function (t) {
  const home = tmpDir('ssb-git-home-')
  const appPath = join(home, 'app')
  const workPath = tmpDir('ssb-git-work-')
  const clonePath = tmpDir('ssb-git-clone-')
  const env = Object.assign({}, process.env, {
    HOME: home,
    ssb_appname: 'test'
  })

  let child
  let remoteUrl

  function cleanup() {
    if (child && !child.killed) child.kill('SIGKILL')
  }

  t.teardown(cleanup)

  getPort(function (err, sbotPort) {
    t.error(err, 'allocate sbot port')
    if (err) return

    getPort(function (err, decentPort) {
      t.error(err, 'allocate decent port')
      if (err) return

      getPort(function (err, wsPort) {
        t.error(err, 'allocate ws port')
        if (err) return

        child = spawn(process.execPath, [
          bin,
          'start',
          '--path', appPath,
          '--host=127.0.0.1',
          '--port=' + sbotPort,
          '--ws.port=' + wsPort,
          '--decent.host=127.0.0.1',
          '--decent.port=' + decentPort,
          '--ssbsky.port=0'
        ], { env })

        let serverExited = false
        child.once('exit', function (code, signal) {
          serverExited = true
          if (signal === 'SIGKILL') return
          t.fail('server exited early: ' + (signal || code))
        })

        waitForHttp('http://127.0.0.1:' + decentPort + '/', 30, function (err) {
          t.error(err, 'decent http server starts')
          if (err || serverExited) return

          run(process.execPath, [
            bin,
            'git.create',
            '{"name":"git-e2e-test"}',
            '--',
            '--path', appPath,
            '--host', '127.0.0.1',
            '--port', String(sbotPort)
          ], { env }, function (err, stdout) {
          t.error(err, 'git.create succeeds')
          if (err) return

          remoteUrl = JSON.parse(stdout.trim())
          t.ok(/^http:\/\/127\.0\.0\.1:\d+\/git\//.test(remoteUrl), 'git.create returns smart http url')

          const repoId = decodeURIComponent(remoteUrl.split('/git/')[1])

          run(process.execPath, [
            bin,
            'get',
            repoId,
            '--',
            '--path', appPath,
            '--host', '127.0.0.1',
            '--port', String(sbotPort)
          ], { env }, function (err, stdout) {
            t.error(err, 'repo message fetch succeeds')
            if (err) return

            const repoValue = JSON.parse(stdout)
            t.equal(repoValue.content.name, 'git-e2e-test', 'git.create stores the repo name, not the raw JSON string')

            fs.writeFileSync(join(workPath, 'README.md'), '# git-ssb e2e\n\nhello from test\n')

            run('git', ['init'], { cwd: workPath, env }, function (err) {
              t.error(err, 'git init succeeds')
              if (err) return

              run('git', ['config', 'user.name', 'Codex Test'], { cwd: workPath, env }, function (err) {
                t.error(err, 'set git user.name')
                if (err) return

                run('git', ['config', 'user.email', 'codex@example.invalid'], { cwd: workPath, env }, function (err) {
                  t.error(err, 'set git user.email')
                  if (err) return

                  run('git', ['add', 'README.md'], { cwd: workPath, env }, function (err) {
                    t.error(err, 'git add succeeds')
                    if (err) return

                    run('git', ['commit', '-m', 'Initial test commit'], { cwd: workPath, env }, function (err) {
                      t.error(err, 'git commit succeeds')
                      if (err) return

                      run('git', ['branch', '-M', 'main'], { cwd: workPath, env }, function (err) {
                        t.error(err, 'git branch rename succeeds')
                        if (err) return

                        run('git', ['remote', 'add', 'ssb', remoteUrl], { cwd: workPath, env }, function (err) {
                          t.error(err, 'git remote add succeeds')
                          if (err) return

                          run('git', ['push', 'ssb', 'main'], { cwd: workPath, env }, function (err) {
                            t.error(err, 'git push over smart http succeeds')
                            if (err) return

                            run('git', ['clone', remoteUrl, 'repo'], { cwd: clonePath, env }, function (err) {
                              t.error(err, 'git clone over smart http succeeds')
                              if (err) return

                              const readme = fs.readFileSync(join(clonePath, 'repo', 'README.md'), 'utf8')
                              t.equal(readme, '# git-ssb e2e\n\nhello from test\n', 'cloned content matches pushed content')

                              getText(remoteUrl + '/json/refs', function (err, res, body) {
                                t.error(err, 'json refs request succeeds')
                                if (err) return
                                t.equal(res.statusCode, 200, 'json refs returns 200')

                                const refs = JSON.parse(body)
                                t.equal(refs.symrefs[0].name, 'HEAD', 'json refs exposes HEAD symref')
                                t.equal(refs.symrefs[0].ref, 'refs/heads/main', 'HEAD points to main')
                                t.equal(refs.refs[0].name, 'refs/heads/main', 'json refs exposes pushed branch')

                                getText(remoteUrl + '/json/log/main', function (err, res, body) {
                                  t.error(err, 'json log request succeeds')
                                  if (err) return
                                  t.equal(res.statusCode, 200, 'json log returns 200')

                                  const log = JSON.parse(body)
                                  t.equal(log.ref, 'main', 'json log returns requested ref')
                                  t.equal(log.commits[0].title, 'Initial test commit', 'json log returns pushed commit title')
                                  cleanup()
                                  t.end()
                                })
                              })
                            })
                          })
                        })
                      })
                    })
                  })
                })
              })
            })
          })
          })
        })
      })
    })
  })
})
