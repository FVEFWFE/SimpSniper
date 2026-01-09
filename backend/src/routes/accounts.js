const express = require('express');
const router = express.Router();
const db = require('../config/database');
const snoowrap = require('snoowrap');

// Get all Reddit accounts for user
router.get('/', async (req, res) => {
  const userId = req.headers['x-user-id'];

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const result = await db.query(
      'SELECT * FROM reddit_accounts WHERE user_id = $1 ORDER BY is_primary DESC, created_at ASC',
      [userId]
    );

    // Don't send tokens to client
    const accounts = result.rows.map(acc => ({
      ...acc,
      access_token: undefined,
      refresh_token: undefined
    }));

    res.json(accounts);
  } catch (error) {
    console.error('Get accounts error:', error);
    res.status(500).json({ error: 'Failed to get accounts' });
  }
});

// Get single account
router.get('/:id', async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;

  try {
    const result = await db.query(
      'SELECT * FROM reddit_accounts WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const account = result.rows[0];
    delete account.access_token;
    delete account.refresh_token;

    res.json(account);
  } catch (error) {
    console.error('Get account error:', error);
    res.status(500).json({ error: 'Failed to get account' });
  }
});

// Delete account
router.delete('/:id', async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;

  try {
    const result = await db.query(
      'DELETE FROM reddit_accounts WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// Check account health (shadowban, karma)
router.post('/:id/check-health', async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;

  try {
    // Get account with tokens
    const result = await db.query(
      'SELECT * FROM reddit_accounts WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const account = result.rows[0];

    // Create Reddit client
    const reddit = new snoowrap({
      userAgent: process.env.REDDIT_USER_AGENT,
      clientId: process.env.REDDIT_CLIENT_ID,
      clientSecret: process.env.REDDIT_CLIENT_SECRET,
      accessToken: account.access_token,
      refreshToken: account.refresh_token
    });

    // Get updated account info
    const me = await reddit.getMe();

    // Basic shadowban check: try to fetch profile without auth
    let isShadowbanned = false;
    try {
      const response = await fetch(`https://www.reddit.com/user/${me.name}/about.json`, {
        headers: { 'User-Agent': process.env.REDDIT_USER_AGENT }
      });
      const data = await response.json();
      // If profile doesn't exist publicly, likely shadowbanned
      isShadowbanned = !data.data || data.data.is_suspended;
    } catch (err) {
      isShadowbanned = true;
    }

    // Update database
    await db.query(`
      UPDATE reddit_accounts
      SET post_karma = $1,
          comment_karma = $2,
          is_shadowbanned = $3,
          shadowban_checked_at = NOW(),
          updated_at = NOW()
      WHERE id = $4
    `, [me.link_karma, me.comment_karma, isShadowbanned, id]);

    res.json({
      reddit_username: me.name,
      post_karma: me.link_karma,
      comment_karma: me.comment_karma,
      total_karma: me.link_karma + me.comment_karma,
      is_shadowbanned: isShadowbanned,
      checked_at: new Date()
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ error: 'Failed to check account health' });
  }
});

// Get account stats
router.get('/:id/stats', async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;

  try {
    // Get account
    const accountResult = await db.query(
      'SELECT * FROM reddit_accounts WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (accountResult.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Get posting stats
    const statsResult = await db.query(`
      SELECT
        COUNT(*) as total_posts,
        SUM(upvotes) as total_upvotes,
        SUM(comments_count) as total_comments,
        AVG(upvotes) as avg_upvotes,
        MAX(upvotes) as max_upvotes
      FROM posted_content
      WHERE reddit_account_id = $1
    `, [id]);

    // Get posts per day for last 7 days
    const recentResult = await db.query(`
      SELECT DATE(posted_at) as date, COUNT(*) as count
      FROM posted_content
      WHERE reddit_account_id = $1
        AND posted_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(posted_at)
      ORDER BY date DESC
    `, [id]);

    res.json({
      account: {
        ...accountResult.rows[0],
        access_token: undefined,
        refresh_token: undefined
      },
      stats: statsResult.rows[0],
      recent_activity: recentResult.rows
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

module.exports = router;
