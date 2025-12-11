const chatService = require('../services/chat.service');
const { verifyAccess } = require('../utils/jwt');

function initializeChatSocket(io) {
  const chatNamespace = io.of('/chat');

  chatNamespace.use(async (socket, next) => {
    try {
      let token = socket.handshake.auth.token || socket.handshake.headers.authorization;

      if (!token) {
        return next(new Error('Thiếu token xác thực'));
      }

      if (token.startsWith('Bearer ')) {
        token = token.slice(7);
      }

      const decoded = verifyAccess(token);
      socket.userId = decoded.sub;
      next();
    } catch (error) {
      console.error('Lỗi xác thực Socket.IO:', error.name, error.message);

      if (error.name === 'TokenExpiredError') {
        return next(new Error('Token đã hết hạn. Vui lòng đăng nhập lại'));
      } else if (error.name === 'JsonWebTokenError') {
        return next(new Error('Token không hợp lệ'));
      } else {
        return next(new Error('Lỗi xác thực'));
      }
    }
  });

  chatNamespace.on('connection', (socket) => {
    console.log(`User ${socket.userId} đã kết nối chat socket`);

    socket.on('join_chat', async (data) => {
      try {
        const { chatId } = data;

        const isMember = await chatService.isChatMember(chatId, socket.userId);
        if (!isMember) {
          socket.emit('error', { message: 'Bạn không có quyền truy cập chat này' });
          return;
        }

        socket.join(`chat:${chatId}`);
        console.log(`User ${socket.userId} đã tham gia chat ${chatId}`);

        const unreadCount = await chatService.getUnreadCount(chatId, socket.userId);
        socket.emit('joined_chat', { chatId, unreadCount });
      } catch (error) {
        console.error('Lỗi join_chat:', error);
        socket.emit('error', { message: 'Không thể tham gia chat' });
      }
    });

    socket.on('leave_chat', (data) => {
      const { chatId } = data;
      socket.leave(`chat:${chatId}`);
      console.log(`User ${socket.userId} đã rời chat ${chatId}`);
    });

    socket.on('send_message', async (data) => {
      try {
        const { chatId, content, messageType, replyToId } = data;

        const isMember = await chatService.isChatMember(chatId, socket.userId);
        if (!isMember) {
          socket.emit('error', { message: 'Bạn không có quyền gửi tin nhắn' });
          return;
        }

        const message = await chatService.createMessage(chatId, socket.userId, {
          content,
          messageType,
          replyToId,
        });

        chatNamespace.to(`chat:${chatId}`).emit('new_message', message);
      } catch (error) {
        console.error('Lỗi send_message:', error);
        socket.emit('error', { message: 'Không thể gửi tin nhắn' });
      }
    });

    socket.on('typing', (data) => {
      const { chatId } = data;
      socket.to(`chat:${chatId}`).emit('user_typing', {
        userId: socket.userId,
        chatId,
      });
    });

    socket.on('stop_typing', (data) => {
      const { chatId } = data;
      socket.to(`chat:${chatId}`).emit('user_stop_typing', {
        userId: socket.userId,
        chatId,
      });
    });

    socket.on('mark_as_read', async (data) => {
      try {
        const { chatId } = data;

        const isMember = await chatService.isChatMember(chatId, socket.userId);
        if (!isMember) {
          return;
        }

        await chatService.updateLastRead(chatId, socket.userId);

        socket.to(`chat:${chatId}`).emit('user_read_messages', {
          userId: socket.userId,
          chatId,
          readAt: new Date(),
        });
      } catch (error) {
        console.error('Lỗi mark_as_read:', error);
      }
    });

    socket.on('disconnect', () => {
      console.log(`User ${socket.userId} đã ngắt kết nối chat socket`);
    });
  });

  return chatNamespace;
}

module.exports = { initializeChatSocket };
