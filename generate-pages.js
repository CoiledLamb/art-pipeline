// generate-pages.js
// Reads gallery.json and emits one art/[slug].html per entry.
// Uploads all generated pages to Neocities under art/.
// Called automatically after sync and watch events, or manually
// via: node index.js pages

const fs = require("fs");
const path = require("path");

const config = require("./config");
const { readGalleryJSON } = require("./gallery");

// Flatten all categories into one sorted-by-date array with category attached.
function flattenGallery(gallery) {
  const all = [];

  for (const category of config.validCategories) {
    const entries = gallery[category] || [];
    for (const entry of entries) {
      if (entry.slug) all.push({ ...entry, category });
    }
  }

  all.sort((a, b) => {
    if (a.date && b.date) return new Date(b.date) - new Date(a.date);
    return a.date ? -1 : 1;
  });

  return all;
}

// Find pieces within ±3 days of the given date, excluding itself.
function findNearby(all, entry, maxResults = 5) {
  if (!entry.date) return [];
  const target = new Date(entry.date).getTime();
  const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;

  return all
    .filter((e) => e.slug !== entry.slug && e.date)
    .map((e) => ({ entry: e, dist: Math.abs(new Date(e.date).getTime() - target) }))
    .filter(({ dist }) => dist <= THREE_DAYS)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, maxResults)
    .map(({ entry: e }) => e);
}

function renderPage(entry, all) {
  const idx = all.findIndex((e) => e.slug === entry.slug);
  const prev = idx < all.length - 1 ? all[idx + 1] : null;
  const next = idx > 0 ? all[idx - 1] : null;
  const nearby = findNearby(all, entry);

  const imgPath = `/images/${entry.category}/${entry.file}`;

  // Use the friendly display date (MM/DD/YY) in the nav counter and date field.
  const displayDate = entry.display || entry.date || "";

  const tags = (entry.tags || [entry.category]).map(
    (t) => `<span class="art-tag">${t}</span>`
  ).join("\n          ");

  const nearbyHtml = nearby.length
    ? nearby.map((n) => `
          <a class="nearby-item" href="${n.slug}.html">
            <div class="nearby-thumb">
              <img src="/images/${n.category}/${n.file}" alt="" loading="lazy">
            </div>
            <div class="nearby-info">
              <div class="nearby-title">${n.title || n.file}</div>
              <div class="nearby-date">${n.display || n.date || ""}</div>
            </div>
          </a>`).join("\n")
    : "<div class=\"nearby-empty\">no nearby pieces</div>";

  const specRows = [
    { key: "tablet", val: "wacom cintiq 16\"" },
    { key: "program", val: "clip studio paint 3.0" },
    { key: "source", val: entry.source || config.defaultSource },
    ...(entry.session ? [{ key: "session", val: entry.session }] : []),
  ].map(
    ({ key, val }) =>
      `<div class="proc-row"><div class="proc-key">${key}</div><div class="proc-val">${val}</div></div>`
  ).join("\n          ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Coiled Lamb \u2014 ${entry.title || entry.file}</title>
  <link rel="icon" type="image/svg+xml" href="../favicon.svg">
  <link rel="stylesheet" href="../boot.css" />
  <link rel="stylesheet" href="../nav.css" />
  <style>
    html, body { margin:0; background:#155352; color:#b1c9c3; font-family:'Source Code Pro',monospace; min-height:100vh; }
    #site { opacity:0; transition:opacity 0.7s ease; }
    #site.visible { opacity:1; }
    .art-page { padding:28px 32px 60px; box-sizing:border-box; }

    .breadcrumb { font-size:11px; color:#3a6a68; letter-spacing:0.06em; margin-bottom:16px; text-transform:lowercase; }
    .breadcrumb a { color:#7aa8a6; text-decoration:none; }
    .breadcrumb a:hover { color:#e0eeec; }
    .breadcrumb-sep { margin:0 5px; }

    .piece-nav { display:flex; align-items:center; justify-content:space-between; margin-bottom:18px; }
    .piece-nav-btn {
      background:rgba(255,255,255,0.06); border:1px solid #1e5554; color:#b1c9c3;
      font-family:'Source Code Pro',monospace; font-size:13px; padding:3px 12px;
      cursor:pointer; border-radius:2px; text-decoration:none; text-transform:lowercase;
      transition:background 0.12s, border-color 0.12s;
    }
    .piece-nav-btn:hover { background:rgba(255,255,255,0.11); border-color:#40a4b9; }
    .piece-nav-btn.disabled { opacity:0.25; pointer-events:none; }
    .piece-nav-counter { font-size:10px; color:#3a6a68; letter-spacing:0.06em; }

    .piece-body { display:grid; grid-template-columns:1fr 220px; gap:20px; align-items:start; }

    .piece-img-wrap {
      background:rgba(11,46,45,0.55); border:1px solid #1e5554; border-radius:2px;
      overflow:hidden; margin-bottom:14px;
    }
    .piece-img-wrap img { display:block; width:100%; height:auto; }
    .piece-img-note { font-size:10px; color:#3a6a68; text-align:center; margin-top:6px; letter-spacing:0.04em; }

    .piece-title { font-size:clamp(1.1rem,2vw,1.6rem); color:#e0eeec; text-transform:lowercase; margin:0 0 4px; font-weight:600; }
    .piece-date { font-size:11px; color:#3a6a68; letter-spacing:0.06em; margin-bottom:10px; }
    .piece-tags { display:flex; gap:5px; flex-wrap:wrap; margin-bottom:12px; }
    .art-tag { font-size:10px; color:#7aa8a6; border:1px solid #1e5554; border-radius:2px; padding:1px 7px; text-transform:lowercase; }
    .cal-backlink {
      display:inline-block; font-size:11px; color:#77bfcf; text-decoration:none;
      border:1px solid #1e5554; border-radius:2px; padding:2px 8px;
      transition:border-color 0.12s, color 0.12s;
    }
    .cal-backlink:hover { border-color:#40a4b9; color:#e0eeec; }

    .piece-sidebar { display:flex; flex-direction:column; gap:14px; }
    .glass { background:rgba(11,46,45,0.55); border:1px solid #1e5554; border-radius:2px; }
    .sidebar-panel { padding:13px 14px; }
    .section-label { font-size:10px; text-transform:uppercase; letter-spacing:0.12em; color:#3a6a68; margin:0 0 10px; }
    .proc-row { margin-bottom:8px; }
    .proc-key { font-size:9px; text-transform:uppercase; letter-spacing:0.08em; color:#3a6a68; margin-bottom:1px; }
    .proc-val { font-size:11px; color:#b1c9c3; text-transform:lowercase; }

    .nearby-item {
      display:flex; gap:8px; align-items:flex-start; padding:5px;
      border-radius:2px; text-decoration:none; transition:background 0.1s;
      margin-bottom:6px;
    }
    .nearby-item:hover { background:rgba(255,255,255,0.05); }
    .nearby-thumb {
      width:36px; height:36px; flex-shrink:0; overflow:hidden;
      border:1px solid #1e5554; border-radius:1px; background:rgba(255,255,255,0.04);
    }
    .nearby-thumb img { width:100%; height:100%; object-fit:cover; display:block; }
    .nearby-info { flex:1; min-width:0; }
    .nearby-title { font-size:10px; color:#b1c9c3; text-transform:lowercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .nearby-date { font-size:9px; color:#3a6a68; }
    .nearby-empty { font-size:10px; color:#3a6a68; }

    @media(max-width:640px) { .piece-body { grid-template-columns:1fr; } .art-page { padding:16px 14px 40px; } }
  </style>
</head>
<body>
  <div id="scanlines"></div>
  <div id="boot">
    <div id="boot-ascii"></div>
    <div id="boot-terminal"></div>
    <div id="boot-welcome"></div>
    <span class="boot-skip" onclick="dismissBoot()">[ press any key to skip ]</span>
  </div>

  <div id="site">
    <script>window.NAV_ACTIVE = 'artwork';</script>
    <script src="../nav.js?v=2"></script>

    <div class="art-page">
      <div class="breadcrumb">
        <a href="../artwork-calendar.html">artwork</a>
        <span class="breadcrumb-sep">\u203a</span>
        <a href="../artwork-calendar.html?filter=${entry.category}">${entry.category}</a>
        <span class="breadcrumb-sep">\u203a</span>
        <span>${entry.title || entry.file}</span>
      </div>

      <div class="piece-nav">
        <a class="piece-nav-btn${prev ? "" : " disabled"}" href="${prev ? prev.slug + ".html" : "#"}">
          \u2039 prev
        </a>
        <span class="piece-nav-counter">${displayDate}</span>
        <a class="piece-nav-btn${next ? "" : " disabled"}" href="${next ? next.slug + ".html" : "#"}">
          next \u203a
        </a>
      </div>

      <div class="piece-body">
        <div>
          <div class="piece-img-wrap">
            <img src="${imgPath}" alt="${entry.title || entry.file}">
          </div>
          <div class="piece-img-note">${entry.file}</div>

          <h1 class="piece-title">${entry.title || entry.file}</h1>
          <div class="piece-date">${displayDate}</div>
          <div class="piece-tags">
          ${tags}
          </div>
          <a class="cal-backlink" href="../artwork-calendar.html">\u2190 calendar</a>
        </div>

        <div class="piece-sidebar">
          <div class="glass sidebar-panel">
            <p class="section-label">process</p>
            ${specRows}
          </div>
          <div class="glass sidebar-panel">
            <p class="section-label">nearby</p>
            ${nearbyHtml}
          </div>
        </div>
      </div>
    </div>
  </div>

  <script src="../boot.js"></script>
  <script>
    document.addEventListener('keydown', function(e) {
      if (document.getElementById('boot').style.display !== 'none') dismissBoot();
    });
    startBoot();
  </script>
</body>
</html>
`;
}

async function generateAllPages() {
  const gallery = readGalleryJSON();
  const all = flattenGallery(gallery);

  if (all.length === 0) {
    console.log("[pages] no entries with slugs found, skipping.");
    return;
  }

  // Write pages to local site dir for preview.
  const siteArtDir = config.siteDir ? path.join(config.siteDir, "art") : null;
  if (siteArtDir && fs.existsSync(config.siteDir)) {
    fs.mkdirSync(siteArtDir, { recursive: true });
  }

  let generated = 0;
  let uploaded = 0;

  for (const entry of all) {
    const html = renderPage(entry, all);
    const fileName = `${entry.slug}.html`;
    const remotePath = `art/${fileName}`;

    // Write to local site dir.
    if (siteArtDir && fs.existsSync(config.siteDir)) {
      fs.writeFileSync(path.join(siteArtDir, fileName), html, "utf8");
    }

    // Upload to Neocities.
    if (!config.safeMode) {
      try {
        const blob = Buffer.from(html, "utf8");
        const form = new FormData();
        form.append(remotePath, new Blob([blob], { type: "text/html" }), fileName);

        const response = await fetch("https://neocities.org/api/upload", {
          method: "POST",
          headers: { Authorization: `Bearer ${config.neocitiesApiKey}` },
          body: form,
        });
        const result = await response.json();

        if (result.result === "success") {
          uploaded++;
        } else {
          console.error(`[pages] upload failed for ${fileName}:`, result);
        }
      } catch (err) {
        console.error(`[pages] upload error for ${fileName}:`, err.message);
      }
    }

    generated++;
  }

  console.log(`[pages] generated: ${generated}, uploaded: ${uploaded} (safeMode: ${config.safeMode})`);
}

module.exports = { generateAllPages };
