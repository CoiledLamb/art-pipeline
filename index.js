const chokidar = require("chokidar");
const fs = require("fs");
const path = require("path");

const config = require("./config");
const { reconcileFile } = require("./process-file");

const mode = process.argv[2] || "watch";

async function runSync() {
  console.log("sync mode");
  console.log(`input dir: ${config.inputDir}`);

  if (!fs.existsSync(config.inputDir)) {
    console.error(`Input directory does not exist: ${config.inputDir}`);
    process.exit(1);
  }

  async function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      // 🚫 skip private folder entirely
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
      // 🚫 skip anything inside /private
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
    await runSync();
    return;
  }

  console.error(`Unknown mode: ${mode}`);
  console.log("Use: node index.js watch");
  console.log("Use: node index.js sync");
  process.exit(1);
}

main().catch((err) => {
  console.error("fatal startup error:", err);
  process.exit(1);
});
