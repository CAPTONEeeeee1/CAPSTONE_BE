const { prisma } = require('../shared/prisma');
const { createBoardSchema, renameBoardSchema } = require('../validators/board.validators');


async function createBoard(req, res) {
  const parsed = createBoardSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { workspaceId, name, mode, keySlug } = parsed.data;

  const m = await prisma.workspaceMember.findFirst({ where: { workspaceId, userId: req.user.id } });
  if (!m) return res.status(403).json({ error: 'Not in workspace' });

  const result = await prisma.$transaction(async (tx) => {
    const b = await tx.board.create({
      data: { workspaceId, name, mode, keySlug, createdById: req.user.id }
    });

    await tx.boardMember.create({
      data: { boardId: b.id, userId: req.user.id, role: 'admin', joinedAt: new Date() }
    });

    const l1 = await tx.list.create({ data: { boardId: b.id, name: 'Todo',        orderIdx: 0 } });
    const l2 = await tx.list.create({ data: { boardId: b.id, name: 'In Progress',  orderIdx: 1 } });
    const l3 = await tx.list.create({ data: { boardId: b.id, name: 'Done',         orderIdx: 2, isDone: true } });

    return { b, lists: [l1, l2, l3] };
  });

  return res.status(201).json({ board: result.b, lists: result.lists });
}

async function getBoard(req, res) {
  const { boardId } = req.params;
  const member = await prisma.boardMember.findFirst({ where: { boardId, userId: req.user.id } });
  if (!member) return res.status(403).json({ error: 'Not a board member' });

  const board = await prisma.board.findUnique({
    where: { id: boardId },
    include: { lists: { orderBy: { orderIdx: 'asc' } } }
  });
  return res.json({ board });
}

async function renameBoard(req, res) {
  const { boardId } = req.params;
  const parsed = renameBoardSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { name } = parsed.data;

  const member = await prisma.boardMember.findFirst({ 
    where: { boardId, userId: req.user.id } 
  });
  if (!member) return res.status(403).json({ error: 'Access denied to this board' });

  const board = await prisma.board.findUnique({ where: { id: boardId } });
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

  const member = await prisma.boardMember.findFirst({ 
    where: { boardId, userId: req.user.id } 
  });
  if (!member) return res.status(403).json({ error: 'Access denied to this board' });

  if (member.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can delete board' });
  }

  await prisma.board.delete({
    where: { id: boardId }
  });

  return res.json({ message: 'Board deleted successfully' });
}

module.exports = { createBoard, getBoard, renameBoard, deleteBoard };
