const { prisma } = require('../shared/prisma');
const { createWorkspaceSchema, inviteMemberSchema, updateWorkspaceSchema, updateMemberRoleSchema } = require('../validators/workspace.validators');
const { sendWorkspaceInvitationNotification, sendInvitationResponseNotification } = require('../services/notification.service');
const { logActivity, getClientInfo } = require('../services/activity.service');


async function createWorkspace(req, res) {
    const parsed = createWorkspaceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { name, description, visibility } = parsed.data;

    const ws = await prisma.$transaction(async (tx) => {
        const workspace = await tx.workspace.create({ data: { name, description, visibility, ownerId: req.user.id } });
        await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId: req.user.id, role: 'owner', joinedAt: new Date() } });
        return workspace;
    });

    const clientInfo = getClientInfo(req);
    logActivity({
        userId: req.user.id,
        action: 'workspace_created',
        entityType: 'workspace',
        entityId: ws.id,
        entityName: ws.name,
        ...clientInfo
    });

    res.status(201).json({ workspace: ws });
}

async function updateWorkspace(req, res) {
    const { workspaceId } = req.params;
    const parsed = updateWorkspaceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { name, description, visibility } = parsed.data;

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

    const member = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: req.user.id }
    });
    if (!member || !['owner', 'admin'].includes(member.role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (visibility !== undefined) updateData.visibility = visibility;

    const updated = await prisma.workspace.update({
        where: { id: workspaceId },
        data: updateData
    });

    res.json({ workspace: updated });
}

async function deleteWorkspace(req, res) {
    const { workspaceId } = req.params;

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

    if (workspace.ownerId !== req.user.id) {
        return res.status(403).json({ error: 'Only workspace owner can delete workspace' });
    }

    await prisma.workspace.delete({ where: { id: workspaceId } });
    res.json({ success: true });
}

async function listMyWorkspaces(req, res) {
    const userId = req.user.id;
    const wss = await prisma.workspace.findMany({
        where: { members: { some: { userId } } },
        orderBy: { createdAt: 'desc' }
    });
    res.json({ workspaces: wss });
}

async function getWorkspaceMembers(req, res) {
    const { workspaceId } = req.params;

    const members = await prisma.workspaceMember.findMany({
        where: { workspaceId },
        select: {
            id: true,
            role: true,
            joinedAt: true,
            user: {
                select: {
                    id: true,
                    email: true,
                    fullName: true
                }
            }
        }
    });

    res.json({ members });
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

    const existingInvitation = await prisma.workspaceInvitation.findFirst({
        where: { workspaceId, email, status: 'pending' }
    });
    if (existingInvitation) return res.status(400).json({ error: 'Invitation already sent' });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Delete any old invitations (accepted, rejected, expired) to avoid unique constraint error
    await prisma.workspaceInvitation.deleteMany({
        where: {
            workspaceId,
            email,
            status: { not: 'pending' }
        }
    });

    const invitation = await prisma.workspaceInvitation.create({
        data: {
            workspaceId,
            email,
            role,
            invitedById: req.user.id,
            expiresAt
        }
    });

    sendWorkspaceInvitationNotification({
        inviterId: req.user.id,
        receiverEmail: email,
        workspace,
        invitationId: invitation.id
    });

    res.status(201).json({ invitation });
}

async function acceptInvitation(req, res) {
    const { invitationId } = req.params;

    const invitation = await prisma.workspaceInvitation.findUnique({
        where: { id: invitationId },
        include: { workspace: true }
    });
    if (!invitation) return res.status(404).json({ error: 'Invitation not found' });

    if (invitation.status !== 'pending') {
        return res.status(400).json({ error: 'Invitation is not pending' });
    }

    if (new Date() > invitation.expiresAt) {
        await prisma.workspaceInvitation.update({
            where: { id: invitationId },
            data: { status: 'expired' }
        });
        return res.status(400).json({ error: 'Invitation has expired' });
    }

    const existingMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId: invitation.workspaceId, userId: req.user.id }
    });
    if (existingMember) {
        return res.status(400).json({ error: 'You are already a member of this workspace' });
    }

    await prisma.$transaction(async (tx) => {
        await tx.workspaceMember.create({
            data: {
                workspaceId: invitation.workspaceId,
                userId: req.user.id,
                role: invitation.role,
                invitedById: invitation.invitedById,
                invitedAt: invitation.invitedAt,
                joinedAt: new Date()
            }
        });

        await tx.workspaceInvitation.update({
            where: { id: invitationId },
            data: {
                status: 'accepted',
                respondedAt: new Date()
            }
        });
    });

    sendInvitationResponseNotification({
        inviterId: invitation.invitedById,
        responderId: req.user.id,
        workspace: invitation.workspace,
        accepted: true
    });

    res.json({
        message: 'Invitation accepted successfully',
        workspaceId: invitation.workspaceId,
        workspace: invitation.workspace
    });
}

async function rejectInvitation(req, res) {
    const { invitationId } = req.params;

    const invitation = await prisma.workspaceInvitation.findUnique({
        where: { id: invitationId },
        include: { workspace: true }
    });
    if (!invitation) return res.status(404).json({ error: 'Invitation not found' });

    if (invitation.status !== 'pending') {
        return res.status(400).json({ error: 'Invitation is not pending' });
    }

    if (invitation.email !== req.user.email) {
        return res.status(403).json({ error: 'This invitation is not for you' });
    }

    await prisma.workspaceInvitation.update({
        where: { id: invitationId },
        data: {
            status: 'rejected',
            respondedAt: new Date()
        }
    });

    sendInvitationResponseNotification({
        inviterId: invitation.invitedById,
        responderId: req.user.id,
        workspace: invitation.workspace,
        accepted: false
    });

    res.json({ message: 'Invitation rejected successfully' });
}

async function listMyInvitations(req, res) {
    const invitations = await prisma.workspaceInvitation.findMany({
        where: {
            email: req.user.email,
            status: 'pending'
        },
        include: {
            workspace: {
                select: { id: true, name: true, description: true }
            },
            invitedBy: {
                select: { id: true, fullName: true, email: true }
            }
        },
        orderBy: { invitedAt: 'desc' }
    });

    res.json({ invitations });
}

async function removeMember(req, res) {
    const { workspaceId, userId } = req.params;

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

    const currentMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: req.user.id }
    });
    if (!currentMember || !['owner', 'admin'].includes(currentMember.role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
    }

    if (workspace.ownerId === userId) {
        return res.status(400).json({ error: 'Cannot remove workspace owner' });
    }

    const targetMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId }
    });
    if (!targetMember) return res.status(404).json({ error: 'Member not found' });

    if (req.user.id === userId) {
        return res.status(400).json({ error: 'Cannot remove yourself' });
    }

    if (currentMember.role === 'admin' && targetMember.role === 'admin') {
        return res.status(400).json({ error: 'Permission denied' });
    }

    await prisma.workspaceMember.delete({
        where: { id: targetMember.id }
    });

    res.json({ message: 'Member removed successfully' });
}

async function leaveWorkspace(req, res) {
    const { workspaceId } = req.params;

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

    if (workspace.ownerId === req.user.id) {
        return res.status(400).json({ error: 'Workspace owner cannot leave workspace' });
    }

    const member = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: req.user.id }
    });
    if (!member) return res.status(404).json({ error: 'You are not a member of this workspace' });

    await prisma.workspaceMember.delete({
        where: { id: member.id }
    });

    res.json({ message: 'Left workspace successfully' });
}

async function updateMemberRole(req, res) {
    const { workspaceId, userId } = req.params;
    const parsed = updateMemberRoleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { role } = parsed.data;

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

    const currentMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: req.user.id }
    });
    if (!currentMember || !['owner', 'admin'].includes(currentMember.role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
    }

    if (workspace.ownerId === userId) {
        return res.status(400).json({ error: 'Cannot change workspace owner role' });
    }

    const targetMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId }
    });
    if (!targetMember) return res.status(404).json({ error: 'Member not found' });

    if (currentMember.role === 'admin' && targetMember.role === 'admin') {
        return res.status(400).json({ error: 'Admin cannot change another admin role' });
    }

    const updated = await prisma.workspaceMember.update({
        where: { id: targetMember.id },
        data: { role }
    });

    res.json({ member: updated });
}

module.exports = { createWorkspace, updateWorkspace, deleteWorkspace, listMyWorkspaces, getWorkspaceMembers, inviteMember, acceptInvitation, rejectInvitation, listMyInvitations, removeMember, leaveWorkspace, updateMemberRole };