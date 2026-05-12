async function up(pool) {
  await pool.execute(`
    ALTER TABLE support_conversations
    MODIFY COLUMN status ENUM('open','completed','closed') NOT NULL DEFAULT 'open'
  `);

  await pool.execute(`
    ALTER TABLE support_conversations
    ADD COLUMN IF NOT EXISTS assigned_admin_id BIGINT UNSIGNED NULL,
    ADD COLUMN IF NOT EXISTS last_message_at DATETIME NULL
  `);

  await pool.execute(`
    ALTER TABLE support_conversations
    ADD INDEX IF NOT EXISTS idx_support_conversations_status_v070 (status),
    ADD INDEX IF NOT EXISTS idx_support_conversations_assigned_admin_id_v070 (assigned_admin_id),
    ADD INDEX IF NOT EXISTS idx_support_conversations_updated_at_v070 (updated_at),
    ADD INDEX IF NOT EXISTS idx_support_conversations_last_message_at_v070 (last_message_at)
  `);

  await pool.execute(`
    UPDATE support_conversations sc
    SET last_message_at = (
      SELECT MAX(sm.created_at)
      FROM support_messages sm
      WHERE sm.conversation_id = sc.id
    )
    WHERE sc.last_message_at IS NULL
  `);
}

module.exports = { up };
