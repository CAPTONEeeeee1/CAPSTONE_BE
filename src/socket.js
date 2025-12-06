const { prisma } = require('./shared/prisma');

function initializeSocket(io) {
    io.on('connection', (socket) => {
        console.log('A user connected:', socket.id);

        socket.on('joinWorkspace', (workspaceId) => {
            socket.join(workspaceId);
            console.log(`User ${socket.id} joined workspace ${workspaceId}`);
        });

        socket.on('leaveWorkspace', (workspaceId) => {
            socket.leave(workspaceId);
            console.log(`User ${socket.id} left workspace ${workspaceId}`);
        });

        socket.on('sendMessage', async ({ workspaceId, conversationId, senderId, content }) => {
            try {
                const message = await prisma.message.create({
                    data: {
                        conversationId,
                        senderId,
                        content,
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
                });

                io.to(workspaceId).emit('newMessage', message);
            } catch (error) {
                console.error('Error sending message:', error);
                // Optionally emit an error event to the sender
                socket.emit('sendMessageError', { error: 'Failed to send message' });
            }
        });

        socket.on('disconnect', () => {
            console.log('User disconnected:', socket.id);
        });
    });
}

module.exports = initializeSocket;
