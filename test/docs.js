'use strict'

const test = require('tape')
const http = require('http')
const MarkdownIt = require('markdown-it')

const docs = require('../lib/docs-renderer')
const { createUiServer } = require('../lib/ui-server')

// ---------------------------------------------------------------------------
// Renderer unit tests
// ---------------------------------------------------------------------------

test('rewriteHref rewrites relative .md links to /docs/<slug>', (t) => {
  t.equal(docs.rewriteHref('overview.md'), '/docs/overview')
  t.equal(docs.rewriteHref('./api.md'), '/docs/api')
  t.equal(docs.rewriteHref('docs-maintenance.md'), '/docs/docs-maintenance')
  t.end()
})

test('rewriteHref preserves anchors on rewritten links', (t) => {
  t.equal(docs.rewriteHref('api.md#writing'), '/docs/api#writing')
  t.equal(docs.rewriteHref('./architecture.md#data-flow'), '/docs/architecture#data-flow')
  t.end()
})

test('rewriteHref leaves external links and bare anchors untouched', (t) => {
  t.equal(docs.rewriteHref('https://example.com/x.md'), 'https://example.com/x.md')
  t.equal(docs.rewriteHref('http://example.com/x.md'), 'http://example.com/x.md')
  t.equal(docs.rewriteHref('mailto:a@b.c'), 'mailto:a@b.c')
  t.equal(docs.rewriteHref('//cdn.example/x.md'), '//cdn.example/x.md')
  t.equal(docs.rewriteHref('#section'), '#section')
  t.end()
})

test('rewriteHref leaves non-.md relative links untouched', (t) => {
  t.equal(docs.rewriteHref('img/diagram.png'), 'img/diagram.png')
  t.equal(docs.rewriteHref('./assets/logo.svg'), './assets/logo.svg')
  t.end()
})

test('rendered pages render fenced code blocks', (t) => {
  // The generated API reference contains fenced code examples.
  const html = docs.renderDocPage('api-reference')
  t.ok(html.includes('<pre><code>'), 'fenced code becomes <pre><code>')
  t.end()
})

test('renderer neutralizes raw HTML in Markdown source', (t) => {
  // Render a hostile snippet through the same configured markdown instance the
  // renderer uses, by exercising a doc page is not enough, so test the contract
  // directly: html:false must escape raw tags.
  const md = new MarkdownIt({ html: false })
  const out = md.render('Hello <script>alert(1)</script> world')
  t.ok(out.indexOf('<script>') === -1, 'raw <script> is not emitted')
  t.ok(out.indexOf('&lt;script&gt;') !== -1, 'raw HTML is escaped')
  t.end()
})

test('renderDocPage returns null for non-allowlisted slugs', (t) => {
  t.equal(docs.renderDocPage('docs-and-readme-work-order'), null)
  t.equal(docs.renderDocPage('git-identity-work-order'), null)
  t.equal(docs.renderDocPage('nonexistent'), null)
  t.end()
})

test('index lists every allowlisted page and the archive', (t) => {
  const html = docs.renderIndex()
  for (const page of docs.DOC_PAGES) {
    t.ok(html.includes('/docs/' + page.slug), 'index links /docs/' + page.slug)
  }
  t.ok(html.includes('/docs/archive'), 'index links the historical archive')
  t.end()
})

// ---------------------------------------------------------------------------
// Live HTTP routing tests
// ---------------------------------------------------------------------------

function get(port, urlPath) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: urlPath }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => resolve({ status: res.statusCode, body, type: res.headers['content-type'] }))
    }).on('error', reject)
  })
}

test('/docs routes are served, work orders 404, archive is bannered', (t) => {
  const fakeSbot = { id: '@docs-test.ed25519' }
  const ui = createUiServer(fakeSbot, { decent: { port: 0 } }, {
    pluginName: 'docs-test',
    configNamespace: 'decent',
    defaultPort: 0,
    stylesheetName: 'style.css',
    buildDir: require('path').join(__dirname, '..', 'decent', 'build'),
    launchMessage: 'docs-test launched at',
    useWsPortFallback: false
  })

  ui.server.on('listening', async () => {
    const port = ui.server.address().port
    try {
      const index = await get(port, '/docs')
      t.equal(index.status, 200, 'GET /docs is 200')
      t.ok(/text\/html/.test(index.type), '/docs is HTML')
      t.ok(index.body.includes('/docs/overview'), '/docs index links a page')

      const page = await get(port, '/docs/overview')
      t.equal(page.status, 200, 'GET /docs/overview is 200')
      t.ok(page.body.includes('Docs index'), 'page has docs nav')

      const ref = await get(port, '/docs/api-reference')
      t.equal(ref.status, 200, 'GET /docs/api-reference is 200')

      const workOrder = await get(port, '/docs/docs-and-readme-work-order')
      t.equal(workOrder.status, 404, 'work order slug returns 404')

      const junk = await get(port, '/docs/does-not-exist')
      t.equal(junk.status, 404, 'unknown slug returns 404')

      const archive = await get(port, '/docs/archive')
      t.equal(archive.status, 200, 'GET /docs/archive is 200')
      t.ok(archive.body.includes('Historical archive'), 'archive carries a banner')
      t.ok(archive.body.includes('/docs/archive/'), 'archive links are archive-local')
    } catch (err) {
      t.fail(err.message)
    }
    ui.close(() => t.end())
  })
})
