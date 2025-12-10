const { prisma } = require('../shared/prisma');

async function getWorkspaceReport(req, res) {
    const { workspaceId } = req.params;
    const { startDate, endDate } = req.query;

    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, name: true }
    });

    if (!workspace) {
        return res.status(404).json({ error: 'Workspace not found' });
    }

    const member = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: req.user.id }
    });

    if (!member || !['OWNER', 'LEADER'].includes(member.role)) {
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
        select: { id: true }
    });

    if (!workspace) {
        return res.status(404).json({ error: 'Workspace not found' });
    }

    const member = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: req.user.id }
    });

    if (!member || !['OWNER', 'LEADER'].includes(member.role)) {
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

async function getGlobalReport(req, res) {
  const [
    totalUsers,
    activeUsers,
    suspendedUsers,
    totalWorkspaces,
    totalBoards,
    totalCards,
    recentActivities,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: 'active' } }),
    prisma.user.count({ where: { status: "suspended" } }),
    prisma.workspace.count(),
    prisma.board.count(),
    prisma.card.count(),
    prisma.activityLog.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, fullName: true } },
      },
    }),
  ]);

  res.json({
    stats: {
      users: { total: totalUsers, active: activeUsers, suspended: suspendedUsers },
      workspaces: totalWorkspaces,
      boards: totalBoards,
      cards: totalCards,
    },
    recentActivities,
  });
}

async function getUserDashboardReport(req, res) {
  const userId = req.user.id;

  const workspaceFilter = {
    members: {
      some: {
        userId,
      },
    },
  };

  const [
    totalBoards,
    totalCards,
    completedCards,
    overdueCards,
    inProgressCards,
    totalMembers,
    recentActivities,
  ] = await Promise.all([
    prisma.board.count({
      where: { workspace: workspaceFilter },
    }),
    prisma.card.count({
      where: { board: { workspace: workspaceFilter } },
    }),
    prisma.card.count({
      where: {
        list: { isDone: true },
        board: { workspace: workspaceFilter },
      },
    }),
    prisma.card.count({
      where: {
        dueDate: { lt: new Date() },
        list: { isDone: false },
        board: { workspace: workspaceFilter },
      },
    }),
    prisma.card.count({
      where: {
        list: { isDone: false },
        board: { workspace: workspaceFilter },
      },
    }),
    prisma.workspaceMember.count({
      where: {
        workspace: {
          members: {
            some: {
              userId,
            },
          },
        },
      },
    }),
    prisma.activityLog.findMany({
      where: {
        userId,
        action: {
          notIn: ['user_login', 'user_logout'],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        user: { select: { id: true, email: true, fullName: true, avatar: true } },
      },
    }),
  ]);

  const completionRate = totalCards > 0 ? ((completedCards / totalCards) * 100).toFixed(2) : 0;

  res.json({
    summary: {
      totalBoards,
      totalCards,
      completedCards,
      overdueCards,
      inProgressCards,
      totalMembers,
      completionRate,
    },
    recentActivities,
  });
}

async function getReportsOverview(req, res) {
  const userId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10; // Default to 10 activities per page
  const skip = (page - 1) * limit;

  const workspaceFilter = {
    members: {
      some: {
        userId,
      },
    },
  };

      const userWorkspaces = await prisma.workspace.findMany({
        where: workspaceFilter,
        select: { id: true },
      });
      const workspaceIds = userWorkspaces.map(ws => ws.id);
  
      // Fetch accessible board IDs within the user's workspaces
      const accessibleBoards = await prisma.board.findMany({
          where: { workspaceId: { in: workspaceIds } },
          select: { id: true }
      });
      const accessibleBoardIds = accessibleBoards.map(b => b.id);
  
      // Fetch accessible card IDs within those boards
      const accessibleCards = await prisma.card.findMany({
          where: { boardId: { in: accessibleBoardIds } },
          select: { id: true }
      });
      const accessibleCardIds = accessibleCards.map(c => c.id);
  
      const activityWhere = {
          OR: [
              { entityType: 'workspace', entityId: { in: workspaceIds } },
              { entityType: 'board', entityId: { in: accessibleBoardIds } },
              { entityType: 'card', entityId: { in: accessibleCardIds } }
          ]
      };
  
      const [
      totalWorkspaces,
      totalCards,
      completedCards,
      totalMembers,
      recentActivities,
      totalActivityCount,
      topPerformers,
    ] = await Promise.all([
      prisma.workspace.count({ where: workspaceFilter }),
      prisma.card.count({ where: { board: { workspaceId: { in: workspaceIds } } } }),
      prisma.card.count({
        where: {
          list: { isDone: true },
          board: { workspaceId: { in: workspaceIds } },
        },
      }),
      prisma.workspaceMember.count({ where: { workspaceId: { in: workspaceIds } } }),
      prisma.activityLog.findMany({
        where: activityWhere,
        orderBy: { createdAt: 'desc' },
        skip: skip,
        take: limit,
        include: {
          user: { select: { id: true, fullName: true, avatar: true } },
        },
      }),    prisma.activityLog.count({ where: activityWhere }),
      prisma.card.groupBy({
      by: ['createdById'],
      where: {
        board: { workspaceId: { in: workspaceIds } },
        list: { isDone: true },
      },
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
      take: 5,
    }).then(async results => {
      const userIds = results.map(r => r.createdById);
      if (userIds.length === 0) return [];
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, fullName: true, avatar: true },
      });
      return results.map(r => {
        const user = users.find(u => u.id === r.createdById);
        return {
          user,
          tasksCompleted: r._count.id,
        };
      });
    }),
  ]);

  const boardEntityIds = recentActivities
    .filter(a => a.entityType === 'board')
    .map(a => a.entityId);

  const workspaceMap = {};

  const workspaceEntityIds = recentActivities
    .filter(a => a.entityType === 'workspace')
    .map(a => a.entityId);

  if (workspaceEntityIds.length > 0) {
    const workspaces = await prisma.workspace.findMany({
        where: { id: { in: workspaceEntityIds } },
        select: { id: true, name: true }
    });
    workspaces.forEach(ws => {
        workspaceMap[ws.id] = { id: ws.id, name: ws.name };
    });
  }

  if (boardEntityIds.length > 0) {
      const boards = await prisma.board.findMany({
          where: { id: { in: boardEntityIds } },
          include: { workspace: { select: { id: true, name: true } } }
      });
      boards.forEach(board => {
          workspaceMap[board.id] = { id: board.workspace.id, name: board.workspace.name };
      });
  }

  const enrichedActivities = recentActivities.map(activity => ({
      ...activity,
      workspace: workspaceMap[activity.entityId] || null,
  }));

  res.json({
    overview: {
      totalWorkspaces,
      totalCards,
      completedCards,
      totalMembers,
      completionRate: totalCards > 0 ? ((completedCards / totalCards) * 100).toFixed(0) : 0,
    },
    recentActivities: enrichedActivities,
    topPerformers,
    pagination: {
      total: totalActivityCount,
      page,
      limit,
      totalPages: Math.ceil(totalActivityCount / limit),
      hasMore: (page * limit) < totalActivityCount,
    }
  });
}

module.exports = {
    getWorkspaceReport,
    getWorkspaceActivityTimeline,
    getGlobalReport,
    getUserDashboardReport,
    getReportsOverview
};
