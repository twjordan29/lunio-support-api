async function up(pool) {
  // Create support_conversation_participants table
  await pool.execute(`
    CREATE TABLE support_conversation_participants (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      conversation_id BIGINT UNSIGNED NOT NULL,
      participant_type ENUM('user','admin','support') NOT NULL,
      participant_id BIGINT UNSIGNED NOT NULL,
      last_read_message_id BIGINT UNSIGNED NULL,
      last_read_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_participants_conversation_id (conversation_id),
      INDEX idx_participants_type_id (participant_type, participant_id),
      UNIQUE KEY unique_participant (conversation_id, participant_type, participant_id),
      FOREIGN KEY (conversation_id) REFERENCES support_conversations(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

module.exports = { up };