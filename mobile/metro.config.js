// Expo (SDK 52+) detects npm workspaces automatically, so the shared package
// in ../shared is watched and resolved without extra configuration.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
