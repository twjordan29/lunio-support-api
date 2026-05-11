const ConversationRepository = require('../repositories/conversationRepository');

class ConversationService {
  constructor() {
    this.repository = new ConversationRepository();
  }

  async getConversations(userId, role, page = 1, limit = 25) {
    const conversations = await this.repository.getConversations(userId, role, page, limit);
    const total = await this.repository.getConversationCount(userId, role);
    return {
      conversations,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  async getMessages(conversationId, userId, role, page = 1, limit = 25) {
    // Check access
    if (role === 'user') {
      const conv = await this.repository.getConversationById(conversationId);
      if (!conv || conv.user_id !== userId) {
        throw new Error('Access denied');
      }
    }

    const messages = await this.repository.getMessages(conversationId, page, limit);
    const total = await this.repository.getMessageCount(conversationId);

    // Filter internal messages for users
    const filteredMessages = role === 'user' ? messages.filter(m => !m.is_internal) : messages;

    return {
      messages: filteredMessages,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  async markRead(conversationId, userId, role) {
    // Check access
    if (role === 'user') {
      const conv = await this.repository.getConversationById(conversationId);
      if (!conv || conv.user_id !== userId) {
        throw new Error('Access denied');
      }
    }

    const participantType = role === 'user' ? 'user' : role;
    const result = await this.repository.markConversationRead(conversationId, participantType, userId);
    const unreadCount = await this.repository.getUnreadCount(userId, role);

    return {
      conversation_id: conversationId,
      last_read_message_id: result.lastMessageId,
      last_read_at: result.lastReadAt,
      unread_count: unreadCount
    };
  }

  async updateStatus(conversationId, status, userId, role) {
    const updated = await this.repository.updateConversationStatus(conversationId, status, role);
    return updated;
  }

  async updateAssignment(conversationId, assignedAdminId, userId, role) {
    const updated = await this.repository.updateConversationAssignment(conversationId, assignedAdminId, role);
    return updated;
  }

  async sendMessage(conversationId, senderType, senderId, body, userId, role) {
    // For new conversation
    let convId = conversationId;
    if (!convId) {
      if (role !== 'user') {
        throw new Error('conversation_id required for non-users');
      }
      // Create new conversation (this would be called from socket, but for completeness)
      convId = await this.repository.createConversation(userId, null, null); // Assume no subject for now
    }

    const messageId = await this.repository.createMessage(convId, senderType, senderId, body);
    await this.repository.updateConversationLastMessage(convId);

    return { messageId, conversationId: convId };
  }
}

module.exports = ConversationService;