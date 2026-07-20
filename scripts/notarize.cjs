/**
 * electron-builder afterSign hook — notarize macOS app when credentials exist.
 *
 * Setup (once, on your Mac):
 *   xcrun notarytool store-credentials "grok-build-notary" \
 *     --apple-id "you@example.com" \
 *     --team-id "TEAMID" \
 *     --password "app-specific-password"
 *
 * Or set env before build:
 *   APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
 *   optional: APPLE_NOTARY_PROFILE=grok-build-notary
 *
 * Without credentials this hook no-ops (unsigned / ad-hoc local builds OK).
 */
const path = require("node:path");
const { existsSync } = require("node:fs");

exports.default = async function notarizeMac(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== "darwin") return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  if (!existsSync(appPath)) {
    console.warn("[notarize] app not found:", appPath);
    return;
  }

  const profile = process.env.APPLE_NOTARY_PROFILE || "grok-build-notary";
  const appleId = process.env.APPLE_ID;
  const applePass = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  const hasEnv = Boolean(appleId && applePass && teamId);
  const forceSkip =
    process.env.SKIP_NOTARIZE === "1" ||
    process.env.CSC_IDENTITY_AUTO_DISCOVERY === "false";

  if (forceSkip && !hasEnv) {
    console.log("[notarize] skipped (SKIP_NOTARIZE / no identity discovery)");
    return;
  }

  let notarize;
  try {
    ({ notarize } = require("@electron/notarize"));
  } catch {
    console.warn(
      "[notarize] @electron/notarize not installed — run: npm i -D @electron/notarize"
    );
    return;
  }

  if (!hasEnv) {
    // Try keychain profile only
    try {
      console.log(`[notarize] using keychain profile: ${profile}`);
      await notarize({
        appPath,
        tool: "notarytool",
        keychainProfile: profile,
      });
      console.log("[notarize] success");
      return;
    } catch (err) {
      console.warn(
        "[notarize] no credentials — skipping. Install Developer ID + run notarytool store-credentials, or set APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID."
      );
      console.warn("[notarize]", String(err?.message || err).slice(0, 200));
      return;
    }
  }

  try {
    console.log("[notarize] submitting", appPath);
    await notarize({
      appPath,
      tool: "notarytool",
      appleId,
      appleIdPassword: applePass,
      teamId,
    });
    console.log("[notarize] success");
  } catch (err) {
    console.error("[notarize] failed:", err?.message || err);
    throw err;
  }
};
