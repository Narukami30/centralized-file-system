// models/CategoryFeedback.js
// Stores user corrections/overrides for AI file categorization
const mongoose = require('mongoose');

const categoryFeedbackSchema = new mongoose.Schema({
  file: { type: mongoose.Schema.Types.ObjectId, ref: 'File', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  originalCategory: { type: String, required: true },
  correctedCategory: { type: String, required: true },
  originalConfidence: { type: Number, default: 0 },
  filename: { type: String, default: '' },
  mimeType: { type: String, default: '' },
  branch: { type: String, default: '' },
  date: { type: Date, default: Date.now }
});

categoryFeedbackSchema.index({ correctedCategory: 1 });
categoryFeedbackSchema.index({ branch: 1, correctedCategory: 1 });
categoryFeedbackSchema.index({ mimeType: 1, correctedCategory: 1 });

module.exports = mongoose.model('CategoryFeedback', categoryFeedbackSchema);
