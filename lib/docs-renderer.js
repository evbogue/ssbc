'use strict'

// Renders the repository's canonical Markdown documentation into small, styled
// HTML pages for the built-in `/docs` route. Only the allowlisted pages below
// are ever served, so work orders and proposals in docs/ cannot leak out.
//
// SSB post rendering uses `ssb-markdown`; it is deliberately NOT used here
// because it rejects ordinary relative documentation links. This module uses
// `markdown-it` with raw HTML disabled and a custom link rule that rewrites
// relative `.md` links to `/docs/<slug>`.

const fs   = require('fs')
const path = require('path')
const MarkdownIt = require('markdown-it')

const DOCS_DIR = path.join(__dirname, '..', 'docs')

// The only documentation pages exposed at /docs/<slug>. Order is the index order.
const DOC_PAGES = [
  { slug: 'overview',         title: 'Overview' },
  { slug: 'architecture',     title: 'Architecture' },
  { slug: 'api',              title: 'API' },
  { slug: 'api-reference',    title: 'API reference (generated)' },
  { slug: 'cli',              title: 'CLI' },
  { slug: 'frontend',         title: 'Frontend' },
  { slug: 'docs-maintenance', title: 'Documentation maintenance' }
]

const ALLOWED_SLUGS = new Set(DOC_PAGES.map((p) => p.slug))

function isAllowedSlug(slug) {
  return ALLOWED_SLUGS.has(slug)
}

// True for anything that should be left exactly as the author wrote it:
// absolute URLs (with a scheme), protocol-relative URLs, and same-page anchors.
function isExternalOrAnchor(href) {
  if (!href) return true
  if (href[0] === '#') return true
  if (href.slice(0, 2) === '//') return true
  return /^[a-z][a-z0-9+.\-]*:/i.test(href)
}

// Rewrite a relative `.md` link to its /docs/<slug> route, preserving any
// `#anchor`. Non-.md relative links and external links are returned unchanged.
function rewriteHref(href) {
  if (isExternalOrAnchor(href)) return href

  const hashIndex = href.indexOf('#')
  const anchor = hashIndex === -1 ? '' : href.slice(hashIndex)
  let pathPart  = hashIndex === -1 ? href : href.slice(0, hashIndex)

  pathPart = pathPart.replace(/^\.\//, '')
  if (!/\.md$/i.test(pathPart)) return href

  const slug = path.basename(pathPart).replace(/\.md$/i, '')
  return '/docs/' + slug + anchor
}

function createMarkdown() {
  // html:false escapes any raw HTML in the source (neutralizing it rather than
  // passing it through). linkify is off so bare URLs are not auto-linked.
  const md = new MarkdownIt({ html: false, linkify: false, typographer: false })

  const defaultLinkOpen = md.renderer.rules.link_open ||
    function (tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options)
    }

  md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    const token = tokens[idx]
    const hrefIndex = token.attrIndex('href')
    if (hrefIndex !== -1) {
      token.attrs[hrefIndex][1] = rewriteHref(token.attrs[hrefIndex][1])
    }
    return defaultLinkOpen(tokens, idx, options, env, self)
  }

  return md
}

const md = createMarkdown()

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const PAGE_STYLE = [
  ':root{color-scheme:light dark}',
  '*{box-sizing:border-box}',
  'body{margin:0;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;',
  'color:#1a1a1a;background:#fdfdfd}',
  'main{max-width:46rem;margin:0 auto;padding:2rem 1.25rem 4rem}',
  'nav.docs-nav{max-width:46rem;margin:0 auto;padding:1rem 1.25rem;border-bottom:1px solid #e3e3e3;',
  'font-size:.9rem;display:flex;gap:1rem;flex-wrap:wrap}',
  'nav.docs-nav a{color:#0a58ca;text-decoration:none}',
  'nav.docs-nav a:hover{text-decoration:underline}',
  'a{color:#0a58ca}',
  'h1,h2,h3,h4{line-height:1.25;margin:1.8em 0 .6em}',
  'h1{margin-top:.4em}',
  'code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.9em;',
  'background:#f0f0f0;padding:.1em .35em;border-radius:4px}',
  'pre{background:#f4f4f4;padding:1rem;border-radius:8px;overflow:auto}',
  'pre code{background:none;padding:0}',
  'blockquote{margin:1em 0;padding:.2em 1em;border-left:4px solid #d0d0d0;color:#444}',
  'table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:.4em .7em}',
  '.docs-banner{max-width:46rem;margin:0 auto 1.5rem;padding:.8rem 1rem;border-radius:8px;',
  'background:#fff6db;border:1px solid #e7d27a;font-size:.92rem}',
  '@media (prefers-color-scheme:dark){',
  'body{color:#e6e6e6;background:#16181c}',
  'nav.docs-nav{border-color:#2c2f36}',
  'nav.docs-nav a,a{color:#6ea8fe}',
  'code{background:#23262d}pre{background:#1d2026}',
  'blockquote{border-left-color:#3a3f47;color:#b6b6b6}',
  'td,th{border-color:#2c2f36}',
  '.docs-banner{background:#2a2410;border-color:#5c4f1e}',
  '}'
].join('')

// Wrap rendered body HTML in a complete, accessible page with light/dark styles
// and navigation to the docs index and historical archive.
function wrapPage(title, bodyHtml, opts) {
  opts = opts || {}
  const banner = opts.banner
    ? '<div class="docs-banner">' + opts.banner + '</div>'
    : ''
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>' + escapeHtml(title) + '</title>',
    '<style>' + PAGE_STYLE + '</style>',
    '</head>',
    '<body>',
    '<nav class="docs-nav">',
    '<a href="/docs">Docs index</a>',
    '<a href="/docs/archive">Historical archive</a>',
    '<a href="/">App</a>',
    '</nav>',
    '<main>',
    banner,
    bodyHtml,
    '</main>',
    '</body>',
    '</html>'
  ].join('\n')
}

// Render an allowlisted Markdown page to a full HTML document.
// Returns the HTML string, or null if the slug is not allowed or the file is
// missing.
function renderDocPage(slug) {
  if (!isAllowedSlug(slug)) return null
  const file = path.join(DOCS_DIR, slug + '.md')
  let source
  try {
    source = fs.readFileSync(file, 'utf8')
  } catch (_) {
    return null
  }
  const page = DOC_PAGES.find((p) => p.slug === slug)
  const bodyHtml = md.render(source)
  return wrapPage((page ? page.title : slug) + ' — ssbc docs', bodyHtml)
}

// Render the /docs index: the list of current docs plus a labelled archive link.
function renderIndex() {
  const items = DOC_PAGES.map((p) =>
    '<li><a href="/docs/' + p.slug + '">' + escapeHtml(p.title) + '</a></li>'
  ).join('\n')
  const body = [
    '<h1>Documentation</h1>',
    '<p>Current documentation for this server. These pages describe how the',
    'repository works now.</p>',
    '<ul>',
    items,
    '</ul>',
    '<h2>Historical archive</h2>',
    '<p>The vendored <a href="/docs/archive">scuttlebot.io manual</a> is kept as a',
    'clearly labelled historical reference. It describes the original',
    'Secure Scuttlebutt project, not this server\'s current behavior.</p>'
  ].join('\n')
  return wrapPage('Documentation — ssbc', body)
}

module.exports = {
  DOC_PAGES,
  isAllowedSlug,
  rewriteHref,
  renderDocPage,
  renderIndex,
  wrapPage,
  escapeHtml
}
