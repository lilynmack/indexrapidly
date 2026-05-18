// server.js - Complete IndexRapidly Server for Render
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
const PORT = process.env.PORT || 10000;

// Validate DATABASE_URL
if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set!');
  process.exit(1);
}

console.log('Database URL:', process.env.DATABASE_URL.substring(0, 30) + '...');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Database pool error:', err);
});

// Initialize database
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

    // Insert default packages
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
    
    console.log('✅ Database initialized');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdn.tailwindcss.com", "cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "cdn.tailwindcss.com", "cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "cdnjs.cloudflare.com"],
    },
  },
}));
app.use(cors());
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Force HTTPS for custom domain
app.use((req, res, next) => {
  if (req.headers['x-forwarded-proto'] !== 'https' && process.env.NODE_ENV === 'production') {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 1000,
  max: 1,
  message: { error: 'Rate limit exceeded. Please wait before making another request.' }
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});

app.use('/api/', apiLimiter);
app.use(generalLimiter);

// Serve static files from public folder
app.use(express.static(path.join(__dirname, 'public'), {
  index: 'index.html',
  extensions: ['html']
}));

// Main routes for HTML pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/index.html', (req, res) => {
  res.redirect('/');
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// ==================== API ROUTES ====================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    domain: req.hostname
  });
});

// User registration
app.post('/api/auth/register', [
  body('username').trim().isLength({ min: 3, max: 30 }).escape(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { username, email, password } = req.body;
    
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'User already exists' });
    }
    
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    const api_key = 'ir_' + require('crypto').randomBytes(32).toString('hex');
    
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash, api_key, credits_balance) VALUES ($1, $2, $3, $4, 0) RETURNING id',
      [username, email, password_hash, api_key]
    );
    
    const userId = result.rows[0].id;
    
    const token = jwt.sign(
      { id: userId, username, email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.status(201).json({
      message: 'Registration successful',
      token,
      user: { id: userId, username, email, credits_balance: 0, api_key }
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User login
app.post('/api/auth/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { email, password } = req.body;
    
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        credits_balance: user.credits_balance,
        api_key: user.api_key
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user profile
app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, credits_balance, api_key, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get credit packages
app.get('/api/packages', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM credit_packages WHERE is_active = true');
    res.json(result.rows);
  } catch (error) {
    console.error('Packages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Submit payment confirmation
app.post('/api/payment/confirm', authenticateToken, [
  body('transaction_hash').trim().notEmpty().escape(),
  body('crypto_type').isIn(['BTC', 'ETH', 'USDT']),
  body('package_id').isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { transaction_hash, crypto_type, package_id } = req.body;
    const userId = req.user.id;
    
    const packageResult = await pool.query(
      'SELECT * FROM credit_packages WHERE id = $1 AND is_active = true',
      [package_id]
    );
    
    if (packageResult.rows.length === 0) {
      return res.status(404).json({ error: 'Package not found' });
    }
    
    const packageData = packageResult.rows[0];
    
    const amount = crypto_type === 'BTC' ? packageData.price_btc : 
                   crypto_type === 'ETH' ? packageData.price_eth : packageData.price_usdt;
    
    await pool.query(
      'INSERT INTO payment_confirmations (user_id, transaction_hash, crypto_type, amount) VALUES ($1, $2, $3, $4)',
      [userId, transaction_hash, crypto_type, amount]
    );
    
    await pool.query(
      'INSERT INTO transactions (user_id, package_id, credits_purchased, amount_paid, crypto_type, transaction_hash, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [userId, package_id, packageData.credits, packageData.price_usd, crypto_type, transaction_hash, 'pending_verification']
    );
    
    res.json({
      message: 'Payment confirmation submitted successfully. Credits will be added after verification.',
      credits_pending: packageData.credits
    });
    
  } catch (error) {
    console.error('Payment confirmation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Submit URLs for indexing
app.post('/api/submit-urls', authenticateToken, [
  body('urls').isArray().withMessage('URLs must be an array'),
  body('urls.*').isURL().withMessage('Each item must be a valid URL'),
  body('schedule_type').isIn(['instant', 'scheduled']),
  body('scheduled_time').optional().isISO8601()
], async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { urls, schedule_type, scheduled_time } = req.body;
    const userId = req.user.id;
    
    const userResult = await client.query(
      'SELECT credits_balance FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userCredits = userResult.rows[0].credits_balance;
    const requiredCredits = urls.length;
    
    if (userCredits < requiredCredits) {
      await client.query('ROLLBACK');
      return res.status(402).json({ 
        error: 'Insufficient credits', 
        required: requiredCredits, 
        available: userCredits 
      });
    }
    
    await client.query(
      'UPDATE users SET credits_balance = credits_balance - $1 WHERE id = $2',
      [requiredCredits, userId]
    );
    
    const submissionResults = [];
    
    if (schedule_type === 'instant') {
      const rocketResponse = await axios.post(
        `https://rocketindexer.com/api/index.php?token=${process.env.ROCKETINDEXER_TOKEN}&endpoint=submit`,
        { urls },
        { timeout: 30000 }
      );
      
      const rocketData = rocketResponse.data;
      
      for (let i = 0; i < urls.length; i++) {
        const trackingId = rocketData.tracking_ids ? rocketData.tracking_ids[i] : null;
        await client.query(
          'INSERT INTO url_submissions (user_id, url, tracking_id, status, schedule_type, credits_used, rocketindexer_response) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [userId, urls[i], trackingId, 'submitted', 'instant', 1, JSON.stringify(rocketData)]
        );
        
        submissionResults.push({
          url: urls[i],
          tracking_id: trackingId,
          status: 'submitted'
        });
      }
      
      await client.query('COMMIT');
      
      res.json({
        message: 'URLs submitted successfully',
        credits_remaining: userCredits - requiredCredits,
        submissions: submissionResults,
        rocketindexer_response: rocketData
      });
      
    } else {
      const scheduledDate = new Date(scheduled_time);
      
      for (const url of urls) {
        await client.query(
          'INSERT INTO url_submissions (user_id, url, status, schedule_type, scheduled_time, credits_used) VALUES ($1, $2, $3, $4, $5, $6)',
          [userId, url, 'scheduled', 'scheduled', scheduledDate, 1]
        );
        
        submissionResults.push({
          url,
          status: 'scheduled',
          scheduled_for: scheduledDate.toISOString()
        });
      }
      
      await client.query('COMMIT');
      
      res.json({
        message: 'URLs scheduled successfully',
        credits_remaining: userCredits - requiredCredits,
        submissions: submissionResults,
        scheduled_for: scheduledDate.toISOString()
      });
    }
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Submit URLs error:', error);
    
    if (error.response) {
      res.status(error.response.status).json({
        error: 'RocketIndexer API error',
        details: error.response.data
      });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  } finally {
    client.release();
  }
});

// Get user submissions history
app.get('/api/submissions', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    
    const submissionsResult = await pool.query(
      'SELECT * FROM url_submissions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [req.user.id, limit, offset]
    );
    
    const totalResult = await pool.query(
      'SELECT COUNT(*) FROM url_submissions WHERE user_id = $1',
      [req.user.id]
    );
    
    const total = parseInt(totalResult.rows[0].count);
    
    res.json({
      submissions: submissionsResult.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Submissions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check submission statuses
app.post('/api/submissions/check-status', authenticateToken, [
  body('submission_ids').isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { submission_ids } = req.body;
    
    const submissionsResult = await pool.query(
      `SELECT id, tracking_id FROM url_submissions WHERE id = ANY($1) AND user_id = $2`,
      [submission_ids, req.user.id]
    );
    
    const submissions = submissionsResult.rows;
    const trackingIds = submissions
      .filter(s => s.tracking_id)
      .map(s => s.tracking_id)
      .join(',');
    
    if (!trackingIds) {
      return res.json({ message: 'No tracking IDs available', submissions: [] });
    }
    
    const rocketResponse = await axios.get(
      `https://rocketindexer.com/api/index.php?token=${process.env.ROCKETINDEXER_TOKEN}&endpoint=status&ids=${trackingIds}`,
      { timeout: 15000 }
    );
    
    if (rocketResponse.data && rocketResponse.data.statuses) {
      for (const [trackingId, status] of Object.entries(rocketResponse.data.statuses)) {
        const submission = submissions.find(s => s.tracking_id === trackingId);
        if (submission) {
          await pool.query(
            'UPDATE url_submissions SET status = $1, updated_at = NOW() WHERE id = $2',
            [status, submission.id]
          );
        }
      }
    }
    
    res.json(rocketResponse.data);
    
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get payment addresses
app.get('/api/payment-addresses', (req, res) => {
  res.json({
    BTC: process.env.CRYPTO_WALLET_BTC || 'bc1qdefaultaddress',
    ETH: process.env.CRYPTO_WALLET_ETH || '0xdefaultaddress',
    USDT: process.env.CRYPTO_WALLET_USDT || '0xdefaultaddress'
  });
});

// Background worker: Process scheduled URLs
cron.schedule('* * * * *', async () => {
  console.log('Running scheduled URL processor...');
  
  try {
    const scheduledResult = await pool.query(`
      SELECT us.*, u.api_key FROM url_submissions us
      JOIN users u ON us.user_id = u.id
      WHERE us.schedule_type = 'scheduled' 
      AND us.status = 'scheduled'
      AND us.scheduled_time <= NOW()
      LIMIT 100
    `);
    
    const scheduledUrls = scheduledResult.rows;
    
    if (scheduledUrls.length === 0) return;
    
    const userGroups = {};
    for (const submission of scheduledUrls) {
      if (!userGroups[submission.user_id]) {
        userGroups[submission.user_id] = [];
      }
      userGroups[submission.user_id].push(submission);
    }
    
    for (const [userId, submissions] of Object.entries(userGroups)) {
      const urls = submissions.map(s => s.url);
      
      try {
        const rocketResponse = await axios.post(
          `https://rocketindexer.com/api/index.php?token=${process.env.ROCKETINDEXER_TOKEN}&endpoint=submit`,
          { urls },
          { timeout: 30000 }
        );
        
        const rocketData = rocketResponse.data;
        
        for (let i = 0; i < submissions.length; i++) {
          const trackingId = rocketData.tracking_ids ? rocketData.tracking_ids[i] : null;
          await pool.query(
            'UPDATE url_submissions SET status = $1, tracking_id = $2, rocketindexer_response = $3, updated_at = NOW() WHERE id = $4',
            ['submitted', trackingId, JSON.stringify(rocketData), submissions[i].id]
          );
        }
        
        console.log(`Processed ${submissions.length} scheduled URLs for user ${userId}`);
        
      } catch (error) {
        console.error(`Failed to process scheduled URLs for user ${userId}:`, error.message);
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
  } catch (error) {
    console.error('Scheduled URL processor error:', error);
  }
});

// Status update cron job
cron.schedule('*/30 * * * *', async () => {
  console.log('Running status update check...');
  
  try {
    const activeResult = await pool.query(`
      SELECT id, tracking_id FROM url_submissions 
      WHERE status IN ('submitted', 'in_progress')
      AND tracking_id IS NOT NULL
      AND updated_at <= NOW() - INTERVAL '1 hour'
      LIMIT 50
    `);
    
    const activeSubmissions = activeResult.rows;
    
    if (activeSubmissions.length === 0) return;
    
    const batches = [];
    for (let i = 0; i < activeSubmissions.length; i += 50) {
      batches.push(activeSubmissions.slice(i, i + 50));
    }
    
    for (const batch of batches) {
      const trackingIds = batch.map(s => s.tracking_id).join(',');
      
      try {
        const rocketResponse = await axios.get(
          `https://rocketindexer.com/api/index.php?token=${process.env.ROCKETINDEXER_TOKEN}&endpoint=status&ids=${trackingIds}`,
          { timeout: 15000 }
        );
        
        if (rocketResponse.data && rocketResponse.data.statuses) {
          for (const submission of batch) {
            const status = rocketResponse.data.statuses[submission.tracking_id];
            if (status) {
              await pool.query(
                'UPDATE url_submissions SET status = $1, updated_at = NOW() WHERE id = $2',
                [status, submission.id]
              );
            }
          }
        }
        
      } catch (error) {
        console.error('Status update batch error:', error.message);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
  } catch (error) {
    console.error('Status update cron error:', error);
  }
});

// 404 handler
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
async function start() {
  try {
    const client = await pool.connect();
    console.log('✅ Database connected');
    client.release();
    
    await initializeDatabase();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ IndexRapidly running on port ${PORT}`);
      console.log(`📁 Static files: ${path.join(__dirname, 'public')}`);
    });
  } catch (error) {
    console.error('❌ Startup failed:', error.message);
    process.exit(1);
  }
}

start();
