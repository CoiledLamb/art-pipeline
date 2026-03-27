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
    display: `${Number(mm)}/${Number(dd)}/${yy}`,
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
 */
function extractDateData(fileName, filePath) {
  const digits = fileName
    .replace(/^(figure|figures|hand|hands|general)[\s_-]*/i, "")
    .replace(/\D/g, "");

  if (digits.length === 6) {
    const mm = digits.slice(0, 2);
    const dd = digits.slice(2, 4);
    const yy = digits.slice(4, 6);
    return buildDateParts(mm, dd, yy);
  }

  if (digits.length === 5) {
    const mm = `0${digits.slice(0, 1)}`;
    const dd = digits.slice(1, 3);
    const yy = digits.slice(3, 5);
    return buildDateParts(mm, dd, yy);
  }

  if (digits.length === 4) {
    const candidates = [];

    // Option 1: MDDY -> 3|12|6 => 03/12/26
    {
      const mm = `0${digits.slice(0, 1)}`;
      const dd = digits.slice(1, 3);
      const yy = `2${digits.slice(3, 4)}`;
      const built = buildDateParts(mm, dd, yy);
      if (built) candidates.push(built);
    }

    // Option 2: MDYY -> 3|1|26 => 03/01/26
    {
      const mm = `0${digits.slice(0, 1)}`;
      const dd = `0${digits.slice(1, 2)}`;
      const yy = digits.slice(2, 4);
      const built = buildDateParts(mm, dd, yy);
      if (built) candidates.push(built);
    }

    return chooseClosestCandidate(filePath, candidates);
  }

  return null;
}

function buildFileMetadata(filePath) {
  const baseName = getBaseName(filePath);
  const category = getCategoryFromFilePath(filePath);

  const dateData = extractDateData(baseName, filePath);

  if (!dateData) {
    return null;
  }

  const outputName = `${category} ${dateData.canonical}.webp`;

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
