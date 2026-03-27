require("dotenv").config();
const path = require("path");

const ROOT_DIR = __dirname;

const config = {
  safeMode: false,
  allowDuplicates: false,

  neocitiesApiKey: process.env.NEOCITIES_API_KEY,

  rootDir: ROOT_DIR,
  inputDir: path.join(ROOT_DIR, "incoming"),
  outputDir: path.join(ROOT_DIR, "processed"),
  galleryJsonPath: path.join(ROOT_DIR, "gallery.json"),

  remoteImageRoot: "images",

  validCategories: ["figures", "hands", "general"],
  privateCategory: "private",

  inputExtension: ".png",
  outputExtension: ".webp",

  webpQuality: 85,
};

module.exports = config;
