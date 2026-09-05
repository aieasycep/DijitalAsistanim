// Metro configuration for the pnpm monorepo (hoisted node_modules) + expo-widgets.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules'), path.resolve(workspaceRoot, 'node_modules')];
config.resolver.disableHierarchicalLookup = false;
config.resolver.sourceExts = [...config.resolver.sourceExts, 'sql'];
config.resolver.unstable_enablePackageExports = true;

// Widgets are bundled by expo-widgets' own Metro config (node_modules/expo-widgets/metro.config.js) at build time.
module.exports = config;
