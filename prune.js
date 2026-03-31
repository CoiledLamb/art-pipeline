const { readGalleryJSON, writeGalleryJSON } = require("./gallery");
const { uploadGalleryJSON, listRemoteFolder, deleteFiles } = require("./neocities");
const { getRemoteImagePath } = require("./paths");
const config = require("./config");

// Canonical display format is always MM/DD/YY — two digit month, two digit day, two digit year
function isCanonicalDisplay(display) {
  if (!display) return false;
  return /^\d{2}\/\d{2}\/\d{2}$/.test(display);
}

function pruneGallery() {
  const data = readGalleryJSON();
  const report = {};
  const pruned = {};

  for (const [category, entries] of Object.entries(data)) {
    const seenFiles = new Set();
    const removed = [];
    const kept = [];

    for (const entry of entries) {
      // Drop malformed entries (no file field)
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

      // Drop entries whose display field is not canonical MM/DD/YY
      if (!isCanonicalDisplay(entry.display)) {
        removed.push({ reason: `non-canonical display: "${entry.display}"`, entry });
        continue;
      }

      seenFiles.add(fileKey);
      kept.push(entry);
    }

    report[category] = { kept: kept.length, removed };
    pruned[category] = kept;
  }

  return { report, pruned };
}

// Find remote files that are not referenced in the clean gallery
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

  // Check for remote orphans
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

  // Apply gallery cleanup
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

  // Delete remote orphans
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
