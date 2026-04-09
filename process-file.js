const fs = require("fs");
const sharp = require("sharp");

const config = require("./config");
const {
  ensureDir,
  getOutputDir,
  getOutputPath,
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

// Check if a file is already fully synced (in gallery AND remote).
// If so, we skip collision detection entirely — no suffix needed.
function isAlreadySynced(category, outputName) {
  const gallery = readGalleryJSON();
  return gallery[category].some(
    (entry) => entry.file && entry.file.toLowerCase() === outputName.toLowerCase(),
  );
}

// Resolve the output name for a genuinely NEW file, using a shared
// in-memory registry that only tracks names added THIS session.
// takenNames starts empty — it never contains pre-existing gallery entries.
function resolveOutputName(category, baseOutputName, takenNames) {
  if (!takenNames.has(category)) {
    takenNames.set(category, new Set());
  }
  const taken = takenNames.get(category);

  const baseKey = baseOutputName.toLowerCase();
  if (!taken.has(baseKey)) {
    taken.add(baseKey);
    return baseOutputName;
  }

  const ext = ".webp";
  const stem = baseOutputName.slice(0, -ext.length);

  for (let i = 1; i < 26; i++) {
    const suffix = String.fromCharCode(97 + i); // b, c, d...
    const candidate = `${stem}${suffix}${ext}`;
    const candidateKey = candidate.toLowerCase();
    if (!taken.has(candidateKey)) {
      console.log(`[info] same-day collision: ${baseOutputName} → ${candidate}`);
      taken.add(candidateKey);
      return candidate;
    }
  }

  throw new Error(`Too many same-day entries for ${baseOutputName}`);
}

async function reconcileFile(sourcePath, takenNames) {
  if (!isSupportedInputFile(sourcePath)) return;

  const meta = buildFileMetadata(sourcePath);

  if (!meta) {
    console.log("[skip] invalid filename:", sourcePath);
    return;
  }

  const { baseName, category, dateData } = meta;

  if (isPrivateCategory(category)) return;
  if (!isValidCategory(category)) return;

  // If the canonical output name is already in the gallery, this file
  // is fully synced — skip it entirely, no suffix detection needed.
  if (isAlreadySynced(category, meta.outputName)) {
    console.log(`[skip] already synced: ${baseName}`);
    return;
  }

  // Only new files reach here — resolve suffix only if needed this session
  const outputName = resolveOutputName(category, meta.outputName, takenNames);

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
