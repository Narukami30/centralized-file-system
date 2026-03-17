// routes/notifications.js
const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { requireActor } = require('../middleware/authMiddleware');
const { requireActive, requireRole } = require('../middleware/roleMiddleware');
const logger = require('../utils/logger');

const ALL_ROLES = ['user', 'admin', 'super_admin'];

// GET /notifications — list user's notifications (paginated, filterable)
router.get(
  '/',
  requireActor({ mode: 'json', notFoundMessage: 'User not found' }),
  requireActive({ mode: 'json' }),
  requireRole(ALL_ROLES, { mode: 'json' }),
  async (req, res) => {
    try {
      const me = req.actor;
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
      const skip = (page - 1) * limit;

      const filter = { owner: me._id };
      if (req.query.type) filter.type = req.query.type;
      if (req.query.read === 'true') filter.read = true;
      if (req.query.read === 'false') filter.read = false;

      const [notifications, total, unreadCount] = await Promise.all([
        Notification.find(filter).sort({ date: -1 }).skip(skip).limit(limit),
        Notification.countDocuments(filter),
        Notification.countDocuments({ owner: me._id, read: false })
      ]);

      return res.json({
        success: true,
        data: notifications,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        unreadCount
      });
    } catch (err) {
      logger.error('Notifications list error', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// POST /notifications/mark-read
// body: { ids: [...] } or { all: true }
router.post(
  '/mark-read',
  requireActor({ mode: 'json', notFoundMessage: 'User not found' }),
  requireActive({ mode: 'json' }),
  requireRole(ALL_ROLES, { mode: 'json' }),
  async (req, res) => {
    try {
      const me = req.actor;
      const { ids, all } = req.body;

      if (all) {
        await Notification.updateMany({ owner: me._id, read: false }, { $set: { read: true } });
      } else if (Array.isArray(ids) && ids.length > 0) {
        await Notification.updateMany({ _id: { $in: ids }, owner: me._id }, { $set: { read: true } });
      } else {
        return res.status(400).json({ success: false, message: 'Provide ids array or { all: true }' });
      }

      const unreadCount = await Notification.countDocuments({ owner: me._id, read: false });
      return res.json({ success: true, message: 'Marked as read', unreadCount });
    } catch (err) {
      logger.error('Mark read error', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// POST /notifications/mark-unread
// body: { ids: [...] }
router.post(
  '/mark-unread',
  requireActor({ mode: 'json', notFoundMessage: 'User not found' }),
  requireActive({ mode: 'json' }),
  requireRole(ALL_ROLES, { mode: 'json' }),
  async (req, res) => {
    try {
      const me = req.actor;
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, message: 'Provide ids array' });
      }

      await Notification.updateMany({ _id: { $in: ids }, owner: me._id }, { $set: { read: false } });
      const unreadCount = await Notification.countDocuments({ owner: me._id, read: false });
      return res.json({ success: true, message: 'Marked as unread', unreadCount });
    } catch (err) {
      logger.error('Mark unread error', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// DELETE /notifications/:id
router.delete(
  '/:id',
  requireActor({ mode: 'json', notFoundMessage: 'User not found' }),
  requireActive({ mode: 'json' }),
  requireRole(ALL_ROLES, { mode: 'json' }),
  async (req, res) => {
    try {
      const me = req.actor;
      const result = await Notification.findOneAndDelete({ _id: req.params.id, owner: me._id });
      if (!result) return res.status(404).json({ success: false, message: 'Notification not found' });
      return res.json({ success: true, message: 'Notification deleted' });
    } catch (err) {
      logger.error('Delete notification error', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// GET /notifications/unread-count
router.get(
  '/unread-count',
  requireActor({ mode: 'json', notFoundMessage: 'User not found' }),
  requireActive({ mode: 'json' }),
  requireRole(ALL_ROLES, { mode: 'json' }),
  async (req, res) => {
    try {
      const count = await Notification.countDocuments({ owner: req.actor._id, read: false });
      return res.json({ success: true, count });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

module.exports = router;
