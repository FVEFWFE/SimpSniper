const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Get all subreddits with optional filters
router.get('/', async (req, res) => {
  const {
    niche,
    minSubscribers,
    maxKarma,
    maxAge,
    requiresVerification,
    search,
    limit = 100,
    offset = 0
  } = req.query;

  try {
    let query = 'SELECT * FROM subreddits WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    // Filter by niche tags
    if (niche) {
      query += ` AND $${paramIndex} = ANY(niche_tags)`;
      params.push(niche);
      paramIndex++;
    }

    // Filter by subscribers
    if (minSubscribers) {
      query += ` AND subscribers >= $${paramIndex}`;
      params.push(parseInt(minSubscribers));
      paramIndex++;
    }

    // Filter by karma requirement
    if (maxKarma) {
      query += ` AND (min_karma IS NULL OR min_karma <= $${paramIndex})`;
      params.push(parseInt(maxKarma));
      paramIndex++;
    }

    // Filter by account age requirement
    if (maxAge) {
      query += ` AND (min_account_age_days IS NULL OR min_account_age_days <= $${paramIndex})`;
      params.push(parseInt(maxAge));
      paramIndex++;
    }

    // Filter by verification requirement
    if (requiresVerification !== undefined) {
      query += ` AND requires_verification = $${paramIndex}`;
      params.push(requiresVerification === 'true');
      paramIndex++;
    }

    // Search by name
    if (search) {
      query += ` AND name ILIKE $${paramIndex}`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY engagement_score DESC NULLS LAST, subscribers DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM subreddits WHERE 1=1';
    const countParams = params.slice(0, -2); // Remove limit and offset
    if (niche) countQuery += ` AND $1 = ANY(niche_tags)`;
    if (minSubscribers) countQuery += ` AND subscribers >= $${niche ? 2 : 1}`;
    // ... (add other filters)

    const countResult = await db.query(countQuery.replace(/\$\d+/g, (match, i) => {
      const index = parseInt(match.slice(1));
      return `$${index}`;
    }), countParams);

    res.json({
      subreddits: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get subreddits error:', error);
    res.status(500).json({ error: 'Failed to get subreddits' });
  }
});

// Get single subreddit
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query('SELECT * FROM subreddits WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Subreddit not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get subreddit error:', error);
    res.status(500).json({ error: 'Failed to get subreddit' });
  }
});

// Search subreddits
router.get('/search', async (req, res) => {
  const { q, limit = 20 } = req.query;

  if (!q) {
    return res.status(400).json({ error: 'Search query required' });
  }

  try {
    const result = await db.query(`
      SELECT * FROM subreddits
      WHERE name ILIKE $1 OR display_name ILIKE $1
      ORDER BY subscribers DESC
      LIMIT $2
    `, [`%${q}%`, parseInt(limit)]);

    res.json(result.rows);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Find similar subreddits
router.get('/:id/similar', async (req, res) => {
  const { id } = req.params;
  const { limit = 10 } = req.query;

  try {
    // Get the reference subreddit
    const subResult = await db.query('SELECT * FROM subreddits WHERE id = $1', [id]);

    if (subResult.rows.length === 0) {
      return res.status(404).json({ error: 'Subreddit not found' });
    }

    const subreddit = subResult.rows[0];

    // Find similar based on niche tags and cluster
    const result = await db.query(`
      SELECT *,
        (
          SELECT COUNT(*)
          FROM unnest(niche_tags) tag
          WHERE tag = ANY($1::text[])
        ) as tag_matches
      FROM subreddits
      WHERE id != $2
        AND (
          cluster_id = $3
          OR niche_tags && $1::text[]
        )
      ORDER BY tag_matches DESC, engagement_score DESC NULLS LAST
      LIMIT $4
    `, [subreddit.niche_tags || [], id, subreddit.cluster_id, parseInt(limit)]);

    res.json(result.rows);
  } catch (error) {
    console.error('Find similar error:', error);
    res.status(500).json({ error: 'Failed to find similar subreddits' });
  }
});

// Track subreddit (add to user's list)
router.post('/:id/track', async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;
  const { reddit_account_id, notes } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const result = await db.query(`
      INSERT INTO user_subreddits (user_id, subreddit_id, reddit_account_id, notes)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, subreddit_id, reddit_account_id) DO UPDATE
      SET notes = $4, updated_at = NOW()
      RETURNING *
    `, [userId, id, reddit_account_id, notes]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Track subreddit error:', error);
    res.status(500).json({ error: 'Failed to track subreddit' });
  }
});

// Untrack subreddit
router.delete('/:id/track', async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;
  const { reddit_account_id } = req.query;

  try {
    await db.query(
      'DELETE FROM user_subreddits WHERE user_id = $1 AND subreddit_id = $2 AND reddit_account_id = $3',
      [userId, id, reddit_account_id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Untrack subreddit error:', error);
    res.status(500).json({ error: 'Failed to untrack subreddit' });
  }
});

// Get tracked subreddits for user
router.get('/tracked', async (req, res) => {
  const userId = req.headers['x-user-id'];

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const result = await db.query(`
      SELECT s.*, us.is_verified, us.notes, us.priority
      FROM user_subreddits us
      JOIN subreddits s ON us.subreddit_id = s.id
      WHERE us.user_id = $1
      ORDER BY us.priority DESC, s.engagement_score DESC NULLS LAST
    `, [userId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Get tracked error:', error);
    res.status(500).json({ error: 'Failed to get tracked subreddits' });
  }
});

module.exports = router;
