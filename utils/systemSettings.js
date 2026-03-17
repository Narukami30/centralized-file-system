const SystemSettings = require("../models/SystemSettings");

/**
 * Load global system settings from the database.
 * Creates a default document if none exists.
 */
async function getGlobalSystemSettings() {
  let settings = await SystemSettings.findOne({ key: "global" });
  if (!settings) {
    settings = await SystemSettings.create({
      key: "global",
      notificationsEnabled: true,
      aiSortingEnabled: true,
      autoLogoutMinutes: 30
    });
  }
  return settings;
}

module.exports = { getGlobalSystemSettings };
