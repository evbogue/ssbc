var u = require('../util')
var h = require('hyperscript')
var pull = require('pull-stream')
var mime = require('simple-mime')('application/octect-stream')
var split = require('split-buffer')

var fileInputId = 0

module.exports = {
  needs: {},
  gives: 'file_input',
  create: function (api) {

    function uploadViaHttp (file, cb) {
      var xhr = new XMLHttpRequest()
      xhr.open('POST', '/blobs/add', true)
      xhr.responseType = 'text'
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300)
          cb(null, (xhr.responseText || '').trim())
        else
          cb(new Error('blob upload failed: status ' + xhr.status))
      }
      xhr.onerror = function () {
        cb(new Error('blob upload network error'))
      }
      xhr.send(file)
    }

    return function FileInput(onAdded) {
      var id = 'file-input-' + (fileInputId++)
      var input = h('input', {
        id: id,
        type: 'file',
        style: {
          position: 'absolute',
          left: '-9999px'
        },
        onchange: function (ev) {
          var file = ev.target.files[0]
          if (!file) return

          uploadViaHttp(file, function (err, hash) {
            if (err) {
              console.error(err)
              return
            }
            onAdded({
              link: hash,
              name: file.name,
              size: file.size,
              type: file.type || mime(file.name)
            })
          })
        }
      })

      return h('span', [
        h('label.btn', {htmlFor: id}, [
          h('span.material-symbols-outlined.nav__icon', 'attach_file'),
          'Browse'
        ]),
        input
      ])
    }
  }
}
