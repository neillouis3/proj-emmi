# Authoring connectors and packs

A new capability in Emmi is a **connector manifest + rule files**, not a new
screen. Everything below ships as a *pack*: a folder you install with
`emmi pack install`. No Emmi core code changes are required.

This is the contract used by the example pack in
[`examples/packs/hello`](../examples/packs/hello).

## Pack layout

```
my-pack/
  pack.yaml                 # pack metadata + what it ships
  connectors/
    <connector>.yaml        # one manifest per connector
  rules/
    <connector>/
      <rule>.mjs            # one function export per rule (use .mjs for packs)
  recipes/                  # optional starter automations (installed inactive)
    <name>.yaml
```

### `pack.yaml`

```yaml
id: hello                   # unique pack id
name: Hello Pack
description: One-line summary shown in the Connectors > Packs UI.
version: 1.0.0              # bump to publish an update
core: false                # core packs auto-install and cannot be removed
logo: chrome.svg           # optional; SVG file shipped in the pack folder
author: Your Name          # optional; shown on the Packs card
connectors: [hello]        # connector ids this pack installs
recipes: [hello-demo]      # recipe ids this pack installs
requires: []               # optional pack ids that must be installed first
```

Put the logo file next to `pack.yaml` (e.g. `chrome.svg`). Emmi serves it from the pack library — it does not embed brand SVGs in the app.

Installing a pack auto-installs any missing entries in `requires` (from the
library). You cannot remove a pack while another installed pack still lists it
in `requires`.

### `connectors/<id>.yaml`

```yaml
id: hello
name: Hello
description: What the connector does (shown in the UI).
kind: Local                # Local or Web
scope: Text in, text out   # short scope label shown on the card
popular: false             # optional metadata (unused by UI today)
naming: dotted             # dotted -> hello.greet (recommended); bare -> greet
logo: hello.svg            # optional; SVG next to the connector / in the pack folder
permission:                # optional; drives the generic permissions panel
  grant: true              # connector must be "connected" before rules run
  folderScopes: true       # show a folder-scope editor
  allowlist: true          # show a free-text allowlist editor
  hostAllowlist: true      # show an allowed-hosts editor
  flags:                   # extra on/off toggles
    - id: loud
      label: Loud mode
      help: Optional helper text under the toggle.
setup:                     # optional; hook for a setup helper card
  kind: hello-setup
rules:
  - id: greet
    file: greet.mjs         # use .mjs so Node treats pack rules as ES modules
    category: core          # core | detection | routing | logging
    params: [name]          # positional argument names, in order
```

## Naming: dotted vs bare

- `naming: dotted` (default for new connectors) registers tools as
  `hello.greet`. This avoids collisions and is recommended.
- `naming: bare` registers tools as `greet`. Emmi's built-in `fs`, `shell`,
  and `git` use bare names for backwards compatibility.

Routing to a connector is automatic: dotted tools resolve by prefix, and bare
tools resolve through the manifest, so `connectorFromTool` needs no edits.

## Rule files

Each rule is a single JavaScript file with a default function export. Rules run
**sandboxed in a worker**: they receive positional args (matching `params`),
plus a host `ctx` as the last argument when available. They cannot import Emmi
internals.

```js
// rules/hello/greet.mjs
export default function greet(name) {
  const who = String(name ?? 'world').trim() || 'world'
  return `Hello, ${who}!`
}
```

For account APIs, use host-mediated HTTP (tokens never enter the pack):

```js
// rules/spotify/me.mjs
export default async function me(...args) {
  const ctx = args.find((a) => a && typeof a.http === 'function')
  const res = await ctx.http({ method: 'GET', url: 'https://api.spotify.com/v1/me' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json
}
```

`ctx.http({ method, url, headers?, body?, json?, auth? })` attaches the
connector’s Bearer token (unless `auth: false`), enforces `hostAllowlist`, and
returns `{ ok, status, json, text }`. Optional: `ctx.auth.status()`,
`ctx.auth.setAccountLabel(label)`.

Automations call rules from a script or steps:

```
hello.greet("Emmi")
spotify.me()
```

## Permissions and the grant model

Declaring `permission.grant: true` means the connector must be connected in
**Connectors** before its rules run. The daemon enforces this at the host
boundary; a denied or not-yet-granted connector throws before the rule runs.

The other `permission` fields render editors in a generic permissions panel and
persist to `connector-permissions-extra.json`. `ctx.http` enforces
`hostAllowlist` on the host.

## Account auth (OAuth2 + PKCE)

Account login is a **pack dependency**, not invisible platform magic:

1. Install / enable the **Auth** pack (ships the **Accounts** connector).
2. Connect **Accounts** in Connectors (turns on OAuth + `ctx.http`).
3. Provider packs declare `requires: [auth]` and keep their own `auth:` block
   (URLs, scopes, `clientId`).

```yaml
# pack.yaml — e.g. Spotify
requires: [auth]
```

```yaml
# connectors/spotify.yaml — provider-specific OAuth metadata
permission:
  grant: true
  hostAllowlist: true
auth:
  type: oauth2
  authorizationUrl: https://accounts.spotify.com/authorize
  tokenUrl: https://accounts.spotify.com/api/token
  scopes: [user-read-email, user-read-private, playlist-read-private]
  clientId: YOUR_SPOTIFY_CLIENT_ID   # from the provider’s developer console
  apiHosts: [api.spotify.com, accounts.spotify.com]
```

Connect on the provider opens the browser (PKCE public client). The redirect URI
is `http://127.0.0.1:3921/oauth/callback` (daemon). Tokens are stored encrypted
under the Emmi data dir and never passed into rule workers.

See [`examples/packs/auth`](../examples/packs/auth) and
[`examples/packs/spotify`](../examples/packs/spotify).

## Install, update, remove

```bash
emmi pack install ./examples/packs/hello   # install from a local folder
emmi pack install ./examples/packs/spotify
emmi pack list                             # see installed packs + versions
emmi pack remove hello                     # uninstall
```

Installing copies connector manifests, rule files, and recipes into your Emmi
home, seeds default permissions, and reloads the rule registry. Bump
`version` in `pack.yaml` and reinstall to update.

## Checklist

- [ ] `pack.yaml` with a unique `id`, `version`, and the `connectors`/`recipes`
      it ships.
- [ ] If the pack uses OAuth / `ctx.http`, set `requires: [auth]`.
- [ ] One `connectors/<id>.yaml` per connector with `kind`, `scope`, `naming`,
      and (if needed) `permission` / `auth`.
- [ ] One `.mjs` rule file per `rules[]` entry; filename matches the rule `id`.
- [ ] Account APIs use `ctx.http` (not raw tokens in the pack).
- [ ] Optional `recipes/*.yaml` installed inactive so nothing runs unexpectedly.
- [ ] `emmi pack install ./my-pack` then run a recipe to verify.
