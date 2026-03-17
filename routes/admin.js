const express = require("express");
const router = express.Router();
const User = require("../models/User");
const File = require("../models/File");
const Report = require("../models/Report");
const Notification = require("../models/Notification");
const AuditLog = require("../models/AuditLog");
const Invitation = require("../models/Invitation");
const Branch = require("../models/Branch");
const bcrypt = require("bcrypt");
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireActor } = require("../middleware/authMiddleware");
const { requireActive, requireRole } = require("../middleware/roleMiddleware");
const { getGlobalSystemSettings } = require("../utils/systemSettings");

// ==================== ADMIN DASHBOARD ====================
router.get("/dashboard",
  requireAuth({ mode: "redirect", message: "Please log in to access the dashboard" }),
  requireActive({ mode: "redirect" }),
  requireRole(["admin", "super_admin"], { mode: "redirect" }),
  asyncHandler(async (req, res) => {
  const admin = req.actor;
  const flash = req.consumeFlash ? req.consumeFlash() : null;

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
  const allFiles = await File.find(branchFilter).populate("owner", "fullname email role branch").sort({ uploadedAt: -1 });
  const allUsers = await User.find(isSuperAdmin ? {} : { role: "user", branch: admin.branch || "" }).select("_id fullname email role branch active status avatar createdAt");
  const auditLogs = await Report.find(isSuperAdmin ? {} : { owner: admin._id }).sort({ date: -1 }).limit(10);

  const systemSettings = await getGlobalSystemSettings();

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
}));

// ==================== FILE OPERATIONS ====================
router.post("/file/delete/:fileId",
  requireActor({ mode: "json", notFoundMessage: "Unauthorized" }),
  requireActive({ mode: "json" }),
  requireRole(["admin", "super_admin"], { mode: "json" }),
  asyncHandler(async (req, res) => {
  const admin = req.actor;

  const file = await File.findById(req.params.fileId).populate("owner", "branch");
  if (!file) {
    return res.json({ success: false, message: "File not found" });
  }

  if (admin.role !== "super_admin") {
    const fileBranch = file.branch || (file.owner ? file.owner.branch : "");
    if (!fileBranch || fileBranch !== (admin.branch || "")) {
      return res.json({ success: false, message: "You can only manage files from your branch" });
    }
  }

  file.deleted = true;
  file.deletedAt = new Date();
  await file.save();

  // Create audit log
  const report = new Report({
    filename: file.filename,
    action: "Moved to Recycle Bin by Admin",
    user: admin.fullname,
    owner: admin._id,
    date: new Date(),
    ipAddress: req.ip || "",
    userAgent: (req.headers["user-agent"] || "").slice(0, 300),
    fileSize: file.sizeBytes || 0
  });
  await report.save();

  res.json({ success: true, message: "File moved to recycle bin" });
}));

// ==================== USER MANAGEMENT ====================
router.post("/user/role",
  requireActor({ mode: "json", notFoundMessage: "Unauthorized" }),
  requireActive({ mode: "json" }),
  requireRole(["super_admin"], { mode: "json" }),
  asyncHandler(async (req, res) => {
  const admin = req.actor;

  const targetUser = await User.findById(req.body.userId);
  if (!targetUser) {
    return res.json({ success: false, message: "User not found" });
  }

  if (targetUser.role === "super_admin") {
    return res.json({ success: false, message: "Super Admin role cannot be changed" });
  }

  const allowedRoles = ["user", "admin"];
  if (!allowedRoles.includes(req.body.role)) {
    return res.json({ success: false, message: "Invalid role" });
  }

  if (String(targetUser._id) === String(admin._id)) {
    return res.json({ success: false, message: "You cannot change your own role" });
  }

  if (req.body.role === "admin") {
    const targetBranch = (targetUser.branch || "").trim();
    if (!targetBranch) {
      return res.json({ success: false, message: "User must be assigned to a branch before promotion to admin" });
    }

    const existingBranchAdmin = await User.findOne({
      role: "admin",
      branch: targetBranch,
      active: { $ne: false },
      _id: { $ne: targetUser._id }
    });

    if (existingBranchAdmin) {
      return res.json({ success: false, message: `Branch already has an active admin (${existingBranchAdmin.email})` });
    }
  }

  const user = await User.findByIdAndUpdate(req.body.userId, { role: req.body.role }, { new: true })
    .select('_id fullname email role branch active status avatar');
  
  // Create audit log
  const report = new Report({
    filename: user.email,
    action: `Role changed to ${req.body.role}`,
    user: admin.fullname,
    owner: admin._id,
    date: new Date(),
    ipAddress: req.ip || "",
    userAgent: (req.headers["user-agent"] || "").slice(0, 300)
  });
  await report.save();

  res.json({ success: true, message: "Role updated", user });
}));

router.post("/user/deactivate/:userId",
  requireActor({ mode: "json", notFoundMessage: "Unauthorized" }),
  requireActive({ mode: "json" }),
  requireRole(["admin", "super_admin"], { mode: "json" }),
  asyncHandler(async (req, res) => {
  const admin = req.actor;

  // Soft delete by removing email (or we could add a "active" flag)
  const user = await User.findById(req.params.userId);
  if (!user) {
    return res.json({ success: false, message: "User not found" });
  }

  if (admin.role === "admin" && user.role !== "user") {
    return res.json({ success: false, message: "Admins can only manage regular users" });
  }

  if (admin.role === "admin" && (user.branch || "") !== (admin.branch || "")) {
    return res.json({ success: false, message: "Admins can only manage users in their assigned branch" });
  }

  const report = new Report({
    filename: user.email,
    action: "User Deactivated",
    user: admin.fullname,
    owner: admin._id,
    date: new Date(),
    ipAddress: req.ip || "",
    userAgent: (req.headers["user-agent"] || "").slice(0, 300)
  });
  await report.save();

  user.active = false;
  user.online = false;
  await user.save();

  res.json({ success: true, message: "User deactivated" });
}));

// ==================== FILTER & SEARCH ====================
router.get("/files/search",
  requireActor({ mode: "json", notFoundMessage: "Unauthorized" }),
  requireActive({ mode: "json" }),
  requireRole(["admin", "super_admin"], { mode: "json" }),
  asyncHandler(async (req, res) => {
  const { query, category, email } = req.query;
  const admin = req.actor;

  const filter = {};

  if (query) {
    filter.filename = { $regex: query, $options: "i" };
  }
  if (category && category !== "all") {
    filter.filetype = category;
  }

  if (admin.role !== "super_admin") {
    filter.branch = admin.branch || "";
  }

  const files = await File.find(filter).populate("owner", "fullname email branch").sort({ uploadedAt: -1 });
  res.json(files);
}));

// ==================== USER SUSPEND / UNSUSPEND ====================
router.post("/user/suspend/:userId",
  requireActor({ mode: "json", notFoundMessage: "Unauthorized" }),
  requireActive({ mode: "json" }),
  requireRole(["admin", "super_admin"], { mode: "json" }),
  asyncHandler(async (req, res) => {
  const admin = req.actor;
  const { reason, until } = req.body;

  const user = await User.findById(req.params.userId);
  if (!user) {
    return res.json({ success: false, message: "User not found" });
  }

  if (user.role === "super_admin") {
    return res.json({ success: false, message: "Cannot suspend a Super Admin" });
  }

  if (admin.role === "admin" && user.role !== "user") {
    return res.json({ success: false, message: "Admins can only suspend regular users" });
  }

  if (admin.role === "admin" && (user.branch || "") !== (admin.branch || "")) {
    return res.json({ success: false, message: "Admins can only manage users in their assigned branch" });
  }

  user.status = "suspended";
  user.active = false;
  user.suspendedReason = typeof reason === "string" ? reason.trim().slice(0, 500) : "";
  user.suspendedUntil = until ? new Date(until) : null;
  user.online = false;
  await user.save();

  await AuditLog.create({
    user: admin._id,
    action: "account_suspended",
    details: `Suspended ${user.email}${user.suspendedReason ? ": " + user.suspendedReason : ""}`,
    targetUser: user._id,
    ip: req.ip || "",
    userAgent: (req.headers["user-agent"] || "").slice(0, 300)
  });

  res.json({ success: true, message: "User suspended" });
}));

router.post("/user/unsuspend/:userId",
  requireActor({ mode: "json", notFoundMessage: "Unauthorized" }),
  requireActive({ mode: "json" }),
  requireRole(["admin", "super_admin"], { mode: "json" }),
  asyncHandler(async (req, res) => {
  const admin = req.actor;

  const user = await User.findById(req.params.userId);
  if (!user) {
    return res.json({ success: false, message: "User not found" });
  }

  if (admin.role === "admin" && user.role !== "user") {
    return res.json({ success: false, message: "Admins can only manage regular users" });
  }

  if (admin.role === "admin" && (user.branch || "") !== (admin.branch || "")) {
    return res.json({ success: false, message: "Admins can only manage users in their assigned branch" });
  }

  user.status = "active";
  user.active = true;
  user.suspendedReason = "";
  user.suspendedUntil = null;
  await user.save();

  await AuditLog.create({
    user: admin._id,
    action: "account_reactivated",
    details: `Reactivated ${user.email}`,
    targetUser: user._id,
    ip: req.ip || "",
    userAgent: (req.headers["user-agent"] || "").slice(0, 300)
  });

  res.json({ success: true, message: "User reactivated" });
}));

// ==================== INVITATION ====================
router.post("/invite",
  requireActor({ mode: "json", notFoundMessage: "Unauthorized" }),
  requireActive({ mode: "json" }),
  requireRole(["admin", "super_admin"], { mode: "json" }),
  asyncHandler(async (req, res) => {
  const admin = req.actor;
  const { email, role, branch } = req.body;

  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.json({ success: false, message: "Valid email is required" });
  }

  const inviteEmail = email.trim().toLowerCase();

  // Check if user already exists
  const existingUser = await User.findOne({ email: inviteEmail });
  if (existingUser) {
    return res.json({ success: false, message: "A user with this email already exists" });
  }

  // Check for existing pending invitation
  const existingInvite = await Invitation.findOne({ email: inviteEmail, status: "pending", expiresAt: { $gt: new Date() } });
  if (existingInvite) {
    return res.json({ success: false, message: "An invitation is already pending for this email" });
  }

  const inviteRole = (role === "admin" && admin.role === "super_admin") ? "admin" : "user";
  const inviteBranch = typeof branch === "string" ? branch.trim() : (admin.branch || "");

  const token = Invitation.generateToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const invitation = await Invitation.create({
    email: inviteEmail,
    role: inviteRole,
    branch: inviteBranch,
    invitedBy: admin._id,
    token,
    expiresAt
  });

  await AuditLog.create({
    user: admin._id,
    action: "invite_sent",
    details: `Invited ${inviteEmail} as ${inviteRole} to branch: ${inviteBranch}`,
    ip: req.ip || "",
    userAgent: (req.headers["user-agent"] || "").slice(0, 300)
  });

  // Build invitation link
  const protocol = req.protocol;
  const host = req.get("host");
  const inviteLink = `${protocol}://${host}/auth/invite/${token}`;

  // Try sending email (non-blocking — works if nodemailer is configured)
  try {
    const sendInviteEmail = require("../utils/mailer");
    await sendInviteEmail(inviteEmail, inviteLink, inviteBranch, inviteRole);
  } catch (_) {
    // Email sending is optional
  }

  res.json({
    success: true,
    message: "Invitation created",
    inviteLink,
    invitation: { email: inviteEmail, role: inviteRole, branch: inviteBranch, expiresAt }
  });
}));

// ==================== AUDIT LOG ====================
router.get("/audit-logs",
  requireActor({ mode: "json", notFoundMessage: "Unauthorized" }),
  requireActive({ mode: "json" }),
  requireRole(["admin", "super_admin"], { mode: "json" }),
  asyncHandler(async (req, res) => {
  const admin = req.actor;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const skip = (page - 1) * limit;

  const filter = {};
  if (admin.role !== "super_admin") {
    filter.user = admin._id;
  }
  if (req.query.action) {
    filter.action = req.query.action;
  }

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .populate("user", "fullname email")
      .populate("targetUser", "fullname email")
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit),
    AuditLog.countDocuments(filter)
  ]);

  res.json({ success: true, logs, total, page, pages: Math.ceil(total / limit) });
}));

module.exports = router;
