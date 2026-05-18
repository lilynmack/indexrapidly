// server.js - Render Compatible Version
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

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Render's PostgreSQL
  }
});

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

    // Insert default packages if not exist
    const packagesCount = await client.query('SELECT COUNT(*) FROM credit_packages');
    if (parseInt(packagesCount.rows[0].count) === 0) {
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
    }
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  } finally {
    client.release();
  }
}

// Initialize database on startup
initializeDatabase();

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

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
// Add this right after "app.use(express.static(...))" and before API routes

// Homepage route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Dashboard route
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Catch-all for SPA (if needed)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Homepage route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Dashboard route
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Catch-all for SPA (if needed)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Homepage route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Dashboard route
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Catch-all for SPA (if needed)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Homepage route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Dashboard route
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Catch-all for SPA (if needed)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Homepage route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Dashboard route
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Catch-all for SPA (if needed)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
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
    
    // Check if user exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'User already exists' });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    
    // Generate API key
    const api_key = 'ir_' + require('crypto').randomBytes(32).toString('hex');
    
    // Insert user
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash, api_key, credits_balance) VALUES ($1, $2, $3, $4, 0) RETURNING id',
      [username, email, password_hash, api_key]
    );
    
    const userId = result.rows[0].id;
    
    // Generate JWT
    const token = jwt.sign(
      { id: userId, username, email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.status(201).json({
      message: 'Registration successful',
      token,
      user: {
        id: userId,
        username,
        email,
        credits_balance: 0,
        api_key
      }
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
    
    // Find user
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    
    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate JWT
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
    
    // Get package details
    const packageResult = await pool.query(
      'SELECT * FROM credit_packages WHERE id = $1 AND is_active = true',
      [package_id]
    );
    
    if (packageResult.rows.length === 0) {
      return res.status(404).json({ error: 'Package not found' });
    }
    
    const packageData = packageResult.rows[0];
    
    // Determine amount based on crypto type
    const amount = crypto_type === 'BTC' ? packageData.price_btc : 
                   crypto_type === 'ETH' ? packageData.price_eth : packageData.price_usdt;
    
    // Insert payment confirmation
    await pool.query(
      'INSERT INTO payment_confirmations (user_id, transaction_hash, crypto_type, amount) VALUES ($1, $2, $3, $4)',
      [userId, transaction_hash, crypto_type, amount]
    );
    
    // Create transaction record
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
    
    // Check user credits
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
    
    // Deduct credits
    await client.query(
      'UPDATE users SET credits_balance = credits_balance - $1 WHERE id = $2',
      [requiredCredits, userId]
    );
    
    const submissionResults = [];
    
    if (schedule_type === 'instant') {
      // Process immediately through RocketIndexer
      const rocketResponse = await axios.post(
        `https://rocketindexer.com/api/index.php?token=${process.env.ROCKETINDEXER_TOKEN}&endpoint=submit`,
        { urls },
        { timeout: 30000 }
      );
      
      const rocketData = rocketResponse.data;
      
      // Insert submissions with tracking IDs
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
      // Schedule for later
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

// Get payment addresses
app.get('/api/payment-addresses', (req, res) => {
  res.json({
    BTC: process.env.CRYPTO_WALLET_BTC,
    ETH: process.env.CRYPTO_WALLET_ETH,
    USDT: process.env.CRYPTO_WALLET_USDT
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
    
    // Group by user
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
      
      // Respect rate limits
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
  } catch (error) {
    console.error('Scheduled URL processor error:', error);
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
  console.log(`IndexRapidly server running on port ${PORT}`);
});
