// utils/pushNotify.js
// Web Push notification helper using web-push library
const webpush = require('web-push');
const logger = require('./logger');

let pushEnabled = false;

function initPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const contact = process.env.VAPID_CONTACT || 'mailto:admin@doj-ppa.gov.ph';

  if (!publicKey || !privateKey) {
    logger.warn('VAPID keys not set — Web Push notifications disabled');
    return;
  }

  webpush.setVapidDetails(contact, publicKey, privateKey);
  pushEnabled = true;
  logger.info('Web Push notifications enabled');
}

/**
 * Send push notification to a user's subscriptions
 * @param {string} userId - User ObjectId
 * @param {object} payload - { title, body, icon?, url?, tag? }
 */
async function sendPushToUser(userId, payload) {
  if (!pushEnabled) return;

  try {
    const PushSubscription = require('../models/PushSubscription');
    const subs = await PushSubscription.find({ user: userId });

    const payloadStr = JSON.stringify({
      title: payload.title || 'Notification',
      body: payload.body || '',
      icon: payload.icon || '/img/logo-icon.png',
      url: payload.url || '/',
      tag: payload.tag || 'general'
    });

    const results = await Promise.allSettled(
      subs.map(sub => webpush.sendNotification(sub.subscription, payloadStr))
    );

    // Remove expired subscriptions (410 Gone)
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'rejected') {
        const err = results[i].reason;
        if (err.statusCode === 410 || err.statusCode === 404) {
          await PushSubscription.findByIdAndDelete(subs[i]._id);
          logger.info('Removed expired push subscription', { userId, endpoint: subs[i].subscription.endpoint });
        }
      }
    }
  } catch (err) {
    logger.error('Push notification error', { userId, error: err.message });
  }
}

/**
 * Get VAPID public key for client-side subscription
 */
function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

module.exports = { initPush, sendPushToUser, getVapidPublicKey, isPushEnabled: () => pushEnabled };
