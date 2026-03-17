const mongoose = require("mongoose");

const revokedTokenSchema = new mongoose.Schema(
  {
    jti: { type: String, required: true, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false, index: true },
    reason: { type: String, default: "" },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

revokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("RevokedToken", revokedTokenSchema);
