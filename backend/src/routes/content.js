const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Get all content items for user
router.get('/', async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { status, niche, limit = 50, offset = 0 } = req.query;

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    let query = 'SELECT * FROM content_items WHERE user_id = $1';
    const params = [userId];
    let paramIndex = 2;

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (niche) {
      query += ` AND $${paramIndex} = ANY(niche_tags)`;
      params.push(niche);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, params);

    res.json({
      content: result.rows,
      total: result.rows.length,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get content error:', error);
    res.status(500).json({ error: 'Failed to get content' });
  }
});

// Get single content item
router.get('/:id', async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;

  try {
    const result = await db.query(
      'SELECT * FROM content_items WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Content not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get content error:', error);
    res.status(500).json({ error: 'Failed to get content' });
  }
});

// Update content metadata
router.patch('/:id', async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;
  const { niche_tags, content_tags, custom_tags, notes, status, max_uses } = req.body;

  try {
    const updates = [];
    const params = [id, userId];
    let paramIndex = 3;

    if (niche_tags) {
      updates.push(`niche_tags = $${paramIndex}`);
      params.push(niche_tags);
      paramIndex++;
    }

    if (content_tags) {
      updates.push(`content_tags = $${paramIndex}`);
      params.push(content_tags);
      paramIndex++;
    }

    if (custom_tags) {
      updates.push(`custom_tags = $${paramIndex}`);
      params.push(custom_tags);
      paramIndex++;
    }

    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex}`);
      params.push(notes);
      paramIndex++;
    }

    if (status) {
      updates.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (max_uses !== undefined) {
      updates.push(`max_uses = $${paramIndex}`);
      params.push(max_uses);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = NOW()');

    const query = `
      UPDATE content_items
      SET ${updates.join(', ')}
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Content not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update content error:', error);
    res.status(500).json({ error: 'Failed to update content' });
  }
});

// Get content posting history
router.get('/:id/history', async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;

  try {
    const result = await db.query(`
      SELECT pc.*, s.name as subreddit_name, s.display_name as subreddit_display_name
      FROM posted_content pc
      JOIN subreddits s ON pc.subreddit_id = s.id
      WHERE pc.content_item_id = $1 AND pc.user_id = $2
      ORDER BY pc.posted_at DESC
    `, [id, userId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

// Delete content
router.delete('/:id', async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;

  try {
    await db.query(
      'DELETE FROM content_items WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Delete content error:', error);
    res.status(500).json({ error: 'Failed to delete content' });
  }
});

module.exports = router;
