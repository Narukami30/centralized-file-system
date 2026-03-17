const mongoose = require("mongoose");

const refreshTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    familyId: { type: String, required: true, index: true },
    replacedByHash: { type: String, default: "" },
    revokedAt: { type: Date, default: null },
    revokeReason: { type: String, default: "" },
    expiresAt: { type: Date, required: true },
    ipAddress: { type: String, default: "" },
    userAgent: { type: String, default: "" }
  },
  { timestamps: true }
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
