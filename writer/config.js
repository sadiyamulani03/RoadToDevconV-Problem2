// Writer client configuration.
//
// Fresh Swarm ID users have no stamp/batch of their own, so the writer MUST
// offer the subsidised gateway route. This object is imported and used by the
// upload path (see writer/upload.js and writer/writer.js).

export const swarmConfig = {
  subsidisedGatewayUrl: 'https://api.gateway.ethswarm.org/',
}

// Swarm ID sign-in (browser). These values are public endpoints/names only —
// no credentials live here. See writer/swarm-auth.js: the app attempts the
// real @snaha/swarm-id client first and falls back to a clearly labeled demo
// session when the library or popup flow is unavailable.
export const swarmIdConfig = {
  iframeOrigin: 'https://swarm-id.snaha.net',
  // ESM bundle specifier for dynamic import in the browser. Pinned for
  // reproducibility; only the sign-in path uses it, never the upload path.
  clientSpecifier: 'https://esm.sh/@snaha/swarm-id@0.4.1',
  metadata: {
    name: 'Deccan Birders — Portable Records',
    description: 'Self-describing bird sightings stored on Swarm.',
  },
}
