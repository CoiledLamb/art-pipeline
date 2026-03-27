const SAFE_MODE = false; // true = process locally only, no live uploads
const ALLOW_DUPLICATES = false; // true = ignore duplicate protections during testing

const chokidar = require("chokidar");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

// --------------------------
// CONFIG
// --------------------------
const NEOCITIES_API_KEY = "Your API Key Here!";

const INPUT_DIR = path.join(__dirname, "incoming");
const OUTPUT_DIR = path.join(__dirname, "processed");
const GALLERY_JSON = path.join(__dirname, "gallery.json");

const VALID_CATEGORIES = ["figures", "hands", "general"];
const REMOTE_IMAGE_ROOT = "images";

// --------------------------
// HELPERS
// --------------------------
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getCategory(filePath) {
  return path.basename(path.dirname(filePath));
}

function generateName(original) {
  return path.parse(original).name + ".webp";
}

function getRemoteFolder(category) {
  return `${REMOTE_IMAGE_ROOT}/${category}`;
}

function getRemoteImagePath(category, fileName) {
  return `${getRemoteFolder(category)}/${fileName}`;
}

function readGalleryJSON() {
  if (!fs.existsSync(GALLERY_JSON)) {
    return {
      figures: [],
      hands: [],
      general: [],
    };
  }

  const data = JSON.parse(fs.readFileSync(GALLERY_JSON, "utf8"));

  for (const key of VALID_CATEGORIES) {
    if (!Array.isArray(data[key])) {
      data[key] = [];
    }
  }

  return data;
}

// --------------------------
// DATE + CAPTION EXTRACTION
// --------------------------
function extractDateData(filename) {
  let digits = filename
    .replace(/^(figures|hands|general)\s/i, "")
    .replace(/\.webp$/i, "");

  let mm, dd, yy;

  if (digits.length === 5) {
    mm = digits.slice(0, 1);
    dd = digits.slice(1, 3);
    yy = digits.slice(3, 5);
  } else if (digits.length === 6) {
    mm = digits.slice(0, 2);
    dd = digits.slice(2, 4);
    yy = digits.slice(4, 6);
  } else {
    return null;
  }

  return {
    iso: `20${yy}-${mm.padStart(2, "0")}-${dd}`,
    display: `${mm}/${dd}/${yy}`,
  };
}

// --------------------------
// JSON UPDATE
// --------------------------
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

  fs.writeFileSync(GALLERY_JSON, JSON.stringify(data, null, 2));
  console.log("📝 gallery.json updated");
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
    console.log("VERIFY RESPONSE:", {
      result: "success",
      files,
    });

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
  const fileBuffer = fs.readFileSync(GALLERY_JSON);
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
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".png") return;

  const category = getCategory(filePath);

  if (category === "private") {
    console.log("🔒 Skipping private file");
    return;
  }

  if (!VALID_CATEGORIES.includes(category)) {
    console.log(`⚠️ Unknown category "${category}" — skipping`);
    return;
  }

  const baseName = path.basename(filePath);
  const outputName = generateName(baseName);
  const remotePath = getRemoteImagePath(category, outputName);

  if (!ALLOW_DUPLICATES) {
    const existsRemotely = await remoteFileExists(category, outputName);

    if (existsRemotely) {
      console.log(`⚠️ Already exists on live site: ${remotePath}`);
      return;
    }
  }

  const outputDir = path.join(OUTPUT_DIR, category);
  ensureDir(outputDir);

  const outputPath = path.join(outputDir, outputName);

  if (!ALLOW_DUPLICATES && fs.existsSync(outputPath)) {
    console.log("⚠️ Already processed locally");
    return;
  }

  console.log(`📦 Processing ${baseName}`);
  console.log(`🗂️ Category: ${category}`);
  console.log(`🌐 Remote path will be: ${remotePath}`);

  try {
    await sharp(filePath).webp({ quality: 85 }).toFile(outputPath);

    console.log("✅ Converted");

    let uploaded = false;

    if (SAFE_MODE) {
      console.log("🛑 SAFE MODE: skipping upload");
      uploaded = true;
    } else {
      uploaded = await uploadFile(outputPath, category, outputName);
    }

    if (uploaded) {
      const jsonChanged = updateGalleryJSON(category, outputName);

      if (!SAFE_MODE && jsonChanged) {
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
console.log("👀 Watching for files...");

chokidar
  .watch(INPUT_DIR, {
    ignoreInitial: true,
    depth: 2,
  })
  .on("add", (filePath) => {
    processFile(filePath);
  });
