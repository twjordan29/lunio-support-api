const fs = require('fs');
const path = require('path');
const pool = require('../config/database');
const logger = require('./logger');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const MIGRATION_TABLE = 'support_api_migrations';

async function ensureMigrationTable() {
  const query = `
    CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      migration VARCHAR(255) NOT NULL UNIQUE,
      executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;
  await pool.execute(query);
}

async function getAppliedMigrations() {
  const [rows] = await pool.execute(`SELECT migration FROM ${MIGRATION_TABLE} ORDER BY id`);
  return rows.map(row => row.migration);
}

function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.js'))
    .sort();
}

async function runMigration(migrationFile) {
  const migrationPath = path.join(MIGRATIONS_DIR, migrationFile);
  const migration = require(migrationPath);

  if (typeof migration.up !== 'function') {
    throw new Error(`Migration ${migrationFile} does not export an 'up' function`);
  }

  logger.info(`Running migration: ${migrationFile}`);
  await migration.up(pool);
  await pool.execute(`INSERT INTO ${MIGRATION_TABLE} (migration) VALUES (?)`, [migrationFile]);
  logger.info(`Migration completed: ${migrationFile}`);
}

async function migrate() {
  await ensureMigrationTable();
  const applied = await getAppliedMigrations();
  const files = getMigrationFiles();

  const pending = files.filter(file => !applied.includes(file));

  if (pending.length === 0) {
    logger.info('No pending migrations');
    return;
  }

  logger.info(`Running ${pending.length} pending migrations`);
  for (const file of pending) {
    await runMigration(file);
  }
  logger.info('All migrations completed');
}

async function status() {
  await ensureMigrationTable();
  const applied = await getAppliedMigrations();
  const files = getMigrationFiles();

  console.log('Migration Status:');
  console.log('================');

  for (const file of files) {
    const status = applied.includes(file) ? '✓ Applied' : '○ Pending';
    console.log(`${status}: ${file}`);
  }

  if (files.length === 0) {
    console.log('No migration files found');
  }
}

async function run(command) {
  try {
    if (command === 'migrate') {
      await migrate();
    } else if (command === 'status') {
      await status();
    } else {
      console.log('Usage: node src/utils/migrate.js <migrate|status>');
      process.exit(1);
    }
  } catch (error) {
    logger.error('Migration error', { error: error.message });
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  const command = process.argv[2];
  run(command);
}

module.exports = { migrate, status };