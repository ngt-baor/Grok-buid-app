# macOS code signing & notarization (Phase 9)

## Why

Unsigned builds work for **local testing** (Right-click → Open once).  
For distribution to other Macs without Gatekeeper warnings you need:

1. **Developer ID Application** certificate  
2. **Notarization** via Apple notary service  
3. **Staple** ticket onto the app/DMG  

## Prerequisites

1. Enroll in [Apple Developer Program](https://developer.apple.com/programs/) (~$99/year).
2. On this Mac, open **Xcode → Settings → Accounts** → download certificates, **or** create *Developer ID Application* in Certificates, Identifiers & Profiles and install the `.cer`.
3. Verify:

```bash
security find-identity -v -p codesigning
# Expect a line like: "Developer ID Application: Your Name (TEAMID)"
```

4. Create an [app-specific password](https://appleid.apple.com/account/manage) for notarytool.

5. Store notary credentials (once):

```bash
xcrun notarytool store-credentials "grok-build-notary" \
  --apple-id "you@example.com" \
  --team-id "YOURTEAMID" \
  --password "xxxx-xxxx-xxxx-xxxx"
```

## Build signed + notarized

```bash
cd ~/Developer/Grok-buid-app

# Optional explicit identity:
export CSC_NAME="Developer ID Application: Your Name (TEAMID)"

# Or let electron-builder auto-discover Developer ID
unset CSC_IDENTITY_AUTO_DISCOVERY   # default true

npm run dist:mac
```

`package.json` → `build.afterSign` runs `scripts/notarize.cjs` when credentials exist.

Env alternative (CI):

```bash
export APPLE_ID=you@example.com
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=TEAMID
npm run dist:mac
```

Skip notarize (local only):

```bash
export SKIP_NOTARIZE=1
npm run dist:mac
```

## Current machine status (2026-07-20)

- `security find-identity -v -p codesigning` → **0 valid identities**
- No notary keychain profile → notarize **cannot run yet**
- Project is **ready**: entitlements + afterSign hook + this doc
- Until certificates exist: use unsigned/ad-hoc app + Gatekeeper override for testing

## Ad-hoc local sign (no Apple account)

```bash
codesign --force --deep --sign - "release/mac-arm64/Grok Build.app"
```

Helps some local checks only; **not** a substitute for Developer ID + notarize.
