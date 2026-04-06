require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');

async function seedDatabase() {
  const client = await pool.connect();
  try {
    // Hash the admin password
    const adminHash = await bcrypt.hash('admin123', 10);

    // Read and modify seed SQL with real hash
    let seedSQL = fs.readFileSync(
      path.join(__dirname, 'seed.sql'),
      'utf8'
    );
    seedSQL = seedSQL.replace('$2a$10$dummy_hash_replace_on_init', adminHash);

    console.log('Seeding database...');
    await client.query(seedSQL);
    console.log('Database seeded successfully with sample data.');
  } catch (err) {
    console.error('Error seeding database:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seedDatabase();
