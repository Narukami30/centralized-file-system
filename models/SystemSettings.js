const mongoose = require("mongoose");

const systemSettingsSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: "global" },
  notificationsEnabled: { type: Boolean, default: true },
  aiSortingEnabled: { type: Boolean, default: true },
  autoLogoutMinutes: { type: Number, default: 30, min: 5, max: 120 },
  // Storage Quotas (in bytes, 0 = unlimited)
  userStorageQuota: { type: Number, default: 0 },
  branchStorageQuota: { type: Number, default: 0 },
  recycleBinDays: { type: Number, default: 30, min: 1, max: 365 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("SystemSettings", systemSettingsSchema);
