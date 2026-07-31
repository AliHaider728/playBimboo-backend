import { Router, Request, Response } from 'express';
import Settings from '../models/Settings.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = Router();

// GET Settings (Public)
router.get('/', async (req: Request, res: Response) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings({});
      await settings.save();
    }
    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT Update Settings (Admin)
router.put('/', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings(req.body);
    } else {
      Object.assign(settings, req.body);
    }
    await settings.save();
    res.json(settings);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
