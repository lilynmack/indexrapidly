// Replace your server.js with this complete version
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const xss = require('xss');
const axios = require('axios');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// Validate DATABASE_URL exists
if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is not set!');
  console.error('Please set it in Render dashboard under Environment variables');
  process.exit(1);
}

console.log('Connecting to database...');
console.log('Database URL format:', process.env.DATABASE_URL.substring(0, 20) + '...');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 3,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Database pool error:', err);
});

// Test database connection first
async function startServer() {
  try {
    // Test connection
    const client = await pool.connect();
    console.log('✅ Database connected successfully!');
    client.release();

    // Initialize tables
    await initializeDatabase();

    // Start Express
    app.listen(PORT, () => {
      console.log(`✅ IndexRapidly server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to connect to database:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

// Initialize database tables
async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(30) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        credits_balance INTEGER DEFAULT 0,
        api_key TEXT UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS credit_packages (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        credits INTEGER NOT NULL,
        price_usd DECIMAL(10,2) NOT NULL,
        price_btc DECIMAL(10,8),
        price_eth DECIMAL(10,8),
        price_usdt DECIMAL(10,2),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        package_id INTEGER REFERENCES credit_packages(id),
        credits_purchased INTEGER NOT NULL,
        amount_paid DECIMAL(10,2) NOT NULL,
        crypto_type VARCHAR(10) NOT NULL,
        transaction_hash TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS url_submissions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        url TEXT NOT NULL,
        tracking_id TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        schedule_type VARCHAR(20) DEFAULT 'instant',
        scheduled_time TIMESTAMP,
        credits_used INTEGER DEFAULT 1,
        rocketindexer_response TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS payment_confirmations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        transaction_hash TEXT NOT NULL,
        crypto_type VARCHAR(10) NOT NULL,
        amount DECIMAL(10,8) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        admin_verified BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert default packages if empty
    const { rows } = await client.query('SELECT COUNT(*) as count FROM credit_packages');
    if (parseInt(rows[0].count) === 0) {
      const packages = [
        ['Starter', 100, 9.99, 0.00025, 0.004, 10],
        ['Professional', 500, 39.99, 0.001, 0.016, 40],
        ['Business', 1000, 69.99, 0.00175, 0.028, 70],
        ['Enterprise', 5000, 299.99, 0.0075, 0.12, 300],
        ['Custom', 10000, 499.99, 0.0125, 0.2, 500]
      ];

      for (const pack of packages) {
        await client.query(
          'INSERT INTO credit_packages (name, credits, price_usd, price_btc, price_eth, price_usdt) VALUES ($1, $2, $3, $4, $5, $6)',
          pack
        );
      }
      console.log('✅ Default packages inserted');
    }
    
    console.log('✅ Database tables ready');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  } finally {
    client.release();
  }
}

// ... [rest of your API routes from the previous server.js remain the same] ...
// I'm not repeating all routes here to save space, but keep them all!

// Make sure to end with:
startServer().catch(console.error);
