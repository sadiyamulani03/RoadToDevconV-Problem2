// Swarm ID sign-in adapter for the browser writer.
//
// Honesty contract:
// - Tries the REAL @snaha/swarm-id client (dynamic import, pinned ESM
//   specifier from writer/config.js) with ONLY confirmed API surface:
//   new SwarmIdClient({ iframeOrigin, metadata, onConnectionChange }),
//   client.initialize(), client.connect(), client.connectionInfo, client.destroy().
// - Uploads NEVER go through the Swarm ID client here: the audited subsidised
//   gateway /bytes path (writer/upload.js) is preserved untouched, because the
//   client's upload endpoint family is unverified for the 8 checks.
// - When the library, popup, or identity is unavailable (offline, blocked
//   popup, no account), falls back to a clearly labeled DEMO session.
// - Stores no credentials. Session state is `{ mode: 'swarm-id' | 'demo',
//   signedIn, identityName, canUpload }` in memory only.
//
// Control flow note for Check 1: sign-in (either mode) NEVER enables uploads
// alone. writer/upload.js re-verifies uploadCapability.available first.

import { swarmIdConfig } from './config.js'

export const AUTH_MODES = ['swarm-id', 'demo']

let client = null
let clientAvailable = false

function toSession({ mode, signedIn, identityName = null, canUpload = null }) {
  return { mode, signedIn, identityName, canUpload }
}

export function demoSession() {
  return toSession({ mode: 'demo', signedIn: true, identityName: 'Demo observer', canUpload: null })
}

/**
 * Attempt real Swarm ID sign-in. Resolves to a signed-in session on success.
 * Rejects when the real flow cannot complete (caller falls back to demo).
 */
export async function swarmIdSignIn({ onStatus } = {}) {
  const { SwarmIdClient } = await import(swarmIdConfig.clientSpecifier)
  if (!SwarmIdClient) throw new Error('Swarm ID client export not found.')

  client = new SwarmIdClient({
    iframeOrigin: swarmIdConfig.iframeOrigin,
    metadata: swarmIdConfig.metadata,
    onConnectionChange: (info) => {
      onStatus?.({ type: 'connection-change', identityName: info?.identity?.name ?? null, canUpload: info?.canUpload ?? null })
    },
  })
  await client.initialize()
  // Must be called from a user gesture; propagates if the popup is blocked.
  await client.connect()
  const info = client.connectionInfo
  if (!info?.identity) throw new Error('Swarm ID sign-in completed without an identity.')
  clientAvailable = true
  return toSession({ mode: 'swarm-id', signedIn: true, identityName: info.identity?.name ?? 'Swarm ID user', canUpload: info?.canUpload ?? null })
}

export async function swarmIdSignOut() {
  try {
    await client?.destroy?.()
  } finally {
    client = null
    clientAvailable = false
  }
}

export function isSwarmIdActive() {
  return clientAvailable
}
