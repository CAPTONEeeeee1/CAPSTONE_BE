const { prisma } = require('../shared/prisma');
const { createWorkspaceSchema } = require('../validators/workspace.validators');


async function createWorkspace(req, res) {
    const parsed = createWorkspaceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { name, description, visibility } = parsed.data;


    const ws = await prisma.$transaction(async (tx) => {
        const workspace = await tx.workspace.create({ data: { name, description, visibility, ownerId: req.user.id } });
        await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId: req.user.id, role: 'owner', joinedAt: new Date() } });
        return workspace;
    });
    res.status(201).json({ workspace: ws });
}


async function listMyWorkspaces(req, res) {
    const userId = req.user.id;
    const wss = await prisma.workspace.findMany({
        where: { members: { some: { userId } } },
        orderBy: { createdAt: 'desc' }
    });
    res.json({ workspaces: wss });
}


module.exports = { createWorkspace, listMyWorkspaces };