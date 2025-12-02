const { prisma } = require('../shared/prisma');
const { logActivity, getClientInfo } = require('../services/activity.service');

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

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        createdAt: true,
        _count: {
          select: {
            ownedWorkspaces: true,
            workspaceMemberships: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: parseInt(limit),
    }),
    prisma.user.count({ where }),
  ]);

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
          ownedWorkspaces: true,
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

  // ❌ Không cho phép thay đổi trạng thái của admin duy nhất
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

  res.json({ user: updated });
}

// --- Cập nhật vai trò người dùng ---
async function updateUserRole(req, res) {
  const { userId } = req.params;
  const { role } = req.body;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  // ❌ Không cho phép thay đổi vai trò admin mặc định
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

  // ❌ Không cho phép đổi tên hoặc sửa thông tin admin mặc định
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

  // ❌ Không cho phép xóa admin duy nhất
  if (user.email === 'admin@plannex.com') {
    return res.status(403).json({ error: 'Cannot delete the system admin account' });
  }

  try {
    // Xóa dữ liệu liên quan
    await prisma.workspaceMembership.deleteMany({ where: { userId } });
    await prisma.board.deleteMany({ where: { ownerId: userId } });
    await prisma.card.deleteMany({ where: { creatorId: userId } });
    await prisma.workspace.deleteMany({ where: { ownerId: userId } });

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

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    console.error('Delete user failed:', err);
    res.status(500).json({ error: 'Cannot delete user, related data exists.' });
  }
}

module.exports = {
  getAllUsers,
  getUserDetail,
  updateUserStatus,
  updateUserRole,
  updateUserInfo,
  deleteUser,
};
