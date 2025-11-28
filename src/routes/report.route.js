const express = require('express');
const { auth } = require('../middleware/auth');
const {
    getWorkspaceReport,
    getWorkspaceActivityTimeline,
    getGlobalReport
} = require('../controllers/report.controller');

const router = express.Router();

router.get('/global', auth(), getGlobalReport);
router.get('/workspaces/:workspaceId', auth(), getWorkspaceReport);
router.get('/workspaces/:workspaceId/timeline', auth(), getWorkspaceActivityTimeline);

module.exports = router;
