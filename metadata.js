const path = require("path");
const config = require("./config");
const {
  getCategoryFromFilePath,
  getBaseName,
  toOutputFileName,
} = require("./paths");

function isSupportedInputFile(filePath) {
  return path.extname(filePath).toLowerCase() === config.inputExtension;
}

function isPrivateCategory(category) {
  return category === config.privateCategory;
}

function isValidCategory(category) {
  return config.validCategories.includes(category);
}

function extractDateData(fileName) {
  const digits = fileName
    .replace(/^(figures|hands|general)\s/i, "")
    .replace(/\.webp$/i, "");

  let mm;
  let dd;
  let yy;

  if (digits.length === 5) {
    mm = digits.slice(0, 1);
    dd = digits.slice(1, 3);
    yy = digits.slice(3, 5);
  } else if (digits.length === 6) {
    mm = digits.slice(0, 2);
    dd = digits.slice(2, 4);
    yy = digits.slice(4, 6);
  } else {
    return null;
  }

  return {
    iso: `20${yy}-${mm.padStart(2, "0")}-${dd}`,
    display: `${mm}/${dd}/${yy}`,
  };
}

function buildFileMetadata(filePath) {
  const baseName = getBaseName(filePath);
  const category = getCategoryFromFilePath(filePath);
  const outputName = toOutputFileName(baseName);

  return {
    filePath,
    baseName,
    category,
    outputName,
    dateData: extractDateData(outputName),
  };
}

module.exports = {
  isSupportedInputFile,
  isPrivateCategory,
  isValidCategory,
  extractDateData,
  buildFileMetadata,
};
