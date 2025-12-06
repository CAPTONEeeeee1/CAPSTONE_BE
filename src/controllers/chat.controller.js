const { prisma } = require('../shared/prisma');

async function getConversations(req, res) {
    const { workspaceId } = req.params;
    const userId = req.user.id;
    console.log(`[Chat] Attempting to get conversations for workspace: ${workspaceId}, user: ${userId}`);

    try {
        console.log('[Chat] Executing Prisma query to find conversations...');
        const conversations = await prisma.conversation.findMany({
            where: {
                workspaceId,
                participants: {
                    some: {
                        userId,
                    },
                },
            },
            include: {
                participants: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                fullName: true,
                                avatar: true,
                            },
                        },
                    },
                },
                messages: {
                    orderBy: {
                        createdAt: 'desc',
                    },
                    take: 1,
                },
            },
        });
        console.log(`[Chat] Successfully found ${conversations.length} conversations.`);
        res.json({ conversations });
    } catch (error) {
        console.error('Error getting conversations:', error);
        res.status(500).json({ error: 'Failed to get conversations' });
    }
}

async function getMessages(req, res) {
    const { conversationId } = req.params;
    const userId = req.user.id;

    try {
        // Check if user is a participant of the conversation
        const participant = await prisma.conversationParticipant.findFirst({
            where: {
                conversationId,
                userId,
            },
        });

        if (!participant) {
            return res.status(403).json({ error: 'You are not a participant of this conversation.' });
        }

        const messages = await prisma.message.findMany({
            where: {
                conversationId,
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        fullName: true,
                        avatar: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'asc',
            },
        });
        res.json({ messages });
    } catch (error) {
        console.error('Error getting messages:', error);
        res.status(500).json({ error: 'Failed to get messages' });
    }
}

module.exports = {
    getConversations,
    getMessages,
};
