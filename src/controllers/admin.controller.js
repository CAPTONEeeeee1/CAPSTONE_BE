const { prisma } = require('../shared/prisma');
const { logActivity, getClientInfo } = require('../services/activity.service');
const { sendEmail, getUserSuspendedEmailTemplate } = require('../services/email.service');

// --- Lấy danh sách người dùng ---
async function getAllUsers(req, res) {
  const { page = 1, limit = 20, search } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where = search
    ? {
        OR: [
          { email: { contains: search, mode: 'insensitive' } },
          { fullName: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {};

  const [rawUsers, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        createdAt: true,
        avatar: true,
        _count: {
          select: {
            workspaceMemberships: true,
          },
        },
        workspaceMemberships: {
          select: {
            role: true,
            workspace: {
              select: {
                plan: true,
                planExpiresAt: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: parseInt(limit),
    }),
    prisma.user.count({ where }),
  ]);

  const now = new Date();

  const users = rawUsers.map((u) => {
    const ownedWorkspaces = u.workspaceMemberships.filter(
      (m) => m.role === 'OWNER'
    ).length;

    const memberWorkspaces = u.workspaceMemberships.length;

    const hasActivePremiumWorkspace = u.workspaceMemberships.some(
      (m) =>
        m.workspace.plan === 'PREMIUM' &&
        (!m.workspace.planExpiresAt || m.workspace.planExpiresAt > now)
    );

    return {
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      status: u.status,
      createdAt: u.createdAt,
      avatar: u.avatar,

      ownedWorkspaces,
      memberWorkspaces,

      _count: {
        workspaceMemberships: u._count.workspaceMemberships,
        ownedWorkspaces,
      },

      accountType: hasActivePremiumWorkspace ? 'premium' : 'free',
    };
  });

  res.json({
    users,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
    },
  });
}

// --- Lấy danh sách thanh toán (Admin Payment) ---
async function getPayments(req, res) {
  const { page = 1, limit = 20, search, startDate, endDate } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where = {};

  if (search) {
    where.OR = [
      { orderId: { contains: search, mode: 'insensitive' } },
      { transactionNo: { contains: search, mode: 'insensitive' } },
      {
        workspace: {
          name: { contains: search, mode: 'insensitive' },
        },
      },
      {
        user: {
          email: { contains: search, mode: 'insensitive' },
        },
      },
    ];
  }

  if (startDate && endDate) {
    where.createdAt = {
      gte: new Date(startDate),
      lte: new Date(endDate),
    };
  }

  const [payments, total, totalRevenueResult] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
          },
        },
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: parseInt(limit),
    }),
    prisma.payment.count({ where }),
    prisma.payment.aggregate({
      where,
      _sum: {
        amount: true,
      },
    }),
  ]);

  const totalRevenue = totalRevenueResult._sum.amount || 0;

  const PLAN_LABELS = {
    monthly: 'Gói 1 tháng',
    semiannual: 'Gói 6 tháng',
    annual: 'Gói 12 tháng',
    free_trial: 'Dùng thử',
  };

  res.json({
    payments: payments.map((p) => ({
      id: p.id,
      orderId: p.orderId,
      workspaceId: p.workspaceId,
      workspaceName: p.workspace?.name || '(Đã xóa workspace)',
      userId: p.userId,
      userName: p.user?.fullName || '(Ẩn danh)',
      userEmail: p.user?.email || '',
      amount: p.amount,
      status: p.status,
      plan: p.plan,
      planLabel: PLAN_LABELS[p.plan] || 'Không xác định',
      createdAt: p.createdAt,
    })),
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
    },
    totalRevenue,
  });
}

// --- Lấy chi tiết 1 người dùng ---
async function getUserDetail(req, res) {
  const { userId } = req.params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      phone: true,
      role: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          workspaceMemberships: true,
          createdCards: true,
        },
      },
    },
  });

  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
}

// --- Cập nhật trạng thái người dùng ---
async function updateUserStatus(req, res) {
  const { userId } = req.params;
  const { status } = req.body;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.email === 'admin@plannex.com') {
    return res.status(403).json({ error: 'Cannot modify system admin account' });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { status },
  });

  const clientInfo = getClientInfo(req);
  await logActivity({
    userId: req.user.id,
    action: 'admin_update_user_status',
    entityType: 'user',
    entityId: userId,
    entityName: user.email,
    metadata: { oldStatus: user.status, newStatus: status },
    ...clientInfo,
  });

  if (status === 'suspended') {
    const emailHtml = getUserSuspendedEmailTemplate(user.fullName);
    await sendEmail({
      to: user.email,
      subject: 'Tài khoản của bạn đã bị đình chỉ',
      html: emailHtml,
    });
  }

  res.json({ user: updated });
}

// --- Cập nhật vai trò người dùng ---
async function updateUserRole(req, res) {
  const { userId } = req.params;
  const { role } = req.body;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.email === 'admin@plannex.com') {
    return res.status(403).json({ error: 'Cannot modify system admin account' });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role },
  });

  const clientInfo = getClientInfo(req);
  await logActivity({
    userId: req.user.id,
    action: 'admin_update_user_role',
    entityType: 'user',
    entityId: userId,
    entityName: user.email,
    metadata: { oldRole: user.role, newRole: role },
    ...clientInfo,
  });

  res.json({ user: updated });
}

// --- Cập nhật thông tin cơ bản ---
async function updateUserInfo(req, res) {
  const { userId } = req.params;
  const { fullName, phone } = req.body;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.email === 'admin@plannex.com') {
    return res.status(403).json({ error: 'Cannot modify system admin account' });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { fullName, phone },
  });

  const clientInfo = getClientInfo(req);
  await logActivity({
    userId: req.user.id,
    action: 'admin_update_user_info',
    entityType: 'user',
    entityId: userId,
    entityName: user.email,
    metadata: { changes: { fullName, phone } },
    ...clientInfo,
  });

  res.json({ user: updated });
}

// --- Xóa người dùng ---
async function deleteUser(req, res) {
  const { userId } = req.params;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.email === 'admin@plannex.com') {
    return res
      .status(403)
      .json({ error: 'Cannot delete the system admin account' });
  }

  try {
    const [ownedWorkspaces, createdBoards, relatedCards] = await Promise.all([
      prisma.workspace.count({
        where: {
          members: {
            some: {
              userId: userId,
              role: 'OWNER',
            },
          },
        },
      }),
      prisma.board.count({
        where: { createdById: userId },
      }),
      prisma.card.count({
        where: {
          OR: [
            { createdById: userId },
            { reporterId: userId },
            { updatedById: userId },
          ],
        },
      }),
    ]);

    if (ownedWorkspaces > 0 || createdBoards > 0 || relatedCards > 0) {
      return res.status(400).json({
        error:
          'Không thể xóa tài khoản vì người dùng đã tạo hoặc tham gia công việc (workspace/board/card).',
      });
    }

    await prisma.user.delete({ where: { id: userId } });

    const clientInfo = getClientInfo(req);
    await logActivity({
      userId: req.user.id,
      action: 'admin_delete_user',
      entityType: 'user',
      entityId: userId,
      entityName: user.email,
      metadata: { deletedEmail: user.email },
      ...clientInfo,
    });

    return res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    console.error('Delete user failed:', err);
    return res.status(500).json({
      error: 'Cannot delete user, related data exists.',
    });
  }
}

async function getStats(req, res) {
  try {
    const [
      totalUsers,
      activeUsers,
      suspendedUsers,
      workspaces,
      boards,
      cards,
      recentActivities,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: 'active' } }),
      prisma.user.count({ where: { status: 'suspended' } }),
      prisma.workspace.count(),
      prisma.board.count(),
      prisma.card.count(),
      prisma.activityLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
      }),
    ]);

    res.json({
      stats: {
        users: {
          total: totalUsers,
          active: activeUsers,
          suspended: suspendedUsers,
        },
        workspaces,
        boards,
        cards,
      },
      recentActivities,
    });
  } catch (err) {
    console.error('Get admin stats error:', err);
    res.status(500).json({ error: 'Could not fetch system statistics' });
  }
}

module.exports = {
  getAllUsers,
  getPayments,
  getUserDetail,
  updateUserStatus,
  updateUserRole,
  updateUserInfo,
  deleteUser,
  getStats,
};
