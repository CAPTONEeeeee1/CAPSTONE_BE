const { prisma } = require('../shared/prisma');
const { sendEmail, getWorkspaceInvitationEmailTemplate, getTaskAssignedEmailTemplate, getInvitationResponseEmailTemplate, getWorkspaceDeletedEmailTemplate, getBoardCreatedEmailTemplate, getBoardDeletedEmailTemplate } = require('./email.service');

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
        console.log(`[sendWorkspaceInvitationNotification] Settings for user ${receiver.id}:`, settings);

        const shouldSendIndividualEmail = !settings || (
            settings.emailNotifications &&
            settings.workspaceInvitations &&
            (!settings.emailDigestEnabled || settings.emailDigestFrequency === 'NEVER')
        );
        console.log(`[sendWorkspaceInvitationNotification] shouldSendIndividualEmail: ${shouldSendIndividualEmail}`);

        if (shouldSendIndividualEmail) {
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

        const settings = await prisma.notificationSetting.findUnique({
            where: { userId: assigneeId }
        });
        console.log(`[sendTaskAssignedNotification] Settings for user ${assigneeId}:`, settings);

        // Send email if no settings found (default) or if explicitly enabled
        const shouldSendIndividualEmail = !settings || (
            settings.emailNotifications &&
            settings.taskAssigned &&
            (!settings.emailDigestEnabled || settings.emailDigestFrequency === 'NEVER')
        );
        console.log(`[sendTaskAssignedNotification] shouldSendIndividualEmail: ${shouldSendIndividualEmail}`);

        if (shouldSendIndividualEmail) {
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
        console.log(`[sendInvitationResponseNotification] Settings for user ${inviterId}:`, settings);

        const shouldSendIndividualEmail = !settings || (
            settings.emailNotifications &&
            settings.workspaceInvitationResponse &&
            (!settings.emailDigestEnabled || settings.emailDigestFrequency === 'NEVER')
        );
        console.log(`[sendInvitationResponseNotification] shouldSendIndividualEmail: ${shouldSendIndividualEmail}`);

        if (shouldSendIndividualEmail) {
            const emailHtml = getInvitationResponseEmailTemplate(workspace, responder.fullName, accepted);

            await sendEmail({
                to: inviter.email,
                subject: `Phản hồi lời mời: ${workspace.name}`,
                html: emailHtml
            });
        }
    });
}

async function sendWorkspaceDeletedNotification({ deleterId, memberId, workspaceName, deleterName }) {
    runInBackground(async () => {
        const [deleter, member] = await Promise.all([
            prisma.user.findUnique({ where: { id: deleterId } }),
            prisma.user.findUnique({ where: { id: memberId } })
        ]);

        if (!member) return; // Member might have been deleted or not found

        // Create in-app notification (already done in controller, but good to have a dedicated call if needed)
        try {
            await createNotification({
                type: 'workspace_deleted',
                title: 'Workspace đã bị xóa',
                message: `Workspace "${workspaceName}" mà bạn là thành viên đã bị xóa bởi ${deleterName}.`,
                senderId: deleterId,
                receiverId: memberId,
            });
        } catch (error) {
            console.error('Failed to create in-app notification for workspace deleted:', error);
        }

        const settings = await prisma.notificationSetting.findUnique({
            where: { userId: memberId }
        });

        // For workspace deletion, we assume 'boardDeleted' setting also covers this for email preference.
        // A more granular setting (e.g., settings.workspaceDeleted) would require schema change.
        const shouldSendIndividualEmail = !settings || (
            settings.emailNotifications &&
            settings.boardDeleted && 
            (!settings.emailDigestEnabled || settings.emailDigestFrequency === 'NEVER')
        );

        if (shouldSendIndividualEmail) {
            const emailHtml = getWorkspaceDeletedEmailTemplate(workspaceName, deleterName);

            try {
                await sendEmail({
                    to: member.email,
                    subject: `🗑️ Workspace đã bị xóa: ${workspaceName}`,
                    html: emailHtml
                });
            } catch (error) {
                console.error('Failed to send workspace deleted email:', error.message);
            }
        }
    });
}

async function sendBoardCreatedNotification({ creatorId, memberId, boardName, workspaceName, boardUrl, creatorName }) {
    runInBackground(async () => {
        const [creator, member] = await Promise.all([
            prisma.user.findUnique({ where: { id: creatorId } }),
            prisma.user.findUnique({ where: { id: memberId } })
        ]);

        if (!member) return; // Member might have been deleted or not found

        // Create in-app notification
        try {
            await createNotification({
                type: 'board_created',
                title: 'Board mới được tạo',
                message: `${creatorName} đã tạo board "${boardName}" trong workspace "${workspaceName}".`,
                senderId: creatorId,
                receiverId: memberId,
            });
        } catch (error) {
            console.error('Failed to create in-app notification for board created:', error);
        }

        const settings = await prisma.notificationSetting.findUnique({
            where: { userId: memberId }
        });

        const shouldSendIndividualEmail = !settings || (
            settings.emailNotifications &&
            settings.boardCreated &&
            (!settings.emailDigestEnabled || settings.emailDigestFrequency === 'NEVER')
        );

        if (shouldSendIndividualEmail) {
            const emailHtml = getBoardCreatedEmailTemplate(boardName, creatorName, workspaceName, boardUrl);

            try {
                await sendEmail({
                    to: member.email,
                    subject: `✨ Board mới được tạo: ${boardName}`,
                    html: emailHtml
                });
            } catch (error) {
                console.error('Failed to send board created email:', error.message);
            }
        }
    });
}

async function sendBoardDeletedNotification({ deleterId, memberId, boardName, workspaceName, deleterName }) {
    runInBackground(async () => {
        const [deleter, member] = await Promise.all([
            prisma.user.findUnique({ where: { id: deleterId } }),
            prisma.user.findUnique({ where: { id: memberId } })
        ]);

        if (!member) return; // Member might have been deleted or not found

        // Create in-app notification
        try {
            await createNotification({
                type: 'board_deleted',
                title: 'Board đã bị xóa',
                message: `${deleterName} đã xóa board "${boardName}" trong workspace "${workspaceName}".`,
                senderId: deleterId,
                receiverId: memberId,
            });
        } catch (error) {
            console.error('Failed to create in-app notification for board deleted:', error);
        }

        const settings = await prisma.notificationSetting.findUnique({
            where: { userId: memberId }
        });

        const shouldSendIndividualEmail = !settings || (
            settings.emailNotifications &&
            settings.boardDeleted &&
            (!settings.emailDigestEnabled || settings.emailDigestFrequency === 'NEVER')
        );

        if (shouldSendIndividualEmail) {
            const emailHtml = getBoardDeletedEmailTemplate(boardName, deleterName, workspaceName);

            try {
                await sendEmail({
                    to: member.email,
                    subject: `🗑️ Board đã bị xóa: ${boardName}`,
                    html: emailHtml
                });
            } catch (error) {
                console.error('Failed to send board deleted email:', error.message);
            }
        }
    });
}

module.exports = {
    createNotification,
    sendWorkspaceInvitationNotification,
    sendTaskAssignedNotification,
    sendInvitationResponseNotification,
    sendWorkspaceDeletedNotification,
    sendBoardCreatedNotification,
    sendBoardDeletedNotification
};

