const { prisma } = require('../shared/prisma');
const { createLabelSchema } = require('../validators/label.validators');

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


async function createLabel(req, res) {
    const parsed = createLabelSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { boardId, name, colorHex } = parsed.data;

    // Kiểm tra quyền truy cập Workspace (Áp dụng logic Code 2)
    const { board, workspaceMember } = await checkWorkspaceAccess(boardId, req.user.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    if (!workspaceMember) return res.status(403).json({ error: 'Not a workspace member' });
    
    // Tùy chọn: Thêm kiểm tra trùng tên/màu Label trong Board
    
    const label = await prisma.label.create({ data: { boardId, name, colorHex } });
    res.status(201).json({ label });
}


async function listLabels(req, res) {
    // Label được tìm kiếm qua query param, không phải params.
    const { boardId } = req.query;
    if (!boardId) return res.status(400).json({ error: 'boardId required' });
    
    // Kiểm tra quyền truy cập Workspace (Áp dụng logic Code 2)
    const { board, workspaceMember } = await checkWorkspaceAccess(boardId, req.user.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    if (!workspaceMember) return res.status(403).json({ error: 'Not a workspace member' });

    const labels = await prisma.label.findMany({ where: { boardId }, orderBy: { name: 'asc' } });
    res.json({ labels });
}


async function updateLabel(req, res) {
    const { labelId } = req.params;
    const patch = req.body;
    
    const label = await prisma.label.findUnique({ where: { id: labelId } });
    if (!label) return res.status(404).json({ error: 'Label not found' });
    
    // Kiểm tra quyền truy cập Workspace dựa trên boardId của Label (Áp dụng logic Code 2)
    const { board, workspaceMember } = await checkWorkspaceAccess(label.boardId, req.user.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    if (!workspaceMember) return res.status(403).json({ error: 'Not a workspace member' });

    // Tùy chọn: Ràng buộc chỉ admin/owner mới được chỉnh sửa Label

    const updated = await prisma.label.update({ where: { id: labelId }, data: patch });
    res.json({ label: updated });
}


async function deleteLabel(req, res) {
    const { labelId } = req.params;
    
    const label = await prisma.label.findUnique({ where: { id: labelId } });
    if (!label) return res.status(404).json({ error: 'Label not found' });
    
    // Kiểm tra quyền truy cập Workspace (Áp dụng logic Code 2)
    const { board, workspaceMember } = await checkWorkspaceAccess(label.boardId, req.user.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    if (!workspaceMember) return res.status(403).json({ error: 'Not a workspace member' });

    // Tùy chọn: Ràng buộc chỉ admin/owner mới được xóa Label

    // Xóa Label
    await prisma.label.delete({ where: { id: labelId } });
    res.json({ success: true });
}


async function addLabelToCard(req, res) {
    const { cardId } = req.params;
    const { labelId } = req.body;
    if (!labelId) return res.status(400).json({ error: 'labelId required' });

    const card = await prisma.card.findUnique({ 
        where: { id: cardId },
        select: { id: true, boardId: true } // Chỉ cần boardId
    });
    if (!card) return res.status(404).json({ error: 'Card not found' });
    
    // Kiểm tra quyền truy cập Workspace (Áp dụng logic Code 2)
    const { board, workspaceMember } = await checkWorkspaceAccess(card.boardId, req.user.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    if (!workspaceMember) return res.status(403).json({ error: 'Not a workspace member' });

    // Kiểm tra Label thuộc cùng Board
    const label = await prisma.label.findFirst({ where: { id: labelId, boardId: card.boardId } });
    if (!label) return res.status(400).json({ error: 'Label not found or not in this board' });


    // Sử dụng upsert để tránh lỗi nếu cardId_labelId đã tồn tại
    await prisma.cardLabel.upsert({ 
        where: { cardId_labelId: { cardId, labelId } }, 
        create: { cardId, labelId }, 
        update: {} 
    });
    res.json({ success: true, message: 'Label added successfully' });
}


async function removeLabelFromCard(req, res) {
    const { cardId, labelId } = req.params;
    
    const card = await prisma.card.findUnique({ 
        where: { id: cardId },
        select: { id: true, boardId: true } // Chỉ cần boardId
    });
    if (!card) return res.status(404).json({ error: 'Card not found' });
    
    // Kiểm tra quyền truy cập Workspace (Áp dụng logic Code 2)
    const { board, workspaceMember } = await checkWorkspaceAccess(card.boardId, req.user.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    if (!workspaceMember) return res.status(403).json({ error: 'Not a workspace member' });


    // Xóa (sử dụng catch để bỏ qua lỗi nếu không tìm thấy, đúng như logic Code 1)
    await prisma.cardLabel.delete({ where: { cardId_labelId: { cardId, labelId } } }).catch(() => { });
    res.json({ success: true, message: 'Label removed successfully' });
}


module.exports = { createLabel, listLabels, updateLabel, deleteLabel, addLabelToCard, removeLabelFromCard };