const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Get scheduled posts
router.get('/', async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { status, start_date, end_date } = req.query;

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    let query = `
      SELECT sp.*, s.name as subreddit_name, s.display_name as subreddit_display_name,
             ra.reddit_username, ci.filename
      FROM scheduled_posts sp
      LEFT JOIN subreddits s ON sp.subreddit_id = s.id
      LEFT JOIN reddit_accounts ra ON sp.reddit_account_id = ra.id
      LEFT JOIN content_items ci ON sp.content_item_id = ci.id
      WHERE sp.user_id = $1
    `;
    const params = [userId];
    let paramIndex = 2;

    if (status) {
      query += ` AND sp.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (start_date) {
      query += ` AND sp.scheduled_for >= $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      query += ` AND sp.scheduled_for <= $${paramIndex}`;
      params.push(end_date);
      paramIndex++;
    }

    query += ' ORDER BY sp.scheduled_for ASC';

    const result = await db.query(query, params);

    res.json(result.rows);
  } catch (error) {
    console.error('Get scheduled posts error:', error);
    res.status(500).json({ error: 'Failed to get scheduled posts' });
  }
});

// Create scheduled post
router.post('/', async (req, res) => {
  const userId = req.headers['x-user-id'];
  const {
    reddit_account_id,
    subreddit_id,
    content_item_id,
    title,
    scheduled_for,
    flair_id,
    auto_comment
  } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (!reddit_account_id || !subreddit_id || !title || !scheduled_for) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const result = await db.query(`
      INSERT INTO scheduled_posts (
        user_id, reddit_account_id, subreddit_id, content_item_id,
        title, scheduled_for, flair_id, auto_comment
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [userId, reddit_account_id, subreddit_id, content_item_id, title, scheduled_for, flair_id, auto_comment]);

    // TODO: Add to Bull queue

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Create scheduled post error:', error);
    res.status(500).json({ error: 'Failed to create scheduled post' });
  }
});

// Update scheduled post
router.patch('/:id', async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;
  const { title, scheduled_for, flair_id, auto_comment } = req.body;

  try {
    const updates = [];
    const params = [id, userId];
    let paramIndex = 3;

    if (title) {
      updates.push(`title = $${paramIndex}`);
      params.push(title);
      paramIndex++;
    }

    if (scheduled_for) {
      updates.push(`scheduled_for = $${paramIndex}`);
      params.push(scheduled_for);
      paramIndex++;
    }

    if (flair_id !== undefined) {
      updates.push(`flair_id = $${paramIndex}`);
      params.push(flair_id);
      paramIndex++;
    }

    if (auto_comment !== undefined) {
      updates.push(`auto_comment = $${paramIndex}`);
      params.push(auto_comment);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = NOW()');

    const query = `
      UPDATE scheduled_posts
      SET ${updates.join(', ')}
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scheduled post not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update scheduled post error:', error);
    res.status(500).json({ error: 'Failed to update scheduled post' });
  }
});

// Cancel scheduled post
router.delete('/:id', async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;

  try {
    const result = await db.query(`
      UPDATE scheduled_posts
      SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1 AND user_id = $2 AND status = 'scheduled'
      RETURNING *
    `, [id, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scheduled post not found or already processed' });
    }

    // TODO: Remove from Bull queue

    res.json({ success: true });
  } catch (error) {
    console.error('Cancel scheduled post error:', error);
    res.status(500).json({ error: 'Failed to cancel scheduled post' });
  }
});

module.exports = router;
