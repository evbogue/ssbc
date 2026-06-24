'use strict'
var h             = require('hyperscript')
var pull          = require('pull-stream')
var hyperfile     = require('hyperfile')
var hypercrop     = require('hypercrop')
var hyperlightbox = require('hyperlightbox')
var self_id       = require('../../keys').id

exports.needs = {
  avatar_image:      'first',
  avatar_image_link: 'first',
  avatar_name:       'first',
  avatar_action:     'map',
  follows:           'first',
  followers:         'first',
  follower_of:       'first',
  sbot_links:        'first',
  sbot_user_feed:    'first',
  message_confirm:   'first',
  blob_url:          'first',
  blobs_url:         'first'
}

exports.gives = 'avatar_profile'

exports.create = function (api) {
  function isSsbproSkin () {
    return typeof document !== 'undefined' &&
      !!document.querySelector('link[rel="stylesheet"][href*="ssbpro-style.css"]')
  }

  function wordCount (text) {
    return (text || '').trim().split(/\s+/).filter(Boolean).length
  }

  function analyzeBio (text) {
    var bio = (text || '').trim()
    if (!bio) return {
      tone: 'warn',
      label: 'Add a short bio',
      detail: 'Say what people can subscribe to you for.'
    }
    if (bio.length > 180) return {
      tone: 'warn',
      label: 'Too long for cards',
      detail: 'Aim for one or two sentences so it previews cleanly.'
    }
    if (bio.length < 28 || wordCount(bio) < 5) return {
      tone: 'hint',
      label: 'Could be clearer',
      detail: 'Add one concrete detail about what you do or care about.'
    }
    if (/^(hi|hello|hey|welcome|just|things|stuff)\b/i.test(bio)) return {
      tone: 'hint',
      label: 'Start stronger',
      detail: 'Lead with what you make, study, or want to share.'
    }
    if ((bio.match(/https?:\/\//g) || []).length > 1) return {
      tone: 'hint',
      label: 'Link-heavy',
      detail: 'Keep the bio readable and include only the most useful link.'
    }
    return {
      tone: 'good',
      label: 'Looks good',
      detail: 'This should read well in cards and QR previews.'
    }
  }

  function stripBuzzwords (text) {
    return (text || '')
      .replace(/\b(passionate|visionary|disruptive|innovative|synergy|thought leader|rockstar|ninja)\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([,.])/g, '$1')
      .trim()
  }

  function firstSentence (text) {
    var bio = (text || '').trim()
    var match = bio.match(/^(.{24,170}?[.!?])\s/)
    return match ? match[1] : bio
  }

  function transformBio (text, mode) {
    var bio = (text || '').trim()
    if (mode === 'shorten') return firstSentence(stripBuzzwords(bio)).slice(0, 180).trim()
    if (mode === 'clearer') return stripBuzzwords(bio)
    if (mode === 'warmer') {
      if (!bio) return 'I am working on local-first tools and sharing what I learn.'
      if (/^I\b/.test(bio)) return bio
      return 'I ' + bio.charAt(0).toLowerCase() + bio.slice(1)
    }
    if (mode === 'specific') {
      if (!bio) return 'I build ___ for ___ and write about ___.'
      if (bio.indexOf('___') !== -1) return bio
      return bio + ' Currently focused on ___.'
    }
    if (mode === 'buzzwords') return stripBuzzwords(bio)
    return bio
  }

  // ── Blob upload helper ──────────────────────────────────────────────
  function uploadBlob (dataURL, cb) {
    // Decode base64 data URL to binary using native browser APIs.
    // dataurl-.parse() returns a browserify Buffer that XHR serialises as a
    // base64 string rather than raw bytes, so we decode it ourselves.
    var parts  = dataURL.split(',')
    var mime   = parts[0].match(/:([^;]+)/)[1]
    var binary = atob(parts[1])
    var arr    = new Uint8Array(binary.length)
    for (var i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)

    var xhr = new XMLHttpRequest()
    xhr.open('POST', '/blobs/add', true)
    xhr.responseType = 'text'
    xhr.onload = function () {
      if (xhr.status < 200 || xhr.status >= 300)
        return cb(new Error('Upload failed: ' + xhr.status))
      cb(null, { link: xhr.responseText.trim(), size: arr.length, type: mime })
    }
    xhr.onerror = function () { cb(new Error('Network error')) }
    xhr.send(arr)
  }

  return function (id) {
    var isSelf = id === self_id

    // ── Runtime state ───────────────────────────────────────────────
    var description     = ''
    var headerImageLink = null
    var editing         = false
    var pendingAvatar   = null
    var pendingBanner   = null
    var followingData   = []
    var followersData   = []
    var currentList     = null   // 'following' | 'followers' | null
    var lb              = null   // lazily created lightbox

    function getLightbox () {
      if (!lb) {
        lb = hyperlightbox()
        document.body.appendChild(lb)
      }
      return lb
    }

    function showImproveBio () {
      var modal = h('div.bio-improve-modal')
      var nameInput = h('input.bio-improve-name', {
        type: 'text',
        value: nameSpan.textContent || '',
        placeholder: 'Display name'
      })
      var bioInput = h('textarea.bio-improve-text', {
        rows: 5,
        placeholder: 'Write a short bio people can understand at a glance...'
      }, description)
      var count = h('span.bio-improve-count')
      var status = h('div.bio-improve-status')
      var previewName = h('div.bio-preview-name')
      var previewBio = h('div.bio-preview-text')
      var saveBtn = h('button.btn.btn-primary.bio-improve-save', {type: 'button'}, 'Save bio')

      function close () {
        getLightbox().close()
      }

      function sync () {
        var bio = bioInput.value
        var name = nameInput.value.trim() || 'Your name'
        var analysis = analyzeBio(bio)
        count.textContent = bio.length + '/180'
        count.classList.toggle('bio-improve-count--over', bio.length > 180)
        status.className = 'bio-improve-status bio-improve-status--' + analysis.tone
        status.innerHTML = ''
        status.appendChild(h('strong', analysis.label))
        status.appendChild(h('span', analysis.detail))
        previewName.textContent = name
        previewBio.textContent = bio.trim() || 'A concise bio helps people know why to subscribe.'
        saveBtn.disabled = !nameInput.value.trim() && !bio.trim()
      }

      function applyTransform (mode) {
        bioInput.value = transformBio(bioInput.value, mode)
        sync()
        bioInput.focus()
      }

      function template (text) {
        bioInput.value = text
        sync()
        bioInput.focus()
      }

      function save () {
        var newName = nameInput.value.trim()
        var newBio = bioInput.value.trim()
        var msg = {type: 'about', about: id}
        var changed = false
        if (newName && newName !== nameSpan.textContent) {
          msg.name = newName
          changed = true
        }
        if (newBio !== description) {
          msg.description = newBio
          changed = true
        }
        if (!changed) { close(); return }
        saveBtn.disabled = true
        api.message_confirm(msg, function (err, published) {
          saveBtn.disabled = false
          if (err) { alert(err.message); return }
          if (published) {
            if (newName) nameSpan.textContent = newName
            description = newBio
            bioEl.textContent = newBio
            renderProfileQuality()
          }
          close()
        })
      }

      modal.appendChild(h('div.bio-improve-header',
        h('div',
          h('div.bio-improve-title', 'Improve bio'),
          h('div.bio-improve-subtitle', 'Make your public SSB identity easier to understand.')
        ),
        h('button.bio-improve-close', {type: 'button', title: 'Close', onclick: close},
          h('span.material-symbols-outlined', 'close'))
      ))
      modal.appendChild(h('div.bio-improve-grid',
        h('div.bio-improve-editor',
          h('label.bio-improve-label', 'Name'),
          nameInput,
          h('label.bio-improve-label', 'Bio'),
          bioInput,
          h('div.bio-improve-row', count),
          status,
          h('div.bio-improve-tools',
            h('button', {type: 'button', onclick: function () { applyTransform('shorten') }}, 'Shorten'),
            h('button', {type: 'button', onclick: function () { applyTransform('clearer') }}, 'Make clearer'),
            h('button', {type: 'button', onclick: function () { applyTransform('warmer') }}, 'Make warmer'),
            h('button', {type: 'button', onclick: function () { applyTransform('specific') }}, 'More specific'),
            h('button', {type: 'button', onclick: function () { applyTransform('buzzwords') }}, 'Remove buzzwords')
          ),
          h('div.bio-improve-templates',
            h('button', {type: 'button', onclick: function () { template('I build ___ for ___ and write about ___.') }}, 'I build...'),
            h('button', {type: 'button', onclick: function () { template('Working on ___, interested in ___.') }}, 'Working on...'),
            h('button', {type: 'button', onclick: function () { template('Independent ___ focused on ___.') }}, 'Independent...')
          )
        ),
        h('div.bio-improve-preview',
          h('div.bio-preview-heading', 'Profile card'),
          h('div.bio-preview-card',
            h('div.bio-preview-top',
              api.avatar_image(id, 'thumbnail'),
              h('div', previewName, previewBio)
            ),
            h('button.bio-preview-subscribe', {type: 'button', disabled: true}, 'Subscribe')
          ),
          h('div.bio-preview-note', 'This is how your bio appears in profile cards and QR subscribe previews.')
        )
      ))
      modal.appendChild(h('div.bio-improve-footer',
        h('button.btn', {type: 'button', onclick: close}, 'Cancel'),
        saveBtn
      ))

      nameInput.addEventListener('input', sync)
      bioInput.addEventListener('input', sync)
      saveBtn.onclick = save
      sync()
      getLightbox().show(modal)
      bioInput.focus()
      bioInput.select()
    }

    // ── Banner cropper ──────────────────────────────────────────────
    // Renders a drag-to-pan crop modal and exports 1600×534 JPEG (3:1, retina-ready)
    function showBannerCropper (dataURL, onConfirm) {
      var OUT_W  = 1600, OUT_H  = 534   // output dimensions (~3:1 @ 2× retina)
      var DISP_W = 600,  DISP_H = 200   // canvas pixel dimensions inside modal

      var img = new Image()
      img.onload = function () {
        var imgRatio = img.width / img.height
        var outRatio = OUT_W / OUT_H

        // Scale to cover: fit whichever axis is "short" relative to the banner ratio
        var scaledW, scaledH
        if (imgRatio >= outRatio) {
          // Image wider than banner — fit height, allow horizontal pan
          scaledH = OUT_H
          scaledW = Math.round(img.width * (OUT_H / img.height))
        } else {
          // Image taller than banner — fit width, allow vertical pan
          scaledW = OUT_W
          scaledH = Math.round(img.height * (OUT_W / img.width))
        }

        // Start centered
        var panX = (OUT_W - scaledW) / 2
        var panY = (OUT_H - scaledH) / 2

        function clampPan () {
          panX = Math.min(0, Math.max(OUT_W - scaledW, panX))
          panY = Math.min(0, Math.max(OUT_H - scaledH, panY))
        }

        // Display canvas (rendered at DISP_W×DISP_H pixels, CSS stretches to 100%)
        var dc   = h('canvas.banner-crop-canvas', {width: DISP_W, height: DISP_H})
        var dctx = dc.getContext('2d')

        function draw () {
          dctx.clearRect(0, 0, DISP_W, DISP_H)
          dctx.drawImage(img,
            panX    * DISP_W / OUT_W,
            panY    * DISP_H / OUT_H,
            scaledW * DISP_W / OUT_W,
            scaledH * DISP_H / OUT_H
          )
        }

        draw()

        var canPanH = scaledW > OUT_W
        var canPanV = scaledH > OUT_H
        var canPan  = canPanH || canPanV

        var hintText = canPanH && canPanV ? 'Drag to reposition'
          : canPanH ? 'Drag left or right to reposition'
          : canPanV ? 'Drag up or down to reposition'
          : ''

        // ── Mouse drag ─────────────────────────────────────────────
        var dragging    = false
        var anchorX     = 0, anchorY     = 0
        var panAtDragX  = 0, panAtDragY  = 0

        function onMouseDown (e) {
          if (!canPan) return
          e.preventDefault()
          dragging   = true
          anchorX    = e.clientX
          anchorY    = e.clientY
          panAtDragX = panX
          panAtDragY = panY
          dc.style.cursor = 'grabbing'
        }

        function onMouseMove (e) {
          if (!dragging) return
          var rect   = dc.getBoundingClientRect()
          // Map CSS-pixel delta → output-pixel delta (map-pan convention: drag right = see right)
          var scaleX = OUT_W / rect.width
          var scaleY = OUT_H / rect.height
          panX = panAtDragX - (e.clientX - anchorX) * scaleX
          panY = panAtDragY - (e.clientY - anchorY) * scaleY
          clampPan()
          draw()
        }

        function onMouseUp () {
          if (!dragging) return
          dragging = false
          dc.style.cursor = canPan ? 'grab' : 'default'
        }

        function cleanup () {
          document.removeEventListener('mousemove', onMouseMove)
          document.removeEventListener('mouseup',   onMouseUp)
        }

        dc.addEventListener('mousedown', onMouseDown)
        document.addEventListener('mousemove', onMouseMove)
        document.addEventListener('mouseup',   onMouseUp)

        // ── Touch drag ─────────────────────────────────────────────
        dc.addEventListener('touchstart', function (e) {
          if (!canPan || !e.touches[0]) return
          e.preventDefault()
          dragging   = true
          anchorX    = e.touches[0].clientX
          anchorY    = e.touches[0].clientY
          panAtDragX = panX
          panAtDragY = panY
        }, {passive: false})

        dc.addEventListener('touchmove', function (e) {
          if (!dragging || !e.touches[0]) return
          e.preventDefault()
          var rect   = dc.getBoundingClientRect()
          var scaleX = OUT_W / rect.width
          var scaleY = OUT_H / rect.height
          panX = panAtDragX - (e.touches[0].clientX - anchorX) * scaleX
          panY = panAtDragY - (e.touches[0].clientY - anchorY) * scaleY
          clampPan()
          draw()
        }, {passive: false})

        dc.addEventListener('touchend', function () { dragging = false })

        // ── Confirm / Cancel ───────────────────────────────────────
        function doConfirm () {
          cleanup()
          var out = document.createElement('canvas')
          out.width  = OUT_W
          out.height = OUT_H
          out.getContext('2d').drawImage(img, panX, panY, scaledW, scaledH)
          getLightbox().close()
          onConfirm(out.toDataURL('image/jpeg', 0.85))
        }

        function doCancel () {
          cleanup()
          getLightbox().close()
        }

        dc.style.cursor = canPan ? 'grab' : 'default'

        var modal = h('div.profile-crop-modal.profile-banner-crop-modal',
          h('div.profile-crop-title',
            h('span.material-symbols-outlined', {style: {fontSize: '18px'}}, 'wallpaper'),
            ' Banner photo'
          ),
          dc,
          hintText ? h('p.profile-crop-hint', hintText) : null,
          h('div.profile-crop-buttons',
            h('button.btn',             {type: 'button', title: 'Cancel and keep your current banner', onclick: doCancel},  'Cancel'),
            h('button.btn.btn-primary', {type: 'button', title: 'Set this image as your profile banner', onclick: doConfirm}, 'Use this banner')
          )
        )
        getLightbox().show(modal)
      }
      img.src = dataURL
    }

    // ── Banner ──────────────────────────────────────────────────────
    var bannerEl = h('div.profile-banner')

    // ── Avatar ──────────────────────────────────────────────────────
    var avatarImg  = api.avatar_image(id, 'profile')
    var avatarWrap = h('div.profile-avatar-wrap', avatarImg)

    // ── Name / handle / bio ────────────────────────────────────────
    var nameSpan = api.avatar_name(id)
    var nameEl   = h('div.profile-name', nameSpan)

    var copyBtn = h('button.profile-copy-btn', {
      type: 'button', title: 'Copy ID to clipboard',
      onclick: function () {
        var fullId = id
        var btn = copyBtn
        function flash () {
          var orig = btn.querySelector('.material-symbols-outlined')
          if (orig) orig.textContent = 'check'
          setTimeout(function () { if (orig) orig.textContent = 'content_copy' }, 2000)
        }
        if (navigator.clipboard) {
          navigator.clipboard.writeText(fullId).then(flash)
        } else {
          var ta = document.createElement('textarea')
          ta.value = fullId
          document.body.appendChild(ta)
          ta.select()
          document.execCommand('copy')
          document.body.removeChild(ta)
          flash()
        }
      }
    }, h('span.material-symbols-outlined', {style: {fontSize: '13px'}}, 'content_copy'))

    var handleEl = h('div.profile-handle',
      id.slice(0, 14) + '…' + id.slice(-6), ' ', copyBtn)

    var bioEl = h('div.profile-bio' + (isSelf ? '.profile-bio--self' : ''))

    // ── Stats + expandable lists ───────────────────────────────────
    var postCountEl      = h('strong', '—')
    var followingCountEl = h('strong', '—')
    var followersCountEl = h('strong', '—')
    var listExpandEl     = h('div.profile-list-expand', {style: {display: 'none'}})
    var profileQualityEl = h('div.profile-quality', {style: {display: 'none'}})
    var relationEl       = h('div.profile-relation', {style: {display: 'none'}})
    var activityEl       = h('div.profile-activity', {style: {display: 'none'}})

    function profileNeeds () {
      var needs = []
      var name = (nameSpan.textContent || '').trim()
      if (!name || name === id) needs.push({icon: 'badge', text: 'Add a display name'})
      if (!description || description.trim().length < 28)
        needs.push({icon: 'subject', text: 'Add a clear one or two sentence bio'})
      if (!headerImageLink) needs.push({icon: 'wallpaper', text: 'Add a banner image'})
      return needs
    }

    function renderProfileQuality () {
      if (!isSsbproSkin() || !isSelf) return
      var needs = profileNeeds()
      profileQualityEl.innerHTML = ''
      if (!needs.length) {
        profileQualityEl.style.display = 'none'
        return
      }
      profileQualityEl.appendChild(h('div.profile-quality__head',
        h('span.material-symbols-outlined', 'tips_and_updates'),
        h('strong', 'Profile hints')
      ))
      var list = h('div.profile-quality__list')
      needs.forEach(function (item) {
        list.appendChild(h('button.profile-quality__item', {
          type: 'button',
          onclick: item.icon === 'subject' ? showImproveBio : enterEdit
        },
          h('span.material-symbols-outlined', item.icon),
          h('span', item.text)
        ))
      })
      profileQualityEl.appendChild(list)
      profileQualityEl.style.display = ''
    }

    function renderRelation (youFollow, followsYou) {
      if (!isSsbproSkin() || isSelf) return
      var label = youFollow && followsYou ? 'Mutual subscription'
        : youFollow ? 'You subscribe to this profile'
        : followsYou ? 'This profile subscribes to you'
        : 'You are not subscribed yet'
      var icon = youFollow && followsYou ? 'sync_alt'
        : youFollow ? 'check_circle'
        : followsYou ? 'person_add'
        : 'person'
      relationEl.innerHTML = ''
      relationEl.appendChild(h('span.material-symbols-outlined', icon))
      relationEl.appendChild(h('span', label))
      relationEl.style.display = ''
    }

    function shorten (text, max) {
      text = (text || '').replace(/\s+/g, ' ').trim()
      if (text.length <= max) return text
      return text.slice(0, max - 1).replace(/\s+\S*$/, '') + '…'
    }

    function renderActivity (summary) {
      if (!isSsbproSkin()) return
      activityEl.innerHTML = ''
      var rows = []
      if (summary.intro) rows.push({
        icon: 'waving_hand',
        label: 'Intro',
        value: shorten(summary.intro, 130)
      })
      if (summary.channels.length) rows.push({
        icon: 'tag',
        label: 'Channels',
        value: summary.channels.slice(0, 5).map(function (ch) { return '#' + ch }).join(' ')
      })
      if (summary.mediaCount) rows.push({
        icon: 'perm_media',
        label: 'Media',
        value: summary.mediaCount + ' post' + (summary.mediaCount === 1 ? '' : 's') + ' with blobs'
      })
      if (!rows.length) {
        activityEl.style.display = 'none'
        return
      }
      activityEl.appendChild(h('div.profile-activity__head', h('strong', 'Activity')))
      rows.forEach(function (row) {
        activityEl.appendChild(h('div.profile-activity__row',
          h('span.material-symbols-outlined', row.icon),
          h('div',
            h('span.profile-activity__label', row.label),
            h('span.profile-activity__value', row.value)
          )
        ))
      })
      activityEl.style.display = ''
    }

    function toggleList (type) {
      if (currentList === type) {
        listExpandEl.innerHTML = ''
        listExpandEl.style.display = 'none'
        currentList = null
        return
      }
      currentList = type
      listExpandEl.innerHTML = ''
      var data = type === 'following' ? followingData : followersData
      listExpandEl.appendChild(h('div.profile-list-title',
        type === 'following'
          ? isSsbproSkin() ? 'Subscriptions' : 'Following'
          : isSsbproSkin() ? 'Subscribers' : 'Followers'))
      var grid = h('div.profile-list-grid')
      data.forEach(function (fid) {
        grid.appendChild(api.avatar_image_link(fid, 'thumbnail'))
      })
      listExpandEl.appendChild(grid)
      listExpandEl.style.display = ''
    }

    var statsEl = h('div.profile-stats',
      h('span.profile-stat', postCountEl, ' Posts'),
      h('span.profile-stat', {onclick: function () { toggleList('following') }},
        followingCountEl, isSsbproSkin() ? ' Subscriptions' : ' Following'),
      h('span.profile-stat', {onclick: function () { toggleList('followers') }},
        followersCountEl, isSsbproSkin() ? ' Subscribers' : ' Followers')
    )

    // ── Petname (others' profiles): inline "add / edit nickname" ──────
    // Collapsed: a ghost trigger ("Add nickname" / "Edit nickname"). Click it
    // to reveal [input][Save][Cancel]. Enter/Esc are kept as shortcuts. The
    // nickname is published as an `about` claiming a name for this feed.
    var petnameEl    = h('div.profile-petname', {style: {display: 'none'}})
    var petnameName  = null
    var petnameFound = false

    function petnameEditing () {
      return petnameEl.classList.contains('petname--editing')
    }

    function renderPetnameEditing () {
      petnameEl.innerHTML = ''
      petnameEl.classList.add('petname--editing')

      var input  = h('input.petname-input', {
        type: 'text', value: petnameName || '', placeholder: 'Your name for them'
      })
      var save   = h('button.btn.btn-primary.btn-sm.petname-save',  {type: 'button', title: 'Save your private nickname for this person'}, 'Save')
      var cancel = h('button.btn.btn-sm.petname-cancel',            {type: 'button', title: 'Cancel editing the nickname'}, 'Cancel')

      function syncSave () { save.disabled = !input.value.trim() }
      function commit () {
        var v = input.value.trim()
        if (!v) return
        save.disabled = true
        api.message_confirm({type: 'about', about: id, name: v}, function (err, msg) {
          if (err || !msg) { save.disabled = false; return }
          petnameFound = true
          petnameName  = v
          renderPetnameCollapsed()
        })
      }

      save.onclick   = commit
      cancel.onclick = renderPetnameCollapsed
      input.addEventListener('input', syncSave)
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter')  { e.preventDefault(); commit() }
        if (e.key === 'Escape') { renderPetnameCollapsed() }
      })

      petnameEl.appendChild(input)
      petnameEl.appendChild(save)
      petnameEl.appendChild(cancel)
      petnameEl.style.display = ''
      syncSave()
      input.focus(); input.select()
    }

    function renderPetnameCollapsed () {
      if (isSelf) { petnameEl.style.display = 'none'; return }
      petnameEl.innerHTML = ''
      petnameEl.classList.remove('petname--editing')
      petnameEl.appendChild(
        h('button.petname-trigger', {type: 'button', title: petnameName ? 'Edit your private nickname for this person' : 'Add a private nickname for this person', onclick: renderPetnameEditing},
          h('span.material-symbols-outlined', {style: {fontSize: '15px'}},
            petnameName ? 'edit' : 'add'),
          h('span.petname-trigger-label', petnameName ? 'Edit nickname' : 'Add nickname')
        )
      )
      petnameEl.style.display = ''
    }

    // ── Actions area (top-right of card body) ──────────────────────
    var actionsEl = h('div.profile-card-actions')
    var editBtn, improveBtn

    if (isSelf) {
      editBtn = h('button.btn.profile-edit-btn', {type: 'button', title: 'Edit your name, picture, and bio', onclick: enterEdit},
        'Edit profile')
      if (isSsbproSkin()) {
        improveBtn = h('button.btn.btn-primary.profile-improve-btn', {
          type: 'button',
          title: 'Improve your public bio',
          onclick: showImproveBio
        }, 'Improve bio')
        actionsEl.appendChild(improveBtn)
      }
      actionsEl.appendChild(editBtn)
    } else {
      var actionEls = api.avatar_action(id)
      ;(Array.isArray(actionEls) ? actionEls : [actionEls]).forEach(function (el) {
        if (el) actionsEl.appendChild(el)
      })
    }

    // ── Edit form (own profile only) ───────────────────────────────
    var nameInput, bioInput
    var editFormEl = h('div.profile-edit-form', {style: {display: 'none'}})

    function enterEdit () {
      editing = true
      pendingAvatar = null
      pendingBanner = null
      editFormEl.innerHTML = ''

      nameInput = h('input.profile-name-input', {
        type: 'text', value: nameSpan.textContent || '', placeholder: 'Display name'
      })
      bioInput = h('textarea.profile-bio-input', {placeholder: 'Write a bio…', rows: 3}, description)

      editFormEl.appendChild(h('div.profile-edit-fields',
        h('label.profile-edit-label', 'Name'), nameInput,
        h('label.profile-edit-label', 'Bio'),  bioInput
      ))
      editFormEl.appendChild(h('div.profile-edit-footer',
        h('button.btn.btn-sm', {type: 'button', title: 'Discard your profile changes', onclick: cancelEdit}, 'Cancel'),
        h('button.btn.btn-primary.btn-sm', {type: 'button', title: 'Publish your profile changes', onclick: saveEdit}, 'Save')
      ))

      // Banner: click to open crop modal, then upload 1600×534 JPEG
      bannerEl.classList.add('profile-banner--editable')
      var bannerOverlay = h('div.profile-banner-edit-overlay',
        h('span.material-symbols-outlined', 'add_a_photo'), ' Change banner')
      bannerEl.appendChild(bannerOverlay)
      bannerEl.onclick = function () {
        var bannerInput = hyperfile.asDataURL(function (data) {
          document.body.removeChild(bannerInput)
          showBannerCropper(data, function (croppedData) {
            bannerEl.style.backgroundImage = 'url(' + croppedData + ')'
            uploadBlob(croppedData, function (err, file) {
            if (!err) pendingBanner = Object.assign({}, file, { width: 1600, height: 534, name: 'banner.jpg' })
          })
          })
        })
        bannerInput.style.display = 'none'
        document.body.appendChild(bannerInput)
        bannerInput.click()
      }

      // Avatar: click to crop then upload (exports 400×400 JPEG for retina clarity)
      avatarWrap.classList.add('profile-avatar--editable')
      avatarWrap.title = 'Click to change photo'
      avatarWrap.onclick = function () {
        var fileInput = hyperfile.asDataURL(function (data) {
          document.body.removeChild(fileInput)
          var cropCanvas
          var cropModal = h('div.profile-crop-modal',
            h('div.profile-crop-title',
              h('span.material-symbols-outlined', {style: {fontSize: '18px'}}, 'face'),
              ' Profile photo'
            )
          )
          var btnRow = h('div.profile-crop-buttons',
            h('button.btn', {type: 'button', title: 'Cancel and keep your current picture', onclick: function () { getLightbox().close() }}, 'Cancel'),
            h('button.btn.btn-primary', {type: 'button', title: 'Set this image as your profile picture', onclick: function () {
              if (!cropCanvas || !cropCanvas.selection) return
              // Draw selection onto a 512×512 canvas (spec-recommended size) and export as JPEG 85%
              var out = document.createElement('canvas')
              out.width = 512
              out.height = 512
              out.getContext('2d').drawImage(cropCanvas.selection, 0, 0, 512, 512)
              var cropped = out.toDataURL('image/jpeg', 0.85)
              avatarImg.src = cropped
              uploadBlob(cropped, function (err, file) {
                if (!err) pendingAvatar = Object.assign({}, file, { width: 512, height: 512, name: 'avatar.jpg' })
              })
              getLightbox().close()
            }}, 'Use this photo')
          )
          var cropWrap = h('div.profile-crop-canvas-wrap')
          var img = new Image()
          img.onload = function () {
            cropCanvas = hypercrop(img)
            cropWrap.appendChild(cropCanvas)
            cropModal.appendChild(cropWrap)
            cropModal.appendChild(h('p.profile-crop-hint', 'Drag to reposition · scroll to zoom'))
            cropModal.appendChild(btnRow)
          }
          img.src = data
          getLightbox().show(cropModal)
        })
        fileInput.style.display = 'none'
        document.body.appendChild(fileInput)
        fileInput.click()
      }

      nameEl.style.display = 'none'
      bioEl.style.display  = 'none'
      if (editBtn) editBtn.style.display = 'none'
      if (improveBtn) improveBtn.style.display = 'none'
      editFormEl.style.display = ''
      nameInput.focus()
      nameInput.select()
    }

    function cancelEdit () {
      editing = false
      editFormEl.style.display = 'none'
      nameEl.style.display = ''
      bioEl.style.display  = ''
      if (editBtn) editBtn.style.display = ''
      if (improveBtn) improveBtn.style.display = ''

      bannerEl.classList.remove('profile-banner--editable')
      bannerEl.onclick = null
      var ov = bannerEl.querySelector('.profile-banner-edit-overlay')
      if (ov) bannerEl.removeChild(ov)
      if (!pendingBanner && headerImageLink)
        bannerEl.style.backgroundImage = 'url(' + api.blob_url(headerImageLink) + ')'
      else if (!pendingBanner && !headerImageLink)
        bannerEl.style.backgroundImage = ''

      avatarWrap.classList.remove('profile-avatar--editable')
      avatarWrap.onclick = null
      avatarWrap.title   = ''
      pendingBanner = null
      pendingAvatar = null
    }

    function saveEdit () {
      var newName = (nameInput && nameInput.value.trim()) || ''
      var newBio  = (bioInput  && bioInput.value.trim())  || ''
      var msg     = {type: 'about', about: id}
      var changed = false

      if (newName)               { msg.name        = newName;        changed = true }
      if (newBio !== description) { msg.description = newBio;         changed = true }
      if (pendingAvatar)          { msg.image       = pendingAvatar;  changed = true }
      if (pendingBanner)          { msg.headerImage = pendingBanner;  changed = true }

      if (!changed) { cancelEdit(); return }

      api.message_confirm(msg, function (err, published) {
        if (err) { alert(err.message); return }
        if (published) {
          if (newName) nameSpan.textContent = newName
          if (newBio !== description) { description = newBio; bioEl.textContent = newBio }
          if (pendingBanner) headerImageLink = pendingBanner.link
          if (pendingAvatar) avatarImg.src = api.blob_url(pendingAvatar.link)
          renderProfileQuality()
        }
        cancelEdit()
      })
    }

    // ── Async data loads ───────────────────────────────────────────
    pull(
      api.sbot_links({dest: id, rel: 'about', values: true}),
      pull.drain(function (link) {
        var c         = link.value && link.value.content
        if (!c) return
        var bySubject = link.value.author === id
        var bySelf    = link.value.author === self_id

        if (typeof c.description === 'string' && bySubject && !editing) {
          description = c.description
          bioEl.textContent = c.description
          renderProfileQuality()
        }

        if (c.headerImage && (bySubject || bySelf) && !pendingBanner) {
          var lnk = typeof c.headerImage === 'string'
            ? c.headerImage : (c.headerImage && c.headerImage.link)
          if (lnk) {
            headerImageLink = lnk
            bannerEl.style.backgroundImage = 'url(' + api.blob_url(lnk) + ')'
            renderProfileQuality()
          }
        }

        if (!isSelf && bySelf && c.name) {
          petnameFound = true
          petnameName  = c.name
          if (!petnameEditing()) renderPetnameCollapsed()
        }
      }, function () {
        // Stream ended — render the collapsed trigger (Add / Edit nickname),
        // unless the viewer is mid-edit.
        if (!isSelf && !petnameEditing()) renderPetnameCollapsed()
        renderProfileQuality()
      })
    )

    if (isSsbproSkin() && !isSelf) {
      api.follower_of(self_id, id, function (err, youFollow) {
        if (err) return
        api.follower_of(id, self_id, function (err2, followsYou) {
          if (err2) return
          renderRelation(!!youFollow, !!followsYou)
        })
      })
    }

    pull(api.follows(id), pull.unique(), pull.collect(function (err, ary) {
      followingData = ary || []
      followingCountEl.textContent = String(followingData.length)
    }))

    pull(api.followers(id), pull.unique(), pull.collect(function (err, ary) {
      followersData = ary || []
      followersCountEl.textContent = String(followersData.length)
    }))

    // Post count and ssbpro activity summary — all derived from classic posts.
    var postCount = 0
    var activitySummary = {intro: '', channels: [], mediaCount: 0}
    var channelCounts = {}
    pull(
      api.sbot_user_feed({id: id, reverse: true, limit: 500}),
      pull.drain(function (msg) {
        var content = msg && msg.value && msg.value.content
        if (content && typeof content === 'object' && content.type === 'post') {
          postCount++
          if (isSsbproSkin()) {
            if (content.channel) channelCounts[content.channel] = (channelCounts[content.channel] || 0) + 1
            if (!activitySummary.intro && content.channel === 'intro')
              activitySummary.intro = content.text || ''
            if (Array.isArray(content.mentions)) {
              for (var i = 0; i < content.mentions.length; i++) {
                if (content.mentions[i] && /^&/.test(content.mentions[i].link || '')) {
                  activitySummary.mediaCount++
                  break
                }
              }
            }
          }
        }
      }, function () {
        postCountEl.textContent = postCount >= 500 ? '500+' : String(postCount)
        if (isSsbproSkin()) {
          activitySummary.channels = Object.keys(channelCounts).sort(function (a, b) {
            return channelCounts[b] - channelCounts[a]
          })
          renderActivity(activitySummary)
        }
      })
    )

    // ── Assemble card ──────────────────────────────────────────────
    return h('div.profile-card',
      bannerEl,
      h('div.profile-body',
        h('div.profile-body-top', avatarWrap, actionsEl),
        nameEl,
        handleEl,
        bioEl,
        relationEl,
        profileQualityEl,
        editFormEl,
        isSelf ? null : petnameEl,
        statsEl,
        listExpandEl,
        activityEl
      )
    )
  }
}
