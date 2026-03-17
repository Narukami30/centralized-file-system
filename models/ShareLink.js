const mongoose = require("mongoose");

const shareLinkSchema = new mongoose.Schema({
  file: { type: mongoose.Schema.Types.ObjectId, ref: "File", required: true },
  token: { type: String, required: true, unique: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  expiresAt: { type: Date, required: true },
  maxDownloads: { type: Number, default: 0 }, // 0 = unlimited
  downloadCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

shareLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("ShareLink", shareLinkSchema);
