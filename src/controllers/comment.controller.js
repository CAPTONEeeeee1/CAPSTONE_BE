
const { prisma } = require('../shared/prisma');
const { createCommentSchema, updateCommentSchema } = require('../validators/comment.validators');

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
    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card) return res.status(404).json({ error: 'Card not found' });
    const { board, workspaceMember } = await checkWorkspaceAccess(card.boardId, req.user.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    if (!workspaceMember) return res.status(403).json({ error: 'Not a workspace member' });


    const comments = await prisma.comment.findMany({ where: { cardId }, orderBy: { createdAt: 'asc' } });
    res.json({ comments });
}


async function addComment(req, res) {
    const { cardId } = req.params;
    const parsed = createCommentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });


    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card) return res.status(404).json({ error: 'Card not found' });
    const { board, workspaceMember } = await checkWorkspaceAccess(card.boardId, req.user.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    if (!workspaceMember) return res.status(403).json({ error: 'Not a workspace member' });


    const { bodyMd, parentId } = { ...parsed.data, ...req.body };
    const c = await prisma.comment.create({ data: { cardId, authorId: req.user.id, bodyMd, parentId } });
    res.status(201).json({ comment: c });
}


async function updateComment(req, res) {
    const { commentId } = req.params;
    const parsed = updateCommentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });


    const c = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!c) return res.status(404).json({ error: 'Comment not found' });

    if (c.authorId !== req.user.id) return res.status(403).json({ error: 'Not the author' });

    const updated = await prisma.comment.update({ where: { id: commentId }, data: { bodyMd: parsed.data.bodyMd } });
    res.json({ comment: updated });
}

async function deleteComment(req, res) {
    const { commentId } = req.params;
    const c = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!c) return res.status(404).json({ error: 'Comment not found' });
    if (c.authorId !== req.user.id) return res.status(403).json({ error: 'Not the author' });

    await prisma.comment.delete({ where: { id: commentId } });
    res.json({ success: true });
}


module.exports = { listComments, addComment, updateComment, deleteComment };