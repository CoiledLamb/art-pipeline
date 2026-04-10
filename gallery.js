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

// Mirror gallery.json into the local site folder so the preview server
// and artwork-calendar.html can fetch it without a Neocities deploy.
// Silently skips if siteGalleryJsonPath is not configured or the
// directory doesn't exist (e.g. CI environments).
function mirrorToSiteDir(jsonText) {
  if (!config.siteGalleryJsonPath) return;

  try {
    const siteDir = config.siteDir;
    if (!fs.existsSync(siteDir)) return;
    fs.writeFileSync(config.siteGalleryJsonPath, jsonText, "utf8");
  } catch (err) {
    console.warn("[warn] could not mirror gallery.json to site dir:", err.message);
  }
}

function writeGalleryJSON(data) {
  const normalized = normalizeGalleryShape(data);
  const jsonText = `${JSON.stringify(normalized, null, 2)}\n`;
  const tempPath = `${config.galleryJsonPath}.tmp`;

  fs.writeFileSync(tempPath, jsonText, "utf8");
  fs.renameSync(tempPath, config.galleryJsonPath);

  mirrorToSiteDir(jsonText);
}

// Derive the display title from parsed date data and category.
// e.g. category="figures", display="04/07/26" -> "04/07/26 \u2014 figures"
function buildTitle(category, dateData) {
  if (!dateData) return category;
  return `${dateData.display} \u2014 ${category}`;
}

// Derive a URL-safe slug from category and canonical date string.
// e.g. category="figures", canonical="040726" -> "figures-040726"
// Same-day suffix is preserved: canonical="040726b" -> "figures-040726b"
function buildSlug(category, dateData) {
  if (!dateData) return category;
  const suffix = dateData.suffix || "";
  return `${category}-${dateData.canonical}${suffix}`;
}

// Build the full set of derived metadata fields for a new entry.
// Any fields already present on an incoming object are preserved
// (allows manual overrides via future tooling).
function buildEntryMeta(category, dateData, overrides = {}) {
  const useSession = config.sessionCategories.includes(category);

  return {
    slug: overrides.slug ?? buildSlug(category, dateData),
    title: overrides.title ?? buildTitle(category, dateData),
    tags: overrides.tags ?? [category],
    source: overrides.source ?? config.defaultSource,
    session: overrides.session !== undefined
      ? overrides.session
      : (useSession ? config.defaultSession : null),
  };
}

function normalizeIncomingEntry(entryOrFileName, category) {
  if (typeof entryOrFileName === "string") {
    const dateData = extractDateData(entryOrFileName);
    const meta = buildEntryMeta(category || "general", dateData);

    return {
      file: entryOrFileName,
      date: dateData ? dateData.iso : null,
      display: dateData ? dateData.display : entryOrFileName,
      ...meta,
    };
  }

  if (entryOrFileName && typeof entryOrFileName === "object") {
    const dateData = extractDateData(entryOrFileName.file || "");
    const meta = buildEntryMeta(category || "general", dateData, entryOrFileName);

    return {
      file: entryOrFileName.file ?? null,
      date: entryOrFileName.date ?? (dateData ? dateData.iso : null),
      display: entryOrFileName.display ?? (dateData ? dateData.display : entryOrFileName.file) ?? null,
      ...meta,
    };
  }

  return {
    file: null,
    date: null,
    display: null,
    slug: null,
    title: null,
    tags: [],
    source: config.defaultSource,
    session: null,
  };
}

function galleryEntryExists(data, category, entryOrFileName) {
  const incoming = normalizeIncomingEntry(entryOrFileName, category);

  return data[category].some((item) => {
    if (!item) return false;

    // Identity is filename only.
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
  const entry = normalizeIncomingEntry(entryOrFileName, category);

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
    slug: entry.slug,
    title: entry.title,
    tags: entry.tags,
    source: entry.source,
    session: entry.session,
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
  buildEntryMeta,
  buildSlug,
  buildTitle,
  galleryEntryExists,
  addGalleryEntry,
};
