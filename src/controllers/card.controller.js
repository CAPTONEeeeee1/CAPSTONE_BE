const { prisma } = require('../shared/prisma');
const { createCardSchema, updateCardSchema, moveCardSchema } = require('../validators/card.validators');

function makeBoardKey(prefix, seq) {
    if (prefix && prefix.trim()) return `${prefix.trim().toUpperCase()}-${seq}`;
    return `CARD-${seq}`;
}

async function createCard(req, res) {
    const parsed = createCardSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { boardId, listId, title, description, priority, dueDate, startDate, assigneeIds, labelIds, custom } = parsed.data;


    const member = await prisma.boardMember.findFirst({ where: { boardId, userId: req.user.id } });
    if (!member) return res.status(403).json({ error: 'Not a board member' });


    const list = await prisma.list.findUnique({ where: { id: listId } });
    if (!list || list.boardId !== boardId) return res.status(400).json({ error: 'Invalid list/board' });


    const board = await prisma.board.findUnique({ where: { id: boardId }, select: { id: true, keySlug: true } });
    if (!board) return res.status(404).json({ error: 'Board not found' });
    const result = await prisma.$transaction(async (tx) => {
        const maxOrder = await tx.card.aggregate({ where: { listId }, _max: { orderIdx: true } });
        const orderIdx = (maxOrder._max.orderIdx ?? -1) + 1;

        const maxKey = await tx.card.aggregate({ where: { boardId }, _max: { keySeq: true } });
        const keySeq = (maxKey._max.keySeq ?? 0) + 1;


        const card = await tx.card.create({
            data: {
                boardId,
                listId,
                keySeq,
                title,
                description: description ?? null,
                priority: priority ?? 'medium',
                dueDate: dueDate ? new Date(dueDate) : null,
                startDate: startDate ? new Date(startDate) : null,
                orderIdx,
                custom: custom ?? null,
                reporterId: req.user.id,
                createdById: req.user.id,
            }
        });

        let assigned = [];
        if (assigneeIds && assigneeIds.length) {
            const validMembers = await tx.boardMember.findMany({
                where: { boardId, userId: { in: assigneeIds } },
                select: { userId: true }
            });
            const uniqueUserIds = [...new Set(validMembers.map(m => m.userId))];
            if (uniqueUserIds.length) {
                assigned = await Promise.all(uniqueUserIds.map(uid => tx.cardMember.create({ data: { cardId: card.id, userId: uid } })));
            }
        }

        let attachedLabels = [];
        if (labelIds && labelIds.length) {
            const validLabels = await tx.label.findMany({
                where: { boardId, id: { in: labelIds } },
                select: { id: true }
            });
            const uniqueLabelIds = [...new Set(validLabels.map(l => l.id))];
            if (uniqueLabelIds.length) {
                attachedLabels = await Promise.all(uniqueLabelIds.map(lid => tx.cardLabel.create({ data: { cardId: card.id, labelId: lid } })));
            }
        }


        return { card, assigned, attachedLabels, keySeq };
    });

    const humanKey = makeBoardKey(board.keySlug, result.keySeq);
    return res.status(201).json({
        card: {
            ...result.card,
            key: humanKey,
            members: result.assigned,
            labels: result.attachedLabels
        }
    });
}

async function listCardsByList(req, res) {
    const { listId } = req.params;
    const list = await prisma.list.findUnique({ where: { id: listId }, select: { id: true, boardId: true } });
    if (!list) return res.status(404).json({ error: 'List not found' });

    // membership via board
    const bm = await prisma.boardMember.findFirst({ where: { boardId: list.boardId, userId: req.user.id } });
    if (!bm) return res.status(403).json({ error: 'Not a board member' });

    const { q, labelId, memberId, offset = '0', limit = '50' } = req.query;

    const where = { listId };
    if (q) where.OR = [
        { title: { contains: String(q), mode: 'insensitive' } },
        { description: { contains: String(q), mode: 'insensitive' } }
    ];
    if (labelId) where.labels = { some: { labelId: String(labelId) } };
    if (memberId) where.members = { some: { userId: String(memberId) } };

    const take = Math.min(Math.max(parseInt(String(limit), 10) || 50, 1), 200);
    const skip = Math.max(parseInt(String(offset), 10) || 0, 0);

    const [items, total] = await Promise.all([
        prisma.card.findMany({
            where,
            include: {
                list: { select: { id: true, name: true } },
                labels: { include: { label: true } },
                members: { include: { user: { select: { id: true, fullName: true } } } }
            },
            orderBy: [{ orderIdx: 'asc' }, { updatedAt: 'desc' }],
            skip,
            take
        }),
        prisma.card.count({ where })
    ]);

    return res.json({ total, offset: skip, limit: take, items });
}

async function getCard(req, res) {
    const { cardId } = req.params;
    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card) return res.status(404).json({ error: 'Card not found' });
    const member = await prisma.boardMember.findFirst({ where: { boardId: card.boardId, userId: req.user.id } });
    if (!member) return res.status(403).json({ error: 'Not a board member' });
    const full = await prisma.card.findUnique({ where: { id: cardId }, include: { labels: true, members: true } });
    res.json({ card: full });
}


async function updateCard(req, res) {
    const { cardId } = req.params;
    const parsed = updateCardSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const patch = parsed.data;


    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card) return res.status(404).json({ error: 'Card not found' });
    const member = await prisma.boardMember.findFirst({ where: { boardId: card.boardId, userId: req.user.id } });
    if (!member) return res.status(403).json({ error: 'Not a board member' });


    const updated = await prisma.card.update({ where: { id: cardId }, data: { ...patch, updatedById: req.user.id } });
    res.json({ card: updated });
}

async function deleteCard(req, res) {
    const { cardId } = req.params;
    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card) return res.status(404).json({ error: 'Card not found' });
    const member = await prisma.boardMember.findFirst({ where: { boardId: card.boardId, userId: req.user.id } });
    if (!member) return res.status(403).json({ error: 'Not a board member' });
    await prisma.card.delete({ where: { id: cardId } });
    res.json({ success: true });
}


async function moveCard(req, res) {
    const { cardId } = req.params;
    const parsed = moveCardSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { toListId, toIndex } = parsed.data;


    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card) return res.status(404).json({ error: 'Card not found' });
    const member = await prisma.boardMember.findFirst({ where: { boardId: card.boardId, userId: req.user.id } });
    if (!member) return res.status(403).json({ error: 'Not a board member' });


    await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
            'UPDATE "Card" SET "orderIdx" = "orderIdx" + 1 WHERE "listId" = $1 AND "orderIdx" >= $2',
            toListId, toIndex
        );
        await tx.card.update({ where: { id: cardId }, data: { listId: toListId, orderIdx: toIndex, updatedById: req.user.id } });
    });


    const updated = await prisma.card.findUnique({ where: { id: cardId } });
    res.json({ card: updated });
}


module.exports = { createCard, getCard, updateCard, deleteCard, moveCard, listCardsByList };