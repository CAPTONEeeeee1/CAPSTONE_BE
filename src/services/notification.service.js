const { prisma } = require('../shared/prisma');
const { sendEmail, getWorkspaceInvitationEmailTemplate, getTaskAssignedEmailTemplate, getInvitationResponseEmailTemplate } = require('./email.service');

async function createNotification({ type, title, message, senderId, receiverId, workspaceId, cardId, invitationId }) {
    return await prisma.notification.create({
        data: {
            type,
            title,
            message,
            senderId,
            receiverId,
            workspaceId,
            cardId,
            invitationId
        }
    });
}

function runInBackground(asyncFn) {
    asyncFn().catch(err => {
        console.error('[Background Task Error]:', err.message);
    });
}

async function sendWorkspaceInvitationNotification({ inviterId, receiverEmail, workspace, invitationId }) {
    runInBackground(async () => {
        const receiver = await prisma.user.findUnique({ where: { email: receiverEmail } });
        if (!receiver) return;

        const inviter = await prisma.user.findUnique({ where: { id: inviterId } });

        await createNotification({
            type: 'workspace_invitation',
            title: 'Lời mời tham gia workspace',
            message: `${inviter.fullName} đã mời bạn tham gia workspace "${workspace.name}"`,
            senderId: inviterId,
            receiverId: receiver.id,
            workspaceId: workspace.id,
            invitationId
        });

        const settings = await prisma.notificationSetting.findUnique({
            where: { userId: receiver.id }
        });

        if (!settings || (settings.emailNotifications && settings.workspaceInviteEmail)) {
            const acceptUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/invitations/${invitationId}`;
            const emailHtml = getWorkspaceInvitationEmailTemplate(workspace, inviter.fullName, acceptUrl);

            await sendEmail({
                to: receiverEmail,
                subject: `Lời mời tham gia workspace: ${workspace.name}`,
                html: emailHtml
            });
        }
    });
}

async function sendTaskAssignedNotification({
    assignerId,
    assigneeId,
    cardId,
    cardTitle,
    cardDescription,
    cardPriority,
    cardDueDate,
    cardKeySeq,
    boardId,
    boardKey,
    workspaceId
}) {
    runInBackground(async () => {
        const [assigner, assignee] = await Promise.all([
            prisma.user.findUnique({ where: { id: assignerId } }),
            prisma.user.findUnique({ where: { id: assigneeId } })
        ]);

        if (!assigner || !assignee) {
            console.error('Assigner or assignee not found');
            return;
        }

        const taskKey = `${boardKey || 'CARD'}-${cardKeySeq}`;

        // Create in-app notification
        try {
            await createNotification({
                type: 'task_assigned',
                title: 'Nhiệm vụ mới được giao',
                message: `${assigner.fullName} đã giao nhiệm vụ "${cardTitle}" (${taskKey}) cho bạn`,
                senderId: assignerId,
                receiverId: assigneeId,
                cardId: cardId,
                workspaceId: workspaceId
            });
        } catch (error) {
            console.error('Failed to create in-app notification:', error);
            throw error;
        }

        // Always send email notification (check settings first)
        const settings = await prisma.notificationSetting.findUnique({
            where: { userId: assigneeId }
        });

        // Send email if no settings found (default) or if explicitly enabled
        const shouldSendEmail = !settings || (settings.emailNotifications && settings.taskAssignedEmail);

        if (shouldSendEmail) {
            const taskUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/workspaces/${workspaceId}/boards/${boardId}`;

            const cardData = {
                id: cardId,
                title: cardTitle,
                description: cardDescription,
                priority: cardPriority,
                dueDate: cardDueDate,
                keySeq: cardKeySeq
            };

            const emailHtml = getTaskAssignedEmailTemplate(cardData, assigner.fullName, taskUrl);

            try {
                await sendEmail({
                    to: assignee.email,
                    subject: `Nhiệm vụ mới: ${cardTitle}`,
                    html: emailHtml
                });
            } catch (error) {
                console.error('Failed to send email:', error.message);
            }
        }
    });
}

async function sendInvitationResponseNotification({ inviterId, responderId, workspace, accepted }) {
    runInBackground(async () => {
        const [inviter, responder] = await Promise.all([
            prisma.user.findUnique({ where: { id: inviterId } }),
            prisma.user.findUnique({ where: { id: responderId } })
        ]);

        const notificationType = accepted ? 'invitation_accepted' : 'invitation_rejected';
        const actionText = accepted ? 'đã chấp nhận' : 'đã từ chối';

        await createNotification({
            type: notificationType,
            title: `Phản hồi lời mời workspace`,
            message: `${responder.fullName} ${actionText} lời mời tham gia workspace "${workspace.name}"`,
            senderId: responderId,
            receiverId: inviterId,
            workspaceId: workspace.id
        });

        const settings = await prisma.notificationSetting.findUnique({
            where: { userId: inviterId }
        });

        if (!settings || (settings.emailNotifications && settings.invitationResponseEmail)) {
            const emailHtml = getInvitationResponseEmailTemplate(workspace, responder.fullName, accepted);

            await sendEmail({
                to: inviter.email,
                subject: `Phản hồi lời mời: ${workspace.name}`,
                html: emailHtml
            });
        }
    });
}

module.exports = {
    createNotification,
    sendWorkspaceInvitationNotification,
    sendTaskAssignedNotification,
    sendInvitationResponseNotification
};
