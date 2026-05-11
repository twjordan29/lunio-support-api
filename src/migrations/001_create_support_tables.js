async function up(pool) {
  // Create support_conversations table
  await pool.execute(`
    CREATE TABLE support_conversations (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      company_id BIGINT UNSIGNED NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      subject VARCHAR(255) NULL,
      status ENUM('open','pending','resolved','closed') NOT NULL DEFAULT 'open',
      priority ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
      assigned_admin_id BIGINT UNSIGNED NULL,
      last_message_at DATETIME NULL,
      resolved_at DATETIME NULL,
      closed_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_support_conversations_user_id (user_id),
      INDEX idx_support_conversations_company_id (company_id),
      INDEX idx_support_conversations_status (status),
      INDEX idx_support_conversations_last_message_at (last_message_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Create support_messages table
  await pool.execute(`
    CREATE TABLE support_messages (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      conversation_id BIGINT UNSIGNED NOT NULL,
      sender_type ENUM('user','admin','support','system') NOT NULL,
      sender_id BIGINT UNSIGNED NULL,
      body TEXT NOT NULL,
      is_internal TINYINT(1) NOT NULL DEFAULT 0,
      read_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_support_messages_conversation_id (conversation_id),
      INDEX idx_support_messages_sender (sender_type, sender_id),
      INDEX idx_support_messages_created_at (created_at),
      FOREIGN KEY (conversation_id) REFERENCES support_conversations(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

module.exports = { up };