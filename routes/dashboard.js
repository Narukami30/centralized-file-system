const express = require("express");
const router = express.Router();
const User = require("../models/User");
const File = require("../models/File");
const Report = require("../models/Report");
const { requireAuth } = require("../middleware/authMiddleware");
const { requireActive } = require("../middleware/roleMiddleware");
const BRANCH_OPTIONS = require("../config/branches");
const { getGlobalSystemSettings } = require("../utils/systemSettings");
const { pushFlash } = require("../utils/sessionHelpers");

// -------------------- ADMIN DASHBOARD --------------------
router.get("/admin", requireAuth({ mode: "redirect", message: "Unauthorized" }), requireActive({ mode: "redirect" }), async (req, res) => {
  try {
    const admin = req.user;
    if (admin.role !== "admin" && admin.role !== "super_admin") {
      pushFlash(req, res, "error", "Unauthorized");
      return res.redirect("/auth/login");
    }

    const flash = req.consumeFlash ? req.consumeFlash() : null;
    const systemSettings = await getGlobalSystemSettings();

    const isSuperAdmin = admin.role === "super_admin";
    const branchFilter = isSuperAdmin ? { deleted: { $ne: true } } : { branch: admin.branch || "", deleted: { $ne: true } };

    const totalFiles = await File.countDocuments(branchFilter);
    const totalUsers = await User.countDocuments({ role: "user", ...(isSuperAdmin ? {} : { branch: admin.branch || "" }) });
    const activeAdmins = await User.countDocuments(
      isSuperAdmin
        ? { role: { $in: ["admin", "super_admin"] } }
        : { role: "admin", branch: admin.branch || "", active: { $ne: false } }
    );
    const recentUploads = await File.countDocuments({
      ...branchFilter,
      uploadedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    });
    const allFiles = await File.find(branchFilter).populate("owner", "fullname email branch").sort({ uploadedAt: -1 });
    const allUsers = await User.find(isSuperAdmin ? {} : { role: "user", branch: admin.branch || "" }).select("_id fullname email role branch active status avatar createdAt");
    const auditLogs = await Report.find(isSuperAdmin ? {} : { owner: admin._id }).sort({ date: -1 }).limit(10);

    res.render("admindashboard", {
      email: admin.email,
      fullname: admin.fullname,
      role: admin.role,
      avatar: admin.avatar || "",
      stats: {
        totalFiles,
        totalUsers,
        activeAdmins,
        recentUploads
      },
      files: allFiles,
      users: allUsers,
      systemSettings,
      auditLogs,
      success: flash && flash.type === "success" ? flash.message : null,
      error: flash && flash.type === "error" ? flash.message : null
    });
  } catch (err) {
    pushFlash(req, res, "error", "Unable to load admin dashboard");
    res.redirect("/auth/login");
  }
});

// -------------------- ADMIN USER UPLOADS --------------------
router.get("/admin-user-uploads", requireAuth({ mode: "redirect", message: "Unauthorized" }), requireActive({ mode: "redirect" }), async (req, res) => {
  try {
    const admin = req.user;
    if (admin.role !== "admin" && admin.role !== "super_admin") {
      pushFlash(req, res, "error", "Unauthorized");
      return res.redirect("/auth/login");
    }

    const flash = req.consumeFlash ? req.consumeFlash() : null;

    const userQuery = admin.role === "super_admin"
      ? { role: "user" }
      : { role: "user", branch: admin.branch || "" };
    const userIds = (await User.find(userQuery).select("_id")).map(u => u._id);
    const userFiles = await File.find({ owner: { $in: userIds } })
      .populate("owner", "fullname email role branch")
      .sort({ uploadedAt: -1 });

    res.render("adminUserUploads", {
      email: admin.email,
      fullname: admin.fullname,
      role: admin.role,
      files: userFiles,
      success: flash && flash.type === "success" ? flash.message : null,
      error: flash && flash.type === "error" ? flash.message : null
    });
  } catch (err) {
    if (req.setFlash) req.setFlash("error", "Unable to load user uploads page");
    res.redirect("/auth/admin");
  }
});

// -------------------- SUPER ADMIN DASHBOARD --------------------
router.get("/super", requireAuth({ mode: "redirect", message: "Unauthorized" }), requireActive({ mode: "redirect" }), async (req, res) => {
  try {
    const superAdmin = req.user;
    if (superAdmin.role !== "super_admin") {
      pushFlash(req, res, "error", "Unauthorized");
      return res.redirect("/auth/login");
    }

    const flash = req.consumeFlash ? req.consumeFlash() : null;
    const systemSettings = await getGlobalSystemSettings();

    const totalFiles = await File.countDocuments();
    const totalUsers = await User.countDocuments({ role: "user" });
    const totalAdmins = await User.countDocuments({ role: "admin" });
    const activeAdminAccounts = await User.countDocuments({ role: "admin", active: { $ne: false } });
    const activeUserAccounts = await User.countDocuments({ role: "user", active: { $ne: false } });
    const systemActions = await Report.countDocuments();

    const allFiles = await File.find().populate("owner", "fullname email branch").sort({ uploadedAt: -1 }).limit(10);
    const allUsers = await User.find().select("_id fullname email role branch active status avatar createdAt").sort({ _id: -1 });
    const allAdmins = await User.find({ role: "admin" }).select("_id fullname email role branch active status avatar createdAt");
    const auditLogs = await Report.find().sort({ date: -1 }).limit(20);
    const activeBranchAdmins = await User.find({ role: "admin", active: { $ne: false } }).select("email branch");
    const branchAdminLookup = new Map();
    activeBranchAdmins.forEach((admin) => {
      if (admin.branch && !branchAdminLookup.has(admin.branch)) {
        branchAdminLookup.set(admin.branch, admin.email);
      }
    });
    const branchAdminAssignments = BRANCH_OPTIONS.map((branchName) => ({
      branch: branchName,
      adminEmail: branchAdminLookup.get(branchName) || ""
    }));

    res.render("superadmindashboard", {
      email: superAdmin.email,
      fullname: superAdmin.fullname,
      role: superAdmin.role,
      avatar: superAdmin.avatar || "",
      stats: {
        totalFiles,
        totalUsers,
        totalAdmins,
        activeAdminAccounts,
        activeUserAccounts,
        systemActions
      },
      files: allFiles,
      users: allUsers,
      admins: allAdmins,
      systemSettings,
      branchAdminAssignments,
      auditLogs,
      success: flash && flash.type === "success" ? flash.message : null,
      error: flash && flash.type === "error" ? flash.message : null
    });
  } catch (err) {
    pushFlash(req, res, "error", err.message || "Unable to load super admin dashboard");
    res.redirect("/auth/login");
  }
});

// -------------------- USER DASHBOARD --------------------
router.get("/user", requireAuth({ mode: "redirect", message: "Please log in to access the dashboard" }), async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      pushFlash(req, res, "error", "User not found");
      return res.redirect("/auth/login");
    }

    const flash = req.consumeFlash ? req.consumeFlash() : null;
    const systemSettings = await getGlobalSystemSettings();

    let files = [];
    try {
      files = await File.find({ owner: user._id, deleted: { $ne: true } }).sort({ uploadedAt: -1 });
    } catch (err) {
      console.log("Error fetching files:", err.message);
    }

    let sharedFiles = [];
    try {
      sharedFiles = await File.find({ sharedWith: user._id, deleted: { $ne: true } })
        .populate("owner", "fullname email").sort({ uploadedAt: -1 });
    } catch (err) {
      console.log("Error fetching shared files:", err.message);
    }

    res.render("userdashboard", {
      fullname: user.fullname,
      email: user.email,
      role: user.role,
      avatar: user.avatar || "",
      totpEnabled: user.totpEnabled || false,
      systemSettings,
      files,
      sharedFiles,
      success: flash && flash.type === "success" ? flash.message : null,
      error: flash && flash.type === "error" ? flash.message : null,
      viewReports: req.query.viewReports || null
    });
  } catch (err) {
    console.error("User dashboard error:", err.message);
    pushFlash(req, res, "error", "Unable to load dashboard");
    res.redirect("/auth/login");
  }
});

module.exports = router;
