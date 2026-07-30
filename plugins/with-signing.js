/**
 * Persist iOS signing across `expo prebuild`.
 *
 * `ios/` is gitignored and regenerated wholesale, so DEVELOPMENT_TEAM set by
 * hand in Xcode survives only until the next prebuild — after which the build
 * fails, or worse, silently signs against nothing. This has cost the studio a
 * debugging pass twice (zhouyi 2026-07-10, armillary-expo 2026-07-30), both
 * times presenting as an unrelated symptom.
 *
 * The team ID is an identifier, not a credential: it is embedded in the code
 * signature of every distributed Apple binary and readable with
 * `codesign -dvvv`. It authorizes nothing without the certificate and private
 * key, which .gitignore excludes. Committing it is safe.
 *
 * It is overridable because this repo is public, and a hardcoded team makes a
 * fork fail to build with an error that does not name its own cause.
 */

const { withXcodeProject } = require('expo/config-plugins');

const STUDIO_TEAM_ID = '497QWRKRQH';

const withSigning = (config) => {
  const teamId = process.env.APPLE_TEAM_ID ?? STUDIO_TEAM_ID;

  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const configurations = project.pbxXCBuildConfigurationSection();
    const target = cfg.modRequest.projectName;

    for (const key of Object.keys(configurations)) {
      const entry = configurations[key];
      // The section interleaves comment entries with real ones.
      if (typeof entry !== 'object' || !entry.buildSettings) continue;

      // Pods and other generated targets sign themselves; only the app target
      // carries the bundle identifier, so it is the discriminator.
      const settings = entry.buildSettings;
      if (settings.PRODUCT_NAME?.replace(/"/g, '') !== target) continue;

      settings.DEVELOPMENT_TEAM = teamId;
      settings.CODE_SIGN_STYLE = 'Automatic';
    }

    return cfg;
  });
};

module.exports = withSigning;
