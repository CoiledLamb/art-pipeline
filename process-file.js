const fs = require("fs");
const sharp = require("sharp");

const config = require("./config");
const {
  ensureDir,
  getOutputDir,
  getOutputPath,
  getRemoteImagePath,
} = require("./paths");
const {
  isSupportedInputFile,
  isPrivateCategory,
  isValidCategory,
  buildFileMetadata,
} = require("./metadata");
const {
  readGalleryJSON,
  galleryEntryExists,
  addGalleryEntry,
} = require("./gallery");
const {
  remoteFileExists,
  uploadFile,
  uploadGalleryJSON,
} = require("./neocities");

async function ensureProcessedFile(sourcePath, outputPath, fileName) {
  if (fs.existsSync(outputPath)) return false;

  await sharp(sourcePath)
    .webp({ quality: config.webpQuality })
    .toFile(outputPath);
  console.log(`✅ [${fileName}] converted`);
  return true;
}

async function getFileState(category, outputName, outputPath) {
  const gallery = readGalleryJSON();

  return {
    processed: fs.existsSync(outputPath),
    remote: await remoteFileExists(category, outputName),
    gallery: galleryEntryExists(gallery, category, outputName),
  };
}

async function reconcileFile(sourcePath) {
  if (!isSupportedInputFile(sourcePath)) return;

  const meta = buildFileMetadata(sourcePath);
  const { baseName, category, outputName } = meta;

  if (isPrivateCategory(category)) return;
  if (!isValidCategory(category)) return;

  const outputDir = getOutputDir(category);
  ensureDir(outputDir);

  const outputPath = getOutputPath(category, outputName);
  const remotePath = getRemoteImagePath(category, outputName);

  console.log(`\n🔎 ${baseName}`);

  try {
    let state = await getFileState(category, outputName, outputPath);

    if (!state.processed) {
      await ensureProcessedFile(sourcePath, outputPath, outputName);
      state.processed = true;
    }

    if (!state.remote) {
      if (!config.safeMode) {
        const ok = await uploadFile(outputPath, category, outputName);
        if (!ok) throw new Error("upload failed");
      }
      state.remote = true;
    }

    if (!state.gallery) {
      const result = addGalleryEntry(category, outputName);

      if (result.changed && !config.safeMode) {
        const ok = await uploadGalleryJSON(config.galleryJsonPath);
        if (!ok) throw new Error("gallery upload failed");
      }

      state.gallery = true;
    }

    console.log(`✅ synced: ${outputName}`);
  } catch (err) {
    console.error(`❌ ${outputName}:`, err.message);
  }
}

module.exports = {
  reconcileFile,
};
