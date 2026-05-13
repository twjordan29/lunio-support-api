async function up(pool) {
  await pool.execute(`
    ALTER TABLE support_conversation_participants
    MODIFY COLUMN participant_type ENUM('user','guest','staff','admin','support') NOT NULL
  `);

  await pool.execute(`
    ALTER TABLE support_messages
    MODIFY COLUMN sender_type ENUM('user','guest','staff','admin','support','system') NOT NULL
  `);
}

module.exports = { up };
