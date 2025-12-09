const { prisma } = require('../shared/prisma');
const fs = require('fs').promises;
const path = require('path');

class ChatService {
  async createWorkspaceChat(workspaceId, workspaceName, ownerId) {
    const chat = await prisma.workspaceChat.create({
      data: {
        workspaceId,
        name: `${workspaceName} - Chat`,
      },
    });

    await this.addChatMember(chat.id, ownerId);
    
    return chat;
  }

  async addChatMember(chatId, userId) {
    return await prisma.chatMember.create({
      data: {
        chatId,
        userId,
      },
    });
  }

  async removeChatMember(chatId, userId) {
    return await prisma.chatMember.delete({
      where: {
        chatId_userId: {
          chatId,
          userId,
        },
      },
    });
  }

  async getChatByWorkspaceId(workspaceId) {
    return await prisma.workspaceChat.findUnique({
      where: { workspaceId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                avatar: true,
              },
            },
          },
        },
      },
    });
  }

  async getChatMessages(chatId, limit = 50, cursor = null) {
    const messages = await prisma.chatMessage.findMany({
      where: {
        chatId,
        deletedAt: null,
      },
      take: limit,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        sender: {
          select: {
            id: true,
            fullName: true,
            email: true,
            avatar: true,
          },
        },
        attachments: true,
        replyTo: {
          include: {
            sender: {
              select: {
                id: true,
                fullName: true,
                avatar: true,
              },
            },
          },
        },
      },
    });

    return messages.reverse();
  }

  async searchMessages(chatId, query, limit = 20) {
    return await prisma.chatMessage.findMany({
      where: {
        chatId,
        deletedAt: null,
        OR: [
          {
            content: {
              contains: query,
              mode: 'insensitive',
            },
          },
          {
            attachments: {
              some: {
                fileName: {
                  contains: query,
                  mode: 'insensitive',
                },
              },
            },
          },
        ],
      },
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
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
  }

  async createMessage(chatId, senderId, data) {
    const { content, messageType, replyToId, attachments } = data;

    const message = await prisma.chatMessage.create({
      data: {
        chatId,
        senderId,
        content,
        messageType: messageType || 'text',
        replyToId,
        attachments: attachments
          ? {
              create: attachments.map((att) => ({
                fileName: att.fileName,
                fileSize: att.fileSize,
                mimeType: att.mimeType,
                fileUrl: att.fileUrl,
                uploadedById: senderId,
              })),
            }
          : undefined,
      },
      include: {
        sender: {
          select: {
            id: true,
            fullName: true,
            email: true,
            avatar: true,
          },
        },
        attachments: true,
        replyTo: {
          include: {
            sender: {
              select: {
                id: true,
                fullName: true,
                avatar: true,
              },
            },
          },
        },
      },
    });

    return message;
  }

  async updateMessage(messageId, userId, content) {
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
    });

    if (!message || message.senderId !== userId) {
      throw new Error('Không có quyền chỉnh sửa tin nhắn này');
    }

    return await prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        content,
        isEdited: true,
      },
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
  }

  async deleteMessage(messageId, userId) {
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
    });

    if (!message || message.senderId !== userId) {
      throw new Error('Không có quyền xóa tin nhắn này');
    }

    return await prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  async updateLastRead(chatId, userId) {
    return await prisma.chatMember.update({
      where: {
        chatId_userId: {
          chatId,
          userId,
        },
      },
      data: {
        lastReadAt: new Date(),
      },
    });
  }

  async getUnreadCount(chatId, userId) {
    const member = await prisma.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId,
          userId,
        },
      },
    });

    if (!member) return 0;

    return await prisma.chatMessage.count({
      where: {
        chatId,
        deletedAt: null,
        createdAt: {
          gt: member.lastReadAt || member.joinedAt,
        },
        senderId: {
          not: userId,
        },
      },
    });
  }

  async getChatAttachments(chatId, mimeTypeFilter = null, limit = 50, cursor = null) {
    const where = {
      message: {
        chatId,
        deletedAt: null,
      },
    };

    if (mimeTypeFilter) {
      where.mimeType = {
        startsWith: mimeTypeFilter,
      };
    }

    return await prisma.chatAttachment.findMany({
      where,
      take: limit,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: {
        uploadedAt: 'desc',
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            fullName: true,
            avatar: true,
          },
        },
        message: {
          select: {
            id: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async deleteAttachment(attachmentId) {
    const attachment = await prisma.chatAttachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment) {
      throw new Error('Không tìm thấy tệp đính kèm');
    }

    const filePath = path.join(process.cwd(), 'uploads', 'chat', path.basename(attachment.fileUrl));
    
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.error('Lỗi khi xóa file:', error);
    }

    return await prisma.chatAttachment.delete({
      where: { id: attachmentId },
    });
  }

  async isChatMember(chatId, userId) {
    const member = await prisma.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId,
          userId,
        },
      },
    });

    return !!member;
  }

  async getChatMembers(chatId) {
    return await prisma.chatMember.findMany({
      where: { chatId },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            avatar: true,
            status: true,
            lastLoginAt: true,
          },
        },
      },
    });
  }
}

module.exports = new ChatService();
