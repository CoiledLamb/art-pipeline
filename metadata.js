const fs = require("fs");
const path = require("path");
const config = require("./config");
const { getCategoryFromFilePath, getBaseName } = require("./paths");

function isSupportedInputFile(filePath) {
  return path.extname(filePath).toLowerCase() === config.inputExtension;
}

function isPrivateCategory(category) {
  return category === config.privateCategory;
}

function isValidCategory(category) {
  return config.validCategories.includes(category);
}

function isValidMonthDay(mm, dd) {
  const month = Number(mm);
  const day = Number(dd);

  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

function buildDateParts(mm, dd, yy) {
  if (!isValidMonthDay(mm, dd)) {
    return null;
  }

  return {
    iso: `20${yy}-${mm}-${dd}`,
    // Use zero-padded strings directly — months 1-9 will show as 01-09,
    // months 10-12 are already two digits and are unaffected
    display: `${mm}/${dd}/${yy}`,
    canonical: `${mm}${dd}${yy}`,
    mm,
    dd,
    yy,
  };
}

function getFileHintDate(filePath) {
  try {
    const stat = fs.statSync(filePath);
    // mtime is usually the least surprising here
    return stat.mtime;
  } catch {
    return null;
  }
}

function candidateDateFromParts(mm, dd, yy) {
  const fullYear = Number(`20${yy}`);
  return new Date(fullYear, Number(mm) - 1, Number(dd));
}

function chooseClosestCandidate(filePath, candidates) {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const hintDate = getFileHintDate(filePath);
  if (!hintDate) {
    return candidates[0];
  }

  let best = candidates[0];
  let bestDistance = Math.abs(
    candidateDateFromParts(best.mm, best.dd, best.yy).getTime() -
      hintDate.getTime(),
  );

  for (let i = 1; i < candidates.length; i++) {
    const candidate = candidates[i];
    const distance = Math.abs(
      candidateDateFromParts(
        candidate.mm,
        candidate.dd,
        candidate.yy,
      ).getTime() - hintDate.getTime(),
    );

    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best;
}

/**
 * Extract and normalize date from filename.
 * Supports:
 * - 6 digits: MMDDYY
 * - 5 digits: MDDYY
 * - 4 digits: ambiguous; try MDDY and MDYY, use file timestamp as tiebreaker
 *
 * Also detects an optional trailing same-day suffix letter (b, c, d...)
 * after the digits, e.g. "figures 21826b.png" → suffix "b"
 */
function extractDateData(fileName, filePath) {
  const stem = fileName
    .replace(/^(figure|figures|hand|hands|general)[\s_-]*/i, "")
    .replace(/\.[^.]+$/, ""); // strip extension

  // Check for a trailing suffix letter (b-z) after the digits
  const suffixMatch = stem.match(/^(\d+)([b-z])$/i);
  const rawDigits = suffixMatch ? suffixMatch[1] : stem.replace(/\D/g, "");
  const suffix = suffixMatch ? suffixMatch[2].toLowerCase() : null;

  let dateData = null;

  if (rawDigits.length === 6) {
    const mm = rawDigits.slice(0, 2);
    const dd = rawDigits.slice(2, 4);
    const yy = rawDigits.slice(4, 6);
    dateData = buildDateParts(mm, dd, yy);
  } else if (rawDigits.length === 5) {
    const mm = `0${rawDigits.slice(0, 1)}`;
    const dd = rawDigits.slice(1, 3);
    const yy = rawDigits.slice(3, 5);
    dateData = buildDateParts(mm, dd, yy);
  } else if (rawDigits.length === 4) {
    const candidates = [];

    // Option 1: MDDY -> 3|12|6 => 03/12/26
    {
      const mm = `0${rawDigits.slice(0, 1)}`;
      const dd = rawDigits.slice(1, 3);
      const yy = `2${rawDigits.slice(3, 4)}`;
      const built = buildDateParts(mm, dd, yy);
      if (built) candidates.push(built);
    }

    // Option 2: MDYY -> 3|1|26 => 03/01/26
    {
      const mm = `0${rawDigits.slice(0, 1)}`;
      const dd = `0${rawDigits.slice(1, 2)}`;
      const yy = rawDigits.slice(2, 4);
      const built = buildDateParts(mm, dd, yy);
      if (built) candidates.push(built);
    }

    dateData = chooseClosestCandidate(filePath, candidates);
  }

  if (!dateData) return null;

  // Attach the suffix so buildFileMetadata can include it in the output name
  return { ...dateData, suffix };
}

function buildFileMetadata(filePath) {
  const baseName = getBaseName(filePath);
  const category = getCategoryFromFilePath(filePath);

  const dateData = extractDateData(baseName, filePath);

  if (!dateData) {
    return null;
  }

  // If the source file has an explicit suffix (e.g. "21826b"), use it directly
  // in the output name. This allows naming same-day files in incoming/ without
  // relying on collision detection.
  const suffixPart = dateData.suffix ? dateData.suffix : "";
  const outputName = `${category} ${dateData.canonical}${suffixPart}.webp`;

  return {
    filePath,
    baseName,
    category,
    outputName,
    dateData,
  };
}

module.exports = {
  isSupportedInputFile,
  isPrivateCategory,
  isValidCategory,
  extractDateData,
  buildFileMetadata,
};
