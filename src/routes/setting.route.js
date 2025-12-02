const express = require('express');
const { getNotificationSettings, updateNotificationSettings } = require('../controllers/setting.controller');
const { auth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { updateSettingsValidator } = require('../validators/setting.validators');

const router = express.Router();

// All routes in this file are protected
router.use(auth(true));

router
  .route('/')
  .get(getNotificationSettings)
  .put(validate(updateSettingsValidator), updateNotificationSettings);

module.exports = router;
