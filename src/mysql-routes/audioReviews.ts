import express from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { pool } from '../mysql-lib/db.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { r2Upload, r2Delete } from '../utils/r2Upload.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Public GET - active only, sorted by displayOrder
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, customerName, audioUrl, duration, displayOrder, isActive, createdAt FROM audio_reviews WHERE isActive = 1 ORDER BY displayOrder ASC, createdAt DESC'
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching audio reviews:', error);
    res.status(500).json({ error: 'Failed to fetch audio reviews' });
  }
});

// Admin GET - all reviews
router.get('/admin', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, customerName, audioUrl, duration, displayOrder, isActive, createdAt FROM audio_reviews ORDER BY displayOrder ASC, createdAt DESC'
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching admin audio reviews:', error);
    res.status(500).json({ error: 'Failed to fetch audio reviews' });
  }
});

// Admin POST - create review with audio upload
router.post('/', authenticateToken, requireAdmin, upload.single('audio'), async (req, res) => {
  try {
    const { customerName, duration, displayOrder, isActive } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: 'Audio file is required' });
    }

    if (!customerName) {
      return res.status(400).json({ error: 'Customer name is required' });
    }

    let audioUrl = '';
    try {
      audioUrl = await r2Upload(req.file.buffer, req.file.originalname, req.file.mimetype);
    } catch (error: any) {
      if (error.message === 'R2_CREDENTIALS_MISSING') {
        return res.status(400).json({ error: 'R2 credentials missing. Please configure them in .env' });
      }
      throw error;
    }

    const id = randomUUID();
    const order = displayOrder ? parseInt(displayOrder, 10) : 0;
    const active = isActive === 'false' || isActive === false || isActive === 0 ? 0 : 1;
    const dur = duration || '0:00';

    await pool.execute(
      'INSERT INTO audio_reviews (id, customerName, audioUrl, duration, displayOrder, isActive) VALUES (?, ?, ?, ?, ?, ?)',
      [id, customerName, audioUrl, dur, order, active]
    );

    res.status(201).json({ success: true, id, audioUrl });
  } catch (error) {
    console.error('Error creating audio review:', error);
    res.status(500).json({ error: 'Failed to create audio review' });
  }
});

// Admin PUT - update review
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { customerName, duration, displayOrder, isActive } = req.body;

    const [existing]: any = await pool.execute('SELECT id FROM audio_reviews WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Review not found' });
    }

    const updates = [];
    const values = [];
    if (customerName !== undefined) { updates.push('customerName = ?'); values.push(customerName); }
    if (duration !== undefined) { updates.push('duration = ?'); values.push(duration); }
    if (displayOrder !== undefined) { updates.push('displayOrder = ?'); values.push(displayOrder); }
    if (isActive !== undefined) { updates.push('isActive = ?'); values.push(isActive ? 1 : 0); }

    if (updates.length > 0) {
      values.push(id);
      await pool.execute(`UPDATE audio_reviews SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating audio review:', error);
    res.status(500).json({ error: 'Failed to update audio review' });
  }
});

// Admin DELETE
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const [existing]: any = await pool.execute('SELECT audioUrl FROM audio_reviews WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Review not found' });
    }

    await pool.execute('DELETE FROM audio_reviews WHERE id = ?', [id]);
    
    // Attempt R2 cleanup (silent fail if no config)
    await r2Delete(existing[0].audioUrl);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting audio review:', error);
    res.status(500).json({ error: 'Failed to delete audio review' });
  }
});

export default router;
