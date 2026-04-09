const path = require("path");
const fs = require("fs");
const config = require("./config");

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getCategoryFromFilePath(filePath) {
  return path.basename(path.dirname(filePath));
}

function getBaseName(filePath) {
  return path.basename(filePath);
}

function toOutputFileName(originalFileName) {
  return `${path.parse(originalFileName).name}${config.outputExtension}`;
}

function getOutputDir(category) {
  return path.join(config.outputDir, category);
}

function getOutputPath(category, outputFileName) {
  return path.join(getOutputDir(category), outputFileName);
}

function getRemoteFolder(category) {
  return `${config.remoteImageRoot}/${category}`;
}

function getRemoteImagePath(category, fileName) {
  return `${getRemoteFolder(category)}/${fileName}`;
}

module.exports = {
  ensureDir,
  getCategoryFromFilePath,
  getBaseName,
  toOutputFileName,
  getOutputDir,
  getOutputPath,
  getRemoteFolder,
  getRemoteImagePath,
};
