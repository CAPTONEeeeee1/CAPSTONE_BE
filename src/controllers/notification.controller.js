const { prisma } = require('../shared/prisma');
const { updateNotificationSettingsSchema } = require('../validators/notification.validators');


async function getMyNotifications(req, res) {
    const { page = 1, limit = 20, unreadOnly = false } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = { receiverId: req.user.id };
    if (unreadOnly === 'true') {
        where.isRead = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
        prisma.notification.findMany({
            where,
            include: {
                sender: {
                    select: { id: true, fullName: true, email: true, avatar: true }
                }
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: parseInt(limit)
        }),
        prisma.notification.count({ where }),
        prisma.notification.count({ 
            where: { receiverId: req.user.id, isRead: false } 
        })
    ]);

    res.json({
        notifications,
        pagination: {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / parseInt(limit))
        },
        unreadCount
    });
}

async function markAsRead(req, res) {
    const { notificationId } = req.params;

    const notification = await prisma.notification.findUnique({
        where: { id: notificationId }
    });

    if (!notification) {
        return res.status(404).json({ error: 'Notification not found' });
    }

    if (notification.receiverId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
    }

    const updated = await prisma.notification.update({
        where: { id: notificationId },
        data: { isRead: true, readAt: new Date() }
    });

    res.json({ notification: updated });
}

async function markAllAsRead(req, res) {
    await prisma.notification.updateMany({
        where: { receiverId: req.user.id, isRead: false },
        data: { isRead: true, readAt: new Date() }
    });

    res.json({ success: true, message: 'All notifications marked as read' });
}

async function deleteNotification(req, res) {
    const { notificationId } = req.params;

    const notification = await prisma.notification.findUnique({
        where: { id: notificationId }
    });

    if (!notification) {
        return res.status(404).json({ error: 'Notification not found' });
    }

    if (notification.receiverId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.notification.delete({ where: { id: notificationId } });

    res.json({ success: true });
}

async function getNotificationSettings(req, res) {
    let settings = await prisma.notificationSetting.findUnique({
        where: { userId: req.user.id }
    });

    if (!settings) {
        settings = await prisma.notificationSetting.create({
            data: { userId: req.user.id }
        });
    }

    res.json({ settings });
}

async function updateNotificationSettings(req, res) {
    const parsed = updateNotificationSettingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    
    const { emailNotifications, taskAssignedEmail, workspaceInviteEmail, invitationResponseEmail } = parsed.data;

    const updateData = {};
    if (emailNotifications !== undefined) updateData.emailNotifications = emailNotifications;
    if (taskAssignedEmail !== undefined) updateData.taskAssignedEmail = taskAssignedEmail;
    if (workspaceInviteEmail !== undefined) updateData.workspaceInviteEmail = workspaceInviteEmail;
    if (invitationResponseEmail !== undefined) updateData.invitationResponseEmail = invitationResponseEmail;

    const settings = await prisma.notificationSetting.upsert({
        where: { userId: req.user.id },
        update: updateData,
        create: {
            userId: req.user.id,
            ...updateData
        }
    });

    res.json({ settings });
}

async function getUnreadCount(req, res) {
    const count = await prisma.notification.count({
        where: { receiverId: req.user.id, isRead: false }
    });

    res.json({ unreadCount: count });
}

module.exports = {
    getMyNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    getNotificationSettings,
    updateNotificationSettings,
    getUnreadCount
};
