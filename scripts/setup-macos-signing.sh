#!/usr/bin/env bash
# Guided setup for Developer ID + notary credentials for Grok Build App.
# You still must enroll/pay on developer.apple.com (Apple requires your Apple ID).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SIGN_DIR="$ROOT/signing"
mkdir -p "$SIGN_DIR"

APP_NAME="Grok Build App"
CN="${APPLE_CN:-Grok Build Developer}"
EMAIL="${APPLE_ID:-}"
TEAM_ID="${APPLE_TEAM_ID:-}"
PROFILE="${APPLE_NOTARY_PROFILE:-grok-build-notary}"

echo "═══════════════════════════════════════════════════════"
echo "  $APP_NAME — macOS signing setup"
echo "═══════════════════════════════════════════════════════"
echo ""

echo "【1】 Checking local tools…"
if ! command -v openssl >/dev/null; then
  echo "  ✗ openssl missing"
  exit 1
fi
echo "  ✓ openssl"

if xcrun notarytool --help >/dev/null 2>&1; then
  echo "  ✓ notarytool (via xcrun)"
else
  echo "  ✗ notarytool unavailable — install full Xcode or newer CLT"
fi

echo ""
echo "【2】 Existing code-signing identities:"
IDENTITIES="$(security find-identity -v -p codesigning 2>/dev/null || true)"
echo "$IDENTITIES" | sed 's/^/  /'
if echo "$IDENTITIES" | grep -q "Developer ID Application"; then
  echo ""
  echo "  ✓ Developer ID Application already installed."
  echo "  Next: store notary credentials (step 5) then: npm run dist:mac"
  HAS_CERT=1
else
  echo "  … no Developer ID Application yet"
  HAS_CERT=0
fi

echo ""
echo "【3】 Apple Developer enrollment (YOU must do this in browser)"
echo "  1. Open: https://developer.apple.com/programs/enroll/"
echo "  2. Sign in with your Apple ID"
echo "  3. Enroll Individual or Organization (~\$99/year)"
echo "  4. After active, copy Team ID from:"
echo "     https://developer.apple.com/account#MembershipDetailsCard"
echo ""

if [[ -z "$EMAIL" ]]; then
  echo "  To generate CSR automatically, re-run with your Apple ID email:"
  echo "    APPLE_ID=you@example.com APPLE_CN=\"Your Name\" bash scripts/setup-macos-signing.sh"
  echo ""
  echo "  Opening enrollment page…"
  open "https://developer.apple.com/programs/enroll/" 2>/dev/null || true
  open "https://developer.apple.com/account/resources/certificates/list" 2>/dev/null || true
  echo ""
  echo "  After you have Team ID + enrolled, run again with APPLE_ID=…"
  exit 0
fi

echo "【4】 Generating Certificate Signing Request (CSR) for: $EMAIL"
KEY="$SIGN_DIR/developerID_application.key"
CSR="$SIGN_DIR/CertificateSigningRequest.certSigningRequest"

if [[ -f "$KEY" && -f "$CSR" ]]; then
  echo "  … CSR already exists:"
  echo "    $CSR"
else
  openssl genrsa -out "$KEY" 2048 2>/dev/null
  chmod 600 "$KEY"
  openssl req -new -key "$KEY" -out "$CSR" \
    -subj "/emailAddress=${EMAIL}/CN=${CN}/C=US"
  echo "  ✓ Private key: $KEY  (KEEP SECRET — never commit)"
  echo "  ✓ CSR:         $CSR"
fi

echo ""
echo "【5】 Create certificate on Apple (browser)"
echo "  1. Open: https://developer.apple.com/account/resources/certificates/add"
echo "  2. Select: Developer ID Application  (NOT Apple Development)"
echo "  3. Continue → Upload CSR file:"
echo "       $CSR"
echo "  4. Download the .cer file"
echo "  5. Double-click the .cer to install into Keychain (login)"
echo "  6. Also import the private key if needed:"
echo "       open $SIGN_DIR"
echo "       # Or: security import $KEY -k ~/Library/Keychains/login.keychain-db"
echo ""
open "https://developer.apple.com/account/resources/certificates/add" 2>/dev/null || true
open -R "$CSR" 2>/dev/null || true

echo "【6】 After .cer is installed, verify:"
echo "    security find-identity -v -p codesigning"
echo "  Expect: Developer ID Application: $CN (TEAMID)"
echo ""

echo "【7】 Notary credentials (after cert works)"
if [[ -n "$TEAM_ID" ]]; then
  echo "  Run (you will be prompted / use app-specific password):"
  echo "    xcrun notarytool store-credentials \"$PROFILE\" \\"
  echo "      --apple-id \"$EMAIL\" \\"
  echo "      --team-id \"$TEAM_ID\" \\"
  echo "      --password \"xxxx-xxxx-xxxx-xxxx\""
  echo ""
  echo "  App-specific password: https://appleid.apple.com → Sign-In → App-Specific Passwords"
else
  echo "  Set APPLE_TEAM_ID=XXXXXXXXXX then re-run, or run notarytool store-credentials manually."
  echo "  App-specific password: https://appleid.apple.com"
fi

echo ""
echo "【8】 Build signed app"
echo "    cd $ROOT"
echo "    export CSC_IDENTITY_AUTO_DISCOVERY=true"
echo "    # optional: export CSC_NAME=\"Developer ID Application: $CN (TEAMID)\""
echo "    npm run dist:mac"
echo ""
echo "Done preparing local CSR/key. Remaining steps need your Apple ID login + payment."
echo "signing/ is gitignored — do not push keys."
