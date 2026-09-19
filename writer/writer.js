// Browser writer logic — entrypoint module for writer/index.html.
//
// Imports ONLY: ./config.js, ./capability.js, ./upload.js, ./swarm-auth.js,
// ../shared/format.js. It never imports reader code. The reader never imports
// this file.
//
// UI contract for Check 7: every upload failure renders a distinguishable,
// actionable reason into #upload-error (user-visible DOM), never only console.

import { swarmConfig } from './config.js'
import { checkUploadCapability, uploadCapability } from './capability.js'
import { uploadSightingRecord } from './upload.js'
import { swarmIdSignIn, swarmIdSignOut, demoSession } from './swarm-auth.js'

let session = { signedIn: false, mode: 'none', identityName: null }

const signinBtn = document.getElementById('signin-btn')
const signoutBtn = document.getElementById('signout-btn')
const authBadge = document.getElementById('auth-badge')
const signinStatus = document.getElementById('signin-status')
const capabilityBtn = document.getElementById('capability-btn')
const capabilityStatus = document.getElementById('capability-status')
const form = document.getElementById('sighting-form')
const uploadBtn = document.getElementById('upload-btn')
const errorBox = document.getElementById('upload-error')
const okBox = document.getElementById('upload-ok')
const preview = document.getElementById('bytes-preview')
const steps = document.getElementById('upload-steps')
const historyList = document.getElementById('history-list')

const HISTORY_KEY = 'deccan-birders-recent'

function refreshUploadAvailability() {
  // Button is enabled only when BOTH sign-in and capability are confirmed.
  // Capability alone gates the actual upload call inside uploadSightingRecord().
  uploadBtn.disabled = !(session.signedIn && uploadCapability.available)
}

function renderAuth() {
  if (!session.signedIn) {
    authBadge.textContent = 'Not signed in'
    authBadge.className = 'badge'
    signoutBtn.hidden = true
    signinBtn.disabled = false
  } else if (session.mode === 'swarm-id') {
    authBadge.textContent = `Swarm ID · ${session.identityName ?? 'signed in'}`
    authBadge.className = 'badge live'
    signoutBtn.hidden = false
    signinBtn.disabled = true
  } else {
    authBadge.textContent = 'Demo session · local browser session — no credentials stored'
    authBadge.className = 'badge demo'
    signoutBtn.hidden = false
    signinBtn.disabled = true
  }
}

function showError(reason, message, action) {
  errorBox.hidden = false
  okBox.hidden = true
  errorBox.textContent = `[${reason}] ${message}${action ? ` Action: ${action}` : ''}`
}

function setStep(name) {
  if (!steps) return
  steps.hidden = false
  for (const li of steps.querySelectorAll('li')) {
    li.classList.toggle('done', li.dataset.step === name || stepOrder(li.dataset.step) < stepOrder(name))
    li.classList.toggle('active', li.dataset.step === name)
  }
}

function stepOrder(name) {
  return { prepare: 0, capability: 1, upload: 2, stored: 3 }[name] ?? -1
}

function resetSteps() {
  if (!steps) return
  steps.hidden = true
  for (const li of steps.querySelectorAll('li')) li.classList.remove('done', 'active')
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')
  } catch {
    return []
  }
}

function saveHistory(entries) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, 10)))
  } catch {
    // Local history is optional convenience; never blocks the demo.
  }
}

function renderHistory() {
  const entries = loadHistory()
  historyList.innerHTML = ''
  if (!entries.length) {
    const li = document.createElement('li')
    li.className = 'muted'
    li.textContent = 'No uploads yet on this device.'
    historyList.append(li)
    return
  }
  for (const e of entries) {
    const li = document.createElement('li')
    const title = document.createElement('strong')
    title.textContent = `${e.species} · ${e.date ?? ''}`
    const ref = document.createElement('div')
    ref.className = 'muted'
    ref.textContent = `Swarm reference: ${e.reference}`
    const open = document.createElement('a')
    open.href = `../reader/index.html?ref=${encodeURIComponent(e.reference)}`
    open.textContent = 'Open Reader →'
    li.append(title, ref, open)
    historyList.append(li)
  }
}

function rememberRecord({ species, observedAt, reference }) {
  const entries = loadHistory()
  entries.unshift({ species, date: (observedAt ?? '').slice(0, 10), reference })
  saveHistory(entries)
  renderHistory()
}

function showOk(record, reference, serializedText) {
  errorBox.hidden = true
  okBox.hidden = false
  const url = `${swarmConfig.subsidisedGatewayUrl}bytes/${reference}`
  const readerUrl = `../reader/index.html?ref=${encodeURIComponent(reference)}`
  okBox.innerHTML = ''
  const headline = document.createElement('strong')
  headline.textContent = 'Your record now lives independently of this application.'
  const meta = document.createElement('div')
  meta.textContent = `format=${record.format} version=${record.version} status=stored`
  const refLine = document.createElement('div')
  refLine.textContent = `Swarm reference: ${reference}`
  const rawLink = document.createElement('a')
  rawLink.href = url
  rawLink.textContent = url
  rawLink.target = '_blank'
  rawLink.rel = 'noopener'
  const openReader = document.createElement('a')
  openReader.href = readerUrl
  openReader.textContent = 'Open in Independent Reader →'
  openReader.className = 'cta'
  okBox.append(headline, meta, refLine, rawLink, openReader)
  preview.textContent = serializedText
}

signinBtn.addEventListener('click', async () => {
  signinBtn.disabled = true
  signinStatus.textContent = 'Opening Swarm ID…'
  try {
    // Real Swarm ID first; demo fallback is explicit, never disguised.
    session = await swarmIdSignIn({
      onStatus: ({ identityName }) => {
        if (identityName) signinStatus.textContent = `Swarm ID: ${identityName}…`
      },
    })
    signinStatus.textContent = `Signed in with Swarm ID${session.identityName ? ` as ${session.identityName}` : ''}. Upload still requires capability confirmation.`
  } catch (err) {
    session = demoSession()
    signinStatus.textContent = `Swarm ID unavailable (${err?.message ?? err}). Continuing with a demo session — no credentials stored. Upload still requires capability confirmation.`
  } finally {
    renderAuth()
    refreshUploadAvailability()
  }
})

signoutBtn.addEventListener('click', async () => {
  await swarmIdSignOut()
  session = { signedIn: false, mode: 'none', identityName: null }
  signinStatus.textContent = 'Signed out.'
  signinBtn.disabled = false
  renderAuth()
  refreshUploadAvailability()
})

capabilityBtn.addEventListener('click', async () => {
  capabilityBtn.disabled = true
  capabilityStatus.textContent = 'Probing subsidised gateway…'
  try {
    const cap = await checkUploadCapability()
    if (cap.available) {
      capabilityStatus.textContent = `Capability available: ${cap.reason} (${cap.gatewayUrl})`
    } else {
      capabilityStatus.textContent = `Capability unavailable: ${cap.reason}`
      showError(
        'upload-capability-unavailable',
        cap.reason,
        'Verify network access to the subsidised gateway and retry.',
      )
    }
  } catch (err) {
    capabilityStatus.textContent = `Capability check failed: ${err?.message ?? err}`
    showError('gateway-unavailable', `Capability probe failed: ${err?.message ?? err}`, 'Retry in a moment.')
  } finally {
    capabilityBtn.disabled = false
    refreshUploadAvailability()
  }
})

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  errorBox.hidden = true
  okBox.hidden = true
  resetSteps()

  // CHECK 1 — visible pre-gate (the hard gate also lives inside uploadSightingRecord).
  if (!uploadCapability.available) {
    showError(
      'upload-capability-unavailable',
      `Upload capability unavailable: ${uploadCapability.reason}.`,
      'Press "Check upload capability" and wait for confirmation before uploading.',
    )
    return
  }
  if (!session.signedIn) {
    showError(
      'auth-connection-problem',
      'Not signed in.',
      'Sign in with Swarm ID first, then confirm capability.',
    )
    return
  }

  const data = new FormData(form)
  const rawDate = String(data.get('observedAt') ?? '').trim()
  const fields = {
    species: String(data.get('species') ?? ''),
    count: Number(data.get('count')),
    location: String(data.get('location') ?? ''),
    observer: String(data.get('observer') ?? ''),
    observedAt: rawDate || undefined,
    notes: String(data.get('notes') ?? ''),
  }

  uploadBtn.disabled = true
  uploadBtn.textContent = 'Uploading…'
  try {
    setStep('prepare')
    setStep('capability')
    const { reference, serializedText, record } = await uploadSightingRecord(fields, { session })
    setStep('upload')
    setStep('stored')
    showOk(record, reference, serializedText)
    rememberRecord({ species: record.species, observedAt: record.observedAt, reference })
  } catch (err) {
    const reason = err?.reason ?? 'unknown-error'
    const actions = {
      'upload-capability-unavailable': 'Run "Check upload capability" first and wait for confirmation.',
      'auth-connection-problem': 'Sign in again, then re-confirm capability.',
      'validation-failed': 'Fix the highlighted field and retry.',
      'network-failure': 'Verify network access to the subsidised gateway and retry.',
      'gateway-unavailable': 'The subsidised gateway is unreachable; retry later.',
      'upload-rejected': 'The gateway refused the bytes; retry with a smaller valid record.',
      'malformed-response': 'Gateway reply was unexpected; retry, then report if it persists.',
      'unknown-error': 'Retry; if it persists, re-run the capability check to isolate the cause.',
    }
    showError(reason, err.message, actions[reason] ?? actions['unknown-error'])
    // Console logging alone does not satisfy Check 7; DOM output above is the requirement.
    console.error(err)
  } finally {
    uploadBtn.textContent = 'Upload Record'
    refreshUploadAvailability()
  }
})

renderAuth()
renderHistory()
refreshUploadAvailability()
