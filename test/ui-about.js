'use strict'

const test = require('tape')
const about = require('../decent/src/modules/ui/about')

test('about activity preserves photo and banner thumbnail classes', (t) => {
  const api = about.create({ blob_url: (link) => '/blobs/get/' + link })
  for (const name of [undefined, 'Ada']) {
    const content = api.message_content_mini({
      value: {
        author: '@author.ed25519',
        content: {
          type: 'about',
          about: '@author.ed25519',
          name,
          image: { link: '&photo.sha256' },
          headerImage: '&banner.sha256'
        }
      }
    })
    const images = content.filter((node) => node && node.nodeName === 'a')
      .map((node) => node.childNodes[0]).filter((node) => node.nodeName === 'img')
    t.equal(images.length, 2, 'renders both thumbnails with or without a name change')
    t.equal(images[0].className, 'avatar--thumbnail about-mini__photo', 'photo receives its compact styling class')
    t.equal(images[1].className, 'about-mini__banner', 'banner retains its own sizing class')
    t.equal(images[0].src, '/blobs/get/&photo.sha256', 'object blob links resolve')
    t.equal(images[1].src, '/blobs/get/&banner.sha256', 'string blob links resolve')
  }
  t.end()
})
