/**
 * withAppleTeamId — iOS signing and entitlement glue driven by env / app config:
 *
 *  - DEVELOPMENT_TEAM on every native target (main app, share extension, widgets) from
 *    `extra.appleTeamId` (app.config.ts ← APPLE_TEAM_ID). A second pass runs in the finalized mod so
 *    targets created by later plugins (expo-share-intent, expo-widgets) are covered too.
 *  - `com.apple.developer.associated-domains` entitlement = union of `ios.associatedDomains` and
 *    EXPO_PUBLIC_UNIVERSAL_LINK_HOSTS (`applinks:<host>`).
 *  - Finalized pass over the written entitlements: de-duplicates list entitlements (expo-share-intent
 *    prepends the app group a second time) and adds the App Group to the share-extension entitlements
 *    only if expo-share-intent did not write one.
 *
 * Without a team id the signing parts are skipped (simulator / CI builds without credentials); the
 * entitlement passes still run. Everything is idempotent.
 */
const fs = require('node:fs');
const path = require('node:path');
const {
  IOSConfig,
  WarningAggregator,
  withEntitlementsPlist,
  withFinalizedMod,
  withXcodeProject,
} = require('expo/config-plugins');

const PLUGIN = 'withAppleTeamId';
const ASSOCIATED_DOMAINS = 'com.apple.developer.associated-domains';
const APP_GROUPS = 'com.apple.security.application-groups';

function unique(values) {
  return [...new Set(values)];
}

function resolveTeamId(config) {
  const fromExtra =
    config.extra && typeof config.extra.appleTeamId === 'string' ? config.extra.appleTeamId : '';
  const value = fromExtra || process.env.APPLE_TEAM_ID || '';
  return value.trim();
}

function resolveApplinks(config) {
  const fromConfig = Array.isArray(config.ios && config.ios.associatedDomains)
    ? config.ios.associatedDomains
    : [];
  const fromEnv = String(process.env.EXPO_PUBLIC_UNIVERSAL_LINK_HOSTS || '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean)
    .map((host) => `applinks:${host}`);
  return unique(
    [...fromConfig, ...fromEnv].filter(
      (domain) => typeof domain === 'string' && domain.startsWith('applinks:'),
    ),
  );
}

/** Sets DEVELOPMENT_TEAM on every native target's build configurations. Returns the number of changes. */
function applyTeamToProject(project, teamId) {
  let changed = 0;
  for (const [uuid, target] of IOSConfig.Target.getNativeTargets(project)) {
    const configurations = IOSConfig.XcodeUtils.getBuildConfigurationsForListId(
      project,
      target.buildConfigurationList,
    );
    for (const [, configuration] of configurations) {
      if (!configuration.buildSettings) continue;
      if (configuration.buildSettings.DEVELOPMENT_TEAM !== teamId) {
        configuration.buildSettings.DEVELOPMENT_TEAM = teamId;
        changed += 1;
      }
    }
    project.addTargetAttribute('DevelopmentTeam', teamId, { uuid });
  }
  return changed;
}

function withTeamInXcodeProject(config, teamId) {
  return withXcodeProject(config, (mod) => {
    applyTeamToProject(mod.modResults, teamId);
    return mod;
  });
}

function withAssociatedDomainsEntitlement(config, applinks) {
  return withEntitlementsPlist(config, (mod) => {
    const existing = Array.isArray(mod.modResults[ASSOCIATED_DOMAINS])
      ? mod.modResults[ASSOCIATED_DOMAINS]
      : [];
    const domains = unique([...existing, ...applinks]);
    if (domains.length > 0) mod.modResults[ASSOCIATED_DOMAINS] = domains;
    return mod;
  });
}

function shareExtensionName(config) {
  const entry = (Array.isArray(config.plugins) ? config.plugins : []).find(
    (plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === 'expo-share-intent',
  );
  const params = Array.isArray(entry) && entry[1] && typeof entry[1] === 'object' ? entry[1] : {};
  const name =
    typeof params.iosShareExtensionName === 'string' && params.iosShareExtensionName
      ? params.iosShareExtensionName
      : 'ShareExtension';
  return name.replace(/[^a-zA-Z0-9]/g, '');
}

function loadPlist() {
  const plist = require('@expo/plist');
  return plist.default ? plist.default : plist;
}

/** Reads an entitlements plist, applies `mutate`, and writes it back only when something changed. */
function patchEntitlementsFile(entitlementsPath, mutate) {
  if (!entitlementsPath || !fs.existsSync(entitlementsPath)) return false;
  const plist = loadPlist();
  const entitlements = plist.parse(fs.readFileSync(entitlementsPath, 'utf8'));
  if (!mutate(entitlements)) return false;
  fs.writeFileSync(entitlementsPath, plist.build(entitlements));
  return true;
}

/** Keeps a single entry per app group / associated domain. Returns whether anything changed. */
function dedupeListEntitlements(entitlements) {
  let changed = false;
  for (const key of [APP_GROUPS, ASSOCIATED_DOMAINS]) {
    if (!Array.isArray(entitlements[key])) continue;
    const deduped = unique(entitlements[key]);
    if (deduped.length !== entitlements[key].length) {
      entitlements[key] = deduped;
      changed = true;
    }
  }
  return changed;
}

function resolveAppGroups(config) {
  const fromEntitlements =
    config.ios && config.ios.entitlements ? config.ios.entitlements[APP_GROUPS] : undefined;
  if (Array.isArray(fromEntitlements) && fromEntitlements.length > 0)
    return unique(fromEntitlements);
  if (config.extra && typeof config.extra.appGroup === 'string' && config.extra.appGroup) {
    return [config.extra.appGroup];
  }
  return [];
}

function ensureShareExtensionAppGroup(config, platformProjectRoot) {
  const appGroups = resolveAppGroups(config);
  if (appGroups.length === 0) return false;
  const extensionName = shareExtensionName(config);
  const entitlementsPath = path.join(
    platformProjectRoot,
    extensionName,
    `${extensionName}.entitlements`,
  );
  return patchEntitlementsFile(entitlementsPath, (entitlements) => {
    const existing = Array.isArray(entitlements[APP_GROUPS]) ? entitlements[APP_GROUPS] : [];
    if (existing.length > 0) return false; // expo-share-intent already configured it — leave as is
    entitlements[APP_GROUPS] = appGroups;
    return true;
  });
}

function dedupeMainAppEntitlements(projectRoot) {
  return patchEntitlementsFile(
    IOSConfig.Entitlements.getEntitlementsPath(projectRoot),
    dedupeListEntitlements,
  );
}

function withFinalizedSigning(config, teamId) {
  return withFinalizedMod(config, [
    'ios',
    async (mod) => {
      const { projectRoot, platformProjectRoot } = mod.modRequest;
      try {
        if (teamId) {
          const project = IOSConfig.XcodeUtils.getPbxproj(projectRoot);
          if (applyTeamToProject(project, teamId) > 0)
            fs.writeFileSync(project.filepath, project.writeSync());
        }
        dedupeMainAppEntitlements(projectRoot);
        ensureShareExtensionAppGroup(mod, platformProjectRoot);
      } catch (error) {
        WarningAggregator.addWarningIOS(
          PLUGIN,
          `Finalized signing pass skipped: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return mod;
    },
  ]);
}

module.exports = function withAppleTeamId(config) {
  const teamId = resolveTeamId(config);
  let result = withAssociatedDomainsEntitlement(config, resolveApplinks(config));
  if (teamId) {
    result = withTeamInXcodeProject(result, teamId);
  }
  result = withFinalizedSigning(result, teamId);
  return result;
};

// Exposed for tests / scripts (pure helpers over parsed pbxproj + plist objects).
module.exports.applyTeamToProject = applyTeamToProject;
module.exports.dedupeListEntitlements = dedupeListEntitlements;
module.exports.patchEntitlementsFile = patchEntitlementsFile;
module.exports.ensureShareExtensionAppGroup = ensureShareExtensionAppGroup;
