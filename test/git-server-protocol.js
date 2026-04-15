'use strict'

const test = require('tape')

const gitServer = require('../plugins/git-server')

const {
  buildRefAdvert,
  buildReceivePackResult,
  parsePktLines,
  sidebandPkts
} = gitServer._test

test('receive-pack advertisement includes modern status capabilities', function (t) {
  const advert = Buffer.concat(buildRefAdvert('git-receive-pack', [], []))
  const serviceLen = parseInt(advert.slice(0, 4).toString('ascii'), 16)
  const afterService = advert.slice(serviceLen + 4)
  const { lines } = parsePktLines(afterService)

  t.ok(lines[0].includes('report-status'), 'advertises report-status')
  t.ok(lines[0].includes('report-status-v2'), 'advertises report-status-v2')
  t.ok(lines[0].includes('side-band-64k'), 'advertises side-band-64k')
  t.end()
})

test('receive-pack result is sideband-wrapped when negotiated', function (t) {
  const result = Buffer.concat(buildReceivePackResult(['refs/heads/main'], null, true))
  const outerLen = parseInt(result.slice(0, 4).toString('ascii'), 16)
  const outerPayload = result.slice(4, outerLen)

  t.ok(outerLen > 4, 'starts with a pkt-line')
  t.equal(outerPayload[0], 0x01, 'uses sideband channel 1 for status data')
  t.equal(result.slice(-4).toString('ascii'), '0000', 'ends with an outer flush packet')

  const { lines, rest } = parsePktLines(outerPayload.slice(1))
  t.deepEqual(lines, ['unpack ok', 'ok refs/heads/main'], 'encodes unpack and ref status lines')
  t.equal(rest.length, 0, 'inner sideband payload ends with a flush packet')
  t.end()
})

test('side-band packets are split to git-safe pkt-line sizes', function (t) {
  const packets = sidebandPkts(0x01, Buffer.alloc(70000, 0x61))

  t.equal(packets.length, 2, 'large payload is split into multiple packets')
  t.equal(parseInt(packets[0].slice(0, 4).toString('ascii'), 16), 65520, 'first packet uses the maximum safe line length')
  t.equal(parseInt(packets[1].slice(0, 4).toString('ascii'), 16), 4490, 'remainder is emitted in a final packet')
  t.equal(packets[0][4], 0x01, 'first packet preserves the sideband channel')
  t.equal(packets[1][4], 0x01, 'second packet preserves the sideband channel')
  t.end()
})
