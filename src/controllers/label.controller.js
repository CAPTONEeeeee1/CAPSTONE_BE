const { prisma } = require('../shared/prisma');
const { createLabelSchema } = require('../validators/label.validators');


async function createLabel(req, res) {
    const parsed = createLabelSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { boardId, name, colorHex } = parsed.data;


    const bm = await prisma.boardMember.findFirst({ where: { boardId, userId: req.user.id } });
    if (!bm) return res.status(403).json({ error: 'Not a board member' });


    const label = await prisma.label.create({ data: { boardId, name, colorHex } });
    res.status(201).json({ label });
}


async function listLabels(req, res) {
    const { boardId } = req.query;
    if (!boardId) return res.status(400).json({ error: 'boardId required' });
    const bm = await prisma.boardMember.findFirst({ where: { boardId, userId: req.user.id } });
    if (!bm) return res.status(403).json({ error: 'Not a board member' });
    const labels = await prisma.label.findMany({ where: { boardId }, orderBy: { name: 'asc' } });
    res.json({ labels });
}


async function updateLabel(req, res) {
    const { labelId } = req.params;
    const patch = req.body;
    const label = await prisma.label.findUnique({ where: { id: labelId } });
    if (!label) return res.status(404).json({ error: 'Label not found' });
    const bm = await prisma.boardMember.findFirst({ where: { boardId: label.boardId, userId: req.user.id } });
    if (!bm) return res.status(403).json({ error: 'Not a board member' });


    const updated = await prisma.label.update({ where: { id: labelId }, data: patch });
    res.json({ label: updated });
}


async function deleteLabel(req, res) {
    const { labelId } = req.params;
    const label = await prisma.label.findUnique({ where: { id: labelId } });
    if (!label) return res.status(404).json({ error: 'Label not found' });
    const bm = await prisma.boardMember.findFirst({ where: { boardId: label.boardId, userId: req.user.id } });
    if (!bm) return res.status(403).json({ error: 'Not a board member' });


    await prisma.label.delete({ where: { id: labelId } });
    res.json({ success: true });
}


async function addLabelToCard(req, res) {
    const { cardId } = req.params;
    const { labelId } = req.body;
    if (!labelId) return res.status(400).json({ error: 'labelId required' });


    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card) return res.status(404).json({ error: 'Card not found' });
    const bm = await prisma.boardMember.findFirst({ where: { boardId: card.boardId, userId: req.user.id } });
    if (!bm) return res.status(403).json({ error: 'Not a board member' });

    const label = await prisma.label.findFirst({ where: { id: labelId, boardId: card.boardId } });
    if (!label) return res.status(400).json({ error: 'Label not in this board' });


    await prisma.cardLabel.upsert({ where: { cardId_labelId: { cardId, labelId } }, create: { cardId, labelId }, update: {} });
    res.json({ success: true });
}


async function removeLabelFromCard(req, res) {
    const { cardId, labelId } = req.params;
    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card) return res.status(404).json({ error: 'Card not found' });
    const bm = await prisma.boardMember.findFirst({ where: { boardId: card.boardId, userId: req.user.id } });
    if (!bm) return res.status(403).json({ error: 'Not a board member' });


    await prisma.cardLabel.delete({ where: { cardId_labelId: { cardId, labelId } } }).catch(() => { });
    res.json({ success: true });
}


module.exports = { createLabel, listLabels, updateLabel, deleteLabel, addLabelToCard, removeLabelFromCard };