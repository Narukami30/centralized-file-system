// models/Report.js
const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  action: { type: String, required: true }, // e.g., "Uploaded", "Deleted", "Downloaded", "Shared"
  date: { type: Date, default: Date.now },
  user: { type: String, required: true },   // store user fullname or ID
  branch: { type: String, default: "" },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  ipAddress: { type: String, default: "" },
  userAgent: { type: String, default: "" },
  fileSize: { type: Number, default: 0 },
  duration: { type: Number, default: 0 } // operation duration in ms
});

reportSchema.index({ date: -1 });
reportSchema.index({ action: 1, date: -1 });
reportSchema.index({ owner: 1, date: -1 });
reportSchema.index({ branch: 1, date: -1 });

module.exports = mongoose.model("Report", reportSchema);
