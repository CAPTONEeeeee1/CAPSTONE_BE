const { prisma } = require('../shared/prisma');
const { createListSchema, getBoardListsSchema, updateListSchema, deleteListSchema, reorderListsSchema } = require('../validators/list.validators');
const { logActivity } = require('../services/activity.service');

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


async function createList(req, res) {
    const parsed = createListSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { boardId, name } = parsed.data;

    const { board, workspaceMember } = await checkWorkspaceAccess(boardId, req.user.id);
    if (!board) {
        return res.status(404).json({ error: 'Không tìm thấy bảng' });
    }
    if (!workspaceMember) {
        return res.status(403).json({ error: 'Bạn không phải thành viên của workspace' });
    }

    const max = await prisma.list.aggregate({ 
        where: { boardId }, 
        _max: { orderIdx: true } 
    });
    const orderIdx = (max._max.orderIdx ?? -1) + 1;
    
    const list = await prisma.list.create({ 
        data: { boardId, name, orderIdx } 
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

    res.status(201).json({ list });
}

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
                select: { cards: true }
            }
        }
    });

    res.json({ lists });
}


async function updateList(req, res) {
    const parsed = updateListSchema.safeParse({ ...req.params, ...req.body });
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { listId, name, orderIdx, isDone } = parsed.data;

    const list = await prisma.list.findUnique({ 
        where: { id: listId },
        include: { board: { select: { id: true, name: true, workspaceId: true } } }
    });
    if (!list) {
        return res.status(404).json({ error: 'Không tìm thấy danh sách' });
    }

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

    // Log activity
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


async function deleteList(req, res) {
    const parsed = deleteListSchema.safeParse({ ...req.params, ...req.query });
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { listId, moveToListId } = parsed.data;

    const list = await prisma.list.findUnique({ 
        where: { id: listId },
        include: { 
            board: { select: { id: true, name: true, workspaceId: true } },
            _count: { select: { cards: true } }
        }
    });
    if (!list) {
        return res.status(404).json({ error: 'Không tìm thấy danh sách' });
    }

    const { workspaceMember } = await checkWorkspaceAccess(list.boardId, req.user.id);
    if (!workspaceMember) {
        return res.status(403).json({ error: 'Bạn không phải thành viên của workspace' });
    }

    // Check if list has cards
    if (list._count.cards > 0) {
        if (!moveToListId) {
            return res.status(400).json({ 
                error: 'Không thể xóa danh sách có thẻ. Vui lòng cung cấp moveToListId để chuyển các thẻ trước.',
                cardCount: list._count.cards,
                suggestion: 'Thêm ?moveToListId=<target-list-id> để chuyển các thẻ trước khi xóa'
            });
        }

        // Validate target list exists and belongs to same board
        const targetList = await prisma.list.findUnique({
            where: { id: moveToListId }
        });

        if (!targetList) {
            return res.status(404).json({ error: 'Không tìm thấy danh sách đích' });
        }

        if (targetList.boardId !== list.boardId) {
            return res.status(400).json({ error: 'Danh sách đích phải thuộc cùng một bảng' });
        }

        if (targetList.id === listId) {
            return res.status(400).json({ error: 'Không thể chuyển thẻ sang chính danh sách đang bị xóa' });
        }

        // Move all cards to target list in a transaction
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

        // Log activity
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

    // Log activity
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

    res.json({ success: true });
}


async function reorderLists(req, res) {
    const parsed = reorderListsSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { boardId, orders } = parsed.data;

    const { board, workspaceMember } = await checkWorkspaceAccess(boardId, req.user.id);
    if (!board) {
        return res.status(404).json({ error: 'Không tìm thấy bảng' });
    }
    if (!workspaceMember) {
        return res.status(403).json({ error: 'Bạn không phải thành viên của workspace' });
    }

    // Verify all lists belong to this board
    const listIds = orders.map(o => o.id);
    const lists = await prisma.list.findMany({
        where: { id: { in: listIds }, boardId }
    });
    
    if (lists.length !== listIds.length) {
        return res.status(400).json({ error: 'Một số danh sách không thuộc bảng này' });
    }

    // Check for duplicate orderIdx
    const orderIndexes = orders.map(o => o.orderIdx);
    const uniqueIndexes = new Set(orderIndexes);
    if (orderIndexes.length !== uniqueIndexes.size) {
        return res.status(400).json({ error: 'Không cho phép trùng chỉ số thứ tự' });
    }

    // Normalize indexes to start from 0 and be sequential
    const sortedOrders = [...orders].sort((a, b) => a.orderIdx - b.orderIdx);
    const normalizedOrders = sortedOrders.map((order, index) => ({
        id: order.id,
        orderIdx: index
    }));

    await prisma.$transaction(
        normalizedOrders.map(o => prisma.list.update({ 
            where: { id: o.id }, 
            data: { orderIdx: o.orderIdx } 
        }))
    );

    logActivity(req, {
        action: 'list_reorder',
        entityType: 'board',
        entityId: boardId,
        metadata: { 
            boardName: board.name,
            workspaceId: board.workspaceId,
            listCount: normalizedOrders.length
        }
    });

    res.json({ success: true, orders: normalizedOrders });
}


module.exports = { createList, getBoardLists, updateList, deleteList, reorderLists };
