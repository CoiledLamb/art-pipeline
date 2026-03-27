const chokidar = require("chokidar");
const config = require("./config");
const { reconcileFile } = require("./process-file");

const mode = process.argv[2] || "watch";

if (mode === "watch") {
  console.log("👀 watch mode");

  chokidar
    .watch(config.inputDir, {
      ignoreInitial: true,
      depth: 2,
    })
    .on("add", (filePath) => {
      reconcileFile(filePath);
    });
}

// basic sync (same as watch but runs once over existing files)
else if (mode === "sync") {
  console.log("🔄 sync mode");

  const fs = require("fs");
  const path = require("path");

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(full);
      } else {
        reconcileFile(full);
      }
    }
  }

  walk(config.inputDir);
} else {
  console.log(`Unknown mode: ${mode}`);
  console.log("Use: watch | sync");
}
