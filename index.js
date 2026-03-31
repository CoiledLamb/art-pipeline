const chokidar = require("chokidar");
const fs = require("fs");
const path = require("path");

const config = require("./config");
const { reconcileFile } = require("./process-file");
const { runPrune } = require("./prune");

const mode = process.argv[2] || "watch";
const flags = process.argv.slice(3);

function cleanForSync() {
  // Wipe processed/ subdirectories
  for (const category of config.validCategories) {
    const dir = path.join(config.outputDir, category);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`[clean] removed: ${dir}`);
    }
  }

  // Reset gallery.json to empty
  const empty = JSON.stringify({ figures: [], hands: [], general: [] }, null, 2) + "\n";
  fs.writeFileSync(config.galleryJsonPath, empty, "utf8");
  console.log(`[clean] reset: ${config.galleryJsonPath}`);
}

async function runSync(clean = false) {
  if (clean) {
    console.log("\n[clean] wiping processed/ and gallery.json before sync...");
    cleanForSync();
    console.log("[clean] done.\n");
  }

  console.log("sync mode");
  console.log(`input dir: ${config.inputDir}`);

  if (!fs.existsSync(config.inputDir)) {
    console.error(`Input directory does not exist: ${config.inputDir}`);
    process.exit(1);
  }

  async function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      // skip private folder entirely
      if (entry.name.toLowerCase() === "private") {
        continue;
      }

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else {
        await reconcileFile(fullPath);
      }
    }
  }

  await walk(config.inputDir);
}

function runWatch() {
  console.log("watch mode");
  console.log(`input dir: ${config.inputDir}`);

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
      // skip anything inside /private
      if (filePath.toLowerCase().includes(`${path.sep}private${path.sep}`)) {
        return;
      }

      console.log(`detected new file: ${filePath}`);
      await reconcileFile(filePath);
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

  console.error(`Unknown mode: ${mode}`);
  console.log("Use: node index.js watch");
  console.log("Use: node index.js sync");
  console.log("Use: node index.js sync --clean");
  console.log("Use: node index.js prune");
  console.log("Use: node index.js prune --confirm");
  process.exit(1);
}

main().catch((err) => {
  console.error("fatal startup error:", err);
  process.exit(1);
});
