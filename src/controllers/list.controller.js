const { prisma } = require('../shared/prisma');
// Hợp nhất tất cả các validators
const { createListSchema, getBoardListsSchema, updateListSchema, deleteListSchema, reorderListsSchema } = require('../validators/list.validators');
// Thêm Activity Log service
const { logActivity } = require('../services/activity.service');

/**
 * Hàm hỗ trợ kiểm tra quyền truy cập Workspace (Từ Code 2)
 */
async function checkWorkspaceAccess(boardId, userId) {
    const board = await prisma.board.findUnique({
        where: { id: boardId },
        select: { id: true, name: true, workspaceId: true }
    });
    if (!board) return { board: null, workspaceMember: null };

    const workspaceMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId: board.workspaceId, userId }
    });

    return { board, workspaceMember };
}


// --- CREATE LIST ---

async function createList(req, res) {
    const parsed = createListSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { boardId, name, isDone } = parsed.data;

    // Kiểm tra quyền truy cập Workspace
    const { board, workspaceMember } = await checkWorkspaceAccess(boardId, req.user.id);
    if (!board) {
        return res.status(404).json({ error: 'Không tìm thấy bảng' });
    }
    if (!workspaceMember) {
        return res.status(403).json({ error: 'Bạn không phải thành viên của workspace' });
    }

    // Kiểm tra xem có danh sách nào có cùng tên trên bảng này chưa
    const existingList = await prisma.list.findFirst({
        where: {
            boardId,
            name: {
                equals: name,
                mode: 'insensitive' // So sánh không phân biệt chữ hoa chữ thường
            }
        }
    });

    if (existingList) {
        return res.status(409).json({ error: 'Đã có tên trùng lặp, vui lòng đổi tên khác.' });
    }

    // Lấy orderIdx lớn nhất
    const maxOrder = await prisma.list.aggregate({
        where: { boardId },
        _max: { orderIdx: true }
    });

    const orderIdx = (maxOrder._max.orderIdx ?? -1) + 1;

    // Tạo danh sách mới
    const list = await prisma.list.create({
        data: {
            boardId,
            name,
            orderIdx,
            isDone: isDone ?? false
        }
    });

    // Log activity
    logActivity(req, {
        action: 'list_create',
        entityType: 'list',
        entityId: list.id,
        metadata: {
            listName: name,
            boardId,
            boardName: board.name,
            workspaceId: board.workspaceId
        }
    });
    
    res.status(201).json({ list: { ...list, cards: [] } });
}


// --- GET BOARD LISTS (New in Code 2) ---

async function getBoardLists(req, res) {
    const parsed = getBoardListsSchema.safeParse(req.params);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { boardId } = parsed.data;

    const { board, workspaceMember } = await checkWorkspaceAccess(boardId, req.user.id);
    if (!board) {
        return res.status(404).json({ error: 'Không tìm thấy bảng' });
    }
    if (!workspaceMember) {
        return res.status(403).json({ error: 'Bạn không phải thành viên của workspace' });
    }

    const lists = await prisma.list.findMany({
        where: { boardId },
        orderBy: { orderIdx: 'asc' },
        include: {
            _count: {
                select: { cards: true } // Đếm số lượng thẻ (Từ Code 2)
            }
        }
    });

    res.json({ lists });
}


// --- UPDATE LIST ---

async function updateList(req, res) {
    // Dùng validator chi tiết từ Code 2
    const parsed = updateListSchema.safeParse({ ...req.params, ...req.body });
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { listId, name, orderIdx, isDone } = parsed.data;

    const list = await prisma.list.findUnique({
        where: { id: listId },
        // Lấy thông tin board để kiểm tra quyền và log activity (Từ Code 2)
        include: { board: { select: { id: true, name: true, workspaceId: true } } }
    });
    if (!list) {
        return res.status(404).json({ error: 'Không tìm thấy danh sách' });
    }

    // Kiểm tra quyền truy cập Workspace (Từ Code 2)
    const { workspaceMember } = await checkWorkspaceAccess(list.boardId, req.user.id);
    if (!workspaceMember) {
        return res.status(403).json({ error: 'Bạn không phải thành viên của workspace' });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (orderIdx !== undefined) updateData.orderIdx = orderIdx;
    if (isDone !== undefined) updateData.isDone = isDone;

    const updated = await prisma.list.update({
        where: { id: listId },
        data: updateData
    });


    const changes = [];
    if (name !== undefined && name !== list.name) changes.push('name');
    if (orderIdx !== undefined && orderIdx !== list.orderIdx) changes.push('order');
    if (isDone !== undefined && isDone !== list.isDone) changes.push('status');

    if (changes.length > 0) {
        logActivity(req, {
            action: 'list_update',
            entityType: 'list',
            entityId: listId,
            metadata: {
                listName: updated.name,
                boardId: list.boardId,
                boardName: list.board.name,
                workspaceId: list.board.workspaceId,
                changes
            }
        });
    }

    res.json({ list: updated });
}


// --- DELETE LIST ---

async function deleteList(req, res) {
    const parsed = deleteListSchema.safeParse({ ...req.params, ...req.query });
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { listId, moveToListId } = parsed.data;

    const list = await prisma.list.findUnique({
        where: { id: listId },
        // Include board info và count cards (Từ Code 2)
        include: {
            board: { select: { id: true, name: true, workspaceId: true } },
            _count: { select: { cards: true } }
        }
    });
    if (!list) {
        return res.status(404).json({ error: 'Không tìm thấy danh sách' });
    }

    // Kiểm tra quyền truy cập Workspace (Từ Code 2)
    const { workspaceMember } = await checkWorkspaceAccess(list.boardId, req.user.id);
    if (!workspaceMember) {
        return res.status(403).json({ error: 'Bạn không phải thành viên của workspace' });
    }

    // Xử lý khi List còn thẻ (Logic quan trọng từ Code 2)
    if (list._count.cards > 0) {
        if (!moveToListId) {
            return res.status(400).json({
                error: 'Không thể xóa danh sách có thẻ. Vui lòng cung cấp danh sách đích để chuyển các thẻ trước.',
                cardCount: list._count.cards,
                suggestion: 'Thêm ?moveToListId=<target-list-id> để chuyển các thẻ trước khi xóa'
            });
        }

        // Validate target list
        const targetList = await prisma.list.findUnique({ where: { id: moveToListId } });
        if (!targetList) return res.status(404).json({ error: 'Không tìm thấy danh sách đích' });
        if (targetList.boardId !== list.boardId) return res.status(400).json({ error: 'Danh sách đích phải thuộc cùng một bảng' });
        if (targetList.id === listId) return res.status(400).json({ error: 'Không thể chuyển thẻ sang chính danh sách đang bị xóa' });

        // Move cards and delete list in a transaction
        await prisma.$transaction(async (tx) => {
            // Get max orderIdx in target list
            const maxOrder = await tx.card.aggregate({
                where: { listId: moveToListId },
                _max: { orderIdx: true }
            });
            const startOrderIdx = (maxOrder._max.orderIdx ?? -1) + 1;

            // Get all cards from source list
            const cards = await tx.card.findMany({
                where: { listId },
                orderBy: { orderIdx: 'asc' }
            });

            // Move cards with new order indexes
            for (let i = 0; i < cards.length; i++) {
                await tx.card.update({
                    where: { id: cards[i].id },
                    data: {
                        listId: moveToListId,
                        orderIdx: startOrderIdx + i
                    }
                });
            }

            // Delete the list
            await tx.list.delete({ where: { id: listId } });
        });

        logActivity(req, {
            action: 'list_delete_with_move',
            entityType: 'list',
            entityId: listId,
            metadata: {
                listName: list.name,
                boardId: list.boardId,
                boardName: list.board.name,
                workspaceId: list.board.workspaceId,
                movedCardsCount: list._count.cards,
                targetListId: moveToListId
            }
        });

                return res.json({
                    success: true,
                    message: `Danh sách đã được xóa và ${list._count.cards} thẻ đã được chuyển sang danh sách đích`
                });
            }
        
            // No cards, just delete the list
            await prisma.list.delete({ where: { id: listId } });
        
            // Log activity (Từ Code 2)
            logActivity(req, {
                action: 'list_delete',
                entityType: 'list',
                entityId: listId,
                metadata: {
                    listName: list.name,
                    boardId: list.boardId,
                    boardName: list.board.name,
                    workspaceId: list.board.workspaceId
                }
            });
        
            res.json({ success: true, message: 'Danh sách đã được xóa thành công' });}


async function reorderLists(req, res) {
    const parsed = reorderListsSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { boardId, orders, socketId } = parsed.data;

    const { board, workspaceMember } = await checkWorkspaceAccess(boardId, req.user.id);
    if (!board) {
        return res.status(404).json({ error: 'Không tìm thấy bảng' });
    }
    if (!workspaceMember) {
        return res.status(403).json({ error: 'Bạn không phải thành viên của workspace' });
    }

    const listIds = orders.map(o => o.id);
    const lists = await prisma.list.findMany({
        where: { id: { in: listIds }, boardId }
    });

    if (lists.length !== listIds.length) {
        return res.status(400).json({ error: 'Một số danh sách không thuộc bảng này' });
    }

    try {
        const sortedOrders = [...orders].sort((a, b) => a.orderIdx - b.orderIdx);
        const normalizedOrders = sortedOrders.map((order, index) => ({
            id: order.id,
            orderIdx: index
        }));

        await prisma.$transaction(async (tx) => {
            for (const order of normalizedOrders) {
                await tx.list.update({
                    where: { id: order.id },
                    data: { orderIdx: order.orderIdx }
                });
            }
        });
        
        res.json({ success: true, orders: normalizedOrders });

        try {
            const payload = {
                boardId,
                orders: normalizedOrders,
                movedBy: req.user.id
            };
            const room = `board:${boardId}`;

            if (socketId && req.boardNamespace.sockets.has(socketId)) {
                req.boardNamespace.to(room).except(socketId).emit('lists_reordered', payload);
            } else {
                req.boardNamespace.to(room).emit('lists_reordered', payload);
            }
        } catch (socketError) {
            console.error("Socket emit error in reorderLists:", socketError);
        }

    } catch (error) {
        console.error("Error reordering lists:", error);
        res.status(500).json({ error: "Failed to reorder lists" });
    }
}


module.exports = { createList, getBoardLists, updateList, deleteList, reorderLists };