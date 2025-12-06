const { prisma } = require('../shared/prisma');
// Sử dụng tất cả các validators cần thiết
const { createBoardSchema, renameBoardSchema } = require('../validators/board.validators');
const { sendBoardCreatedNotification, sendBoardDeletedNotification } = require('../services/notification.service');

// --- HÀM HỖ TRỢ (Nếu cần, nhưng đã được tích hợp trong getBoard/deleteBoard) ---

async function createBoard(req, res) {
    try {
        const parsed = createBoardSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.flatten() });
        }
        const { workspaceId, name, mode, keySlug, lists } = parsed.data;

        const m = await prisma.workspaceMember.findFirst({ where: { workspaceId, userId: req.user.id } });
        if (!m) return res.status(403).json({ error: 'Not in workspace' });

        // Yêu cầu quyền owner hoặc admin để tạo boards (từ >>>>>>> main)
        if (!['owner', 'admin'].includes(m.role)) {
            return res.status(403).json({ error: 'Only workspace owner and admin can create boards' });
        }

        // Check workspace plan and limit boards if it's a FREE plan
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
        });

        if (workspace.plan === 'FREE') {
            const boardCount = await prisma.board.count({
                where: { workspaceId: workspaceId },
            });

            if (boardCount >= 3) {
                return res.status(403).json({
                    error: 'Free plan is limited to 3 boards. Please upgrade to create more.',
                });
            }
        }
        
        // Kiểm tra tên board trùng lặp trong cùng workspace
        const existingBoard = await prisma.board.findFirst({
            where: {
                workspaceId: workspaceId,
                name: name,
            }
        });

        if (existingBoard) {
            return res.status(400).json({ error: 'Board với tên này đã tồn tại trong workspace.' });
        }

        const result = await prisma.$transaction(async (tx) => {
            const b = await tx.board.create({
                data: { workspaceId, name, mode, keySlug, createdById: req.user.id }
            });

            // SỬA LỖI: Không có model `BoardMember`, quyền truy cập board được quản lý qua `WorkspaceMember`.
            // Logic tạo thành viên cho board đã bị loại bỏ vì không có model tương ứng.
            // Quyền truy cập board sẽ được kiểm tra thông qua quyền thành viên trong workspace.

            // Tạo lists từ danh sách tùy chỉnh hoặc dùng 3 lists mặc định
            let createdLists = [];
            if (lists && lists.length > 0) {
                // Tạo lists từ danh sách được cung cấp
                for (let i = 0; i < lists.length; i++) {
                    const list = lists[i];
                    const l = await tx.list.create({
                        data: {
                            boardId: b.id,
                            name: list.name,
                            orderIdx: list.orderIdx !== undefined ? list.orderIdx : i,
                            isDone: list.isDone || false
                        }
                    });
                    createdLists.push(l);
                }
            } else {
                // Tạo 3 lists mặc định
                const l1 = await tx.list.create({ data: { boardId: b.id, name: 'Todo', orderIdx: 0 } });
                const l2 = await tx.list.create({ data: { boardId: b.id, name: 'In Progress', orderIdx: 1 } });
                const l3 = await tx.list.create({ data: { boardId: b.id, name: 'Done', orderIdx: 2, isDone: true } });
                createdLists = [l1, l2, l3];
            }

            return { b, lists: createdLists };
        });

        // --- NEW NOTIFICATION LOGIC ---
        const board = result.b;
        const creator = await prisma.user.findUnique({ where: { id: req.user.id } });

        if (workspace && creator) {
            const members = await prisma.workspaceMember.findMany({
                where: { workspaceId: board.workspaceId },
            });

            const boardUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/workspaces/${workspace.id}/boards/${board.id}`;

            for (const member of members) {
                // Do not send to the creator
                if (member.userId !== req.user.id) {
                    await sendBoardCreatedNotification({
                        creatorId: req.user.id,
                        memberId: member.userId,
                        boardName: board.name,
                        workspaceName: workspace.name,
                        boardUrl: boardUrl,
                        creatorName: creator.fullName
                    });
                }
            }
        }
        // --- END NEW NOTIFICATION LOGIC ---

        return res.status(201).json({ board: board, lists: result.lists });
    } catch (error) {
        console.error('Error creating board:', error);
        return res.status(500).json({
            error: 'Failed to create board',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}

// --- LẤY DANH SÁCH BOARDS CỦA WORKSPACE (Từ >>>>>>> main) ---

async function getWorkSpaceBoards(req, res) {
    const { workspaceId } = req.params;

    const member = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: req.user.id }
    });
    // Kiểm tra quyền: Người dùng phải là thành viên của Workspace
    if (!member) return res.status(403).json({ error: 'Not in workspace' });

    const boards = await prisma.board.findMany({
        where: {
            workspaceId,
            archivedAt: null  // Exclude archived boards
        },
        include: { lists: { orderBy: { orderIdx: 'asc' } } }
    });
    return res.json({ boards });
}


// --- LẤY THÔNG TIN CHI TIẾT BOARD ---

async function getBoard(req, res) {
    const { boardId } = req.params;

    const board = await prisma.board.findUnique({
        where: { id: boardId },
        include: {
            workspace: true,
            lists: { orderBy: { orderIdx: 'asc' } }
        }
    });

    if (!board) return res.status(404).json({ error: 'Board not found' });

    // Kiểm tra quyền truy cập: Người dùng phải là thành viên Workspace (Logic từ >>>>>>> main)
    const workspaceMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId: board.workspaceId, userId: req.user.id }
    });
    if (!workspaceMember) return res.status(403).json({ error: 'Not a workspace member' });

    return res.json({ board });
}


// --- ĐỔI TÊN BOARD (Từ >>>>>>> main) ---

async function renameBoard(req, res) {
    const { boardId } = req.params;
    const parsed = renameBoardSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { name } = parsed.data;

    const board = await prisma.board.findUnique({ where: { id: boardId } });
    if (!board) return res.status(404).json({ error: 'Board not found' });

    const workspaceMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId: board.workspaceId, userId: req.user.id }
    });
    if (!workspaceMember) return res.status(403).json({ error: 'Not a workspace member' });

    // Kiểm tra trùng tên Board trong cùng Workspace
    const existingBoard = await prisma.board.findFirst({
        where: {
            workspaceId: board.workspaceId,
            name: name,
            id: { not: boardId }
        }
    });
    if (existingBoard) {
        return res.status(400).json({ error: 'Board name already exists in this workspace' });
    }

    const updatedBoard = await prisma.board.update({
        where: { id: boardId },
        data: { name }
    });

    return res.json({ board: updatedBoard });
}


// --- XÓA BOARD (Từ >>>>>>> main) ---

async function deleteBoard(req, res) {
    const { boardId } = req.params;

    const board = await prisma.board.findUnique({ where: { id: boardId } });
    if (!board) return res.status(404).json({ error: 'Board not found' });

    const workspaceMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId: board.workspaceId, userId: req.user.id }
    });
    if (!workspaceMember) return res.status(403).json({ error: 'Not a workspace member' });

    // Kiểm tra quyền: Chỉ owner hoặc admin mới được xóa board
    if (!['owner', 'admin'].includes(workspaceMember.role)) {
        return res.status(403).json({ error: 'Only workspace admin or owner can delete board' });
    }

    // Soft delete: Set archivedAt timestamp instead of hard delete
    await prisma.board.update({
        where: { id: boardId },
        data: { archivedAt: new Date() }
    });

    // --- NEW NOTIFICATION LOGIC ---
    const workspace = await prisma.workspace.findUnique({ where: { id: board.workspaceId } });
    const deleter = await prisma.user.findUnique({ where: { id: req.user.id } });

    if (workspace && deleter) {
        const members = await prisma.workspaceMember.findMany({
            where: { workspaceId: board.workspaceId },
        });

        for (const member of members) {
            // Do not send to the deleter
            if (member.userId !== req.user.id) {
                await sendBoardDeletedNotification({
                    deleterId: req.user.id,
                    memberId: member.userId,
                    boardName: board.name,
                    workspaceName: workspace.name,
                    deleterName: deleter.fullName
                });
            }
        }
    }
    // --- END NEW NOTIFICATION LOGIC ---

    return res.json({ message: 'Board deleted successfully' });
}


// --- GHIM/BỎ GHIM BOARD (Từ >>>>>>> main) ---

async function togglePinBoard(req, res) {
    const { boardId } = req.params;

    const board = await prisma.board.findUnique({ where: { id: boardId } });
    if (!board) return res.status(404).json({ error: 'Board not found' });

    const workspaceMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId: board.workspaceId, userId: req.user.id }
    });
    if (!workspaceMember) return res.status(403).json({ error: 'Not a workspace member' });

    const updated = await prisma.board.update({
        where: { id: boardId },
        data: { isPinned: !board.isPinned }
    });

    return res.json({ board: updated });
}

module.exports = { createBoard, getWorkSpaceBoards, getBoard, renameBoard, deleteBoard, togglePinBoard };