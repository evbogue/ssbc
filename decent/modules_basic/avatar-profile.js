'use strict'
var h             = require('hyperscript')
var pull          = require('pull-stream')
var dataurl       = require('dataurl-')
var hyperfile     = require('hyperfile')
var hypercrop     = require('hypercrop')
var hyperlightbox = require('hyperlightbox')
var self_id       = require('../keys').id

exports.needs = {
  avatar_image:      'first',
  avatar_image_link: 'first',
  avatar_name:       'first',
  avatar_action:     'map',
  follows:           'first',
  followers:         'first',
  sbot_links:        'first',
  message_confirm:   'first',
  blob_url:          'first',
  blobs_url:         'first'
}

exports.gives = 'avatar_profile'

exports.create = function (api) {

  // ── Blob upload helper ──────────────────────────────────────────────
  function uploadBlob (dataURL, cb) {
    var parsed = dataurl.parse(dataURL)
    var xhr    = new XMLHttpRequest()
    var base   = api.blobs_url()
    var url    = base.replace(/\/blobs\/get\/?$/, '/blobs/add')
    if (url === base) url = '/blobs/add'
    xhr.open('POST', url, true)
    xhr.responseType = 'text'
    xhr.onload = function () {
      if (xhr.status < 200 || xhr.status >= 300)
        return cb(new Error('Upload failed: ' + xhr.status))
      cb(null, { link: xhr.responseText.trim(), size: parsed.data.length, type: parsed.mimetype })
    }
    xhr.onerror = function () { cb(new Error('Network error')) }
    xhr.send(parsed.data)
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

    // ── Banner ──────────────────────────────────────────────────────
    var bannerEl = h('div.profile-banner')

    // ── Avatar ──────────────────────────────────────────────────────
    var avatarImg  = api.avatar_image(id, 'profile')
    var avatarWrap = h('div.profile-avatar-wrap', avatarImg)

    // ── Name / handle / bio ────────────────────────────────────────
    var nameSpan = api.avatar_name(id)
    var nameEl   = h('div.profile-name', nameSpan)
    var handleEl = h('div.profile-handle',
      id.slice(0, 14) + '…' + id.slice(-6))
    var bioEl    = h('div.profile-bio')

    // ── Stats + expandable lists ───────────────────────────────────
    var followingCountEl = h('strong', '—')
    var followersCountEl = h('strong', '—')
    var listExpandEl     = h('div.profile-list-expand', {style: {display: 'none'}})

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
        type === 'following' ? 'Following' : 'Followers'))
      var grid = h('div.profile-list-grid')
      data.forEach(function (fid) {
        grid.appendChild(api.avatar_image_link(fid, 'thumbnail'))
      })
      listExpandEl.appendChild(grid)
      listExpandEl.style.display = ''
    }

    var statsEl = h('div.profile-stats',
      h('span.profile-stat', {onclick: function () { toggleList('following') }},
        followingCountEl, ' Following'),
      h('span.profile-stat', {onclick: function () { toggleList('followers') }},
        followersCountEl, ' Followers')
    )

    // ── Petname (others' profiles) ─────────────────────────────────
    var petnameEl = h('div.profile-petname', {style: {display: 'none'}})

    function renderPetname (name) {
      petnameEl.innerHTML = ''
      if (!name || isSelf) { petnameEl.style.display = 'none'; return }

      var displayVal = h('strong.petname-value', name)
      var pInput = h('input.petname-input', {type: 'text', value: name, placeholder: 'Your name for them'})

      pInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && pInput.value.trim()) {
          api.message_confirm({type: 'about', about: id, name: pInput.value.trim()},
            function (err, msg) {
              if (err || !msg) return
              renderPetname(pInput.value.trim())
              petnameEl.classList.remove('petname--editing')
            })
        }
        if (e.key === 'Escape') petnameEl.classList.remove('petname--editing')
      })

      petnameEl.appendChild(h('span.petname-label', 'You call them: '))
      petnameEl.appendChild(displayVal)
      petnameEl.appendChild(
        h('button.petname-edit-btn', {type: 'button', onclick: function () {
          petnameEl.classList.toggle('petname--editing')
          if (petnameEl.classList.contains('petname--editing')) { pInput.focus(); pInput.select() }
        }}, h('span.material-symbols-outlined', {style: {fontSize: '14px'}}, 'edit'))
      )
      petnameEl.appendChild(pInput)
      petnameEl.style.display = ''
    }

    // ── Actions area (top-right of card body) ──────────────────────
    var actionsEl = h('div.profile-card-actions')
    var editBtn

    if (isSelf) {
      editBtn = h('button.btn.profile-edit-btn', {type: 'button', onclick: enterEdit},
        'Edit profile')
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
        h('button.btn.btn-sm', {type: 'button', onclick: cancelEdit}, 'Cancel'),
        h('button.btn.btn-primary.btn-sm', {type: 'button', onclick: saveEdit}, 'Save')
      ))

      // Banner: click to upload (no crop — CSS object-fit handles display)
      bannerEl.classList.add('profile-banner--editable')
      var bannerOverlay = h('div.profile-banner-edit-overlay',
        h('span.material-symbols-outlined', 'add_a_photo'), ' Change banner')
      bannerEl.appendChild(bannerOverlay)
      bannerEl.onclick = function () {
        hyperfile.asDataURL(function (data) {
          bannerEl.style.backgroundImage = 'url(' + data + ')'
          uploadBlob(data, function (err, file) { if (!err) pendingBanner = file })
        })
      }

      // Avatar: click to crop then upload
      avatarWrap.classList.add('profile-avatar--editable')
      avatarWrap.title = 'Click to change photo'
      avatarWrap.onclick = function () {
        hyperfile.asDataURL(function (data) {
          var canvas
          var cropModal = h('div.profile-crop-modal')
          var btnRow = h('div.profile-crop-buttons',
            h('button.btn.btn-primary', {type: 'button', onclick: function () {
              if (!canvas || !canvas.selection) return
              var cropped = canvas.selection.toDataURL()
              avatarImg.src = cropped
              uploadBlob(cropped, function (err, file) { if (!err) pendingAvatar = file })
              getLightbox().close()
            }}, 'Use this photo'),
            h('button.btn', {type: 'button', onclick: function () { getLightbox().close() }}, 'Cancel')
          )
          var img = new Image()
          img.onload = function () {
            canvas = hypercrop(img)
            cropModal.appendChild(canvas)
            cropModal.appendChild(btnRow)
          }
          img.src = data
          getLightbox().show(cropModal)
        })
      }

      nameEl.style.display = 'none'
      bioEl.style.display  = 'none'
      if (editBtn) editBtn.style.display = 'none'
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
        }

        if (c.headerImage && (bySubject || bySelf) && !pendingBanner) {
          var lnk = typeof c.headerImage === 'string'
            ? c.headerImage : (c.headerImage && c.headerImage.link)
          if (lnk) {
            headerImageLink = lnk
            bannerEl.style.backgroundImage = 'url(' + api.blob_url(lnk) + ')'
          }
        }

        if (!isSelf && bySelf && c.name) renderPetname(c.name)
      })
    )

    pull(api.follows(id), pull.unique(), pull.collect(function (err, ary) {
      followingData = ary || []
      followingCountEl.textContent = String(followingData.length)
    }))

    pull(api.followers(id), pull.unique(), pull.collect(function (err, ary) {
      followersData = ary || []
      followersCountEl.textContent = String(followersData.length)
    }))

    // ── Assemble card ──────────────────────────────────────────────
    return h('div.profile-card',
      bannerEl,
      h('div.profile-body',
        h('div.profile-body-top', avatarWrap, actionsEl),
        nameEl,
        handleEl,
        bioEl,
        editFormEl,
        isSelf ? null : petnameEl,
        statsEl,
        listExpandEl
      )
    )
  }
}
