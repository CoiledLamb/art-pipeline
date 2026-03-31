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

// If a gallery entry already exists for the base output name, append a letter
// suffix (b, c, d...) until we find an unused name. This supports multiple
// drawings on the same day with the same display date.
function resolveOutputName(category, baseOutputName) {
  const gallery = readGalleryJSON();
  const entries = gallery[category] || [];
  const taken = new Set(entries.map((e) => e.file && e.file.toLowerCase()));

  if (!taken.has(baseOutputName.toLowerCase())) {
    return baseOutputName;
  }

  // baseOutputName is e.g. "figures 021826.webp"
  const ext = ".webp";
  const stem = baseOutputName.slice(0, -ext.length); // "figures 021826"

  for (let i = 1; i < 26; i++) {
    const suffix = String.fromCharCode(97 + i); // b, c, d...
    const candidate = `${stem}${suffix}${ext}`;
    if (!taken.has(candidate.toLowerCase())) {
      console.log(`[info] same-day collision: ${baseOutputName} → ${candidate}`);
      return candidate;
    }
  }

  throw new Error(`Too many same-day entries for ${baseOutputName}`);
}

async function reconcileFile(sourcePath) {
  if (!isSupportedInputFile(sourcePath)) return;

  const meta = buildFileMetadata(sourcePath);

  if (!meta) {
    console.log("[skip] invalid filename:", sourcePath);
    return;
  }

  const { baseName, category, dateData } = meta;

  if (isPrivateCategory(category)) return;
  if (!isValidCategory(category)) return;

  // Resolve final output name, accounting for same-day collisions
  const outputName = resolveOutputName(category, meta.outputName);

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
