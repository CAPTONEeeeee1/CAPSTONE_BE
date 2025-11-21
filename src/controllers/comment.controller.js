const { prisma } = require('../shared/prisma');
const { createCommentSchema, updateCommentSchema } = require('../validators/comment.validators');

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


async function listComments(req, res) {
    const { cardId } = req.params;
    const card = await prisma.card.findUnique({ 
        where: { id: cardId },
        select: { id: true, boardId: true } // Chỉ cần boardId
    });
    if (!card) return res.status(404).json({ error: 'Card not found' });
    
    // Kiểm tra quyền truy cập Workspace (Áp dụng logic Code 2)
    const { board, workspaceMember } = await checkWorkspaceAccess(card.boardId, req.user.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    if (!workspaceMember) return res.status(403).json({ error: 'Not a workspace member' });

    // Tùy chọn: Thêm include cho author để hiển thị thông tin người bình luận
    const comments = await prisma.comment.findMany({ 
        where: { cardId }, 
        orderBy: { createdAt: 'asc' },
        include: {
            author: { select: { id: true, fullName: true, avatar: true } }
        }
    });
    res.json({ comments });
}


async function addComment(req, res) {
    const { cardId } = req.params;
    const parsed = createCommentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const card = await prisma.card.findUnique({ 
        where: { id: cardId },
        select: { id: true, boardId: true } // Chỉ cần boardId
    });
    if (!card) return res.status(404).json({ error: 'Card not found' });
    
    // Kiểm tra quyền truy cập Workspace (Áp dụng logic Code 2)
    const { board, workspaceMember } = await checkWorkspaceAccess(card.boardId, req.user.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    if (!workspaceMember) return res.status(403).json({ error: 'Not a workspace member' });

    // parentId được lấy từ body (giữ nguyên logic cả hai code)
    const { bodyMd, parentId } = { ...parsed.data, ...req.body }; 
    
    const c = await prisma.comment.create({ 
        data: { 
            cardId, 
            authorId: req.user.id, 
            bodyMd, 
            parentId 
        },
        include: {
            author: { select: { id: true, fullName: true, avatar: true } }
        }
    });
    // Tùy chọn: Gửi thông báo cho reporter/assignee

    res.status(201).json({ comment: c });
}


async function updateComment(req, res) {
    const { commentId } = req.params;
    const parsed = updateCommentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const c = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!c) return res.status(404).json({ error: 'Comment not found' });

    // Chỉ tác giả mới được cập nhật
    if (c.authorId !== req.user.id) return res.status(403).json({ error: 'Not the author' });

    const updated = await prisma.comment.update({ where: { id: commentId }, data: { bodyMd: parsed.data.bodyMd } });
    res.json({ comment: updated });
}

async function deleteComment(req, res) {
    const { commentId } = req.params;
    const c = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!c) return res.status(404).json({ error: 'Comment not found' });

    // Chỉ tác giả mới được xóa (hoặc Admin/Owner của Workspace)
    if (c.authorId !== req.user.id) {
        // Nếu không phải tác giả, kiểm tra quyền Workspace Admin/Owner
        const card = await prisma.card.findUnique({ where: { id: c.cardId }, select: { boardId: true } });
        if (!card) return res.status(404).json({ error: 'Associated card not found' });
        
        const { workspaceMember } = await checkWorkspaceAccess(card.boardId, req.user.id);

        if (!workspaceMember || !['owner', 'admin'].includes(workspaceMember.role)) {
            return res.status(403).json({ error: 'Permission denied. Only the author or workspace owner/admin can delete.' });
        }
    }

    await prisma.comment.delete({ where: { id: commentId } });
    res.json({ success: true, message: 'Comment deleted successfully' });
}


module.exports = { listComments, addComment, updateComment, deleteComment };