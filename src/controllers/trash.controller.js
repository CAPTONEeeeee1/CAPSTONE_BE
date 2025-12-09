const { prisma } = require('../shared/prisma');

/**
 * Get trashed boards in workspace (archived within 15 days)
 */
async function getTrashedBoards(req, res) {
    const { workspaceId } = req.params;

    try {
        const member = await prisma.workspaceMember.findFirst({
            where: { workspaceId, userId: req.user.id }
        });

        if (!member) {
            return res.status(403).json({ error: 'Not a workspace member' });
        }

        // Only owner and admin can view trash
        if (!['owner', 'admin'].includes(member.role)) {
            return res.status(403).json({ error: 'Only workspace owner and admin can view trash' });
        }

        const fifteenDaysAgo = new Date();
        fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

        const trashedBoards = await prisma.board.findMany({
            where: {
                workspaceId,
                archivedAt: {
                    not: null,
                    gte: fifteenDaysAgo
                }
            },
            include: {
                createdBy: {
                    select: { id: true, email: true, fullName: true }
                },
                _count: {
                    select: { lists: true, cards: true }
                }
            },
            orderBy: { archivedAt: 'desc' }
        });

        return res.json({ boards: trashedBoards });
    } catch (error) {
        console.error('Error fetching trashed boards:', error);
        return res.status(500).json({ error: 'Failed to fetch trashed boards' });
    }
}

/**
 * Restore board from trash
 */
async function restoreBoard(req, res) {
    const { boardId } = req.params;

    try {
        const board = await prisma.board.findUnique({
            where: { id: boardId }
        });

        if (!board) {
            return res.status(404).json({ error: 'Board not found' });
        }

        const member = await prisma.workspaceMember.findFirst({
            where: { workspaceId: board.workspaceId, userId: req.user.id }
        });

        if (!member) {
            return res.status(403).json({ error: 'Not a workspace member' });
        }

        if (!['owner', 'admin'].includes(member.role)) {
            return res.status(403).json({ error: 'Only workspace owner and admin can restore boards' });
        }

        if (!board.archivedAt) {
            return res.status(400).json({ error: 'Board is not in trash' });
        }

        const restoredBoard = await prisma.board.update({
            where: { id: boardId },
            data: { archivedAt: null }
        });

        return res.json({
            message: 'Board restored successfully',
            board: restoredBoard
        });
    } catch (error) {
        console.error('Error restoring board:', error);
        return res.status(500).json({ error: 'Failed to restore board' });
    }
}

/**
 * Permanently delete board
 */
async function permanentlyDeleteBoard(req, res) {
    const { boardId } = req.params;

    try {
        const board = await prisma.board.findUnique({
            where: { id: boardId }
        });

        if (!board) {
            return res.status(404).json({ error: 'Board not found' });
        }

        const member = await prisma.workspaceMember.findFirst({
            where: { workspaceId: board.workspaceId, userId: req.user.id }
        });

        if (!member) {
            return res.status(403).json({ error: 'Not a workspace member' });
        }

        if (!['owner', 'admin'].includes(member.role)) {
            return res.status(403).json({ error: 'Only workspace owner and admin can permanently delete boards' });
        }

        await prisma.board.delete({
            where: { id: boardId }
        });

        return res.json({ message: 'Board permanently deleted' });
    } catch (error) {
        console.error('Error permanently deleting board:', error);
        return res.status(500).json({ error: 'Failed to permanently delete board' });
    }
}

/**
 * Get all trashed cards in workspace (archived within 15 days)
 */
async function getTrashedCardsInWorkspace(req, res) {
    const { workspaceId } = req.params;

    try {
        const member = await prisma.workspaceMember.findFirst({
            where: { workspaceId, userId: req.user.id }
        });

        if (!member) {
            return res.status(403).json({ error: 'Not a workspace member' });
        }

        const fifteenDaysAgo = new Date();
        fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

        // Get all boards in workspace
        const boards = await prisma.board.findMany({
            where: { workspaceId },
            select: { id: true }
        });

        const boardIds = boards.map(b => b.id);

        const trashedCards = await prisma.card.findMany({
            where: {
                boardId: { in: boardIds },
                archivedAt: {
                    not: null,
                    gte: fifteenDaysAgo
                }
            },
            include: {
                board: {
                    select: { id: true, name: true }
                },
                list: {
                    select: { id: true, name: true }
                },
                createdBy: {
                    select: { id: true, email: true, fullName: true }
                },
                members: {
                    include: {
                        user: {
                            select: { id: true, email: true, fullName: true }
                        }
                    }
                }
            },
            orderBy: { archivedAt: 'desc' }
        });

        return res.json({ cards: trashedCards });
    } catch (error) {
        console.error('Error fetching trashed cards in workspace:', error);
        return res.status(500).json({ error: 'Failed to fetch trashed cards' });
    }
}

/**
 * Get trashed cards in board (archived within 15 days)
 */
async function getTrashedCards(req, res) {
    const { boardId } = req.params;

    try {
        const board = await prisma.board.findUnique({
            where: { id: boardId }
        });

        if (!board) {
            return res.status(404).json({ error: 'Board not found' });
        }

        const member = await prisma.workspaceMember.findFirst({
            where: { workspaceId: board.workspaceId, userId: req.user.id }
        });

        if (!member) {
            return res.status(403).json({ error: 'Not a workspace member' });
        }

        const fifteenDaysAgo = new Date();
        fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

        const trashedCards = await prisma.card.findMany({
            where: {
                boardId,
                archivedAt: {
                    not: null,
                    gte: fifteenDaysAgo
                }
            },
            include: {
                list: {
                    select: { id: true, name: true }
                },
                createdBy: {
                    select: { id: true, email: true, fullName: true }
                },
                members: {
                    include: {
                        user: {
                            select: { id: true, email: true, fullName: true }
                        }
                    }
                }
            },
            orderBy: { archivedAt: 'desc' }
        });

        return res.json({ cards: trashedCards });
    } catch (error) {
        console.error('Error fetching trashed cards:', error);
        return res.status(500).json({ error: 'Failed to fetch trashed cards' });
    }
}

/**
 * Restore card from trash
 */
async function restoreCard(req, res) {
    const { cardId } = req.params;

    try {
        const card = await prisma.card.findUnique({
            where: { id: cardId },
            include: { board: true }
        });

        if (!card) {
            return res.status(404).json({ error: 'Card not found' });
        }

        const member = await prisma.workspaceMember.findFirst({
            where: { workspaceId: card.board.workspaceId, userId: req.user.id }
        });

        if (!member) {
            return res.status(403).json({ error: 'Not a workspace member' });
        }

        if (!card.archivedAt) {
            return res.status(400).json({ error: 'Card is not in trash' });
        }

        const restoredCard = await prisma.card.update({
            where: { id: cardId },
            data: { archivedAt: null }
        });

        return res.json({
            message: 'Card restored successfully',
            card: restoredCard
        });
    } catch (error) {
        console.error('Error restoring card:', error);
        return res.status(500).json({ error: 'Failed to restore card' });
    }
}

/**
 * Permanently delete card
 */
async function permanentlyDeleteCard(req, res) {
    const { cardId } = req.params;

    try {
        const card = await prisma.card.findUnique({
            where: { id: cardId },
            include: { board: true }
        });

        if (!card) {
            return res.status(404).json({ error: 'Card not found' });
        }

        const member = await prisma.workspaceMember.findFirst({
            where: { workspaceId: card.board.workspaceId, userId: req.user.id }
        });

        if (!member) {
            return res.status(403).json({ error: 'Not a workspace member' });
        }

        if (!['owner', 'admin', 'member'].includes(member.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        await prisma.card.delete({
            where: { id: cardId }
        });

        return res.json({ message: 'Card permanently deleted' });
    } catch (error) {
        console.error('Error permanently deleting card:', error);
        return res.status(500).json({ error: 'Failed to permanently delete card' });
    }
}

/**
 * Auto-cleanup: Delete boards and cards older than 15 days
 */
async function cleanupOldTrash(req, res) {
    try {
        const fifteenDaysAgo = new Date();
        fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

        const [deletedBoards, deletedCards] = await prisma.$transaction([
            prisma.board.deleteMany({
                where: {
                    archivedAt: {
                        not: null,
                        lt: fifteenDaysAgo
                    }
                }
            }),
            prisma.card.deleteMany({
                where: {
                    archivedAt: {
                        not: null,
                        lt: fifteenDaysAgo
                    }
                }
            })
        ]);

        return res.json({
            message: 'Cleanup completed',
            deletedBoards: deletedBoards.count,
            deletedCards: deletedCards.count
        });
    } catch (error) {
        console.error('Error cleaning up old trash:', error);
        return res.status(500).json({ error: 'Failed to cleanup old trash' });
    }
}

module.exports = {
    getTrashedBoards,
    restoreBoard,
    permanentlyDeleteBoard,
    getTrashedCardsInWorkspace,
    getTrashedCards,
    restoreCard,
    permanentlyDeleteCard,
    cleanupOldTrash
};
