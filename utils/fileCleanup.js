const fs = require("fs");
const path = require("path");
const logger = require("./logger");

/**
 * Safely clean up uploaded files with proper logging
 * @param {Array} files - Array of file objects with .filename property
 * @param {String} context - Context description for logging
 * @returns {Object} { cleaned: Number, failed: Array }
 */
function cleanupUploadFiles(files, context = "upload") {
  if (!Array.isArray(files)) return { cleaned: 0, failed: [] };

  const failed = [];
  let cleaned = 0;

  files.forEach((file) => {
    if (!file || !file.filename) return;
    const filepath = path.join(__dirname, "../uploads", file.filename);
    try {
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
        cleaned++;
      }
    } catch (err) {
      logger.error(`[File Cleanup] Failed to delete ${file.filename}`, {
        context,
        error: err.message,
        filepath,
        code: err.code
      });
      failed.push({
        filename: file.filename,
        error: err.message,
        code: err.code
      });
    }
  });

  return { cleaned, failed };
}

/**
 * Safely delete a single file by path
 * @param {String} filepath - Full path to file
 * @param {String} context - Context description for logging
 * @returns {Object} { success: Boolean, error: String|null }
 */
function deleteFile(filepath, context = "file-operation") {
  try {
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      return { success: true, error: null };
    }
    return { success: false, error: "File does not exist" };
  } catch (err) {
    logger.error(`[File Delete] Failed for ${filepath}`, {
      context,
      error: err.message,
      code: err.code
    });
    return { success: false, error: err.message };
  }
}

module.exports = { cleanupUploadFiles, deleteFile };
