-- Migration 001: Create database and user
-- Run as MySQL root user: mysql -u root -p < migrations/001_create_database.sql

CREATE DATABASE IF NOT EXISTS claude_logs
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Create application user (change password as needed)
CREATE USER IF NOT EXISTS 'claude'@'localhost' IDENTIFIED BY 'Password#3';
GRANT ALL PRIVILEGES ON claude_logs.* TO 'claude'@'localhost';
FLUSH PRIVILEGES;
