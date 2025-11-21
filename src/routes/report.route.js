const express = require('express');
const { auth } = require('../middleware/auth');
const {
    getWorkspaceReport,
    getWorkspaceActivityTimeline
} = require('../controllers/report.controller');

const router = express.Router();

router.get('/workspaces/:workspaceId', auth(), getWorkspaceReport);
router.get('/workspaces/:workspaceId/timeline', auth(), getWorkspaceActivityTimeline);

module.exports = router;
