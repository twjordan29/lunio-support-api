async function up(pool) {
  // Add guest support fields to support_conversations
  await pool.execute(`
    ALTER TABLE support_conversations
    ADD COLUMN conversation_type ENUM('user','guest') NOT NULL DEFAULT 'user' AFTER status,
    ADD COLUMN guest_name VARCHAR(255) NULL AFTER conversation_type,
    ADD COLUMN guest_email VARCHAR(255) NULL AFTER guest_name,
    ADD COLUMN guest_session_id VARCHAR(255) NULL AFTER guest_email,
    ADD COLUMN source_url VARCHAR(500) NULL AFTER guest_session_id
  `);

  // Add index for guest_session_id
  await pool.execute(`
    ALTER TABLE support_conversations
    ADD INDEX idx_guest_session_id (guest_session_id)
  `);
}

module.exports = { up };