const ConversationRepository = require('../repositories/conversationRepository');
const logger = require('../utils/logger');

const STAFF_ROLES = new Set(['admin', 'support', 'staff']);

class ConversationService {
  constructor() {
    this.repository = new ConversationRepository();
  }

  isStaffRole(role) {
    return STAFF_ROLES.has(String(role || '').toLowerCase());
  }

  async getConversations(userId, role, filters = {}, page = 1, limit = 25) {
    logger.info('conversations_list_started', { user_id: userId, role, page, limit, filters: Object.keys(filters) });
    const conversations = await this.repository.getConversations(userId, role, filters, page, limit);
    const total = await this.repository.getConversationCount(userId, role, filters);

    return {
      conversations,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getMessages(conversationId, userId, role, page = 1, limit = 50) {
    const conversation = await this.repository.getConversationById(conversationId);
    if (!conversation) throw new Error('Access denied');

    if (!this.isStaffRole(role) && conversation.user_id !== userId) {
      throw new Error('Access denied');
    }

    const messages = await this.repository.getMessages(conversationId, page, limit);
    const total = await this.repository.getMessageCount(conversationId);

    return {
      messages,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async markRead(conversationId, userId, role) {
    const conversation = await this.repository.getConversationById(conversationId);
    if (!conversation) throw new Error('Access denied');
    if (!this.isStaffRole(role) && conversation.user_id !== userId) throw new Error('Access denied');

    const result = await this.repository.markConversationRead(conversationId, role, userId);
    return {
      conversation_id: conversationId,
      last_read_message_id: result.lastMessageId,
      last_read_at: result.lastReadAt,
    };
  }

  async claimConversation(conversationId, userId, role) {
    return this.repository.claimConversation(conversationId, userId, role);
  }

  async releaseConversation(conversationId, userId, role) {
    return this.repository.releaseConversation(conversationId, userId, role);
  }

  async assignConversation(conversationId, assignedAdminId, userId, role) {
    return this.repository.assignConversation(conversationId, assignedAdminId, userId, role);
  }

  async updateStatus(conversationId, status, userId, role) {
    return this.repository.updateConversationStatus(conversationId, status, userId, role);
  }

  async sendMessage(conversationId, userId, role, body) {
    const conversation = await this.repository.getConversationById(conversationId);
    if (!conversation) throw new Error('Access denied');

    if (this.isStaffRole(role)) {
      if (!this.repository.canStaffModify(conversation, userId, role)) {
        throw new Error('Access denied');
      }
    } else if (conversation.user_id !== userId) {
      throw new Error('Access denied');
    }

    const senderType = this.isStaffRole(role) ? 'staff' : 'user';
    return this.repository.createMessage(conversationId, senderType, userId, body);
  }

  async getConversationSummary(conversationId, userId, role) {
    return this.repository.getConversationSummary(conversationId, userId, role);
  }
}

module.exports = ConversationService;
