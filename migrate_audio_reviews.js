const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'tecnosphere_alvora',
  });

  const sql = `
    CREATE TABLE IF NOT EXISTS audio_reviews (
      id VARCHAR(36) PRIMARY KEY,
      customerName VARCHAR(255) NOT NULL,
      audioUrl VARCHAR(1000) NOT NULL,
      duration VARCHAR(10) NOT NULL DEFAULT '0:00',
      displayOrder INT DEFAULT 0,
      isActive TINYINT(1) DEFAULT 1,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await pool.execute(sql);
    console.log('audio_reviews table created successfully');
    
    const [rows] = await pool.execute('SHOW TABLES');
    console.log('Tables:', rows);
    
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();
