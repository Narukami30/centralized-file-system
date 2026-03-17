const mongoose = require("mongoose");

const branchSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  code: { type: String, default: "", trim: true },
  description: { type: String, default: "" },
  branchHead: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Branch", branchSchema);
