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
        const {
            boardId,
            q,
            labelId,
            memberId,
            listId,
            dueBefore,
            dueAfter,
            limit: limitRaw,
        } = req.query;

        if (!boardId) return res.status(400).json({ error: 'boardId required' });

        // Kiểm tra quyền truy cập Workspace (Áp dụng logic Code 2)
        const { board, workspaceMember } = await checkWorkspaceAccess(String(boardId), req.user.id);
        if (!board) return res.status(404).json({ error: 'Board not found' });
        if (!workspaceMember) return res.status(403).json({ error: 'Not a workspace member' });

        // Khởi tạo các mệnh đề WHERE và tham số
        const whereClauses = ['c."boardId" = $1'];
        const params = [String(boardId)];
        let p = 2; // Bắt đầu từ tham số thứ 2 ($2)

        if (typeof q === 'string' && q.trim().length > 0) {
            whereClauses.push(
                `(c."title" ILIKE '%' || $${p} || '%' OR c."description" ILIKE '%' || $${p} || '%')`
            );
            params.push(q.trim());
            p++;
        }

        if (listId) {
            whereClauses.push(`c."listId" = $${p}`);
            params.push(String(listId));
            p++;
        }

        if (labelId) {
            whereClauses.push(
                // Kiểm tra sự tồn tại trong bảng liên kết CardLabel
                `EXISTS (SELECT 1 FROM "CardLabel" cl WHERE cl."cardId" = c."id" AND cl."labelId" = $${p})`
            );
            params.push(String(labelId));
            p++;
        }

        if (memberId) {
            whereClauses.push(
                // Kiểm tra sự tồn tại trong bảng liên kết CardMember
                `EXISTS (SELECT 1 FROM "CardMember" cm WHERE cm."cardId" = c."id" AND cm."userId" = $${p})`
            );
            params.push(String(memberId));
            p++;
        }

        // Lọc ngày đến hạn
        if (dueAfter) {
            whereClauses.push(`c."dueDate" IS NOT NULL AND c."dueDate" >= $${p}`);
            params.push(new Date(dueAfter));
            p++;
        }

        if (dueBefore) {
            whereClauses.push(`c."dueDate" IS NOT NULL AND c."dueDate" <= $${p}`);
            params.push(new Date(dueBefore));
            p++;
        }

        // Xử lý LIMIT
        let limit = Number(limitRaw || 100);
        if (!Number.isFinite(limit) || limit <= 0) limit = 100;
        if (limit > 200) limit = 200;

        // Xây dựng truy vấn SQL
        const sql = `
            SELECT
                c."id",
                c."title",
                c."description",
                c."listId",
                c."orderIdx",
                c."keySeq",
                NULL::float AS rank
            FROM "Card" c
            WHERE ${whereClauses.join(' AND ')}
            ORDER BY c."updatedAt" DESC
            LIMIT ${limit};
        `;

        // Thực thi truy vấn
        const rows = await prisma.$queryRawUnsafe(sql, ...params);
        return res.json({ results: rows });
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
            },
        });

        return res.json({ results: boards });
    } catch (err) {
        console.error('searchBoards error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}

module.exports = { searchCards, searchWorkspaces, searchBoards };