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
const { readGalleryJSON, addGalleryEntry } = require("./gallery");
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

  console.log(`[ok] converted: ${fileName}`);
  return true;
}

async function getFileState(category, outputName, outputPath, dateData) {
  const gallery = readGalleryJSON();

  const galleryExists = gallery[category].some(
    (entry) => entry.file && entry.file.toLowerCase() === outputName.toLowerCase(),
  );

  return {
    processed: fs.existsSync(outputPath),
    remote: await remoteFileExists(category, outputName),
    gallery: galleryExists,
  };
}

async function reconcileFile(sourcePath) {
  if (!isSupportedInputFile(sourcePath)) return;

  const meta = buildFileMetadata(sourcePath);

  if (!meta) {
    console.log("[skip] invalid filename:", sourcePath);
    return;
  }

  const { baseName, category, outputName, dateData } = meta;

  if (isPrivateCategory(category)) return;
  if (!isValidCategory(category)) return;

  const outputDir = getOutputDir(category);
  ensureDir(outputDir);

  const outputPath = getOutputPath(category, outputName);

  console.log(`\n[process] ${baseName}`);

  try {
    let state = await getFileState(category, outputName, outputPath, dateData);

    // PROCESS
    if (!state.processed) {
      await ensureProcessedFile(sourcePath, outputPath, outputName);
      state.processed = true;
    }

    // UPLOAD
    if (!state.remote) {
      if (!config.safeMode) {
        const ok = await uploadFile(outputPath, category, outputName);
        if (!ok) throw new Error("upload failed");
      }
      state.remote = true;
    }

    // GALLERY (IDENTITY-BASED)
    if (!state.gallery) {
      const result = addGalleryEntry(category, {
        file: outputName,
        date: dateData.iso,
        display: dateData.display,
      });

      if (result.changed && !config.safeMode) {
        const ok = await uploadGalleryJSON(config.galleryJsonPath);
        if (!ok) throw new Error("gallery upload failed");
      }

      state.gallery = true;
    }

    console.log(`[ok] synced: ${outputName}`);
  } catch (err) {
    console.error(`[error] ${outputName}:`, err.message);
  }
}

module.exports = {
  reconcileFile,
};
