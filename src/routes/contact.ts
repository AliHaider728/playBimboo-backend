import { Router, Request, Response } from 'express';
import Contact from '../models/Contact.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { sendContactConfirmationEmail } from '../utils/mailer.js';

const router = Router();

// POST /api/contact
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    const newContact = new Contact({ name, email, subject, message });
    await newContact.save();
    
    // Send confirmation email
    try {
      await sendContactConfirmationEmail(email, name);
    } catch (emailErr) {
      console.error('Failed to send contact confirmation email:', emailErr);
      // We still return 201 because the contact was saved
    }

    res.status(201).json({ message: 'Message sent successfully', contact: newContact });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/contact (Admin only)
router.get('/', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const contacts = await Contact.find().sort({ createdAt: -1 });
    res.json(contacts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/contact/:id/status (Admin only)
router.put('/:id/status', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    if (!['New', 'Read', 'Resolved'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const contact = await Contact.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!contact) {
      return res.status(404).json({ error: 'Contact message not found' });
    }
    res.json(contact);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
