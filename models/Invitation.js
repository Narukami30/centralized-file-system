const mongoose = require("mongoose");
const crypto = require("crypto");

const invitationSchema = new mongoose.Schema({
  email: { type: String, required: true, trim: true, lowercase: true },
  role: { type: String, enum: ["user", "admin"], default: "user" },
  branch: { type: String, default: "" },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  token: { type: String, required: true, unique: true },
  status: { type: String, enum: ["pending", "accepted", "expired"], default: "pending" },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now }
});

// TTL index: auto-delete expired invitations after 7 days past expiry
invitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 604800 });

invitationSchema.statics.generateToken = function () {
  return crypto.randomBytes(32).toString("hex");
};

module.exports = mongoose.model("Invitation", invitationSchema);
