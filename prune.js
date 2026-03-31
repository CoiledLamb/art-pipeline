const { readGalleryJSON, writeGalleryJSON } = require("./gallery");

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
      // This catches ghost entries from pre-parser runs (e.g. "3/2/26", "figures 3226.webp")
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

  if (totalRemoved === 0) {
    console.log("[prune] nothing to remove. gallery is clean.");
    return;
  }

  if (dryRun) {
    console.log("\n[prune] dry-run complete. no changes written.");
    console.log("[prune] run with --confirm to apply.");
    return;
  }

  writeGalleryJSON(pruned);
  console.log("\n[prune] gallery.json updated.");
}

module.exports = { runPrune };
