const fs = require("fs");
const config = require("./config");
const { getRemoteFolder, getRemoteImagePath } = require("./paths");

const NEOCITIES_API_KEY = config.neocitiesApiKey;

if (!NEOCITIES_API_KEY) {
  throw new Error("Missing NEOCITIES_API_KEY in config");
}

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
    console.error(`❌ [${category}] remote folder list failed:`, err);
    return [];
  }
}

async function remoteFileExists(category, fileName) {
  const remotePath = getRemoteImagePath(category, fileName);
  const files = await listRemoteFolder(category);
  return files.some((file) => file.path === remotePath);
}

async function uploadFile(localPath, category, fileName) {
  const remotePath = getRemoteImagePath(category, fileName);
  const fileBuffer = fs.readFileSync(localPath);
  const blob = new Blob([fileBuffer], { type: "image/webp" });
  const form = new FormData();

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

    if (result.result !== "success") {
      console.log("❌ Upload failed:", result);
      return false;
    }

    // verify
    const files = await listRemoteFolder(category);
    return files.some((file) => file.path === remotePath);
  } catch (err) {
    console.error(`❌ [${fileName}] upload failed:`, err);
    return false;
  }
}

async function uploadGalleryJSON(galleryPath) {
  const fileBuffer = fs.readFileSync(galleryPath);
  const blob = new Blob([fileBuffer], { type: "application/json" });
  const form = new FormData();

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

    if (result.result !== "success") {
      console.log("❌ gallery.json upload failed:", result);
      return false;
    }

    return true;
  } catch (err) {
    console.error("❌ gallery.json upload failed:", err);
    return false;
  }
}

// Delete one or more remote files by their full remote paths
// e.g. ["images/figures/figures 021626b.webp"]
async function deleteFiles(remotePaths) {
  if (!remotePaths || remotePaths.length === 0) return true;

  const form = new FormData();
  for (const p of remotePaths) {
    form.append("filenames[]", p);
  }

  try {
    const response = await fetch("https://neocities.org/api/delete", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NEOCITIES_API_KEY}`,
      },
      body: form,
    });

    const result = await response.json();

    if (result.result !== "success") {
      console.error("❌ delete failed:", result);
      return false;
    }

    return true;
  } catch (err) {
    console.error("❌ delete request failed:", err);
    return false;
  }
}

module.exports = {
  listRemoteFolder,
  remoteFileExists,
  uploadFile,
  uploadGalleryJSON,
  deleteFiles,
};
