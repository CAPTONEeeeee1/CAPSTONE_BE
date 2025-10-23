const { prisma } = require('../shared/prisma');

async function requireWorkspaceMember(req, res, next) {
    const userId = req.user?.id;
    const { workspaceId } = req.params;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const m = await prisma.workspaceMember.findFirst({ where: { workspaceId, userId } });
    if (!m) return res.status(403).json({ error: 'Not a workspace member' });
    req.membership = { workspaceRole: m.role };
    next();
}

async function requireBoardMember(req, res, next) {
    const userId = req.user?.id;
    const boardId = req.params.boardId || req.body.boardId || req.query.boardId;
    if (!userId || !boardId) return res.status(400).json({ error: 'Missing boardId' });
    const m = await prisma.boardMember.findFirst({ where: { boardId, userId } });
    if (!m) return res.status(403).json({ error: 'Not a board member' });
    req.membership = { ...(req.membership || {}), boardRole: m.role, boardId };
    next();
}


module.exports = { requireWorkspaceMember, requireBoardMember };