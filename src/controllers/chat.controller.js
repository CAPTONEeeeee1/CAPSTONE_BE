const chatService = require('../services/chat.service');
const { prisma } = require('../shared/prisma');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const uploadDir = path.join(process.cwd(), 'uploads', 'chat');

fs.mkdir(uploadDir, { recursive: true }).catch(console.error);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    cb(null, `${basename}-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'application/zip',
    'application/x-rar-compressed',
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Định dạng file không được hỗ trợ'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

class ChatController {
  async getChatByWorkspace(req, res) {
    try {
      const { workspaceId } = req.params;

      const chat = await chatService.getChatByWorkspaceId(workspaceId);

      if (!chat) {
        return res.status(404).json({ message: 'Không tìm thấy chat room' });
      }

      const isMember = await chatService.isChatMember(chat.id, req.user.id);
      if (!isMember) {
        return res.status(403).json({ message: 'Bạn không có quyền truy cập chat này' });
      }

      const unreadCount = await chatService.getUnreadCount(chat.id, req.user.id);

      res.json({
        ...chat,
        unreadCount,
      });
    } catch (error) {
      console.error('Lỗi getChatByWorkspace:', error);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }

  async getMessages(req, res) {
    try {
      const { chatId } = req.params;
      const { limit = 50, cursor } = req.query;

      const isMember = await chatService.isChatMember(chatId, req.user.id);
      if (!isMember) {
        return res.status(403).json({ message: 'Bạn không có quyền truy cập chat này' });
      }

      const messages = await chatService.getChatMessages(
        chatId,
        parseInt(limit),
        cursor
      );

      res.json({
        messages,
        hasMore: messages.length === parseInt(limit),
        nextCursor: messages.length > 0 ? messages[messages.length - 1].id : null,
      });
    } catch (error) {
      console.error('Lỗi getMessages:', error);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }

  async searchMessages(req, res) {
    try {
      const { chatId } = req.params;
      const { q, limit = 20 } = req.query;

      if (!q) {
        return res.status(400).json({ message: 'Thiếu từ khóa tìm kiếm' });
      }

      const isMember = await chatService.isChatMember(chatId, req.user.id);
      if (!isMember) {
        return res.status(403).json({ message: 'Bạn không có quyền truy cập chat này' });
      }

      const messages = await chatService.searchMessages(chatId, q, parseInt(limit));

      res.json({ messages });
    } catch (error) {
      console.error('Lỗi searchMessages:', error);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }

  async sendMessage(req, res) {
    try {
      const { chatId } = req.params;
      const { content, messageType, replyToId } = req.body;

      const isMember = await chatService.isChatMember(chatId, req.user.id);
      if (!isMember) {
        return res.status(403).json({ message: 'Bạn không có quyền gửi tin nhắn' });
      }

      const message = await chatService.createMessage(chatId, req.user.id, {
        content,
        messageType,
        replyToId,
      });

      // Emit qua chat namespace thay vì main io instance
      const chatNamespace = req.app.get('chatNamespace');
      if (chatNamespace) {
        console.log(`[Chat] Emitting new_message to chat:${chatId}`, message.id);
        chatNamespace.to(`chat:${chatId}`).emit('new_message', message);
      } else {
        console.error('[Chat] chatNamespace not found!');
      }

      res.status(201).json(message);
    } catch (error) {
      console.error('Lỗi sendMessage:', error);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }

  async uploadAttachment(req, res) {
    try {
      const { chatId } = req.params;
      const { messageId, replyToId, content } = req.body;

      const isMember = await chatService.isChatMember(chatId, req.user.id);
      if (!isMember) {
        return res.status(403).json({ message: 'Bạn không có quyền upload file' });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: 'Không có file nào được upload' });
      }

      const attachments = req.files.map((file) => ({
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        fileUrl: `/uploads/chat/${file.filename}`,
      }));

      let message;
      if (messageId) {
        const existingMessage = await prisma.chatMessage.findUnique({
          where: { id: messageId },
        });

        if (!existingMessage || existingMessage.senderId !== req.user.id) {
          return res.status(403).json({ message: 'Không có quyền thêm tệp vào tin nhắn này' });
        }

        await prisma.chatAttachment.createMany({
          data: attachments.map((att) => ({
            ...att,
            messageId,
            uploadedById: req.user.id,
          })),
        });

        message = await prisma.chatMessage.findUnique({
          where: { id: messageId },
          include: {
            sender: {
              select: {
                id: true,
                fullName: true,
                avatar: true,
              },
            },
            attachments: true,
          },
        });
      } else {
        const messageType = attachments[0].mimeType.startsWith('image/') ? 'image' : 'file';

        message = await chatService.createMessage(chatId, req.user.id, {
          content: content || null,
          messageType,
          replyToId,
          attachments,
        });
      }

      // Emit qua chat namespace thay vì main io instance
      const chatNamespace = req.app.get('chatNamespace');
      if (chatNamespace) {
        console.log(`[Chat] Emitting new_message (upload) to chat:${chatId}`, message.id);
        chatNamespace.to(`chat:${chatId}`).emit('new_message', message);
      } else {
        console.error('[Chat] chatNamespace not found!');
      }

      res.status(201).json(message);
    } catch (error) {
      console.error('Lỗi uploadAttachment:', error);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }

  async updateMessage(req, res) {
    try {
      const { messageId } = req.params;
      const { content } = req.body;

      if (!content || content.trim() === '') {
        return res.status(400).json({ message: 'Nội dung tin nhắn không được để trống' });
      }

      const message = await chatService.updateMessage(messageId, req.user.id, content);

      // Emit qua chat namespace
      const chatNamespace = req.app.get('chatNamespace');
      if (chatNamespace) {
        const chatId = message.chatId;
        console.log(`[Chat] Emitting message_updated to chat:${chatId}`, messageId);
        chatNamespace.to(`chat:${chatId}`).emit('message_updated', message);
      }

      res.json(message);
    } catch (error) {
      console.error('Lỗi updateMessage:', error);
      if (error.message.includes('quyền')) {
        return res.status(403).json({ message: error.message });
      }
      res.status(500).json({ message: 'Lỗi server' });
    }
  }

  async deleteMessage(req, res) {
    try {
      const { messageId } = req.params;

      const message = await chatService.deleteMessage(messageId, req.user.id);

      // Emit qua chat namespace
      const chatNamespace = req.app.get('chatNamespace');
      if (chatNamespace) {
        const chatId = message.chatId;
        console.log(`[Chat] Emitting message_deleted to chat:${chatId}`, messageId);
        chatNamespace.to(`chat:${chatId}`).emit('message_deleted', { messageId });
      }

      res.json({ message: 'Đã xóa tin nhắn' });
    } catch (error) {
      console.error('Lỗi deleteMessage:', error);
      if (error.message.includes('quyền')) {
        return res.status(403).json({ message: error.message });
      }
      res.status(500).json({ message: 'Lỗi server' });
    }
  }

  async markAsRead(req, res) {
    try {
      const { chatId } = req.params;

      const isMember = await chatService.isChatMember(chatId, req.user.id);
      if (!isMember) {
        return res.status(403).json({ message: 'Bạn không có quyền truy cập chat này' });
      }

      await chatService.updateLastRead(chatId, req.user.id);

      res.json({ message: 'Đã đánh dấu đã đọc' });
    } catch (error) {
      console.error('Lỗi markAsRead:', error);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }

  async getAttachments(req, res) {
    try {
      const { chatId } = req.params;
      const { type, limit = 50, cursor } = req.query;

      const isMember = await chatService.isChatMember(chatId, req.user.id);
      if (!isMember) {
        return res.status(403).json({ message: 'Bạn không có quyền truy cập chat này' });
      }

      const mimeTypeFilter = type === 'images' ? 'image/' : type === 'files' ? null : null;

      const attachments = await chatService.getChatAttachments(
        chatId,
        mimeTypeFilter,
        parseInt(limit),
        cursor
      );

      res.json({
        attachments,
        hasMore: attachments.length === parseInt(limit),
        nextCursor: attachments.length > 0 ? attachments[attachments.length - 1].id : null,
      });
    } catch (error) {
      console.error('Lỗi getAttachments:', error);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }

  async getMembers(req, res) {
    try {
      const { chatId } = req.params;

      const isMember = await chatService.isChatMember(chatId, req.user.id);
      if (!isMember) {
        return res.status(403).json({ message: 'Bạn không có quyền truy cập chat này' });
      }

      const members = await chatService.getChatMembers(chatId);

      res.json({ members });
    } catch (error) {
      console.error('Lỗi getMembers:', error);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }
}

const chatController = new ChatController();

module.exports = {
  chatController,
  upload,
};
