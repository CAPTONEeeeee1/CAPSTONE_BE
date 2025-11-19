const { prisma } = require('../shared/prisma');
const { createBoardSchema, renameBoardSchema } = require('../validators/board.validators');


async function createBoard(req, res) {
  const parsed = createBoardSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { workspaceId, name, mode, keySlug } = parsed.data;

  const m = await prisma.workspaceMember.findFirst({ where: { workspaceId, userId: req.user.id } });
  if (!m) return res.status(403).json({ error: 'Not in workspace' });

  // Only owner and admin can create boards
  if (!['owner', 'admin'].includes(m.role)) {
    return res.status(403).json({ error: 'Only workspace owner and admin can create boards' });
  }

  const result = await prisma.$transaction(async (tx) => {
    const b = await tx.board.create({
      data: { workspaceId, name, mode, keySlug, createdById: req.user.id }
    });


    const l1 = await tx.list.create({ data: { boardId: b.id, name: 'Todo', orderIdx: 0 } });
    const l2 = await tx.list.create({ data: { boardId: b.id, name: 'In Progress', orderIdx: 1 } });
    const l3 = await tx.list.create({ data: { boardId: b.id, name: 'Done', orderIdx: 2, isDone: true } });

    return { b, lists: [l1, l2, l3] };
  });

  return res.status(201).json({ board: result.b, lists: result.lists });
}

async function getWorkSpaceBoards(req, res) {
  const { workspaceId } = req.params;

  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId: req.user.id }
  });
  if (!member) return res.status(403).json({ error: 'Not in workspace' });

  const boards = await prisma.board.findMany({
    where: { workspaceId },
    include: { lists: { orderBy: { orderIdx: 'asc' } } }
  });
  return res.json({ boards });
}

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

  const workspaceMember = await prisma.workspaceMember.findFirst({
    where: { workspaceId: board.workspaceId, userId: req.user.id }
  });
  if (!workspaceMember) return res.status(403).json({ error: 'Not a workspace member' });

  return res.json({ board });
}

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

async function deleteBoard(req, res) {
  const { boardId } = req.params;

  const board = await prisma.board.findUnique({ where: { id: boardId } });
  if (!board) return res.status(404).json({ error: 'Board not found' });

  const workspaceMember = await prisma.workspaceMember.findFirst({
    where: { workspaceId: board.workspaceId, userId: req.user.id }
  });
  if (!workspaceMember) return res.status(403).json({ error: 'Not a workspace member' });

  if (!['owner', 'admin'].includes(workspaceMember.role)) {
    return res.status(403).json({ error: 'Only workspace admin or owner can delete board' });
  }

  await prisma.board.delete({
    where: { id: boardId }
  });

  return res.json({ message: 'Board deleted successfully' });
}

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
