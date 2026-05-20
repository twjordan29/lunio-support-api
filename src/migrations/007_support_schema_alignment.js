async function up(pool) {
  await pool.execute(`
    ALTER TABLE support_conversations
    MODIFY COLUMN status ENUM('open','pending','completed','closed') NOT NULL DEFAULT 'open'
  `);

  await pool.execute(`
    ALTER TABLE support_conversations
    ADD COLUMN IF NOT EXISTS visitor_name VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS visitor_email VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS page_url TEXT NULL
  `);

  await pool.execute(`
    UPDATE support_conversations sc
    LEFT JOIN support_guest_sessions sgs ON sgs.id = sc.guest_session_id
    SET sc.visitor_name = COALESCE(sc.visitor_name, sgs.name),
        sc.visitor_email = COALESCE(sc.visitor_email, sgs.email)
    WHERE sc.source = 'guest'
  `);
}

module.exports = { up };
