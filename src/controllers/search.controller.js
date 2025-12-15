const { prisma } = require('../shared/prisma');

/**
 * Hàm hỗ trợ kiểm tra quyền truy cập Workspace (Từ Code 2)
 */
async function checkWorkspaceAccess(boardId, userId) {
    const board = await prisma.board.findUnique({ 
        where: { id: boardId },
        select: { workspaceId: true }
    });
    if (!board) return { board: null, workspaceMember: null };

    const workspaceMember = await prisma.workspaceMember.findFirst({ 
        where: { workspaceId: board.workspaceId, userId } 
    });
    
    return { board, workspaceMember };
}


async function searchCards(req, res) {
    try {
        const { boardId, q } = req.query;
        const userId = req.user.id;
        // Giới hạn kết quả mặc định là 20
        const limit = 20;

        // 1. Kiểm tra tham số tìm kiếm
        if (!q || typeof q !== 'string' || q.trim().length < 2) {
            return res.json({ results: [] });
        }
        const searchTerm = q.trim();

        // 2. Tìm kiếm Toàn cục (Global Search) - khi không có boardId
        if (!boardId) {
            const cards = await prisma.card.findMany({
                where: {
                    // Đảm bảo Card thuộc Board mà User có quyền truy cập Workspace
                    board: {
                        workspace: {
                            members: {
                                some: { userId: userId }
                            }
                        }
                    },
                    // Điều kiện tìm kiếm theo tiêu đề Card
                    title: {
                        contains: searchTerm,
                        mode: 'insensitive'
                    }
                },
                select: {
                    id: true,
                    title: true,
                    // Lấy thông tin boardId và workspaceId qua quan hệ lồng nhau
                    board: {
                        select: {
                            id: true,
                            name: true, // Lấy thêm tên Board
                            workspaceId: true,
                        }
                    }
                },
                take: limit,
                orderBy: {
                    updatedAt: 'desc'
                }
            });

            // Định dạng lại kết quả để đáp ứng yêu cầu
            const results = cards.map(card => ({
                id: card.id,
                title: card.title,
                boardId: card.board.id,
                boardName: card.board.name, // Thêm boardName
                workspaceId: card.board.workspaceId,
            }));

            return res.json({ results });
        }

        // 3. Tìm kiếm theo Board cụ thể (Board-Specific Search) - khi có boardId

        // Kiểm tra quyền truy cập Board (User phải là thành viên Workspace chứa Board đó)
        const board = await prisma.board.findFirst({
            where: {
                id: boardId,
                workspace: {
                    members: {
                        some: { userId }
                    }
                }
            },
            select: { workspaceId: true, name: true } // Lấy thêm tên board
        });

        if (!board) {
            return res.status(404).json({ error: "Board not found or access denied" });
        }

        // Thực hiện tìm kiếm Card trong Board đã xác định
        const cards = await prisma.card.findMany({
            where: {
                boardId: boardId,
                title: {
                    contains: searchTerm,
                    mode: 'insensitive'
                }
            },
            take: limit,
            select: {
                id: true,
                title: true,
            },
            orderBy: {
                updatedAt: 'desc'
            }
        });
        
        // Thêm workspaceId và boardName vào kết quả
        const results = cards.map(card => ({
            ...card,
            boardId: boardId,
            workspaceId: board.workspaceId,
            boardName: board.name // Thêm boardName
        }));

        return res.json({ results });

    } catch (err) {
        console.error('searchCards error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}

async function searchWorkspaces(req, res) {
    try {
        const { q, limit: limitRaw } = req.query;
        const userId = req.user.id;

        if (typeof q !== 'string' || q.trim().length === 0) {
            return res.json({ results: [] });
        }

        const limit = Number(limitRaw || 10);
        if (!Number.isFinite(limit) || limit <= 0) limit = 10;
        if (limit > 50) limit = 50;
        
        const searchTerm = q.trim();

        const workspaces = await prisma.workspace.findMany({
            where: {
                name: {
                    contains: searchTerm,
                    mode: 'insensitive',
                },
                members: {
                    some: {
                        userId: userId,
                    },
                },
            },
            take: limit,
            select: {
                id: true,
                name: true,
            },
        });

        return res.json({ results: workspaces });
    } catch (err) {
        console.error('searchWorkspaces error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}

async function searchBoards(req, res) {
    try {
        const { q, limit: limitRaw } = req.query;
        const userId = req.user.id;

        if (typeof q !== 'string' || q.trim().length === 0) {
            return res.json({ results: [] });
        }

        const limit = Number(limitRaw || 10);
        if (!Number.isFinite(limit) || limit <= 0) limit = 10;
        if (limit > 50) limit = 50;
        
        const searchTerm = q.trim();

        const boards = await prisma.board.findMany({
            where: {
                name: {
                    contains: searchTerm,
                    mode: 'insensitive',
                },
                workspace: {
                    members: {
                        some: {
                            userId: userId,
                        },
                    },
                },
            },
            take: limit,
            select: {
                id: true,
                name: true,
                workspaceId: true,
                workspace: { // Lấy thông tin workspace
                    select: {
                        name: true
                    }
                }
            },
        });

        return res.json({ results: boards });
    } catch (err) {
        console.error('searchBoards error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}

module.exports = { searchCards, searchWorkspaces, searchBoards };