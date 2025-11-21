const { prisma } = require('../shared/prisma');
// Hợp nhất tất cả các validators
const { createCardSchema, updateCardSchema, moveCardSchema, assignMemberSchema } = require('../validators/card.validators'); 
// Import các services mới từ Code 2
const { sendTaskAssignedNotification } = require('../services/notification.service');
const { logActivity, getClientInfo } = require('../services/activity.service');


/**
 * Hàm hỗ trợ kiểm tra quyền truy cập Workspace (Từ Code 2)
 */
async function checkWorkspaceAccess(boardId, userId) {
    const board = await prisma.board.findUnique({
        where: { id: boardId },
        select: { workspaceId: true }
    });
    if (!board) return { board: null, workspaceMember: null };

    const workspaceMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId: board.workspaceId, userId }
    });

    return { board, workspaceMember };
}

/**
 * Hàm tạo key người đọc (Từ Code 1 & 2)
 */
function makeBoardKey(prefix, seq) {
    if (prefix && prefix.trim()) return `${prefix.trim().toUpperCase()}-${seq}`;
    return `CARD-${seq}`;
}


// --- CREATE CARD ---

async function createCard(req, res) {
    const parsed = createCardSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    // Thêm attachments từ Code 2
    const { boardId, listId, title, description, priority, dueDate, startDate, assigneeIds, labelIds, attachments, custom } = parsed.data;

    // Fetch board info and list validity in one query (Tối ưu từ Code 2)
    const boardInfo = await prisma.board.findUnique({
        where: { id: boardId },
        select: {
            id: true,
            keySlug: true,
            workspaceId: true,
            lists: {
                where: { id: listId },
                select: { id: true }
            }
        }
    });

    if (!boardInfo) return res.status(404).json({ error: 'Board not found' });
    if (!boardInfo.lists.length) return res.status(400).json({ error: 'Invalid list' });

    // Check workspace access (Tối ưu từ Code 2, thay vì Board Member)
    const workspaceMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId: boardInfo.workspaceId, userId: req.user.id },
        select: { role: true }
    });

    if (!workspaceMember) return res.status(403).json({ error: 'Not a workspace member' });
    // Tùy chọn: Ràng buộc quyền tạo card (Từ Code 2)
    if (!['owner', 'admin', 'member'].includes(workspaceMember.role)) { // Giữ 'member' nếu muốn tất cả thành viên tạo được
        return res.status(403).json({ error: 'Only workspace owners, admins, and members can create cards' });
    }

    // Lấy max values (orderIdx, keySeq) song song (Tối ưu từ Code 2)
    const [maxOrder, maxKey] = await Promise.all([
        prisma.card.aggregate({ where: { listId }, _max: { orderIdx: true } }),
        prisma.card.aggregate({ where: { boardId }, _max: { keySeq: true } })
    ]);

    const orderIdx = (maxOrder._max.orderIdx ?? -1) + 1;
    const keySeq = (maxKey._max.keySeq ?? 0) + 1;

    // Create card
    const card = await prisma.card.create({
        data: {
            boardId,
            listId,
            keySeq,
            title,
            description: description ?? null,
            priority: priority ?? 'medium',
            dueDate: dueDate ? new Date(dueDate) : null,
            startDate: startDate ? new Date(startDate) : null,
            orderIdx,
            custom: custom ?? null,
            reporterId: req.user.id,
            createdById: req.user.id,
        }
    });

    // Xử lý members, labels, attachments song song (Tối ưu từ Code 2)
    const [members, labels, cardAttachments] = await Promise.all([
        // Members
        (async () => {
            if (!assigneeIds?.length) return [];

            // Tìm thông tin người dùng được gán (giả định họ là thành viên workspace)
            const validUsers = await prisma.user.findMany({
                where: { id: { in: assigneeIds } },
                select: { id: true, fullName: true, email: true }
            });

            if (!validUsers.length) return [];

            // Tạo nhiều record CardMember
            await prisma.cardMember.createMany({
                data: validUsers.map(u => ({ cardId: card.id, userId: u.id })),
                skipDuplicates: true
            });

            // Gửi thông báo (Từ Code 2)
            validUsers.forEach(user => {
                if (user.id !== req.user.id) {
                    sendTaskAssignedNotification({
                        assignerId: req.user.id,
                        assigneeId: user.id,
                        cardId: card.id,
                        cardTitle: card.title,
                        cardDescription: card.description,
                        cardPriority: card.priority,
                        cardDueDate: card.dueDate,
                        cardKeySeq: card.keySeq,
                        boardId: boardInfo.id,
                        boardKey: boardInfo.keySlug,
                        workspaceId: boardInfo.workspaceId
                    }).catch(err => {
                        console.error('Failed to send task notification:', err);
                    });
                }
            });

            // Trả về định dạng dễ sử dụng
            return validUsers.map(u => ({ userId: u.id, user: u }));
        })(),

        // Labels
        (async () => {
            if (!labelIds?.length) return [];

            const validLabels = await prisma.label.findMany({
                where: { boardId, id: { in: labelIds } },
                select: { id: true, name: true, colorHex: true }
            });

            if (!validLabels.length) return [];

            await prisma.cardLabel.createMany({
                data: validLabels.map(l => ({ cardId: card.id, labelId: l.id })),
                skipDuplicates: true
            });

            return validLabels.map(l => ({ labelId: l.id, label: l }));
        })(),

        // Attachments (Từ Code 2)
        (async () => {
            if (!attachments?.length) return [];
            // Sử dụng createManyAndReturn (nếu Prisma client hỗ trợ, nếu không phải dùng createMany và sau đó findMany)
            // Giả định createManyAndReturn được hỗ trợ hoặc sẽ sử dụng một logic thay thế để lấy lại dữ liệu
            try {
                return prisma.cardAttachment.createManyAndReturn({ 
                    data: attachments.map(a => ({
                        cardId: card.id,
                        fileName: a.fileName,
                        fileSize: a.fileSize,
                        mimeType: a.mimeType,
                        fileUrl: a.fileUrl,
                        uploadedById: req.user.id
                    })),
                    select: { id: true, fileName: true, fileSize: true, mimeType: true, fileUrl: true, uploadedAt: true }
                });
            } catch (e) {
                 // Fallback if createManyAndReturn is not available (common in older Prisma)
                 await prisma.cardAttachment.createMany({
                     data: attachments.map(a => ({
                        cardId: card.id,
                        fileName: a.fileName,
                        fileSize: a.fileSize,
                        mimeType: a.mimeType,
                        fileUrl: a.fileUrl,
                        uploadedById: req.user.id
                    }))
                 });
                 // Thực hiện findMany để lấy lại dữ liệu chi tiết
                 return prisma.cardAttachment.findMany({ where: { cardId: card.id }, orderBy: { uploadedAt: 'desc' } });
            }
        })()
    ]);

    const humanKey = makeBoardKey(boardInfo.keySlug, keySeq);

    // Ghi Activity Log (Từ Code 2)
    const clientInfo = getClientInfo(req);
    logActivity({
        userId: req.user.id,
        action: 'card_created',
        entityType: 'card',
        entityId: card.id,
        entityName: card.title,
        metadata: { boardId: card.boardId, listId: card.listId, key: humanKey },
        ...clientInfo
    });

    return res.status(201).json({
        card: {
            ...card, // spread base card properties
            key: humanKey,
            members,
            labels,
            attachments: cardAttachments
        }
    });
}


// --- LIST CARDS ---

async function listCardsByList(req, res) {
    const { listId } = req.params;

    const { q, labelId, memberId, offset = '0', limit = '50' } = req.query;
    const take = Math.min(Math.max(parseInt(String(limit), 10) || 50, 1), 200);
    const skip = Math.max(parseInt(String(offset), 10) || 0, 0);

    // Get list with board info in one query (Tối ưu từ Code 2)
    const list = await prisma.list.findUnique({
        where: { id: listId },
        select: {
            id: true,
            boardId: true,
            board: {
                select: {
                    id: true,
                    keySlug: true,
                    workspaceId: true
                }
            }
        }
    });

    if (!list) return res.status(404).json({ error: 'List not found' });

    // Check workspace membership (Tối ưu từ Code 2)
    const workspaceMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId: list.board.workspaceId, userId: req.user.id }
    });

    if (!workspaceMember) return res.status(403).json({ error: 'Not a workspace member' });

    // Build where clause
    const where = { listId };
    if (q) where.OR = [
        { title: { contains: String(q), mode: 'insensitive' } },
        { description: { contains: String(q), mode: 'insensitive' } }
    ];
    if (labelId) where.labels = { some: { labelId: String(labelId) } };
    if (memberId) where.members = { some: { userId: String(memberId) } };

    // Fetch cards and count in parallel (Tối ưu từ Code 2)
    const [cards, total] = await Promise.all([
        prisma.card.findMany({
            where,
            select: {
                // Sử dụng select chi tiết hơn từ Code 2
                id: true, boardId: true, listId: true, keySeq: true, title: true, description: true, 
                priority: true, dueDate: true, startDate: true, orderIdx: true, createdAt: true, updatedAt: true,
                labels: {
                    select: { labelId: true, label: { select: { id: true, name: true, colorHex: true } } }
                },
                members: {
                    select: { userId: true, user: { select: { id: true, fullName: true, email: true } } }
                }
            },
            orderBy: [{ orderIdx: 'asc' }, { updatedAt: 'desc' }],
            skip,
            take
        }),
        prisma.card.count({ where })
    ]);

    // Map cards with human-readable key (Tối ưu từ Code 2)
    const items = cards.map(card => ({
        ...card,
        key: makeBoardKey(list.board.keySlug, card.keySeq),
        // Loại bỏ list: { select... } từ Code 1 vì thông tin list đã được kiểm tra ở trên
    }));

    return res.json({ total, offset: skip, limit: take, items });
}


// --- GET CARD ---

async function getCard(req, res) {
    const { cardId } = req.params;

    // Get card with all related data in one query (Tối ưu từ Code 2)
    const card = await prisma.card.findUnique({
        where: { id: cardId },
        select: {
            id: true, boardId: true, listId: true, keySeq: true, title: true, description: true, priority: true, dueDate: true, 
            startDate: true, orderIdx: true, custom: true, reporterId: true, createdById: true, updatedById: true, 
            createdAt: true, updatedAt: true,
            board: { select: { id: true, keySlug: true, workspaceId: true } },
            labels: { select: { labelId: true, label: { select: { id: true, name: true, colorHex: true } } } },
            members: { select: { userId: true, user: { select: { id: true, fullName: true, email: true } } } },
            attachments: { // Thêm attachments từ Code 2
                select: { id: true, fileName: true, fileUrl: true, uploadedAt: true }
            }
        }
    });

    if (!card) return res.status(404).json({ error: 'Card not found' });

    // Check workspace membership (Tối ưu từ Code 2)
    const workspaceMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId: card.board.workspaceId, userId: req.user.id }
    });

    if (!workspaceMember) return res.status(403).json({ error: 'Not a workspace member' });

    // Format response (Tối ưu từ Code 2)
    const humanKey = makeBoardKey(card.board.keySlug, card.keySeq);
    
    // Loại bỏ trường board để response sạch hơn
    const { board, ...cardDetails } = card; 

    res.json({
        card: {
            ...cardDetails,
            key: humanKey,
        }
    });
}


// --- UPDATE CARD ---

async function updateCard(req, res) {
    const { cardId } = req.params;
    const parsed = updateCardSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const patch = parsed.data;

    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card) return res.status(404).json({ error: 'Card not found' });

    // Kiểm tra quyền truy cập Workspace (Tối ưu từ Code 2)
    const { board, workspaceMember } = await checkWorkspaceAccess(card.boardId, req.user.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    if (!workspaceMember) return res.status(403).json({ error: 'Not a workspace member' });

    // Thêm updatedById (Từ Code 1 & 2)
    const updated = await prisma.card.update({ where: { id: cardId }, data: { ...patch, updatedById: req.user.id } });
    
    // Tùy chọn: Ghi log activity cho cập nhật
    
    res.json({ card: updated });
}


// --- DELETE CARD ---

async function deleteCard(req, res) {
    const { cardId } = req.params;
    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card) return res.status(404).json({ error: 'Card not found' });

    // Kiểm tra quyền truy cập Workspace (Tối ưu từ Code 2)
    const { board, workspaceMember } = await checkWorkspaceAccess(card.boardId, req.user.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    if (!workspaceMember) return res.status(403).json({ error: 'Not a workspace member' });
    
    // Tùy chọn: Thêm kiểm tra quyền admin/owner/reporter để xóa

    await prisma.card.delete({ where: { id: cardId } });
    
    // Tùy chọn: Ghi log activity cho xóa

    res.json({ success: true });
}


// --- MOVE CARD ---

async function moveCard(req, res) {
    const { cardId } = req.params;
    const parsed = moveCardSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { toListId, toIndex } = parsed.data;

    // Get card with board info in one query (Tối ưu từ Code 2)
    const card = await prisma.card.findUnique({
        where: { id: cardId },
        select: { id: true, boardId: true, listId: true, board: { select: { workspaceId: true } } }
    });

    if (!card) return res.status(404).json({ error: 'Card not found' });

    // Check workspace membership
    const workspaceMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId: card.board.workspaceId, userId: req.user.id }
    });

    if (!workspaceMember) return res.status(403).json({ error: 'Not a workspace member' });

    // Sử dụng Promise.all để tối ưu hóa việc cập nhật vị trí (Tối ưu từ Code 2)
    await Promise.all([
        // Đẩy các card khác xuống 1 bậc
        prisma.$executeRawUnsafe(
            'UPDATE "Card" SET "orderIdx" = "orderIdx" + 1 WHERE "listId" = $1 AND "orderIdx" >= $2 AND "id" != $3',
            toListId, toIndex, cardId
        ),
        // Cập nhật card hiện tại
        prisma.card.update({
            where: { id: cardId },
            data: {
                listId: toListId,
                orderIdx: toIndex,
                updatedById: req.user.id
            }
        })
    ]);

    // Chỉ trả về thành công (Code 2) thay vì fetch lại card (Code 1) để tăng tốc độ
    res.json({ success: true, message: 'Card moved successfully' });
}


// --- ASSIGN MEMBER --- (Từ Code 2)

async function assignCardMember(req, res) {
    const { cardId } = req.params;
    const parsed = assignMemberSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { userId } = parsed.data;

    const card = await prisma.card.findUnique({
        where: { id: cardId },
        include: { board: { select: { id: true, keySlug: true, workspaceId: true } } }
    });
    if (!card) return res.status(404).json({ error: 'Card not found' });

    const { workspaceMember } = await checkWorkspaceAccess(card.boardId, req.user.id);
    if (!workspaceMember) return res.status(403).json({ error: 'Not a workspace member' });

    const targetMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId: card.board.workspaceId, userId }
    });
    if (!targetMember) return res.status(400).json({ error: 'User is not a workspace member' });

    const existingAssignment = await prisma.cardMember.findFirst({ where: { cardId, userId } });
    if (existingAssignment) return res.status(400).json({ error: 'User is already assigned to this card' });

    const assignment = await prisma.cardMember.create({ data: { cardId, userId } });

    // Gửi thông báo
    if (userId !== req.user.id) {
        sendTaskAssignedNotification({
            assignerId: req.user.id,
            assigneeId: userId,
            cardId: card.id,
            cardTitle: card.title,
            cardDescription: card.description,
            cardPriority: card.priority,
            cardDueDate: card.dueDate,
            cardKeySeq: card.keySeq,
            boardId: card.board.id,
            boardKey: card.board.keySlug,
            workspaceId: card.board.workspaceId
        }).catch(err => {
            console.error('Failed to send task notification:', err);
        });
    }

    res.status(201).json({ assignment });
}


// --- REMOVE MEMBER --- (Từ Code 2)

async function removeCardMember(req, res) {
    const { cardId, userId } = req.params;

    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card) return res.status(404).json({ error: 'Card not found' });

    const { board, workspaceMember } = await checkWorkspaceAccess(card.boardId, req.user.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    if (!workspaceMember) return res.status(403).json({ error: 'Not a workspace member' });

    const assignment = await prisma.cardMember.findFirst({ where: { cardId, userId } });
    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

    await prisma.cardMember.delete({ where: { cardId_userId: { cardId, userId } } });
    res.json({ success: true });
}


// --- ATTACHMENTS --- (Từ Code 2)

async function getCardAttachments(req, res) {
    const { cardId } = req.params;

    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card) return res.status(404).json({ error: 'Card not found' });

    const { board, workspaceMember } = await checkWorkspaceAccess(card.boardId, req.user.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    if (!workspaceMember) return res.status(403).json({ error: 'Not a workspace member' });

    const attachments = await prisma.cardAttachment.findMany({
        where: { cardId },
        include: {
            uploadedBy: {
                select: { id: true, fullName: true, email: true }
            }
        },
        orderBy: { uploadedAt: 'desc' }
    });

    res.json({ attachments });
}

async function deleteAttachment(req, res) {
    const { cardId, attachmentId } = req.params;

    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card) return res.status(404).json({ error: 'Card not found' });

    const { board, workspaceMember } = await checkWorkspaceAccess(card.boardId, req.user.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    if (!workspaceMember) return res.status(403).json({ error: 'Not a workspace member' });

    const attachment = await prisma.cardAttachment.findFirst({
        where: { id: attachmentId, cardId }
    });
    if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

    // Giả định `member` là thông tin của người dùng hiện tại (workspaceMember)
    if (attachment.uploadedById !== req.user.id && !['admin', 'owner'].includes(workspaceMember.role)) { // Đã sửa 'maintainer' thành 'owner'
         return res.status(403).json({ error: 'Permission denied: Only uploader, owner, or admin can delete' });
    }

    await prisma.cardAttachment.delete({ where: { id: attachmentId } });
    res.json({ message: 'Attachment deleted successfully' });
}


module.exports = { 
    createCard, 
    getCard, 
    updateCard, 
    deleteCard, 
    moveCard, 
    listCardsByList, 
    assignCardMember, 
    removeCardMember, 
    getCardAttachments, 
    deleteAttachment 
};