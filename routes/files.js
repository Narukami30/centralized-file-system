const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const archiver = require("archiver");
const File = require("../models/File");
const ShareLink = require("../models/ShareLink");
const Report = require("../models/Report");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { sendPushToUser } = require("../utils/pushNotify");
const { requireAuth } = require("../middleware/authMiddleware");
const { getGlobalSystemSettings } = require("../utils/systemSettings");
const { pushFlash, isAjaxRequest } = require("../utils/sessionHelpers");
const { categorizeFile } = require("../ai/fileCategorizer");
const logger = require("../utils/logger");

// -------------------- HELPERS --------------------

function sanitizePreviewHtml(html) {
  if (!html || typeof html !== "string") return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[\s\S]*?\/?>/gi, "")
    .replace(/<link[\s\S]*?\/?>/gi, "")
    .replace(/\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript\s*:/gi, "");
}

function sanitizeFilename(filename) {
  const base = path.basename(filename || "file");
  return base.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function computeFileHash(filePath) {
  const buffer = await fs.promises.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function uploadErrorResponse(req, res, message, statusCode = 400) {
  if (isAjaxRequest(req)) {
    return res.status(statusCode).json({ success: false, message });
  }
  pushFlash(req, res, "error", message);
  return res.redirect("/auth/user");
}

function uploadSuccessResponse(req, res, message) {
  if (isAjaxRequest(req)) {
    return res.json({ success: true, message, redirect: "/auth/user?viewReports=true" });
  }
  pushFlash(req, res, "success", message);
  return res.redirect("/auth/user?viewReports=true");
}

// -------------------- MULTER STORAGE --------------------
const UPLOAD_MAX_SIZE = 15 * 1024 * 1024;
const DUPLICATE_UPLOAD_WINDOW_MINUTES = Math.max(
  1,
  Number.parseInt(process.env.UPLOAD_DUPLICATE_WINDOW_MINUTES || "10", 10) || 10
);
const ALLOWED_FILETYPES = ["document", "image", "report"];
const ALLOWED_MIME_BY_TYPE = {
  document: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "text/plain"
  ],
  image: ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"],
  report: ["application/pdf", "text/csv", "text/plain"]
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${sanitizeFilename(file.originalname)}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: UPLOAD_MAX_SIZE }
});


// -------------------- UPLOAD (MULTIPLE FILES) --------------------
router.post("/upload", requireAuth({ mode: "json" }), (req, res) => {
  upload.array("files", 10)(req, res, async (uploadErr) => {
    let { filetype } = req.body;
    const files = req.files || [];

    if (uploadErr) {
      if (uploadErr.code === "LIMIT_FILE_SIZE") {
        return uploadErrorResponse(req, res, "One or more files exceed 15MB upload limit", 413);
      } else if (uploadErr.code === "LIMIT_UNEXPECTED_FILE") {
        return uploadErrorResponse(req, res, "Maximum 10 files per upload", 400);
      } else {
        return uploadErrorResponse(req, res, uploadErr.message || "Upload failed", 400);
      }
    }

    try {
      const user = req.user;
      const systemSettings = await getGlobalSystemSettings();
      const aiSortingEnabled = systemSettings.aiSortingEnabled !== false;

      // AI File Categorization
      let aiDetectedTypes = [];
      if (aiSortingEnabled && files.length > 0) {
        for (const file of files) {
          const detection = categorizeFile({
            originalname: file.originalname,
            mimetype: file.mimetype
          });
          aiDetectedTypes.push({
            filename: file.originalname,
            detected: detection.category,
            confidence: detection.confidence
          });
        }

        const uniqueCategories = [...new Set(aiDetectedTypes.map(d => d.detected))];
        if (!filetype && uniqueCategories.length === 1) {
          const aiCategory = uniqueCategories[0];
          if (ALLOWED_FILETYPES.includes(aiCategory)) {
            filetype = aiCategory;
          }
        } else if (!filetype && uniqueCategories.length > 1) {
          filetype = aiDetectedTypes[0].detected;
          if (!ALLOWED_FILETYPES.includes(filetype)) {
            filetype = "document";
          }
        }
      }

      if (!ALLOWED_FILETYPES.includes(filetype)) {
        files.forEach(f => {
          try { fs.unlinkSync(path.join(__dirname, "../uploads", f.filename)); } catch (_) {}
        });
        return uploadErrorResponse(req, res, "Invalid file category", 400);
      }

      if (!files.length) {
        return uploadErrorResponse(req, res, "No files uploaded", 400);
      }

      const allowedMime = ALLOWED_MIME_BY_TYPE[filetype] || [];
      const invalidFiles = files.filter(f => !allowedMime.includes(f.mimetype));
      if (invalidFiles.length) {
        files.forEach(f => {
          try { fs.unlinkSync(path.join(__dirname, "../uploads", f.filename)); } catch (_) {}
        });
        return uploadErrorResponse(req, res, "One or more files do not match the selected category", 400);
      }

      // --- Storage Quota Enforcement ---
      const totalIncoming = files.reduce((sum, f) => sum + (f.size || 0), 0);
      if (systemSettings.userStorageQuota > 0) {
        const agg = await File.aggregate([
          { $match: { owner: user._id, deleted: { $ne: true } } },
          { $group: { _id: null, total: { $sum: "$sizeBytes" } } }
        ]);
        const currentUsage = agg.length ? agg[0].total : 0;
        if (currentUsage + totalIncoming > systemSettings.userStorageQuota) {
          files.forEach(f => {
            try { fs.unlinkSync(path.join(__dirname, "../uploads", f.filename)); } catch (_) {}
          });
          const usedMB = (currentUsage / (1024 * 1024)).toFixed(1);
          const quotaMB = (systemSettings.userStorageQuota / (1024 * 1024)).toFixed(1);
          return uploadErrorResponse(req, res, `Storage quota exceeded (${usedMB}MB used of ${quotaMB}MB)`, 413);
        }
      }
      if (systemSettings.branchStorageQuota > 0 && user.branch) {
        const branchAgg = await File.aggregate([
          { $match: { branch: user.branch, deleted: { $ne: true } } },
          { $group: { _id: null, total: { $sum: "$sizeBytes" } } }
        ]);
        const branchUsage = branchAgg.length ? branchAgg[0].total : 0;
        if (branchUsage + totalIncoming > systemSettings.branchStorageQuota) {
          files.forEach(f => {
            try { fs.unlinkSync(path.join(__dirname, "../uploads", f.filename)); } catch (_) {}
          });
          return uploadErrorResponse(req, res, "Branch storage quota exceeded", 413);
        }
      }

      const rawTags = (req.body.tags || "").trim();
      const tags = rawTags
        ? rawTags.split(",").map(t => t.trim().toLowerCase()).filter(t => t.length > 0 && t.length <= 50).slice(0, 20)
        : [];

      const duplicateWindowStart = new Date(Date.now() - DUPLICATE_UPLOAD_WINDOW_MINUTES * 60 * 1000);
      let uploadedCount = 0;
      const skippedFiles = [];
      const versionedFiles = [];

      for (const file of files) {
        const uploadedFilePath = path.join(__dirname, "../uploads", file.filename);
        let contentHash = "";
        try {
          contentHash = await computeFileHash(uploadedFilePath);
        } catch (_) {
          contentHash = "";
        }

        // --- File Versioning ---
        const existingFile = await File.findOne({
          owner: user._id,
          originalName: file.originalname,
          deleted: { $ne: true }
        });

        if (existingFile) {
          existingFile.versions.push({
            filename: existingFile.filename,
            sizeBytes: existingFile.sizeBytes,
            contentHash: existingFile.contentHash,
            uploadedAt: existingFile.uploadedAt
          });
          existingFile.filename = file.filename;
          existingFile.sizeBytes = file.size;
          existingFile.mimeType = file.mimetype;
          existingFile.contentHash = contentHash;
          existingFile.filetype = filetype;
          existingFile.uploadedAt = new Date();
          existingFile.version = (existingFile.version || 1) + 1;
          if (tags.length) existingFile.tags = tags;
          await existingFile.save();

          versionedFiles.push(file.originalname);
          uploadedCount++;

          const vReport = new Report({
            filename: file.filename,
            action: `Updated to v${existingFile.version}`,
            user: user.fullname,
            branch: user.branch || "",
            owner: user._id,
            date: new Date(),
            ipAddress: req.ip || "",
            userAgent: (req.headers["user-agent"] || "").slice(0, 300),
            fileSize: file.size || 0
          });
          await vReport.save();
          continue;
        }

        // --- Duplicate Detection ---
        const duplicateQuery = {
          owner: user._id,
          filetype,
          uploadedAt: { $gte: duplicateWindowStart }
        };

        if (contentHash) {
          duplicateQuery.contentHash = contentHash;
        } else {
          duplicateQuery.originalName = file.originalname;
          duplicateQuery.sizeBytes = file.size;
        }

        const recentDuplicate = await File.findOne(duplicateQuery).select("_id filename uploadedAt");

        if (recentDuplicate) {
          try { fs.unlinkSync(uploadedFilePath); } catch (_) {}
          skippedFiles.push(file.originalname);
          continue;
        }

        const newFile = new File({
          filename: file.filename,
          filetype,
          originalName: file.originalname,
          sizeBytes: file.size,
          mimeType: file.mimetype,
          contentHash,
          owner: user._id,
          branch: user.branch || "",
          uploadedAt: new Date(),
          tags
        });
        await newFile.save();

        const newReport = new Report({
          filename: newFile.filename,
          action: "Uploaded",
          user: user.fullname,
          branch: user.branch || "",
          owner: user._id,
          date: new Date(),
          ipAddress: req.ip || "",
          userAgent: (req.headers["user-agent"] || "").slice(0, 300),
          fileSize: newFile.sizeBytes || 0
        });
        await newReport.save();

        if (systemSettings.notificationsEnabled !== false) {
          const newNotification = new Notification({
            message: `File ${newFile.filename} uploaded successfully!`,
            type: "upload",
            owner: user._id,
            relatedFile: newFile._id,
            date: new Date()
          });
          await newNotification.save();
          sendPushToUser(user._id, { title: "File Uploaded", body: `${newFile.filename} uploaded successfully`, tag: "upload" }).catch(() => {});
        }

        uploadedCount++;
      }

      if (uploadedCount === 0 && skippedFiles.length > 0) {
        return uploadErrorResponse(req, res, "All files were duplicates and skipped", 409);
      }

      let message = uploadedCount === 1 ? "File uploaded successfully" : `${uploadedCount} files uploaded successfully`;
      if (versionedFiles.length > 0) {
        message += ` (${versionedFiles.length} file${versionedFiles.length > 1 ? "s" : ""} versioned)`;
      }
      if (skippedFiles.length > 0) {
        message += ` (${skippedFiles.length} duplicate${skippedFiles.length > 1 ? "s" : ""} skipped)`;
      }

      if (isAjaxRequest(req)) {
        return res.json({ success: true, message, uploadedCount });
      }
      pushFlash(req, res, "success", message);
      return res.redirect("/auth/user");
    } catch (err) {
      files.forEach(f => {
        try { fs.unlinkSync(path.join(__dirname, "../uploads", f.filename)); } catch (_) {}
      });
      return uploadErrorResponse(req, res, "Upload failed", 500);
    }
  });
});


// -------------------- FILE DELETE (User) --------------------
router.post("/file/delete/:fileId", requireAuth({ mode: "json" }), async (req, res) => {
  try {
    const { fileId } = req.params;
    const user = req.user;

    const file = await File.findById(fileId);
    if (!file) {
      return res.status(404).json({ success: false, message: "File not found" });
    }

    if (file.owner.toString() !== user._id.toString()) {
      return res.status(403).json({ success: false, message: "You can only delete your own files" });
    }

    file.deleted = true;
    file.deletedAt = new Date();
    await file.save();

    const deleteReport = new Report({
      filename: file.filename,
      action: "Moved to Recycle Bin",
      user: user.fullname,
      branch: user.branch || "",
      owner: user._id,
      date: new Date(),
      ipAddress: req.ip || "",
      userAgent: (req.headers["user-agent"] || "").slice(0, 300),
      fileSize: file.sizeBytes || 0
    });
    await deleteReport.save();

    const systemSettings = await getGlobalSystemSettings();
    if (systemSettings.notificationsEnabled !== false) {
      const notification = new Notification({
        message: `File ${file.filename} moved to recycle bin`,
        type: "delete",
        owner: user._id,
        relatedFile: file._id,
        date: new Date()
      });
      await notification.save();
      sendPushToUser(user._id, { title: "File Deleted", body: `${file.filename} moved to recycle bin`, tag: "delete" }).catch(() => {});
    }

    res.json({ success: true, message: "File moved to recycle bin" });
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});


// -------------------- FILE TAGS --------------------
router.post("/file/tags/:fileId", requireAuth({ mode: "json" }), async (req, res) => {
  try {
    const user = req.user;
    const file = await File.findById(req.params.fileId);
    if (!file) return res.status(404).json({ success: false, message: "File not found" });
    if (file.owner.toString() !== user._id.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const rawTags = (req.body.tags || "").trim();
    file.tags = rawTags ? rawTags.split(",").map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 20) : [];
    await file.save();

    res.json({ success: true, tags: file.tags });
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});


// -------------------- FILE SHARING (with users) --------------------
router.post("/file/share/:fileId", requireAuth({ mode: "json" }), async (req, res) => {
  try {
    const user = req.user;
    const file = await File.findById(req.params.fileId);
    if (!file) return res.status(404).json({ success: false, message: "File not found" });
    if (file.owner.toString() !== user._id.toString()) {
      return res.status(403).json({ success: false, message: "Only the owner can share this file" });
    }

    const { emails } = req.body;
    if (!emails || !Array.isArray(emails) || !emails.length) {
      return res.status(400).json({ success: false, message: "Provide an array of emails" });
    }

    const validEmails = emails.filter(e => typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())).slice(0, 20);
    if (!validEmails.length) {
      return res.status(400).json({ success: false, message: "No valid email addresses provided" });
    }

    const recipients = await User.find({ email: { $in: validEmails }, active: { $ne: false } }).select("_id email");
    const recipientIds = recipients.map(r => r._id.toString());

    const existing = file.sharedWith.map(id => id.toString());
    const merged = [...new Set([...existing, ...recipientIds])];
    file.sharedWith = merged;
    await file.save();

    res.json({ success: true, sharedWith: recipients.map(r => r.email) });
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});


// -------------------- FILE SHARE LINK --------------------
router.post("/file/share-link/:fileId", requireAuth({ mode: "json" }), async (req, res) => {
  try {
    const user = req.user;
    const file = await File.findById(req.params.fileId);
    if (!file) return res.status(404).json({ success: false, message: "File not found" });
    if (file.owner.toString() !== user._id.toString()) {
      return res.status(403).json({ success: false, message: "Only the owner can create share links" });
    }

    const expiresInHours = Math.min(Math.max(Number(req.body.expiresInHours) || 24, 1), 720);
    const maxDownloads = Math.max(Number(req.body.maxDownloads) || 0, 0);

    const token = crypto.randomBytes(32).toString("hex");
    const link = new ShareLink({
      file: file._id,
      token,
      createdBy: user._id,
      expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000),
      maxDownloads
    });
    await link.save();

    const shareUrl = `${req.protocol}://${req.get("host")}/share/${token}`;
    res.json({ success: true, shareUrl, expiresAt: link.expiresAt, maxDownloads });
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});


// -------------------- BULK DELETE --------------------
router.post("/file/bulk-delete", requireAuth({ mode: "json" }), async (req, res) => {
  try {
    const user = req.user;
    const { fileIds } = req.body;
    if (!Array.isArray(fileIds) || !fileIds.length) {
      return res.status(400).json({ success: false, message: "No files selected" });
    }

    const result = await File.updateMany(
      { _id: { $in: fileIds.slice(0, 100) }, owner: user._id, deleted: { $ne: true } },
      { $set: { deleted: true, deletedAt: new Date() } }
    );

    res.json({ success: true, message: `${result.modifiedCount} file(s) moved to recycle bin` });
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});


// -------------------- BULK DOWNLOAD (ZIP) --------------------
router.get("/file/bulk-download", requireAuth({ mode: "json" }), async (req, res) => {
  try {
    const user = req.user;
    const ids = (req.query.ids || "").split(",").filter(Boolean);
    if (!ids.length) return res.status(400).json({ success: false, message: "No files selected" });

    const files = await File.find({
      _id: { $in: ids.slice(0, 50) },
      owner: user._id,
      deleted: { $ne: true }
    });
    if (!files.length) return res.status(404).json({ success: false, message: "No accessible files found" });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", "attachment; filename=files.zip");

    const archive = archiver("zip", { zlib: { level: 5 } });
    archive.on("error", () => res.status(500).end());
    archive.pipe(res);

    for (const f of files) {
      const filePath = path.join(__dirname, "../uploads", f.filename);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: f.originalName || f.filename });
      }
    }
    archive.finalize();
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});


// -------------------- FILE SEARCH --------------------
router.get("/api/search", requireAuth({ mode: "json" }), async (req, res) => {
  try {
    const user = req.user;
    const q = (req.query.q || "").trim();
    const tag = (req.query.tag || "").trim().toLowerCase();
    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;

    const filter = { owner: user._id, deleted: { $ne: true } };

    if (q) {
      filter.$text = { $search: q };
    }
    if (tag) {
      filter.tags = tag;
    }
    if (from || to) {
      filter.uploadedAt = {};
      if (from) filter.uploadedAt.$gte = from;
      if (to) filter.uploadedAt.$lte = to;
    }

    const files = await File.find(filter).sort({ uploadedAt: -1 }).limit(100);
    res.json({ success: true, files });
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});


// -------------------- RECYCLE BIN --------------------
router.get("/recycle-bin", requireAuth({ mode: "json" }), async (req, res) => {
  try {
    const user = req.user;
    const files = await File.find({ owner: user._id, deleted: true }).sort({ deletedAt: -1 });
    res.json({ success: true, files });
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.post("/recycle-bin/restore/:fileId", requireAuth({ mode: "json" }), async (req, res) => {
  try {
    const user = req.user;
    const file = await File.findById(req.params.fileId);
    if (!file) return res.status(404).json({ success: false, message: "File not found" });
    if (file.owner.toString() !== user._id.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    if (!file.deleted) return res.status(400).json({ success: false, message: "File is not in recycle bin" });

    file.deleted = false;
    file.deletedAt = null;
    await file.save();

    res.json({ success: true, message: "File restored" });
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.post("/recycle-bin/purge/:fileId", requireAuth({ mode: "json" }), async (req, res) => {
  try {
    const user = req.user;
    const file = await File.findById(req.params.fileId);
    if (!file) return res.status(404).json({ success: false, message: "File not found" });
    if (file.owner.toString() !== user._id.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    if (!file.deleted) return res.status(400).json({ success: false, message: "File must be in recycle bin first" });

    const allFilenames = [file.filename, ...file.versions.map(v => v.filename)];
    for (const fn of allFilenames) {
      try { fs.unlinkSync(path.join(__dirname, "../uploads", fn)); } catch (_) {}
    }
    await File.findByIdAndDelete(file._id);

    res.json({ success: true, message: "File permanently deleted" });
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});


// -------------------- FILE PREVIEW (DOCX/XLSX) --------------------
router.get("/file/preview/:fileId", requireAuth({ mode: "json" }), async (req, res) => {
  try {
    const user = req.user;
    const file = await File.findById(req.params.fileId);
    if (!file) return res.status(404).json({ success: false, message: "File not found" });

    const isOwner = file.owner.toString() === user._id.toString();
    const isShared = file.sharedWith.some(id => id.toString() === user._id.toString());
    const isAdmin = user.role === "admin" || user.role === "super_admin";
    if (!isOwner && !isShared && !isAdmin) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const filePath = path.join(__dirname, "../uploads", file.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: "Physical file not found" });
    }

    const ext = (file.filename || "").toLowerCase().split(".").pop();

    if (ext === "docx" || ext === "doc") {
      const mammoth = require("mammoth");
      const result = await mammoth.convertToHtml({ path: filePath });
      return res.json({ success: true, type: "docx", html: sanitizePreviewHtml(result.value) });
    }

    if (ext === "xlsx" || ext === "xls" || ext === "csv") {
      const ExcelJS = require("exceljs");
      const workbook = new ExcelJS.Workbook();
      if (ext === "csv") {
        await workbook.csv.readFile(filePath);
      } else {
        await workbook.xlsx.readFile(filePath);
      }
      const sheet = workbook.worksheets[0];
      if (!sheet) {
        return res.json({ success: true, type: "xlsx", html: "<p>Empty spreadsheet</p>" });
      }
      let html = "<table border=\"1\" cellpadding=\"4\" cellspacing=\"0\" style=\"border-collapse:collapse\">";
      sheet.eachRow((row, rowNumber) => {
        html += "<tr>";
        row.eachCell({ includeEmpty: true }, (cell) => {
          const tag = rowNumber === 1 ? "th" : "td";
          const val = cell.text != null ? cell.text : "";
          const escaped = String(val).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          html += `<${tag}>${escaped}</${tag}>`;
        });
        html += "</tr>";
      });
      html += "</table>";
      return res.json({ success: true, type: "xlsx", html: sanitizePreviewHtml(html) });
    }

    return res.status(400).json({ success: false, message: "Preview not supported for this file type" });
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});


// -------------------- FILE VERSION HISTORY --------------------
router.get("/file/versions/:fileId", requireAuth({ mode: "json" }), async (req, res) => {
  try {
    const user = req.user;
    const file = await File.findById(req.params.fileId);
    if (!file) return res.status(404).json({ success: false, message: "File not found" });
    if (file.owner.toString() !== user._id.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    res.json({
      success: true,
      currentVersion: file.version,
      filename: file.originalName,
      versions: file.versions.map(v => ({
        id: v._id,
        filename: v.filename,
        sizeBytes: v.sizeBytes,
        uploadedAt: v.uploadedAt
      }))
    });
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});


// -------------------- STORAGE USAGE --------------------
router.get("/api/storage", requireAuth({ mode: "json" }), async (req, res) => {
  try {
    const user = req.user;
    const agg = await File.aggregate([
      { $match: { owner: user._id, deleted: { $ne: true } } },
      { $group: { _id: null, total: { $sum: "$sizeBytes" }, count: { $sum: 1 } } }
    ]);
    const usage = agg.length ? agg[0] : { total: 0, count: 0 };
    const systemSettings = await getGlobalSystemSettings();

    res.json({
      success: true,
      usedBytes: usage.total,
      fileCount: usage.count,
      quotaBytes: systemSettings.userStorageQuota || 0
    });
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});


module.exports = router;
