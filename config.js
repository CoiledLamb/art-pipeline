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
  // Set to null to disable mirroring (e.g. in CI where the site dir
  // may not be present).
  siteDir: SITE_DIR,
  siteGalleryJsonPath: path.join(SITE_DIR, "gallery.json"),

  remoteImageRoot: "images",

  validCategories: ["figures", "hands", "general"],
  privateCategory: "private",

  inputExtension: ".png",
  outputExtension: ".webp",

  webpQuality: 85,
};

module.exports = config;
