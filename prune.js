const { readGalleryJSON, writeGalleryJSON } = require("./gallery");
const { extractDateData } = require("./metadata");

// Canonical filename format is always: "category MMDDYY.webp" (6-digit, zero-padded)
function isCanonicalFilename(file) {
  if (!file) return false;
  // Match: word(s) + space + exactly 6 digits + .webp
  return /^.+\s\d{6}\.webp$/.test(file);
}

function pruneGallery() {
  const data = readGalleryJSON();
  const report = {};
  const pruned = {};

  for (const [category, entries] of Object.entries(data)) {
    const seenDates = new Map(); // iso date -> index in kept[]
    const seenFiles = new Set(); // canonical filenames already kept
    const removed = [];
    const kept = [];

    for (const entry of entries) {
      // Drop malformed entries (no file field)
      if (!entry || !entry.file) {
        removed.push({ reason: "malformed", entry });
        continue;
      }

      const fileKey = entry.file.toLowerCase();
      const canonical = isCanonicalFilename(entry.file);

      // Exact filename duplicate
      if (seenFiles.has(fileKey)) {
        removed.push({ reason: "duplicate filename", entry });
        continue;
      }

      // If this entry has a date, check for date conflicts
      if (entry.date) {
        if (seenDates.has(entry.date)) {
          const existingIdx = seenDates.get(entry.date);
          const existing = kept[existingIdx];
          const existingCanonical = isCanonicalFilename(existing.file);

          if (canonical && !existingCanonical) {
            // This entry is canonical, existing is not — swap them
            removed.push({ reason: "non-canonical duplicate date", entry: existing });
            kept[existingIdx] = entry;
            seenFiles.delete(existing.file.toLowerCase());
            seenFiles.add(fileKey);
          } else {
            // Existing is canonical (or both are) — drop this one
            removed.push({ reason: "duplicate date", entry });
          }
          continue;
        }

        seenDates.set(entry.date, kept.length);
      } else if (!canonical) {
        // Null date AND non-canonical filename — definitely junk
        removed.push({ reason: "null date, non-canonical", entry });
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
