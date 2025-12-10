const { prisma } = require('./shared/prisma');

function initializeSocket(io) {
    io.on('connection', (socket) => {
        console.log('A user connected:', socket.id);







        socket.on('disconnect', () => {
            console.log('User disconnected:', socket.id);
        });
    });
}

module.exports = initializeSocket;
