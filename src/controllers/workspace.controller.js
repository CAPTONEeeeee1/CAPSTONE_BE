const { prisma } = require('../shared/prisma');
const { createWorkspaceSchema, inviteMemberSchema, updateWorkspaceSchema, updateMemberRoleSchema } = require('../validators/workspace.validators');
const { createNotification, sendWorkspaceInvitationNotification, sendInvitationResponseNotification, sendWorkspaceDeletedNotification, sendMemberRemovedNotification } = require('../services/notification.service');
const { logActivity, getClientInfo } = require('../services/activity.service');


// --- CREATE WORKSPACE ---

async function createWorkspace(req, res) {
    const parsed = createWorkspaceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { name, description, visibility } = parsed.data;

    const ws = await prisma.$transaction(async (tx) => {
        // Tạo Workspace với visibility (từ Code 2)
        const workspace = await tx.workspace.create({
            data: {
                name,
                description: description ?? null, // Đảm bảo description là optional và có thể null
                visibility,
            }
        });
        // Tạo thành viên Owner
        await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId: req.user.id, role: 'OWNER', joinedAt: new Date() } });
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


// --- UPDATE WORKSPACE ---

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
    if (!member || !['OWNER', 'LEADER'].includes(member.role.toUpperCase())) {
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

    const clientInfo = getClientInfo(req);
    const metadata = {};
    if (name !== undefined && name !== workspace.name) metadata.oldName = workspace.name;
    if (description !== undefined && description !== workspace.description) metadata.oldDescription = workspace.description;
    if (visibility !== undefined && visibility !== workspace.visibility) metadata.oldVisibility = workspace.visibility;
    
    // Only log if something actually changed
    if (Object.keys(metadata).length > 0) {
        await logActivity({
            userId: req.user.id,
            action: 'updated_workspace_details',
            entityType: 'Workspace',
            entityId: updated.id,
            entityName: updated.name,
            workspaceId: updated.id,
            metadata: metadata,
            ...clientInfo
        });
    }

    res.json({ workspace: updated });
}


// --- DELETE WORKSPACE ---

async function deleteWorkspace(req, res) {
    const { workspaceId } = req.params;

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

    const member = await prisma.workspaceMember.findFirst({
        where: {
            workspaceId,
            userId: req.user.id,
        },
    });

    if (!member || !['OWNER', 'LEADER'].includes(member.role)) {
        return res.status(403).json({ error: 'Only workspace owner or leader can delete the workspace' });
    }

    // Lấy danh sách thành viên trước khi xóa
    const members = await prisma.workspaceMember.findMany({
        where: { workspaceId: workspaceId }
    });

    await prisma.workspace.delete({ where: { id: workspaceId } });

    // Lấy tên người xóa để đưa vào thông báo
    const deleterName = req.user.fullName;

    // Gửi thông báo đến các thành viên khác, bao gồm email
    for (const member of members) {
        if (member.userId !== req.user.id) { // Không gửi cho chính người xóa
            await sendWorkspaceDeletedNotification({
                deleterId: req.user.id,
                memberId: member.userId,
                workspaceName: workspace.name,
                deleterName: deleterName,
            });
        }
    }

    res.json({ success: true, message: 'Workspace deleted successfully' });

    const clientInfo = getClientInfo(req);
    await logActivity({
        userId: req.user.id,
        action: 'deleted_workspace',
        entityType: 'Workspace',
        entityId: workspace.id,
        entityName: workspace.name,
        workspaceId: workspace.id,
        ...clientInfo
    });
}


// --- LIST MY WORKSPACES ---

async function listMyWorkspaces(req, res) {
    const userId = req.user.id;
    const workspaces = await prisma.workspace.findMany({
        where: { members: { some: { userId } } },
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            name: true,
            description: true,
            plan: true,
            visibility: true,
            createdAt: true,
            _count: {
                select: { members: true, boards: true },
            },
        },
    });

    res.json({ workspaces });
}


async function getWorkspaceById(req, res) {
    const { workspaceId } = req.params;
    const userId = req.user.id;

    try {
        const workspaceWithMembers = await prisma.workspace.findFirst({
            where: {
                id: workspaceId,
                members: { some: { userId: userId } }, // Kiểm tra quyền truy cập
            },
            include: {
                _count: { select: { members: true, boards: true } },
                members: {
                    where: { role: 'OWNER' },
                    include: { user: { select: { id: true, fullName: true, email: true } } }
                }
            }
        });

        if (!workspaceWithMembers) {
            return res.status(404).json({ error: 'Không tìm thấy workspace hoặc bạn không có quyền truy cập' });
        }

        const { members, ...workspaceData } = workspaceWithMembers;
        const owner = members.length > 0 ? members[0].user : null;


        res.json({ workspace: { ...workspaceData, owner } });
    } catch (error) {
        console.error("Error fetching workspace by id:", error);
        res.status(500).json({ error: 'Lỗi máy chủ' });
    }
}



async function getWorkspaceBoards(req, res) {
    const { workspaceId } = req.params;
    // Giả định middleware đã kiểm tra quyền truy cập workspace
    const boards = await prisma.board.findMany({
        where: { workspaceId: workspaceId },
        orderBy: { createdAt: 'asc' }
    });
    res.json({ boards });
}


// --- GET WORKSPACE MEMBERS ---

async function getWorkspaceMembers(req, res) {
    const { workspaceId } = req.params; // SỬA LỖI: Đổi tên từ 'id' thành 'workspaceId' để khớp với route
    // Giả định middleware đã kiểm tra quyền truy cập workspace
    const members = await prisma.workspaceMember.findMany({
        where: { workspaceId: workspaceId }, // SỬA LỖI: Truyền chính xác workspaceId vào câu lệnh where
        select: {
            id: true,
            role: true,
            joinedAt: true,
            user: {
                select: {
                    id: true,
                    email: true,
                    fullName: true,
                    avatar: true
                }
            }
        },
        orderBy: { joinedAt: 'asc' }
    });
    res.json({ members });
}



async function inviteMember(req, res) {
    const { workspaceId } = req.params;
    const parsed = inviteMemberSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { email, role = 'member' } = parsed.data;
    const roleUpper = role.toUpperCase();

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

    const currentMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: req.user.id }
    });
    if (!currentMember) {
        return res.status(403).json({ error: 'You are not a member of this workspace.' });
    }

    // --- New, Stricter Permission Checks ---
    if (currentMember.role === 'OWNER') {
        const leaderCount = await prisma.workspaceMember.count({
            where: { workspaceId, role: 'LEADER' }
        });

        if (leaderCount > 0) {
            if (roleUpper !== 'MEMBER') {
                return res.status(400).json({ error: 'A leader already exists. You can only invite new users as "MEMBER".' });
            }
        } else { // No leader exists yet
            if (roleUpper !== 'LEADER' && roleUpper !== 'MEMBER') {
                return res.status(400).json({ error: 'You may invite one person as "LEADER", otherwise the role must be "MEMBER".' });
            }
        }

    } else if (currentMember.role === 'LEADER') {
        if (roleUpper !== 'MEMBER') {
            return res.status(403).json({ error: 'As a Leader, you can only invite users with the "MEMBER" role.' });
        }
    } else {
        return res.status(403).json({ error: 'Only owner or leader can invite members' });
    }

    // Check workspace plan and limit members if it's a FREE plan
    if (workspace.plan === 'FREE') {
        const memberCount = await prisma.workspaceMember.count({
            where: { workspaceId: workspaceId },
        });

        if (memberCount >= 5) {
            return res.status(403).json({
                error: 'Free plan is limited to 5 members. Please upgrade to invite more.',
            });
        }
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

    // Xóa lời mời cũ không còn pending
    await prisma.workspaceInvitation.deleteMany({
        where: {
            workspaceId,
            email,
            status: { not: 'pending' }
        }
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitation = await prisma.workspaceInvitation.create({
        data: {
            workspaceId,
            email,
            role: roleUpper,
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

    if (invitation.status !== 'pending') return res.status(400).json({ error: 'Invitation is not pending' });
    if (new Date() > invitation.expiresAt) {
        await prisma.workspaceInvitation.update({ where: { id: invitationId }, data: { status: 'expired' } });
        return res.status(400).json({ error: 'Invitation has expired' });
    }

    const existingMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId: invitation.workspaceId, userId: req.user.id }
    });
    if (existingMember) return res.status(400).json({ error: 'You are already a member of this workspace' });

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
            data: { status: 'accepted', respondedAt: new Date() }
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
    if (invitation.status !== 'pending') return res.status(400).json({ error: 'Invitation is not pending' });
    if (invitation.email !== req.user.email) return res.status(403).json({ error: 'This invitation is not for you' });

    await prisma.workspaceInvitation.update({
        where: { id: invitationId },
        data: { status: 'rejected', respondedAt: new Date() }
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
            workspace: { select: { id: true, name: true, description: true } },
            invitedBy: { select: { id: true, fullName: true, email: true } }
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
    if (!currentMember || !['OWNER', 'LEADER'].includes(currentMember.role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
    }

    if (req.user.id === userId) return res.status(400).json({ error: 'Cannot remove yourself' });

    const targetMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId },
        include: { user: { select: { fullName: true, email: true } } }
    });
    if (!targetMember) return res.status(404).json({ error: 'Member not found' });

    if (targetMember.role === 'OWNER') {
        return res.status(400).json({ error: 'Cannot remove workspace owner' });
    }

    await prisma.workspaceMember.delete({ where: { id: targetMember.id } });

    sendMemberRemovedNotification({
        removerId: req.user.id,
        removedMemberId: userId,
        workspaceName: workspace.name,
        removerName: req.user.fullName
    });

    const clientInfo = getClientInfo(req);
    await logActivity({
        userId: req.user.id,
        action: 'removed_member',
        entityType: 'WorkspaceMember',
        entityId: targetMember.id,
        entityName: targetMember.user.fullName,
        workspaceId: workspace.id,
        metadata: {
            removedUserId: userId,
            removedUserEmail: targetMember.user.email
        },
        ...clientInfo
    });

    res.json({ message: 'Member removed successfully' });
}



async function leaveWorkspace(req, res) {
    const { workspaceId } = req.params;

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

    const member = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: req.user.id }
    });
    if (!member) return res.status(404).json({ error: 'You are not a member of this workspace' });

    if (member.role === 'OWNER') {
        return res.status(400).json({ error: 'Workspace owner cannot leave workspace' });
    }

    await prisma.workspaceMember.delete({ where: { id: member.id } });

    const clientInfo = getClientInfo(req);
    await logActivity({
        userId: req.user.id,
        action: 'left_workspace',
        entityType: 'Workspace',
        entityId: workspace.id,
        entityName: workspace.name,
        workspaceId: workspace.id,
        metadata: {
            memberId: member.id,
            memberEmail: req.user.email
        },
        ...clientInfo
    });

    res.json({ message: 'Left workspace successfully' });
}



async function updateMemberRole(req, res) {
    const { workspaceId, userId } = req.params;
    const parsed = updateMemberRoleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { role } = parsed.data;
    const roleUpper = role.toUpperCase();

    if (roleUpper === 'OWNER') {
        return res.status(400).json({ error: 'Cannot assign another owner' });
    }

    const [currentMember, targetMember] = await Promise.all([
        prisma.workspaceMember.findFirst({ where: { workspaceId, userId: req.user.id } }),
        prisma.workspaceMember.findFirst({
            where: { workspaceId, userId },
            include: { user: { select: { fullName: true, email: true } } }
        })
    ]);

    if (!currentMember) return res.status(403).json({ error: 'You are not a member of this workspace.' });
    if (!targetMember) return res.status(404).json({ error: 'Member not found' });

    if (!['OWNER', 'LEADER'].includes(currentMember.role)) {
        return res.status(403).json({ error: 'Only owner or leader can change member roles' });
    }

    if (targetMember.role === 'OWNER') {
        return res.status(400).json({ error: 'Cannot change workspace owner role' });
    }

    // --- Role-specific restrictions ---

    if (currentMember.role === 'LEADER') {
        // Leaders can't assign Leader role or change their own role.
        if (roleUpper === 'LEADER' || targetMember.userId === currentMember.userId) {
            return res.status(403).json({ error: 'Permission denied. Leaders cannot assign the Leader role or change their own role.' });
        }
    }

    // --- Check for existing Leader when assigning the role ---
    if (roleUpper === 'LEADER') {
        // This action is reserved for Owners.
        if (currentMember.role !== 'OWNER') {
            return res.status(403).json({ error: 'Permission denied: Only an owner can assign the LEADER role.' });
        }

        const existingLeader = await prisma.workspaceMember.findFirst({
            where: {
                workspaceId,
                role: 'LEADER',
                userId: { not: userId }
            }
        });
        if (existingLeader) {
            return res.status(400).json({ error: 'A leader already exists in this workspace. Please demote the existing leader first.' });
        }
    }

    const updated = await prisma.workspaceMember.update({
        where: { id: targetMember.id },
        data: { role: roleUpper }
    });

    const clientInfo = getClientInfo(req);
    await logActivity({
        userId: req.user.id,
        action: 'updated_member_role',
        entityType: 'WorkspaceMember',
        entityId: updated.id,
        entityName: targetMember.user.fullName,
        workspaceId: workspaceId,
        metadata: {
            targetUserId: userId,
            oldRole: targetMember.role,
            newRole: roleUpper
        },
        ...clientInfo
    });

    res.json({ member: updated });
}


module.exports = {
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    listMyWorkspaces,
    getWorkspaceById,
    getWorkspaceBoards,
    getWorkspaceMembers,
    inviteMember,
    acceptInvitation,
    rejectInvitation,
    listMyInvitations,
    removeMember,
    leaveWorkspace,
    updateMemberRole
};