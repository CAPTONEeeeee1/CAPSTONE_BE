const express = require('express');
const { auth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');
const {
    getWorkspaceReport,
    getWorkspaceActivityTimeline,
    getGlobalReport,
    getUserDashboardReport,
    getReportsOverview
} = require('../controllers/report.controller');

const router = express.Router();

router.get('/overview', auth(), getReportsOverview);
router.get('/user', auth(), getUserDashboardReport);
router.get('/global', auth(), requireAdmin, getGlobalReport);
router.get('/workspaces/:workspaceId', auth(), getWorkspaceReport);
router.get('/workspaces/:workspaceId/timeline', auth(), getWorkspaceActivityTimeline);

module.exports = router;
