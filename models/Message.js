const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true },
  date: { type: Date, default: Date.now },
  read: { type: Boolean, default: false },
  attachment: {
    fileId: { type: mongoose.Schema.Types.ObjectId, ref: 'File' },
    filename: { type: String },
    originalName: { type: String },
    mimeType: { type: String },
    sizeBytes: { type: Number }
  }
});

// Text index for message search
messageSchema.index({ text: 'text' });
// Conversation query index
messageSchema.index({ from: 1, to: 1, date: -1 });
messageSchema.index({ to: 1, read: 1 });

module.exports = mongoose.model('Message', messageSchema);
