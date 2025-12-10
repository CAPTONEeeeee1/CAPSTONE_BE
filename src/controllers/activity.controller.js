const { prisma } = require('../shared/prisma');

function sanitizeActivityLog(log, includePrivateInfo = false) {
    if (includePrivateInfo) {
        return log;
    }
    
    const { ipAddress, userAgent, ...sanitized } = log;
    return sanitized;
}

function sanitizeActivityLogs(logs, includePrivateInfo = false) {
    return logs.map(log => sanitizeActivityLog(log, includePrivateInfo));
}

async function getMyActivityLogs(req, res) {
    const { page = 1, limit = 50, action, entityType, startDate, endDate, workspaceId } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;
    
    if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
    }

    // Get all workspace IDs where the current user is a member
    const userMemberships = await prisma.workspaceMember.findMany({
        where: { userId: req.user.id },
        select: { workspaceId: true }
    });
    const accessibleWorkspaceIds = userMemberships.map(m => m.workspaceId);

    if (accessibleWorkspaceIds.length === 0) {
        // If the user is not a member of any workspace, return no activities.
        // This is important to prevent accidental exposure of activities.
        res.json({
            logs: [],
            pagination: {
                total: 0,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: 0
            }
        });
        return;
    }

    // Get all board IDs within the accessible workspaces
    const accessibleBoards = await prisma.board.findMany({
        where: { workspaceId: { in: accessibleWorkspaceIds } },
        select: { id: true }
    });
    const accessibleBoardIds = accessibleBoards.map(b => b.id);

    // Get all card IDs within the accessible boards
    const accessibleCards = await prisma.card.findMany({
        where: { boardId: { in: accessibleBoardIds } },
        select: { id: true }
    });
    const accessibleCardIds = accessibleCards.map(c => c.id);

    let finalAccessibleWorkspaceIds = accessibleWorkspaceIds;
    let finalAccessibleBoardIds = accessibleBoardIds;
    let finalAccessibleCardIds = accessibleCardIds;

    // If a specific workspaceId is provided, further restrict the results to that workspace
    if (workspaceId) {
        if (!accessibleWorkspaceIds.includes(workspaceId)) {
            return res.status(403).json({ error: 'You are not a member of this workspace' });
        }
        
        finalAccessibleWorkspaceIds = [workspaceId];

        // Get boards only within the specified workspace
        const specificWorkspaceBoards = await prisma.board.findMany({
            where: { workspaceId: workspaceId },
            select: { id: true }
        });
        finalAccessibleBoardIds = specificWorkspaceBoards.map(b => b.id);

        // Get cards only within the specified workspace's boards
        const specificWorkspaceCards = await prisma.card.findMany({
            where: { boardId: { in: finalAccessibleBoardIds } },
            select: { id: true }
        });
        finalAccessibleCardIds = specificWorkspaceCards.map(c => c.id);
    }
    
    // Apply the workspace, board, and card filtering
    where.OR = [
        { entityType: 'workspace', entityId: { in: finalAccessibleWorkspaceIds } },
        { entityType: 'board', entityId: { in: finalAccessibleBoardIds } },
        { entityType: 'card', entityId: { in: finalAccessibleCardIds } }
    ];


    const [logs, total] = await Promise.all([
        prisma.activityLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: parseInt(limit)
        }),
        prisma.activityLog.count({ where })
    ]);

    res.json({
        logs: sanitizeActivityLogs(logs, false),
        pagination: {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / parseInt(limit))
        }
    });
}

async function getActivityStats(req, res) {
    const { days = 30 } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const [
        totalActivities,
        activitiesByAction,
        activitiesByDay
    ] = await Promise.all([
        prisma.activityLog.count({
            where: {
                userId: req.user.id,
                createdAt: { gte: startDate }
            }
        }),
        
        prisma.activityLog.groupBy({
            by: ['action'],
            where: {
                userId: req.user.id,
                createdAt: { gte: startDate }
            },
            _count: { id: true },
            orderBy: { _count: { id: 'desc' } }
        }),
        
        prisma.$queryRaw`
            SELECT 
                DATE("createdAt") as date,
                COUNT(*)::int as count
            FROM "ActivityLog"
            WHERE "userId" = ${req.user.id}
            AND "createdAt" >= ${startDate}
            GROUP BY DATE("createdAt")
            ORDER BY date DESC
        `
    ]);

    res.json({
        period: {
            days: parseInt(days),
            startDate
        },
        totalActivities,
        activitiesByAction,
        activitiesByDay
    });
}

async function getUserActivityLogs(req, res) {
    const { userId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, fullName: true }
    });

    if (!targetUser) {
        return res.status(404).json({ error: 'User not found' });
    }

    const [logs, total] = await Promise.all([
        prisma.activityLog.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            skip,
            take: parseInt(limit)
        }),
        prisma.activityLog.count({ where: { userId } })
    ]);

    res.json({
        user: targetUser,
        logs: sanitizeActivityLogs(logs, true),
        pagination: {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / parseInt(limit))
        }
    });
}

async function getWorkspaceActivities(req, res) {
    const { workspaceId } = req.params;
    const { page = 1, limit = 50, userId, action, entityType, startDate, endDate } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, name: true }
    });

    if (!workspace) {
        return res.status(404).json({ error: 'Workspace not found' });
    }

    const currentUserMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: req.user.id },
        select: { role: true }
    });

    if (!currentUserMember) {
        return res.status(403).json({ error: 'You are not a member of this workspace' });
    }

    const isAdmin = ['OWNER', 'LEADER'].includes(currentUserMember.role);

    const boards = await prisma.board.findMany({
        where: { workspaceId },
        select: { id: true }
    });
    const boardIds = boards.map(b => b.id);

    const workspaceMembers = await prisma.workspaceMember.findMany({
        where: { workspaceId },
        select: { userId: true }
    });
    const memberUserIds = workspaceMembers.map(m => m.userId);

    const where = {
        userId: { in: memberUserIds },
        OR: [
            { entityType: 'workspace', entityId: workspaceId },
            { entityType: 'board', entityId: { in: boardIds } },
            { entityType: 'card', entityId: { in: [] } }
        ]
    };

    const cards = await prisma.card.findMany({
        where: { boardId: { in: boardIds } },
        select: { id: true }
    });
    where.OR[2].entityId.in = cards.map(c => c.id);

    // If a specific userId is requested, filter by that userId.
    // Otherwise, all members of the workspace can see all activities of all members within that workspace.
    if (userId) {
        where.userId = userId;
    } else {
        where.userId = { in: memberUserIds }; // Allow all members of the workspace to see activities
    }

    if (action) where.action = action;
    if (entityType) {
        where.entityType = entityType;
    }

    if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [logs, total] = await Promise.all([
        prisma.activityLog.findMany({
            where,
            include: {
                user: {
                    select: { id: true, email: true, fullName: true, avatar: true }
                }
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: parseInt(limit)
        }),
        prisma.activityLog.count({ where })
    ]);

    res.json({
        workspace: {
            id: workspace.id,
            name: workspace.name
        },
        canViewAll: isAdmin,
        logs: sanitizeActivityLogs(logs, isAdmin),
        pagination: {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / parseInt(limit))
        }
    });
}

async function getWorkspaceMemberActivities(req, res) {
    const { workspaceId, userId } = req.params;
    const { page = 1, limit = 50, days = 30 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, name: true }
    });

    if (!workspace) {
        return res.status(404).json({ error: 'Workspace not found' });
    }

    const currentUserMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: req.user.id },
        select: { role: true }
    });

    if (!currentUserMember) {
        return res.status(403).json({ error: 'You are not a member of this workspace' });
    }

    const isAdmin = ['OWNER', 'LEADER'].includes(currentUserMember.role);



    const targetMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId },
        include: {
            user: {
                select: { id: true, email: true, fullName: true, avatar: true }
            }
        }
    });

    if (!targetMember) {
        return res.status(404).json({ error: 'Member not found in this workspace' });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const boards = await prisma.board.findMany({
        where: { workspaceId },
        select: { id: true }
    });
    const boardIds = boards.map(b => b.id);

    const cards = await prisma.card.findMany({
        where: { boardId: { in: boardIds } },
        select: { id: true }
    });
    const cardIds = cards.map(c => c.id);

    const where = {
        userId,
        createdAt: { gte: startDate },
        OR: [
            { entityType: 'workspace', entityId: workspaceId },
            { entityType: 'board', entityId: { in: boardIds } },
            { entityType: 'card', entityId: { in: cardIds } }
        ]
    };

    const [logs, total, activitiesByAction, activitiesByDay] = await Promise.all([
        prisma.activityLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: parseInt(limit)
        }),
        prisma.activityLog.count({ where }),
        
        prisma.activityLog.groupBy({
            by: ['action'],
            where,
            _count: { id: true },
            orderBy: { _count: { id: 'desc' } }
        }),
        
        prisma.$queryRaw`
            SELECT 
                DATE("createdAt") as date,
                COUNT(*)::int as count
            FROM "ActivityLog"
            WHERE "userId" = ${userId}
            AND "createdAt" >= ${startDate}
            AND (
                ("entityType" = 'workspace' AND "entityId" = ${workspaceId})
                OR ("entityType" = 'board' AND "entityId" = ANY(${boardIds}::text[]))
                OR ("entityType" = 'card' AND "entityId" = ANY(${cardIds}::text[]))
            )
            GROUP BY DATE("createdAt")
            ORDER BY date DESC
        `
    ]);

    res.json({
        workspace: {
            id: workspace.id,
            name: workspace.name
        },
        member: targetMember.user,
        memberRole: targetMember.role,
        period: {
            days: parseInt(days),
            startDate
        },
        summary: {
            totalActivities: total,
            activitiesByAction,
            activitiesByDay
        },
        logs: sanitizeActivityLogs(logs, isAdmin),
        pagination: {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / parseInt(limit))
        }
    });
}

async function getMyAccessibleWorkspaces(req, res) {
    // Get all workspaces where user is a member
    const memberships = await prisma.workspaceMember.findMany({
        where: { userId: req.user.id },
        include: {
            workspace: {
                select: {
                    id: true,
                    name: true,
                    description: true,
                    visibility: true
                }
            }
        },
        orderBy: { joinedAt: 'desc' }
    });

    // Get activity count for each workspace in last 30 days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const workspacesWithActivity = await Promise.all(
        memberships.map(async (member) => {
            const boards = await prisma.board.findMany({
                where: { workspaceId: member.workspaceId },
                select: { id: true }
            });
            const boardIds = boards.map(b => b.id);

            const cards = await prisma.card.findMany({
                where: { boardId: { in: boardIds } },
                select: { id: true }
            });
            const cardIds = cards.map(c => c.id);

            const activityCount = await prisma.activityLog.count({
                where: {
                    userId: req.user.id,
                    createdAt: { gte: startDate },
                    OR: [
                        { entityType: 'workspace', entityId: member.workspaceId },
                        { entityType: 'board', entityId: { in: boardIds } },
                        { entityType: 'card', entityId: { in: cardIds } }
                    ]
                }
            });

            const lastActivity = await prisma.activityLog.findFirst({
                where: {
                    userId: req.user.id,
                    OR: [
                        { entityType: 'workspace', entityId: member.workspaceId },
                        { entityType: 'board', entityId: { in: boardIds } },
                        { entityType: 'card', entityId: { in: cardIds } }
                    ]
                },
                orderBy: { createdAt: 'desc' },
                select: { createdAt: true, action: true }
            });

            return {
                workspace: member.workspace,
                role: member.role,
                joinedAt: member.joinedAt,
                recentActivityCount: activityCount,
                lastActivity: lastActivity ? {
                    action: lastActivity.action,
                    createdAt: lastActivity.createdAt
                } : null
            };
        })
    );

    res.json({
        workspaces: workspacesWithActivity,
        total: workspacesWithActivity.length
    });
}

module.exports = {
    getMyActivityLogs,
    getUserActivityLogs,
    getWorkspaceActivities,
    getWorkspaceMemberActivities,
    getMyAccessibleWorkspaces
};
