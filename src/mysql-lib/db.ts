import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';




dotenv.config();

const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Create a connection pool instead of a single connection for the web server
export const pool = mysql.createPool(MYSQL_CONFIG);

export default pool;
