import bcrypt from 'bcryptjs';


async function hashPassword(plain) {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(plain, salt);
}


import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('🌱 Seeding database...')

    // XÓA DỮ LIỆU CŨ (DEV ONLY) -----------------------------------
    // Cẩn thận: cái này sẽ xóa sạch tất cả dữ liệu
    await prisma.activityLog.deleteMany()
    await prisma.notification.deleteMany()

    // Chat System
    await prisma.chatAttachment.deleteMany()
    await prisma.chatMessage.deleteMany()
    await prisma.chatMember.deleteMany()
    await prisma.workspaceChat.deleteMany()

    // Cards & Related
    await prisma.cardAttachment.deleteMany()
    await prisma.comment.deleteMany()
    await prisma.cardLabel.deleteMany()
    await prisma.cardMember.deleteMany()
    await prisma.card.deleteMany()
    await prisma.label.deleteMany()
    await prisma.list.deleteMany()
    await prisma.board.deleteMany()

    // Workspace & Members
    await prisma.workspaceInvitation.deleteMany()
    await prisma.workspaceMember.deleteMany()
    await prisma.workspace.deleteMany()

    // Auth & Settings
    await prisma.refreshToken.deleteMany()
    await prisma.emailVerification.deleteMany()
    await prisma.passwordReset.deleteMany()
    await prisma.notificationSetting.deleteMany()
    await prisma.user.deleteMany()

    // USERS -------------------------------------------------------
    const admin = await prisma.user.create({
        data: {
            email: 'admin@example.com',
            phone: '0900000001',
            passwordHash: await hashPassword('admin-password'), // TODO: thay bằng bcrypt hash thật nếu cần
            fullName: 'Admin User',
            avatar: null,
            description: 'System administrator',
            role: 'admin',
            status: 'active',
            emailVerified: true,
            emailVerifiedAt: new Date(),
        },
    })

    const member = await prisma.user.create({
        data: {
            email: 'member@example.com',
            phone: '0900000002',
            passwordHash: await hashPassword('member-password'),
            fullName: 'Member User',
            avatar: null,
            description: 'Normal workspace member',
            role: 'user',
            status: 'active',
            emailVerified: true,
            emailVerifiedAt: new Date(),
        },
    })

    // Notification settings cho từng user
    await prisma.notificationSetting.createMany({
        data: [
            {
                userId: admin.id,
                emailNotifications: true,
                workspaceCreated: true,
                workspaceInvitations: true,
                workspaceInvitationResponse: true,
                boardCreated: true,
                boardDeleted: true,
                taskAssigned: true,
                inAppGroupingEnabled: true,
                emailDigestEnabled: true,
                emailDigestFrequency: 'DAILY',
            },
            {
                userId: member.id,
                emailNotifications: true,
                workspaceCreated: true,
                workspaceInvitations: true,
                workspaceInvitationResponse: true,
                boardCreated: true,
                boardDeleted: true,
                taskAssigned: true,
                inAppGroupingEnabled: true,
                emailDigestEnabled: true,
                emailDigestFrequency: 'DAILY',
            },
        ],
    })

    // WORKSPACE ---------------------------------------------------
    const workspace = await prisma.workspace.create({
        data: {
            name: 'Demo Workspace',
            description: 'Workspace mẫu cho hệ thống quản lý task / board',
            visibility: 'private',
            ownerId: admin.id,
        },
    })

    // WORKSPACE CHAT ----------------------------------------------
    const workspaceChat = await prisma.workspaceChat.create({
        data: {
            workspaceId: workspace.id,
            name: 'Demo Workspace - Chat',
        },
    })

    // MEMBERSHIP --------------------------------------------------
    await prisma.workspaceMember.createMany({
        data: [
            {
                workspaceId: workspace.id,
                userId: admin.id,
                role: 'owner',
                invitedAt: new Date(),
                joinedAt: new Date(),
            },
            {
                workspaceId: workspace.id,
                userId: member.id,
                role: 'member',
                invitedById: admin.id,
                invitedAt: new Date(),
                joinedAt: new Date(),
            },
        ],
    })

    // CHAT MEMBERS ------------------------------------------------
    await prisma.chatMember.createMany({
        data: [
            {
                chatId: workspaceChat.id,
                userId: admin.id,
                joinedAt: new Date(),
            },
            {
                chatId: workspaceChat.id,
                userId: member.id,
                joinedAt: new Date(),
            },
        ],
    })

    // WORKSPACE INVITATION (ví dụ 1 người chưa join) --------------
    const invitation = await prisma.workspaceInvitation.create({
        data: {
            workspaceId: workspace.id,
            email: 'guest@example.com',
            role: 'guest',
            status: 'pending',
            invitedById: admin.id,
            invitedAt: new Date(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // +7 ngày
        },
    })

    // BOARD -------------------------------------------------------
    const board = await prisma.board.create({
        data: {
            workspaceId: workspace.id,
            name: 'Demo Project Board',
            keySlug: 'DEMO',
            mode: 'workspace',
            isPinned: true,
            createdById: admin.id,
        },
    })

    // LISTS -------------------------------------------------------
    const [backlog, inProgress, done] = await Promise.all([
        prisma.list.create({
            data: {
                boardId: board.id,
                name: 'Backlog',
                orderIdx: 1,
                isDone: false,
            },
        }),
        prisma.list.create({
            data: {
                boardId: board.id,
                name: 'In Progress',
                orderIdx: 2,
                isDone: false,
            },
        }),
        prisma.list.create({
            data: {
                boardId: board.id,
                name: 'Done',
                orderIdx: 3,
                isDone: true,
            },
        }),
    ])

    // LABELS ------------------------------------------------------
    const [bugLabel, featureLabel, improvementLabel] = await Promise.all([
        prisma.label.create({
            data: {
                boardId: board.id,
                name: 'Bug',
                colorHex: '#e74c3c',
            },
        }),
        prisma.label.create({
            data: {
                boardId: board.id,
                name: 'Feature',
                colorHex: '#3498db',
            },
        }),
        prisma.label.create({
            data: {
                boardId: board.id,
                name: 'Improvement',
                colorHex: '#f1c40f',
            },
        }),
    ])

    // CARDS -------------------------------------------------------
    const card1 = await prisma.card.create({
        data: {
            boardId: board.id,
            listId: backlog.id,
            keySeq: 1,
            title: 'Setup project structure',
            description: 'Init repo, cấu hình Prisma, ESLint, Prettier, CI basic.',
            priority: 'high',
            reporterId: admin.id,
            createdById: admin.id,
            updatedById: admin.id,
            orderIdx: 1,
            startDate: new Date(),
            dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        },
    })

    const card2 = await prisma.card.create({
        data: {
            boardId: board.id,
            listId: inProgress.id,
            keySeq: 2,
            title: 'Implement auth module',
            description: 'Đăng ký, đăng nhập, refresh token, verify email.',
            priority: 'medium',
            reporterId: admin.id,
            createdById: admin.id,
            updatedById: member.id,
            orderIdx: 1,
            startDate: new Date(),
            dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
            custom: {
                estimate: 8,
                tags: ['backend', 'auth'],
            },
        },
    })

    const card3 = await prisma.card.create({
        data: {
            boardId: board.id,
            listId: done.id,
            keySeq: 3,
            title: 'Design workspace & board schema',
            description: 'Thiết kế schema Prisma cho workspace / board / list / card.',
            priority: 'low',
            reporterId: admin.id,
            createdById: admin.id,
            updatedById: admin.id,
            orderIdx: 1,
            archivedAt: null,
            startDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
            dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        },
    })

    // CARD MEMBERS ------------------------------------------------
    await prisma.cardMember.createMany({
        data: [
            { cardId: card1.id, userId: admin.id },
            { cardId: card2.id, userId: admin.id },
            { cardId: card2.id, userId: member.id },
            { cardId: card3.id, userId: admin.id },
        ],
    })

    // CARD LABELS -------------------------------------------------
    await prisma.cardLabel.createMany({
        data: [
            { cardId: card1.id, labelId: improvementLabel.id },
            { cardId: card2.id, labelId: featureLabel.id },
            { cardId: card3.id, labelId: improvementLabel.id },
        ],
    })

    // COMMENTS (kèm comment reply) --------------------------------
    const rootComment = await prisma.comment.create({
        data: {
            cardId: card2.id,
            authorId: member.id,
            bodyMd: 'Mình sẽ implement phần login & refresh token trước.',
        },
    })

    await prisma.comment.create({
        data: {
            cardId: card2.id,
            authorId: admin.id,
            parentId: rootComment.id,
            bodyMd: 'OK, nhớ log activity + gửi notification khi có thay đổi quan trọng.',
        },
    })

    // ATTACHMENTS -------------------------------------------------
    await prisma.cardAttachment.create({
        data: {
            cardId: card2.id,
            fileName: 'auth-flow.png',
            fileSize: 120_000,
            mimeType: 'image/png',
            fileUrl: 'https://example.com/files/auth-flow.png',
            uploadedById: member.id,
        },
    })

    // NOTIFICATIONS -----------------------------------------------
    await prisma.notification.createMany({
        data: [
            {
                type: 'workspace_invitation',
                title: 'Workspace invitation',
                message: `You have been invited to workspace "${workspace.name}"`,
                senderId: admin.id,
                receiverId: member.id,
                workspaceId: workspace.id,
                invitationId: invitation.id,
                isRead: false,
            },
            {
                type: 'task_assigned',
                title: 'New task assigned',
                message: `You have been assigned to card "${card2.title}"`,
                senderId: admin.id,
                receiverId: member.id,
                workspaceId: workspace.id,
                cardId: card2.id,
                isRead: false,
            },
        ],
    })

    // TOKENS ------------------------------------------------------
    await prisma.refreshToken.create({
        data: {
            userId: admin.id,
            tokenHash: 'hashed-refresh-token-admin-1',
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            ipAddress: '127.0.0.1',
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
    })

    // EMAIL VERIFICATION / PASSWORD RESET -------------------------
    await prisma.emailVerification.create({
        data: {
            userId: member.id,
            otp: '123456',
            attempts: 0,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
            verifiedAt: new Date(),
        },
    })

    await prisma.passwordReset.create({
        data: {
            userId: member.id,
            codeHash: 'hashed-reset-code',
            attempts: 0,
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
    })

    // ACTIVITY LOGS -----------------------------------------------
    await prisma.activityLog.createMany({
        data: [
            {
                userId: admin.id,
                action: 'workspace_created',
                entityType: 'workspace',
                entityId: workspace.id,
                entityName: workspace.name,
                metadata: { visibility: workspace.visibility },
                ipAddress: '127.0.0.1',
                userAgent: 'seed-script',
            },
            {
                userId: admin.id,
                action: 'board_created',
                entityType: 'board',
                entityId: board.id,
                entityName: board.name,
                metadata: { keySlug: board.keySlug },
                ipAddress: '127.0.0.1',
                userAgent: 'seed-script',
            },
            {
                userId: admin.id,
                action: 'card_created',
                entityType: 'card',
                entityId: card2.id,
                entityName: card2.title,
                metadata: { list: 'In Progress', priority: card2.priority },
                ipAddress: '127.0.0.1',
                userAgent: 'seed-script',
            },
        ],
    })

    // CHAT MESSAGES -----------------------------------------------
    const chatMsg1 = await prisma.chatMessage.create({
        data: {
            chatId: workspaceChat.id,
            senderId: admin.id,
            messageType: 'text',
            content: 'Chào mừng mọi người đến với workspace Demo! 🎉',
        },
    })

    const chatMsg2 = await prisma.chatMessage.create({
        data: {
            chatId: workspaceChat.id,
            senderId: member.id,
            messageType: 'text',
            content: 'Xin chào! Cảm ơn đã mời tôi tham gia.',
        },
    })

    const chatMsg3 = await prisma.chatMessage.create({
        data: {
            chatId: workspaceChat.id,
            senderId: admin.id,
            messageType: 'text',
            content: 'Mọi người có thể thảo luận về dự án ở đây nhé!',
            replyToId: chatMsg2.id,
        },
    })

    // CHAT ATTACHMENTS --------------------------------------------
    await prisma.chatAttachment.create({
        data: {
            messageId: chatMsg3.id,
            fileName: 'project-overview.pdf',
            fileSize: 250000,
            mimeType: 'application/pdf',
            fileUrl: '/uploads/chat/project-overview-123456.pdf',
            uploadedById: admin.id,
        },
    })

    // Update lastReadAt cho chat members
    await prisma.chatMember.update({
        where: {
            chatId_userId: {
                chatId: workspaceChat.id,
                userId: member.id,
            },
        },
        data: {
            lastReadAt: new Date(),
        },
    })

    console.log('✅ Seeding done.')
    console.log(`📊 Summary:`)
    console.log(`   - Users: 2`)
    console.log(`   - Workspaces: 1`)
    console.log(`   - Workspace Chat: 1`)
    console.log(`   - Chat Messages: 3`)
    console.log(`   - Boards: 1`)
    console.log(`   - Lists: 3`)
    console.log(`   - Cards: 3`)
    console.log(`   - Labels: 3`)
    console.log(`   - Comments: 2`)
    console.log(`   - Notifications: 2`)
    console.log(`   - Activity Logs: 3`)
}

main()
    .catch((e) => {
        console.error('❌ Seeding error:', e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
