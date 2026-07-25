-- Local development database initialization
-- Runs automatically when the MySQL container starts for the first time

CREATE DATABASE IF NOT EXISTS tasktracker_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON tasktracker_dev.* TO 'tasktracker'@'%';
FLUSH PRIVILEGES;
