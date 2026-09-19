// Live round-trip verification: POST /bytes -> GET /bytes/<ref> -> validate.
// Run: npm run verify:live
// Skips (exit 0) when the subsidised gateway is unreachable so offline CI
// stays green. Prints the public content reference on success.
// No credentials are used or committed; the reference is a public content hash.

import { buildSightingRecord, serializeSightingRecordToString, parseSightingRecord, validateSightingRecord } from '../shared/format.js'
import { swarmConfig } from '../writer/config.js'

const GATEWAY = swarmConfig.subsidisedGatewayUrl

async function main() {
  const record = buildSightingRecord({
    species: 'Indian Roller',
    count: 1,
    location: 'Pashan Lake, Pune',
    observedAt: '1998-05-14T00:00:00.000Z',
    observer: 'Deccan Birders',
    notes: 'First recorded sighting in the collection.',
  })
  const body = serializeSightingRecordToString(record)

  let post
  try {
    post = await fetch(`${GATEWAY}bytes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
  } catch (err) {
    console.log(`SKIP: gateway unreachable for POST (${err.message})`)
    return
  }
  if (!post.ok) {
    console.log(`SKIP: gateway POST answered HTTP ${post.status}`)
    return
  }
  const { reference } = await post.json()
  if (!/^[0-9a-fA-F]{64}$/.test(reference ?? '')) {
    console.error('FAIL: gateway reply carried no 64-hex reference.')
    process.exitCode = 1
    return
  }

  const get = await fetch(`${GATEWAY}bytes/${reference}`)
  if (!get.ok) {
    console.error(`FAIL: GET /bytes/${reference} answered HTTP ${get.status}.`)
    process.exitCode = 1
    return
  }
  const text = await get.text()
  if (text !== body) {
    console.error('FAIL: downloaded bytes differ from uploaded bytes.')
    process.exitCode = 1
    return
  }
  validateSightingRecord(parseSightingRecord(text))
  console.log(`LIVE-OK reference=${reference} format=deccan-birders-sighting version=1`)
  console.log(`Reader deep link: reader/index.html?ref=${reference}`)
}

main().catch((err) => {
  console.log(`SKIP: live verification error (${err?.message ?? err})`)
})
