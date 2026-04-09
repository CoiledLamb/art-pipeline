const { readGalleryJSON, writeGalleryJSON } = require("./gallery");
const { uploadGalleryJSON, listRemoteFolder, deleteFiles } = require("./neocities");
const { getRemoteImagePath, getOutputPath } = require("./paths");
const config = require("./config");
const fs = require("fs");

// Canonical display format is always MM/DD/YY
function isCanonicalDisplay(display) {
  if (!display) return false;
  return /^\d{2}\/\d{2}\/\d{2}$/.test(display);
}

// A suffixed entry is one whose filename ends with a letter before .webp
// e.g. "figures 021826b.webp", "figures 021826c.webp"
// The base would be "figures 021826.webp"
function getSuffixBase(file) {
  if (!file) return null;
  const match = file.match(/^(.+\s\d{6})([b-z])(\.webp)$/i);
  if (!match) return null;
  return `${match[1]}${match[3]}`; // e.g. "figures 021826.webp"
}

function pruneGallery() {
  const data = readGalleryJSON();
  const report = {};
  const pruned = {};

  for (const [category, entries] of Object.entries(data)) {
    const seenFiles = new Set();
    const removed = [];
    const kept = [];

    // Build a set of all canonical base names in this category
    const allFiles = new Set(entries.map((e) => e.file && e.file.toLowerCase()).filter(Boolean));

    for (const entry of entries) {
      if (!entry || !entry.file) {
        removed.push({ reason: "malformed", entry });
        continue;
      }

      const fileKey = entry.file.toLowerCase();

      // Drop exact filename duplicates
      if (seenFiles.has(fileKey)) {
        removed.push({ reason: "duplicate filename", entry });
        continue;
      }

      // Drop non-canonical display entries (ghost entries from pre-parser runs)
      if (!isCanonicalDisplay(entry.display)) {
        removed.push({ reason: `non-canonical display: "${entry.display}"`, entry });
        continue;
      }

      // Drop orphaned suffix entries whose base file doesn't exist in the gallery
      // e.g. "figures 021826b.webp" where "figures 021826.webp" is NOT in the gallery
      // This catches accidental b/c/d entries from double-sync runs
      const base = getSuffixBase(entry.file);
      if (base && !allFiles.has(base.toLowerCase())) {
        removed.push({ reason: `orphaned suffix (base not in gallery): ${base}`, entry });
        continue;
      }

      // Drop suffixed entries whose processed file doesn't exist on disk
      // This catches b/c/d entries that were never actually converted
      if (base) {
        const outputPath = getOutputPath(category, entry.file);
        if (!fs.existsSync(outputPath)) {
          removed.push({ reason: `suffixed entry with no local file`, entry });
          continue;
        }
      }

      seenFiles.add(fileKey);
      kept.push(entry);
    }

    report[category] = { kept: kept.length, removed };
    pruned[category] = kept;
  }

  return { report, pruned };
}

async function findOrphans(pruned) {
  const orphans = [];

  for (const category of config.validCategories) {
    const remoteFiles = await listRemoteFolder(category);
    const galleryFiles = new Set(
      (pruned[category] || []).map((e) => getRemoteImagePath(category, e.file).toLowerCase())
    );

    for (const remote of remoteFiles) {
      if (!remote.is_directory && !galleryFiles.has(remote.path.toLowerCase())) {
        orphans.push({ category, path: remote.path });
      }
    }
  }

  return orphans;
}

function printReport(report) {
  let totalRemoved = 0;

  for (const [category, result] of Object.entries(report)) {
    console.log(`\n[prune] ${category}: ${result.kept} kept, ${result.removed.length} removed`);

    for (const item of result.removed) {
      const label = item.entry?.file ?? "(no file)";
      console.log(`  - [${item.reason}] ${label}`);
    }

    totalRemoved += result.removed.length;
  }

  console.log(`\n[prune] total to remove: ${totalRemoved}`);
  return totalRemoved;
}

async function runPrune(dryRun = true) {
  console.log(`\nprune mode${dryRun ? " (dry-run)" : ""}`);

  const { report, pruned } = pruneGallery();
  const totalRemoved = printReport(report);

  console.log("\n[prune] checking for remote orphans...");
  const orphans = await findOrphans(pruned);

  if (orphans.length > 0) {
    console.log(`\n[prune] orphaned remote files (${orphans.length}):`);
    for (const o of orphans) {
      console.log(`  - [orphan] ${o.path}`);
    }
  } else {
    console.log("[prune] no remote orphans found.");
  }

  if (totalRemoved === 0 && orphans.length === 0) {
    console.log("\n[prune] nothing to do. gallery and remote are clean.");
    return;
  }

  if (dryRun) {
    console.log("\n[prune] dry-run complete. no changes written.");
    console.log("[prune] run with --confirm to apply.");
    return;
  }

  if (totalRemoved > 0) {
    writeGalleryJSON(pruned);
    console.log("\n[prune] gallery.json updated locally.");

    if (!config.safeMode) {
      console.log("[prune] uploading gallery.json to neocities...");
      const ok = await uploadGalleryJSON(config.galleryJsonPath);
      if (ok) {
        console.log("[prune] gallery.json uploaded successfully.");
      } else {
        console.error("[prune] gallery.json upload failed. local file is clean but remote is out of sync.");
      }
    }
  }

  if (orphans.length > 0 && !config.safeMode) {
    console.log("\n[prune] deleting remote orphans...");
    const paths = orphans.map((o) => o.path);
    const ok = await deleteFiles(paths);
    if (ok) {
      console.log(`[prune] deleted ${paths.length} remote file(s).`);
    } else {
      console.error("[prune] remote deletion failed. some orphans may still exist.");
    }
  } else if (orphans.length > 0 && config.safeMode) {
    console.log("[prune] safeMode is on — skipping remote deletion.");
  }
}

module.exports = { runPrune };
