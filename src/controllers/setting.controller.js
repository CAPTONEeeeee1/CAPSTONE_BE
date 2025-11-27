const settingService = require('../services/setting.service');

const getNotificationSettings = async (req, res, next) => {
  try {
    const settings = await settingService.getNotificationSettings(req.user.id);
    res.status(200).json(settings);
  } catch (error) {
    next(error);
  }
};

const updateNotificationSettings = async (req, res, next) => {
  try {
    const updatedSettings = await settingService.updateNotificationSettings(req.user.id, req.body);
    res.status(200).json(updatedSettings);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNotificationSettings,
  updateNotificationSettings,
};
