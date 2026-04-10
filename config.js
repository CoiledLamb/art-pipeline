require("dotenv").config();
const path = require("path");

const ROOT_DIR = __dirname;

// Absolute path to the local neocities site folder.
// gallery.json is mirrored here after every write so the local preview
// server and artwork-calendar.html can fetch it without a deploy.
const SITE_DIR = path.join(ROOT_DIR, "..", "neocities-coiledlamb(1)");

const config = {
  safeMode: false,
  allowDuplicates: false,

  neocitiesApiKey: process.env.NEOCITIES_API_KEY,

  rootDir: ROOT_DIR,
  inputDir: path.join(ROOT_DIR, "incoming"),
  outputDir: path.join(ROOT_DIR, "processed"),
  galleryJsonPath: path.join(ROOT_DIR, "gallery.json"),

  // Mirror target — gallery.json is copied here after every write.
  // Set to null to disable mirroring (e.g. in CI).
  siteDir: SITE_DIR,
  siteGalleryJsonPath: path.join(SITE_DIR, "gallery.json"),

  remoteImageRoot: "images",

  validCategories: ["figures", "hands", "general"],
  privateCategory: "private",

  inputExtension: ".png",
  outputExtension: ".webp",

  webpQuality: 85,

  // Entry metadata defaults.
  // source: shown on every drawing page's process sidebar.
  defaultSource: "line of action",

  // session: shown on drawing pages for these categories only.
  // general and nsfw intentionally omitted — those pieces don't
  // follow the timed class structure.
  sessionCategories: ["figures", "hands"],
  defaultSession: "class style, 30 min",
};

module.exports = config;
