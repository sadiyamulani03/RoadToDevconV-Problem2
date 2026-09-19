# Road to Devcon V — Problem 2

## Take Your Records With You

A bird sighting should not belong to the app that created it. This project turns each Deccan Birders sighting into a portable, self-describing record, stores it on Swarm, and proves that an Independent Reader — without the original Writer — can retrieve and understand it.

## The Problem

Deccan Birders need sighting records that survive app shutdowns, export-format rot, and takedowns: records must be content-addressed on Swarm and readable by software that never shipped with the original app.

## The Core Idea

Exporting data is not the same as owning a portable record.

```text
Traditional:  App → Export → Another app must understand the export
Portable:     Writer → Self-describing record → Swarm → Independent Reader
```

Each record carries its own `format`, `version`, and data:

```json
{"format":"deccan-birders-sighting","version":1,"species":"Indian Roller","count":1,"location":"Pashan Lake, Pune","observedAt":"1998-05-14T00:00:00.000Z","observer":"Deccan Birders","notes":"First recorded sighting in the collection."}
```

## Demo

Hosted static demo (GitHub Pages — enable Pages on `main`, root): open `index.html`, or directly:

- Writer: `writer/index.html` — sign in → Capability check → create → Upload Record → `Open in Independent Reader →`
- Reader: `reader/index.html` — paste a reference or open `reader/index.html?ref=<64-hex-reference>`

No build step. ES modules work from any static host; the app calls only `https://api.gateway.ethswarm.org/` (CORS `*`).

Judge flow in 30 seconds:

```text
Swarm ID
   ↓
Capability check
   ↓
Writer
   ↓
Self-describing record
   ↓
Subsidised Swarm Gateway
   ↓
Swarm
   ↓
Independent Reader
```

## How It Works

1. Sign in with Swarm ID. The app attempts the real `@snaha/swarm-id` client first; if unavailable it falls back to a clearly labeled demo session. No credentials are stored either way — and sign-in alone never enables uploads.
2. Press **Check upload capability**. `checkUploadCapability()` probes the subsidised gateway.
3. Create a sighting and press **Upload Record**: progress runs Preparing portable record → Checking upload capability → Uploading to Swarm → Record stored. The single audited entry point `uploadSightingRecord()` re-verifies `uploadCapability.available` first.
4. Success shows format, version, Swarm reference, stored status, and **Open in Independent Reader →** (deep link `reader/?ref=`).
5. The reader fetches from Swarm, validates the portable format, renders the sighting plus a Portable Record proof card — with zero Writer code.

## Portable Record

`shared/format.js` is the only shared module (no network, storage, or rendering code). The uploaded bytes themselves contain `"format":"deccan-birders-sighting"` and `"version":1` — verify in the bytes preview before upload.

## Independent Reader

Own entrypoints (`reader/index.html`, `reader/cli.js`), own gateway constant, own obtain → download → parse → validate → render flow. Imports only `../shared/format.js`. Never imports Writer parsing, storage, rendering, components, or entrypoints.

## Endpoint Consistency

```text
Writer: POST /bytes
Reader: GET  /bytes/<reference>
```

No `/bzz` mixing. The reference returned by the upload is directly usable by the reader (verified live).

## Subsidised Gateway

`writer/config.js`: `subsidisedGatewayUrl: 'https://api.gateway.ethswarm.org/'`, used directly as `` `${swarmConfig.subsidisedGatewayUrl}bytes` ``. No personal stamp/batch header is sent, so a fresh Swarm ID user with no stamp can upload. The gateway request carries `Content-Type` only — no extra upload arguments.

## Failure Handling

`UploadError.reason`: `upload-capability-unavailable`, `gateway-unavailable`, `auth-connection-problem`, `validation-failed`, `network-failure`, `upload-rejected`, `malformed-response`, `unknown-error`. Browser failures render `[reason] … Action: …` into `#upload-error` (DOM, not console-only); CLI prints `[reason]` plus `Action:` lines.

## Security

No private keys, mnemonics, gift codes, credential-bearing URLs, API keys, authenticated URLs, seed phrases, or wallet secrets are tracked. Secrets would come from environment/ignored files only. `.env.example` holds placeholders.

## Verification

```bash
npm test          # offline unit tests (node --test)
npm run audit     # 8 challenge checks + deep-link/flow info checks
npm run verify:live  # real POST /bytes → GET → validate (skips offline)
```

| Check | Requirement               | Evidence                       | Status    |
| ----- | ------------------------- | ------------------------------ | --------- |
| 1     | Capability before upload  | writer/upload.js:uploadSightingRecord + writer/capability.js:checkUploadCapability | PASS |
| 2     | No-stamp gateway          | writer/config.js:swarmConfig.subsidisedGatewayUrl='https://api.gateway.ethswarm.org/' used by writer/upload.js | PASS |
| 3     | Format + version in bytes | shared/format.js:buildSightingRecord → {"format":"deccan-birders-sighting","version":1,…} | PASS |
| 4     | Independent reader        | reader/cli.js + reader/index.html:reader/app.js (imports only ../shared/format.js) | PASS |
| 5     | Matching endpoint family  | writer POST <gateway>bytes + reader GET <gateway>bytes/<ref> (no /bzz mixing) | PASS |
| 6     | No pin/tag gateway        | writer/upload.js gateway fetch (Content-Type only; no extra upload arguments) | PASS |
| 7     | Specific failure reason   | writer/upload.js:UploadError(reason) → #upload-error (DOM) + CLI [reason] | PASS |
| 8     | No tracked credentials    | .env.example placeholders only; scanned files clean | PASS |

Swarm ID status: partial integration — real `@snaha/swarm-id@0.4.1` attempted for sign-in only (confirmed API: `SwarmIdClient`, `initialize`, `connect`, `connectionInfo`, `destroy`); uploads stay on the audited `/bytes` path because the client's upload endpoint family is unverified for the checks. Demo fallback is explicit, never disguised.

## Run Locally

```bash
npm test && npm run audit
npx serve .  # then open /writer/index.html and /reader/index.html
node writer/cli.js check
node reader/cli.js <64-hex-reference>
```
