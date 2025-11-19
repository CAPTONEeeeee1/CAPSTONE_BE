const express = require('express');
const { auth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');
const {
    getMyActivityLogs,
    getUserActivityLogs,
    getWorkspaceActivities,
    getWorkspaceMemberActivities,
    getMyAccessibleWorkspaces
} = require('../controllers/activity.controller');

const router = express.Router();

router.get('/me', auth(), getMyActivityLogs);
router.get('/me/workspaces', auth(), getMyAccessibleWorkspaces);
router.get('/users/:userId', auth(), requireAdmin, getUserActivityLogs);
router.get('/workspaces/:workspaceId', auth(), getWorkspaceActivities);
router.get('/workspaces/:workspaceId/members/:userId', auth(), getWorkspaceMemberActivities);

module.exports = router;
