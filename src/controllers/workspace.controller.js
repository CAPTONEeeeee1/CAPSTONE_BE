const { prisma } = require('../shared/prisma');

/**
 * Tạo một workspace mới
 */
async function createWorkspace(req, res) {
    const { name, description } = req.body;
    const userId = req.user.id;

    if (!name || name.trim().length < 3) {
        return res.status(400).json({ error: 'Tên workspace phải có ít nhất 3 ký tự' });
    }

    try {
        const workspace = await prisma.workspace.create({
            data: {
                name: name.trim(),
                description: description?.trim(),
                ownerId: userId,
                members: {
                    create: {
                        userId: userId,
                        role: 'owner',
                    },
                },
            },
        });

        res.status(201).json({ workspace });
    } catch (error) {
        console.error("Error creating workspace:", error);
        res.status(500).json({ error: 'Không thể tạo workspace' });
    }
}

/**
 * Lấy danh sách tất cả workspaces mà người dùng là thành viên
 */
async function listMyWorkspaces(req, res) {
    const userId = req.user.id;

    try {
        const workspaces = await prisma.workspace.findMany({
            where: {
                members: {
                    some: {
                        userId: userId,
                    },
                },
            },
            include: {
                _count: {
                    select: { members: true, boards: true },
                },
            },
        });

        res.json({ workspaces });
    } catch (error) {
        console.error("Error listing workspaces:", error);
        res.status(500).json({ error: 'Không thể tải danh sách workspace' });
    }
}

/**
 * Lấy thông tin chi tiết của một workspace theo ID
 */
async function getWorkspaceById(req, res) {
    const { id } = req.params;
    const userId = req.user.id;

    try {
        const workspace = await prisma.workspace.findFirst({
            where: {
                id: id,
                members: { some: { userId: userId } },
            },
        });

        if (!workspace) {
            return res.status(404).json({ error: 'Không tìm thấy workspace hoặc bạn không có quyền truy cập' });
        }

        res.json({ workspace });
    } catch (error) {
        console.error("Error fetching workspace by id:", error);
        res.status(500).json({ error: 'Lỗi máy chủ' });
    }
}

/**
 * Lấy danh sách boards của một workspace
 */
async function getWorkspaceBoards(req, res) {
    const { id } = req.params;
    // Logic kiểm tra quyền truy cập đã có ở middleware
    const boards = await prisma.board.findMany({ where: { workspaceId: id } });
    res.json({ boards });
}

/**
 * Lấy danh sách thành viên của một workspace
 */
async function getWorkspaceMembers(req, res) {
    const { id } = req.params;
    // Logic kiểm tra quyền truy cập đã có ở middleware
    const members = await prisma.workspaceMember.findMany({
        where: { workspaceId: id },
        include: {
            user: { select: { id: true, fullName: true, email: true } },
        },
    });
    res.json({ members });
}

module.exports = {
    createWorkspace,
    listMyWorkspaces,
    getWorkspaceById,
    getWorkspaceBoards,
    getWorkspaceMembers,
};