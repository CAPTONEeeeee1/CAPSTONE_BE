
const { prisma } = require('../shared/prisma');
const { createListSchema, reorderListsSchema } = require('../validators/list.validators');


async function createList(req, res) {
    const parsed = createListSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { boardId, name } = parsed.data;


    const member = await prisma.boardMember.findFirst({ where: { boardId, userId: req.user.id } });
    if (!member) return res.status(403).json({ error: 'Not a board member' });


    const max = await prisma.list.aggregate({ where: { boardId }, _max: { orderIdx: true } });
    const orderIdx = (max._max.orderIdx ?? -1) + 1;
    const list = await prisma.list.create({ data: { boardId, name, orderIdx } });
    res.status(201).json({ list });
}


async function updateList(req, res) {
    const { listId } = req.params;
    const { name, orderIdx, isDone } = req.body;
    const list = await prisma.list.findUnique({ where: { id: listId } });
    if (!list) return res.status(404).json({ error: 'List not found' });
    const member = await prisma.boardMember.findFirst({ where: { boardId: list.boardId, userId: req.user.id } });
    if (!member) return res.status(403).json({ error: 'Not a board member' });


    const updated = await prisma.list.update({ where: { id: listId }, data: { name, orderIdx, isDone } });
    res.json({ list: updated });
}


async function deleteList(req, res) {
    const { listId } = req.params;
    const list = await prisma.list.findUnique({ where: { id: listId } });
    if (!list) return res.status(404).json({ error: 'List not found' });
    const member = await prisma.boardMember.findFirst({ where: { boardId: list.boardId, userId: req.user.id } });
    if (!member) return res.status(403).json({ error: 'Not a board member' });


    await prisma.list.delete({ where: { id: listId } });
    res.json({ success: true });
}


async function reorderLists(req, res) {
    const parsed = reorderListsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { boardId, orders } = parsed.data;


    const member = await prisma.boardMember.findFirst({ where: { boardId, userId: req.user.id } });
    if (!member) return res.status(403).json({ error: 'Not a board member' });


    await prisma.$transaction(
        orders.map(o => prisma.list.update({ where: { id: o.id }, data: { orderIdx: o.orderIdx } }))
    );
    res.json({ success: true });
}


module.exports = { createList, updateList, deleteList, reorderLists };