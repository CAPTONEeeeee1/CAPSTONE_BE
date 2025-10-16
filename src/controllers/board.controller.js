const { prisma } = require('../shared/prisma');
const { createBoardSchema } = require('../validators/board.validators');


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

module.exports = { createBoard, getBoard };
