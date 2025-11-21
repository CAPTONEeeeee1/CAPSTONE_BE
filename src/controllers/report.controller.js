const { prisma } = require('../shared/prisma');

async function getWorkspaceReport(req, res) {
    const { workspaceId } = req.params;
    const { startDate, endDate } = req.query;

    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, name: true, ownerId: true }
    });

    if (!workspace) {
        return res.status(404).json({ error: 'Workspace not found' });
    }

    const member = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: req.user.id }
    });

    if (!member || !['owner', 'admin'].includes(member.role)) {
        return res.status(403).json({ error: 'Only workspace owner/admin can view reports' });
    }

    const dateFilter = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);
    const hasDateFilter = Object.keys(dateFilter).length > 0;

    const cardFilter = { boardId: { in: [] } };
    const boards = await prisma.board.findMany({
        where: { workspaceId },
        select: { id: true }
    });
    cardFilter.boardId.in = boards.map(b => b.id);

    if (hasDateFilter) {
        cardFilter.createdAt = dateFilter;
    }

    const [
        totalMembers,
        totalBoards,
        totalCards,
        cardsByStatus,
        cardsByPriority,
        activeMembers,
        topContributors,
        recentActivities
    ] = await Promise.all([
        prisma.workspaceMember.count({ where: { workspaceId } }),
        
        prisma.board.count({ where: { workspaceId } }),
        
        prisma.card.count({ where: cardFilter }),
        
        prisma.card.groupBy({
            by: ['listId'],
            where: cardFilter,
            _count: { id: true }
        }).then(async results => {
            const lists = await prisma.list.findMany({
                where: { id: { in: results.map(r => r.listId) } },
                select: { id: true, name: true }
            });
            return results.map(r => {
                const list = lists.find(l => l.id === r.listId);
                return {
                    status: list?.name || 'Unknown',
                    count: r._count.id
                };
            });
        }),
        
        prisma.card.groupBy({
            by: ['priority'],
            where: cardFilter,
            _count: { id: true }
        }),
        
        prisma.workspaceMember.findMany({
            where: { 
                workspaceId,
                joinedAt: hasDateFilter ? dateFilter : undefined
            },
            select: {
                user: {
                    select: { id: true, fullName: true, email: true, avatar: true }
                },
                joinedAt: true
            },
            orderBy: { joinedAt: 'desc' },
            take: 10
        }),
        
        prisma.card.groupBy({
            by: ['createdById'],
            where: cardFilter,
            _count: { id: true },
            orderBy: { _count: { id: 'desc' } },
            take: 10
        }).then(async results => {
            const userIds = results.map(r => r.createdById);
            const users = await prisma.user.findMany({
                where: { id: { in: userIds } },
                select: { id: true, fullName: true, email: true, avatar: true }
            });
            return results.map(r => {
                const user = users.find(u => u.id === r.createdById);
                return {
                    user,
                    cardsCreated: r._count.id
                };
            });
        }),
        
        prisma.activityLog.findMany({
            where: {
                entityType: 'workspace',
                entityId: workspaceId,
                createdAt: hasDateFilter ? dateFilter : undefined
            },
            include: {
                user: {
                    select: { id: true, fullName: true, email: true }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: 20
        })
    ]);

    const completedCards = await prisma.card.count({
        where: {
            ...cardFilter,
            list: { isDone: true }
        }
    });

    const overdueCards = await prisma.card.count({
        where: {
            ...cardFilter,
            dueDate: { lt: new Date() },
            list: { isDone: false }
        }
    });

    res.json({
        workspace: {
            id: workspace.id,
            name: workspace.name
        },
        period: {
            startDate: startDate || null,
            endDate: endDate || null
        },
        summary: {
            totalMembers,
            totalBoards,
            totalCards,
            completedCards,
            overdueCards,
            completionRate: totalCards > 0 ? ((completedCards / totalCards) * 100).toFixed(2) : 0
        },
        cardsByStatus,
        cardsByPriority,
        activeMembers,
        topContributors,
        recentActivities
    });
}

async function getWorkspaceActivityTimeline(req, res) {
    const { workspaceId } = req.params;
    const { days = 30 } = req.query;

    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, ownerId: true }
    });

    if (!workspace) {
        return res.status(404).json({ error: 'Workspace not found' });
    }

    const member = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: req.user.id }
    });

    if (!member || !['owner', 'admin'].includes(member.role)) {
        return res.status(403).json({ error: 'Only workspace owner/admin can view timeline' });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const activities = await prisma.activityLog.findMany({
        where: {
            OR: [
                { entityType: 'workspace', entityId: workspaceId },
                { 
                    entityType: 'board',
                    entityId: { 
                        in: (await prisma.board.findMany({
                            where: { workspaceId },
                            select: { id: true }
                        })).map(b => b.id)
                    }
                }
            ],
            createdAt: { gte: startDate }
        },
        include: {
            user: {
                select: { id: true, fullName: true, email: true, avatar: true }
            }
        },
        orderBy: { createdAt: 'desc' },
        take: 100
    });

    res.json({ activities });
}

module.exports = {
    getWorkspaceReport,
    getWorkspaceActivityTimeline
};
