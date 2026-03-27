const fs = require("fs");
const path = require("path");
const config = require("./config");
const { extractDateData } = require("./metadata");

function createEmptyGallery() {
  return {
    figures: [],
    hands: [],
    general: [],
  };
}

function normalizeGalleryShape(data) {
  const normalized = createEmptyGallery();

  for (const key of config.validCategories) {
    if (Array.isArray(data?.[key])) {
      normalized[key] = data[key];
    }
  }

  return normalized;
}

function tryParseGallery(text) {
  return JSON.parse(text);
}

function stripTrailingCommas(text) {
  return text.replace(/,\s*([\]}])/g, "$1");
}

function readGalleryJSON() {
  if (!fs.existsSync(config.galleryJsonPath)) {
    return createEmptyGallery();
  }

  const raw = fs.readFileSync(config.galleryJsonPath, "utf8");

  try {
    return normalizeGalleryShape(tryParseGallery(raw));
  } catch (initialErr) {
    try {
      const repaired = stripTrailingCommas(raw);
      const parsed = tryParseGallery(repaired);

      // Persist the repaired version so future runs are clean.
      writeGalleryJSON(parsed);

      console.warn(
        "⚠️ gallery.json had invalid trailing commas and was repaired",
      );
      return normalizeGalleryShape(parsed);
    } catch (repairErr) {
      const err = new Error(
        `Failed to parse gallery.json: ${initialErr.message}`,
      );
      err.cause = repairErr;
      throw err;
    }
  }
}

function writeGalleryJSON(data) {
  const normalized = normalizeGalleryShape(data);
  const tempPath = `${config.galleryJsonPath}.tmp`;

  fs.writeFileSync(
    tempPath,
    `${JSON.stringify(normalized, null, 2)}\n`,
    "utf8",
  );
  fs.renameSync(tempPath, config.galleryJsonPath);
}

function galleryEntryExists(data, category, fileName) {
  return data[category].some(
    (item) => item?.file && item.file.toLowerCase() === fileName.toLowerCase(),
  );
}

function addGalleryEntry(category, fileName) {
  const data = readGalleryJSON();

  if (galleryEntryExists(data, category, fileName)) {
    return {
      changed: false,
      data,
    };
  }

  const dateData = extractDateData(fileName);

  data[category].push({
    file: fileName,
    date: dateData ? dateData.iso : null,
    display: dateData ? dateData.display : fileName,
  });

  writeGalleryJSON(data);

  return {
    changed: true,
    data,
  };
}

module.exports = {
  createEmptyGallery,
  normalizeGalleryShape,
  readGalleryJSON,
  writeGalleryJSON,
  galleryEntryExists,
  addGalleryEntry,
};
