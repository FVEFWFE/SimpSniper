const express = require('express');
const router = express.Router();
const snoowrap = require('snoowrap');
const db = require('../config/database');

// Reddit OAuth: Start flow
router.get('/reddit/connect', (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }

  // Store userId in session/state for callback
  const state = Buffer.from(JSON.stringify({ userId })).toString('base64');

  const authUrl = snoowrap.getAuthUrl({
    clientId: process.env.REDDIT_CLIENT_ID,
    scope: ['identity', 'edit', 'read', 'submit', 'subscribe', 'vote', 'mysubreddits', 'history'],
    redirectUri: process.env.REDDIT_REDIRECT_URI,
    permanent: true,
    state
  });

  res.json({ authUrl });
});

// Reddit OAuth: Callback
router.get('/reddit/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`${process.env.FRONTEND_URL}?error=${error}`);
  }

  if (!code || !state) {
    return res.redirect(`${process.env.FRONTEND_URL}?error=missing_code`);
  }

  try {
    // Decode state to get userId
    const { userId } = JSON.parse(Buffer.from(state, 'base64').toString());

    // Exchange code for tokens
    const reddit = await snoowrap.fromAuthCode({
      code,
      userAgent: process.env.REDDIT_USER_AGENT,
      clientId: process.env.REDDIT_CLIENT_ID,
      clientSecret: process.env.REDDIT_CLIENT_SECRET,
      redirectUri: process.env.REDDIT_REDIRECT_URI
    });

    // Get account info
    const me = await reddit.getMe();
    const accountAge = Math.floor((Date.now() - me.created_utc * 1000) / (1000 * 60 * 60 * 24));

    // Check if account already exists
    const existing = await db.query(
      'SELECT * FROM reddit_accounts WHERE user_id = $1 AND reddit_id = $2',
      [userId, me.id]
    );

    if (existing.rows.length > 0) {
      // Update existing account
      await db.query(`
        UPDATE reddit_accounts
        SET access_token = $1,
            refresh_token = $2,
            post_karma = $3,
            comment_karma = $4,
            account_age_days = $5,
            updated_at = NOW()
        WHERE id = $6
      `, [
        reddit.accessToken,
        reddit.refreshToken,
        me.link_karma,
        me.comment_karma,
        accountAge,
        existing.rows[0].id
      ]);
    } else {
      // Check if this is the first account for user
      const accountCount = await db.query(
        'SELECT COUNT(*) FROM reddit_accounts WHERE user_id = $1',
        [userId]
      );
      const isPrimary = accountCount.rows[0].count === '0';

      // Create new account
      await db.query(`
        INSERT INTO reddit_accounts (
          user_id, reddit_username, reddit_id, access_token, refresh_token,
          post_karma, comment_karma, account_age_days, is_primary
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        userId,
        me.name,
        me.id,
        reddit.accessToken,
        reddit.refreshToken,
        me.link_karma,
        me.comment_karma,
        accountAge,
        isPrimary
      ]);
    }

    res.redirect(`${process.env.FRONTEND_URL}?reddit_connected=true`);
  } catch (error) {
    console.error('Reddit OAuth error:', error);
    res.redirect(`${process.env.FRONTEND_URL}?error=auth_failed`);
  }
});

// Get current user (mock for now - implement proper JWT later)
router.get('/me', async (req, res) => {
  // TODO: Implement proper JWT authentication
  const userId = req.headers['x-user-id'];

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const user = await db.query('SELECT * FROM users WHERE id = $1', [userId]);

    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user.rows[0]);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Create test user (for development)
router.post('/create-test-user', async (req, res) => {
  try {
    const result = await db.query(
      'INSERT INTO users (email) VALUES ($1) RETURNING *',
      ['test@example.com']
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

module.exports = router;
