// Independent reader browser logic — module for reader/index.html.
//
// Standalone by design:
// - No import from the authoring side (no parsing, storage, rendering, or components from there).
// - Only shared dependency is ../shared/format.js (standalone schema).
// - Own gateway constant for the same raw bytes family used when storing.
// - Performs all five reader steps independently:
//   1. obtain a Swarm reference (user input or ?ref= deep link)
//   2. download the stored content (GET <gateway>bytes/<ref>)
//   3. parse the portable record
//   4. validate format/version
//   5. render the record into the DOM.

import { parseSightingRecord, validateSightingRecord } from '../shared/format.js'

// Reader-owned gateway endpoint. Same host and same /bytes family as storing,
// defined here independently so the reader runs without authoring-side code.
const READER_GATEWAY_URL = 'https://api.gateway.ethswarm.org/'

const form = document.getElementById('reader-form')
const refInput = document.getElementById('ref-input')
const loadBtn = document.getElementById('load-btn')
const errorBox = document.getElementById('reader-error')
const resultBox = document.getElementById('reader-result')
const steps = document.getElementById('reader-steps')

function isHexReference(value) {
  return typeof value === 'string' && /^[0-9a-fA-F]{64}$/.test(value.trim())
}

export function referenceFromUrl(search = window.location.search) {
  const ref = new URLSearchParams(search).get('ref') ?? ''
  return ref.trim()
}

function setStep(name) {
  if (!steps) return
  steps.hidden = false
  const order = { fetch: 0, validate: 1, render: 2 }
  for (const li of steps.querySelectorAll('li')) {
    li.classList.toggle('done', (order[li.dataset.step] ?? 99) < (order[name] ?? 99))
    li.classList.toggle('active', li.dataset.step === name)
  }
}

function resetSteps() {
  if (!steps) return
  steps.hidden = true
  for (const li of steps.querySelectorAll('li')) li.classList.remove('done', 'active')
}

function showReaderError(code, message, action) {
  errorBox.hidden = false
  resultBox.hidden = true
  errorBox.textContent = `[${code}] ${message}${action ? ` Action: ${action}` : ''}`
}

function renderRecord(record, reference) {
  errorBox.hidden = true
  resultBox.hidden = false
  resultBox.innerHTML = ''
  const title = document.createElement('h2')
  title.className = 'specimen'
  title.textContent = record.species
  const sub = document.createElement('p')
  sub.className = 'muted'
  sub.textContent = `×${record.count} · ${record.location} · ${String(record.observedAt).slice(0, 10)}`
  const meta = document.createElement('p')
  meta.textContent = `Observer: ${record.observer} — Observed: ${record.observedAt}`
  const notes = document.createElement('p')
  notes.textContent = record.notes ? `Notes: ${record.notes}` : 'No notes.'
  const proof = document.createElement('div')
  proof.className = 'proof'
  proof.innerHTML = ''
  const proofTitle = document.createElement('h3')
  proofTitle.textContent = 'Portable Record'
  const grid = document.createElement('dl')
  const rows = [
    ['Format', record.format],
    ['Version', String(record.version)],
    ['Storage', 'Swarm'],
    ['Reader dependency', 'None on Writer'],
  ]
  for (const [k, v] of rows) {
    const dt = document.createElement('dt')
    dt.textContent = k
    const dd = document.createElement('dd')
    dd.textContent = v
    grid.append(dt, dd)
  }
  const why = document.createElement('p')
  why.className = 'muted'
  why.textContent = 'This record carries its own format identifier and version, so software that never shipped with the original Writer can understand it.'
  proof.append(proofTitle, grid, why)
  const ref = document.createElement('p')
  ref.className = 'refline'
  ref.textContent = `reference=${reference}`
  const link = document.createElement('a')
  link.href = `${READER_GATEWAY_URL}bytes/${reference}`
  link.textContent = 'Open raw bytes'
  link.target = '_blank'
  link.rel = 'noopener'
  const details = document.createElement('details')
  const summary = document.createElement('summary')
  summary.textContent = 'Technical evidence'
  const tech = document.createElement('pre')
  tech.textContent = `Storage: Swarm\nEndpoint family: /bytes\nFormat: ${record.format}\nVersion: ${record.version}\nReference: ${reference}`
  details.append(summary, tech)
  resultBox.append(title, sub, meta, notes, proof, ref, link, details)
}

async function loadReference(reference) {
  errorBox.hidden = true
  resultBox.hidden = true
  resetSteps()

  // 1. obtain a Swarm reference
  const ref = reference.trim()
  if (!isHexReference(ref)) {
    showReaderError(
      'reader-validation-failed',
      'Reference must be a 64-hex Swarm reference.',
      'Paste the reference shown by the uploader after upload, or open this page with ?ref=<reference>.',
    )
    return
  }

  loadBtn.disabled = true
  loadBtn.textContent = 'Loading…'
  try {
    // 2. download the stored content through the matching endpoint family
    setStep('fetch')
    const downloadUrl = `${READER_GATEWAY_URL}bytes/${ref}`
    let res
    try {
      res = await fetch(downloadUrl, { method: 'GET' })
    } catch (err) {
      showReaderError('reader-network-failure', `Cannot reach Swarm gateway: ${err.message}.`, 'Check network and retry.')
      return
    }
    if (!res.ok) {
      showReaderError(
        'reader-download-rejected',
        `Gateway answered HTTP ${res.status} for this reference.`,
        'Verify the reference came from a /bytes upload and retry.',
      )
      return
    }
    let text
    try {
      text = await res.text()
    } catch (err) {
      showReaderError('reader-malformed-response', `Cannot read gateway body: ${err.message}.`, 'Retry.')
      return
    }

    // 3. parse the portable record
    let parsed
    try {
      parsed = parseSightingRecord(text)
    } catch (err) {
      showReaderError('reader-validation-failed', `Stored content is not a valid record: ${err.message}.`, 'This reference does not hold a Deccan Birders sighting.')
      return
    }

    // 4. validate format/version
    setStep('validate')
    try {
      validateSightingRecord(parsed)
    } catch (err) {
      showReaderError('reader-validation-failed', err.message, 'Only format deccan-birders-sighting version 1 is supported.')
      return
    }

    // 5. render the record
    setStep('render')
    renderRecord(parsed, ref)
    // Keep the deep link in sync without reloading.
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('ref', ref)
      window.history.replaceState(null, '', url)
    } catch {
      // Non-fatal cosmetic step.
    }
  } finally {
    loadBtn.disabled = false
    loadBtn.textContent = 'Download & render'
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault()
  loadReference(refInput.value)
})

// Deep link: reader/?ref=<swarm-reference> loads immediately.
const deepLinked = referenceFromUrl()
if (isHexReference(deepLinked)) {
  refInput.value = deepLinked
  loadReference(deepLinked)
}
