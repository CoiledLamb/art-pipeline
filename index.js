const chokidar = require("chokidar");
const fs = require("fs");
const path = require("path");

const config = require("./config");
const { reconcileFile } = require("./process-file");
const { runPrune } = require("./prune");
const { readGalleryJSON, writeGalleryJSON, buildEntryMeta } = require("./gallery");
const { listRemoteFolder, uploadGalleryJSON } = require("./neocities");
const { extractDateData } = require("./metadata");
const { generateAllPages } = require("./generate-pages");

const mode = process.argv[2] || "watch";
const flags = process.argv.slice(3);

// Canonical filename format: "category MMDDYY.webp" or "category MMDDYYb.webp" etc.
function isCanonicalRemoteFile(fileName) {
  return /^.+\s\d{6}[a-z]?\.webp$/i.test(fileName);
}

function cleanProcessed() {
  for (const category of config.validCategories) {
    const dir = path.join(config.outputDir, category);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`[clean] removed: ${dir}`);
    }
  }
}

// Rebuild gallery.json from remote Neocities file listing.
// Populates all metadata fields (slug, title, tags, source, session)
// using the same parser and config defaults as new entries.
async function rebuildGalleryFromRemote() {
  console.log("[clean] rebuilding gallery.json from remote state...");

  const gallery = {};
  let total = 0;
  let skipped = 0;

  for (const category of config.validCategories) {
    const remoteFiles = await listRemoteFolder(category);
    gallery[category] = [];

    for (const f of remoteFiles) {
      if (f.is_directory || !f.path.endsWith(".webp")) continue;

      const fileName = path.basename(f.path);

      if (!isCanonicalRemoteFile(fileName)) {
        console.log(`[clean] skipping non-canonical remote file: ${fileName}`);
        skipped++;
        continue;
      }

      const dateData = extractDateData(fileName);
      const meta = buildEntryMeta(category, dateData);

      gallery[category].push({
        file: fileName,
        date: dateData ? dateData.iso : null,
        display: dateData ? dateData.display : fileName,
        ...meta,
      });

      total++;
    }
  }

  writeGalleryJSON(gallery);
  console.log(`[clean] gallery.json rebuilt: ${total} entries, ${skipped} non-canonical skipped.`);

  if (!config.safeMode) {
    console.log("[clean] uploading rebuilt gallery.json to neocities...");
    const ok = await uploadGalleryJSON(config.galleryJsonPath);
    if (ok) {
      console.log("[clean] gallery.json uploaded successfully.");
    } else {
      console.error("[clean] gallery.json upload failed — local is correct but remote may be stale.");
    }
  }
}

function buildTakenNames() {
  const gallery = readGalleryJSON();
  const takenNames = new Map();

  for (const [category, entries] of Object.entries(gallery)) {
    const taken = new Set(entries.map((e) => e.file && e.file.toLowerCase()).filter(Boolean));
    takenNames.set(category, taken);
  }

  return takenNames;
}

async function runSync(clean = false) {
  if (clean) {
    console.log("\n[clean] wiping processed/ and rebuilding gallery from remote...");
    cleanProcessed();
    await rebuildGalleryFromRemote();
    console.log("[clean] done.\n");
  }

  console.log("sync mode");
  console.log(`input dir: ${config.inputDir}`);

  if (!fs.existsSync(config.inputDir)) {
    console.error(`Input directory does not exist: ${config.inputDir}`);
    process.exit(1);
  }

  const takenNames = buildTakenNames();

  async function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.toLowerCase() === "private") {
        continue;
      }

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else {
        await reconcileFile(fullPath, takenNames);
      }
    }
  }

  await walk(config.inputDir);

  // Generate and upload individual drawing pages after every sync.
  console.log("\n[pages] generating drawing pages...");
  await generateAllPages();
}

function runWatch() {
  console.log("watch mode");
  console.log(`input dir: ${config.inputDir}`);

  const takenNames = buildTakenNames();

  chokidar
    .watch(config.inputDir, {
      ignoreInitial: true,
      depth: 2,
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 100,
      },
    })
    .on("add", async (filePath) => {
      if (filePath.toLowerCase().includes(`${path.sep}private${path.sep}`)) {
        return;
      }

      console.log(`detected new file: ${filePath}`);
      await reconcileFile(filePath, takenNames);

      // Regenerate pages whenever a new file is added in watch mode.
      console.log("\n[pages] generating drawing pages...");
      await generateAllPages();
    })
    .on("error", (err) => {
      console.error("watcher error:", err);
    });
}

async function main() {
  if (mode === "watch") {
    runWatch();
    return;
  }

  if (mode === "sync") {
    const clean = flags.includes("--clean");
    await runSync(clean);
    return;
  }

  if (mode === "prune") {
    const dryRun = !flags.includes("--confirm");
    await runPrune(dryRun);
    return;
  }

  if (mode === "pages") {
    // Standalone: node index.js pages
    // Useful for regenerating all pages without a full sync.
    console.log("[pages] generating drawing pages...");
    await generateAllPages();
    return;
  }

  console.error(`Unknown mode: ${mode}`);
  console.log("Use: node index.js watch");
  console.log("Use: node index.js sync         (incremental)");
  console.log("Use: node index.js sync --clean (wipes processed/, rebuilds from remote)");
  console.log("Use: node index.js pages        (regenerate drawing pages only)");
  console.log("Use: node index.js prune");
  console.log("Use: node index.js prune --confirm");
  process.exit(1);
}

main().catch((err) => {
  console.error("fatal startup error:", err);
  process.exit(1);
});
