const { prisma } = require('../shared/prisma');
const { logActivity, getClientInfo } = require('../services/activity.service');
const { updateUserStatusSchema, updateUserRoleSchema } = require('../validators/admin.validators');

async function getAllUsers(req, res) {
    const { page = 1, limit = 20, status, role, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (status) where.status = status;
    if (role) where.role = role;
    if (search) {
        where.OR = [
            { email: { contains: search, mode: 'insensitive' } },
            { fullName: { contains: search, mode: 'insensitive' } }
        ];
    }

    const [users, total] = await Promise.all([
        prisma.user.findMany({
            where,
            select: {
                id: true,
                email: true,
                fullName: true,
                phone: true,
                avatar: true,
                role: true,
                status: true,
                emailVerified: true,
                lastLoginAt: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                    select: {
                        ownedWorkspaces: true,
                        workspaceMemberships: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: parseInt(limit)
        }),
        prisma.user.count({ where })
    ]);

    res.json({
        users,
        pagination: {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / parseInt(limit))
        }
    });
}

async function getUserDetail(req, res) {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            fullName: true,
            phone: true,
            avatar: true,
            description: true,
            role: true,
            status: true,
            emailVerified: true,
            emailVerifiedAt: true,
            lastLoginAt: true,
            createdAt: true,
            updatedAt: true,
            ownedWorkspaces: {
                select: {
                    id: true,
                    name: true,
                    createdAt: true
                }
            },
            workspaceMemberships: {
                select: {
                    workspace: {
                        select: {
                            id: true,
                            name: true
                        }
                    },
                    role: true,
                    joinedAt: true
                }
            },
            _count: {
                select: {
                    createdCards: true,
                    commentsAuthored: true,
                    activityLogs: true
                }
            }
        }
    });

    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
}

async function updateUserStatus(req, res) {
    const { userId } = req.params;
    const parsed = updateUserStatusSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { status } = parsed.data;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    const updated = await prisma.user.update({
        where: { id: userId },
        data: { status }
    });

    const clientInfo = getClientInfo(req);
    logActivity({
        userId: req.user.id,
        action: 'admin_update_user_status',
        entityType: 'user',
        entityId: userId,
        entityName: user.email,
        metadata: { oldStatus: user.status, newStatus: status },
        ...clientInfo
    });

    res.json({ user: updated });
}

async function updateUserRole(req, res) {
    const { userId } = req.params;
    const parsed = updateUserRoleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { role } = parsed.data;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    if (user.id === req.user.id) {
        return res.status(400).json({ error: 'Cannot change your own role' });
    }

    const updated = await prisma.user.update({
        where: { id: userId },
        data: { role }
    });

    const clientInfo = getClientInfo(req);
    logActivity({
        userId: req.user.id,
        action: 'admin_update_user_role',
        entityType: 'user',
        entityId: userId,
        entityName: user.email,
        metadata: { oldRole: user.role, newRole: role },
        ...clientInfo
    });

    res.json({ user: updated });
}

async function deleteUser(req, res) {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    if (user.id === req.user.id) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const clientInfo = getClientInfo(req);
    logActivity({
        userId: req.user.id,
        action: 'admin_delete_user',
        entityType: 'user',
        entityId: userId,
        entityName: user.email,
        metadata: { deletedUser: { email: user.email, fullName: user.fullName } },
        ...clientInfo
    });

    await prisma.user.delete({ where: { id: userId } });

    res.json({ success: true });
}

async function getSystemStats(req, res) {
    const [
        totalUsers,
        activeUsers,
        suspendedUsers,
        totalWorkspaces,
        totalBoards,
        totalCards,
        recentActivities
    ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { status: 'active' } }),
        prisma.user.count({ where: { status: 'suspended' } }),
        prisma.workspace.count(),
        prisma.board.count(),
        prisma.card.count(),
        prisma.activityLog.findMany({
            take: 10,
            orderBy: { createdAt: 'desc' },
            include: {
                user: {
                    select: { id: true, email: true, fullName: true }
                }
            }
        })
    ]);

    res.json({
        stats: {
            users: { total: totalUsers, active: activeUsers, suspended: suspendedUsers },
            workspaces: totalWorkspaces,
            boards: totalBoards,
            cards: totalCards
        },
        recentActivities
    });
}

module.exports = {
    getAllUsers,
    getUserDetail,
    updateUserStatus,
    updateUserRole,
    deleteUser,
    getSystemStats
};
