async function up(pool) {
  // Create support_guest_sessions table
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS support_guest_sessions (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      session_uuid VARCHAR(36) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      INDEX idx_session_uuid (session_uuid),
      INDEX idx_expires_at (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Alter support_conversations to add source and guest_session_id
  await pool.execute(`
    ALTER TABLE support_conversations
    ADD COLUMN IF NOT EXISTS source ENUM('guest','authenticated') NOT NULL DEFAULT 'authenticated' AFTER status,
    ADD COLUMN IF NOT EXISTS guest_session_id BIGINT UNSIGNED NULL AFTER source,
    MODIFY COLUMN user_id BIGINT UNSIGNED NULL,
    ADD INDEX IF NOT EXISTS idx_guest_session_id (guest_session_id),
    ADD CONSTRAINT fk_guest_session_id FOREIGN KEY (guest_session_id) REFERENCES support_guest_sessions(id) ON DELETE SET NULL
  `);

  // Alter support_messages sender_type
  await pool.execute(`
    ALTER TABLE support_messages
    MODIFY COLUMN sender_type ENUM('guest','user','staff','system') NOT NULL
  `);

  // Alter support_conversation_participants
  await pool.execute(`
    ALTER TABLE support_conversation_participants
    MODIFY COLUMN participant_type ENUM('guest','user','staff') NOT NULL,
    MODIFY COLUMN participant_id BIGINT UNSIGNED NULL,
    ADD COLUMN IF NOT EXISTS last_read_at DATETIME NULL AFTER last_read_message_id
  `);

  // Optionally, update existing data if needed, but keep it safe
}

module.exports = { up };