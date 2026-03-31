const { readGalleryJSON, writeGalleryJSON } = require("./gallery");

function pruneGallery(dryRun = true) {
  const data = readGalleryJSON();
  const report = {};
  const pruned = {};

  for (const [category, entries] of Object.entries(data)) {
    const seen = new Set();
    const removed = [];
    const kept = [];

    for (const entry of entries) {
      // Drop malformed entries (no file field)
      if (!entry || !entry.file) {
        removed.push({ reason: "malformed", entry });
        continue;
      }

      const key = entry.file.toLowerCase();

      // Drop duplicates (keep first occurrence)
      if (seen.has(key)) {
        removed.push({ reason: "duplicate", entry });
        continue;
      }

      seen.add(key);
      kept.push(entry);
    }

    report[category] = { kept: kept.length, removed };
    pruned[category] = kept;
  }

  return { report, pruned, dryRun };
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

  const { report, pruned } = pruneGallery(dryRun);
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
