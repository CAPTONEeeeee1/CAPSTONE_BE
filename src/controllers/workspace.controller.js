const { prisma } = require('../shared/prisma');
const { createWorkspaceSchema, inviteMemberSchema } = require('../validators/workspace.validators');


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

async function inviteMember(req, res) {
    const { workspaceId } = req.params;
    const parsed = inviteMemberSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { email, role = 'member' } = parsed.data;

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

    const currentMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: req.user.id }
    });
    if (!currentMember || !['owner', 'admin'].includes(currentMember.role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const existingMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: user.id }
    });
    if (existingMember) return res.status(400).json({ error: 'User is already a member' });

    const member = await prisma.workspaceMember.create({
        data: {
            workspaceId,
            userId: user.id,
            role,
            invitedById: req.user.id,
            invitedAt: new Date(),
            joinedAt: new Date()
        }
    });

    res.status(201).json({ member });
}

module.exports = { createWorkspace, listMyWorkspaces, inviteMember };