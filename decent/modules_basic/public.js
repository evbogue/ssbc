var h = require('hyperscript')
var u = require('../util')
var pull = require('pull-stream')
var Scroller = require('pull-scroll')

//var plugs = require('../plugs')
//var message_render = plugs.first(exports.message_render = [])
//var message_compose = plugs.first(exports.message_compose = [])
//var sbot_log = plugs.first(exports.sbot_log = [])

exports.needs = {
  message_render: 'first',
  message_compose: 'first',
  sbot_query: 'first',
}

exports.gives = {
  builtin_tabs: true, screen_view: true
}

exports.create = function (api) {

  function publicFilter (opts) {
    opts = opts || {}
    var filter = {
      $filter: {
        rts: {}
      }
    }
    if(opts.lt != null) filter.$filter.rts.$lt = opts.lt
    if(opts.gt != null) filter.$filter.rts.$gt = opts.gt
    if(!filter.$filter.rts.$lt && !filter.$filter.rts.$gt)
      filter.$filter.rts.$gt = 0
    return filter
  }

  function publicQuery (opts) {
    opts = opts || {}
    return api.sbot_query({
      query: [publicFilter(opts)],
      reverse: opts.reverse,
      limit: opts.limit,
      live: opts.live,
      old: opts.old
    })
  }

  return {
    builtin_tabs: function () {
      return ['/public']
    },

    screen_view: function (path, sbot) {
      if(path === '/public') {

        var content = h('div.column.scroller__content')
        var div = h('div.column.scroller',
          {style: {'overflow':'auto'}},
          h('div.scroller__wrapper',
            api.message_compose({type: 'post'}, {placeholder: 'Write a public message'}),
            content
          )
        )
        div.title = 'Public'
        div.setAttribute('data-icon', 'key')

        pull(
          publicQuery({old: false, live: true}),
          Scroller(div, content, api.message_render, true, false)
        )

        pull(
          u.next(publicQuery, {
            reverse: true,
            limit: 100,
            live: false,
            old: true
          }, ['rts']),
          Scroller(div, content, api.message_render, false, false)
        )

        return div
      }
    }
  }
}
