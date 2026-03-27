# Art Pipeline

A small Node-based pipeline for processing finished artwork for a Neocities site.

The goal is simple:

- drop PNGs into categorized incoming folders
- automatically convert them to WebP
- upload them to the live site
- update `gallery.json`
- keep the website gallery in sync with new work

This repo exists mainly so future agents and collaborators can quickly understand the workflow and help maintain or improve it.

---

## What this project does

The pipeline watches an `incoming/` folder and reacts when new PNG files are added.

For supported categories, it:

1. detects the new file
2. converts it to `.webp`
3. uploads it to the correct live folder on Neocities
4. updates the local `gallery.json`
5. uploads the updated `gallery.json`

Current site image structure is:

- `images/figures/`
- `images/hands/`
- `images/general/`

Local processed output is stored separately in:

- `processed/figures/`
- `processed/hands/`
- `processed/general/`

---

## Supported categories

The pipeline currently supports these incoming subfolders:

- `figures`
- `hands`
- `general`

There is also a `private` folder convention for files that should not be uploaded.

Any unknown category is skipped.

---

## Expected folder structure

```text
art-pipeline/
  incoming/
    figures/
    hands/
    general/
    private/
  processed/
    figures/
    hands/
    general/
  gallery.json
  pipeline.js
  package.json
  README.md
```
