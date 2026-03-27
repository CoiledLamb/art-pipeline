const chokidar = require("chokidar");
const sharp = require("sharp");
const fs = require("fs");

const config = require("./config");
const {
  ensureDir,
  getOutputDir,
  getOutputPath,
  getRemoteFolder,
  getRemoteImagePath,
} = require("./paths");
const {
  isSupportedInputFile,
  isPrivateCategory,
  isValidCategory,
  extractDateData,
  buildFileMetadata,
} = require("./metadata");

const NEOCITIES_API_KEY = config.neocitiesApiKey;

if (!NEOCITIES_API_KEY) {
  console.error("❌ Missing NEOCITIES_API_KEY in .env");
  process.exit(1);
}

// --------------------------
// GALLERY JSON
// --------------------------
function readGalleryJSON() {
  if (!fs.existsSync(config.galleryJsonPath)) {
    return {
      figures: [],
      hands: [],
      general: [],
    };
  }

  const data = JSON.parse(fs.readFileSync(config.galleryJsonPath, "utf8"));

  for (const key of config.validCategories) {
    if (!Array.isArray(data[key])) {
      data[key] = [];
    }
  }

  return data;
}

function updateGalleryJSON(category, fileName) {
  const data = readGalleryJSON();

  const alreadyExists = data[category].some(
    (item) => item.file && item.file.toLowerCase() === fileName.toLowerCase(),
  );

  if (alreadyExists) {
    console.log("⚠️ Already in gallery.json");
    return false;
  }

  const dateData = extractDateData(fileName);

  const entry = {
    file: fileName,
    date: dateData ? dateData.iso : null,
    display: dateData ? dateData.display : fileName,
  };

  data[category].push(entry);
  fs.writeFileSync(config.galleryJsonPath, JSON.stringify(data, null, 2));
  console.log(" gallery.json updated");
  return true;
}

// --------------------------
// REMOTE CHECKS
// --------------------------
async function listRemoteFolder(category) {
  const remoteFolder = getRemoteFolder(category);

  try {
    const response = await fetch(
      `https://neocities.org/api/list?path=${encodeURIComponent(remoteFolder)}`,
      {
        headers: {
          Authorization: `Bearer ${NEOCITIES_API_KEY}`,
        },
      },
    );

    const result = await response.json();

    if (result.result !== "success" || !Array.isArray(result.files)) {
      return [];
    }

    return result.files;
  } catch (err) {
    console.error("Remote folder list failed:", err);
    return [];
  }
}

async function remoteFileExists(category, fileName) {
  const remotePath = getRemoteImagePath(category, fileName);
  const files = await listRemoteFolder(category);
  return files.some((file) => file.path === remotePath);
}

// --------------------------
// API UPLOAD
// --------------------------
async function uploadFile(localPath, category, fileName) {
  const remotePath = getRemoteImagePath(category, fileName);
  const fileBuffer = fs.readFileSync(localPath);
  const blob = new Blob([fileBuffer], { type: "image/webp" });
  const form = new FormData();

  // Per Neocities docs, the multipart parameter name should be the remote filename/path.
  form.append(remotePath, blob, fileName);

  console.log(`⬆️ Upload target: ${remotePath}`);

  try {
    const response = await fetch("https://neocities.org/api/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NEOCITIES_API_KEY}`,
      },
      body: form,
    });

    const result = await response.json();
    console.log("API RESPONSE:", result);

    if (result.result !== "success") {
      console.log("❌ Upload failed:", result);
      return false;
    }

    const files = await listRemoteFolder(category);
    console.log("VERIFY RESPONSE:", { result: "success", files });

    const found = files.some((file) => file.path === remotePath);

    if (found) {
      console.log(`✅ VERIFIED: ${remotePath}`);
      return true;
    }

    console.log(
      `❌ Upload verification failed: ${remotePath} not found in ${getRemoteFolder(category)}`,
    );
    return false;
  } catch (err) {
    console.error("API Error:", err);
    return false;
  }
}

async function uploadGalleryJSON() {
  const fileBuffer = fs.readFileSync(config.galleryJsonPath);
  const blob = new Blob([fileBuffer], { type: "application/json" });
  const form = new FormData();

  // Same Neocities rule: parameter name is the destination filename.
  form.append("gallery.json", blob, "gallery.json");

  try {
    const response = await fetch("https://neocities.org/api/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NEOCITIES_API_KEY}`,
      },
      body: form,
    });

    const result = await response.json();
    console.log("GALLERY JSON RESPONSE:", result);

    if (result.result !== "success") {
      console.log("❌ gallery.json upload failed:", result);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Gallery JSON upload failed:", err);
    return false;
  }
}

// --------------------------
// MAIN PROCESS
// --------------------------
async function processFile(filePath) {
  if (!isSupportedInputFile(filePath)) return;

  const meta = buildFileMetadata(filePath);
  const { baseName, category, outputName } = meta;

  if (isPrivateCategory(category)) {
    console.log(" Skipping private file");
    return;
  }

  if (!isValidCategory(category)) {
    console.log(`⚠️ Unknown category "${category}" — skipping`);
    return;
  }

  const remotePath = getRemoteImagePath(category, outputName);

  if (!config.allowDuplicates) {
    const existsRemotely = await remoteFileExists(category, outputName);
    if (existsRemotely) {
      console.log(`⚠️ Already exists on live site: ${remotePath}`);
      return;
    }
  }

  const outputDir = getOutputDir(category);
  ensureDir(outputDir);

  const outputPath = getOutputPath(category, outputName);

  if (!config.allowDuplicates && fs.existsSync(outputPath)) {
    console.log("⚠️ Already processed locally");
    return;
  }

  console.log(` Processing ${baseName}`);
  console.log(`️ Category: ${category}`);
  console.log(` Remote path will be: ${remotePath}`);

  try {
    await sharp(filePath)
      .webp({ quality: config.webpQuality })
      .toFile(outputPath);
    console.log("✅ Converted");

    let uploaded = false;

    if (config.safeMode) {
      console.log(" SAFE MODE: skipping upload");
      uploaded = true;
    } else {
      uploaded = await uploadFile(outputPath, category, outputName);
    }

    if (uploaded) {
      const jsonChanged = updateGalleryJSON(category, outputName);

      if (!config.safeMode && jsonChanged) {
        await uploadGalleryJSON();
      }
    }
  } catch (err) {
    console.error("❌ Error:", err);
  }
}

// --------------------------
// WATCHER
// --------------------------
console.log(" Watching for files...");
chokidar
  .watch(config.inputDir, {
    ignoreInitial: true,
    depth: 2,
  })
  .on("add", (filePath) => {
    processFile(filePath);
  });
