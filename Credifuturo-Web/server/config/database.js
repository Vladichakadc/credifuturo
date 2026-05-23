const { Sequelize } = require('sequelize');
const path = require('path');

// DATABASE_PATH env var allows overriding (Railway volume: /data/database.sqlite)
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', '..', 'database.sqlite');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: dbPath, // Absolute path: C:\Credifuturo\database.sqlite
  logging: false, // Disable logging for cleaner output
  dialectOptions: {
    // Enable foreign keys in SQLite
    foreignKeys: true
  }
});

module.exports = sequelize;
