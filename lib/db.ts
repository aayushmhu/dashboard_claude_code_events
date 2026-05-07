import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'claude',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'claude_logs',
  waitForConnections: true,
  connectionLimit: 10,
  timezone: 'Z',
});

export default pool;
