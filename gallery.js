const fs = require("fs");
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

      writeGalleryJSON(parsed);

      console.warn(
        "[warn] gallery.json had invalid trailing commas and was repaired",
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

function normalizeIncomingEntry(entryOrFileName) {
  if (typeof entryOrFileName === "string") {
    const dateData = extractDateData(entryOrFileName);

    return {
      file: entryOrFileName,
      date: dateData ? dateData.iso : null,
      display: dateData ? dateData.display : entryOrFileName,
    };
  }

  if (entryOrFileName && typeof entryOrFileName === "object") {
    return {
      file: entryOrFileName.file ?? null,
      date: entryOrFileName.date ?? null,
      display: entryOrFileName.display ?? entryOrFileName.file ?? null,
    };
  }

  return {
    file: null,
    date: null,
    display: null,
  };
}

function galleryEntryExists(data, category, entryOrFileName) {
  const incoming = normalizeIncomingEntry(entryOrFileName);

  return data[category].some((item) => {
    if (!item) return false;

    // Identity is filename only — date is metadata, not identity.
    // This allows multiple entries on the same date (e.g. same-day collision suffixes).
    if (
      incoming.file &&
      item.file &&
      item.file.toLowerCase() === incoming.file.toLowerCase()
    ) {
      return true;
    }

    return false;
  });
}

function addGalleryEntry(category, entryOrFileName) {
  const data = readGalleryJSON();
  const entry = normalizeIncomingEntry(entryOrFileName);

  if (!entry.file) {
    throw new Error("addGalleryEntry requires a valid file field");
  }

  if (galleryEntryExists(data, category, entry)) {
    return {
      changed: false,
      data,
    };
  }

  data[category].push({
    file: entry.file,
    date: entry.date,
    display: entry.display,
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
