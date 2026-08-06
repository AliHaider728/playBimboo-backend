import { Router, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import GlobalAttribute from '../models/GlobalAttribute.js';
import Product from '../models/Product.js';
import { authenticateToken, requireSuperAdmin } from '../middleware/auth.js';

const router = Router();

// GET all global attributes
router.get('/', async (req, res) => {
  try {
    const attributes = await GlobalAttribute.find({ isArchived: false }).sort({ createdAt: 1 });
    res.json(attributes);
  } catch (error) {
    console.error('Error fetching global attributes:', error);
    res.status(500).json({ error: 'Failed to fetch global attributes' });
  }
});

// GET a single global attribute by ID
router.get('/:id', async (req, res) => {
  try {
    const attribute = await GlobalAttribute.findOne({ id: req.params.id, isArchived: false });
    if (!attribute) return res.status(404).json({ error: 'Attribute not found' });
    res.json(attribute);
  } catch (error) {
    console.error('Error fetching global attribute:', error);
    res.status(500).json({ error: 'Failed to fetch global attribute' });
  }
});

// POST create global attribute
router.post('/', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { name, slug, displayType } = req.body;
    
    if (!name || !slug) {
      return res.status(400).json({ error: 'Name and slug are required' });
    }

    const existing = await GlobalAttribute.findOne({ slug: slug.toLowerCase() });
    if (existing) {
      return res.status(400).json({ error: 'Attribute slug must be unique' });
    }

    const attribute = new GlobalAttribute({
      id: randomUUID(),
      name,
      slug: slug.toLowerCase(),
      displayType: displayType || 'buttons',
      terms: []
    });

    await attribute.save();
    res.status(201).json(attribute);
  } catch (error) {
    console.error('Error creating global attribute:', error);
    res.status(500).json({ error: 'Failed to create global attribute' });
  }
});

// PUT update global attribute
router.put('/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { name, slug, displayType } = req.body;
    
    const attribute = await GlobalAttribute.findOne({ id: req.params.id, isArchived: false });
    if (!attribute) return res.status(404).json({ error: 'Attribute not found' });

    if (slug && slug.toLowerCase() !== attribute.slug) {
      const existing = await GlobalAttribute.findOne({ slug: slug.toLowerCase(), isArchived: false });
      if (existing) {
        return res.status(400).json({ error: 'Attribute slug must be unique' });
      }
    }

    if (name) attribute.name = name;
    if (slug) attribute.slug = slug.toLowerCase();
    if (displayType) attribute.displayType = displayType;

    await attribute.save();
    res.json(attribute);
  } catch (error) {
    console.error('Error updating global attribute:', error);
    res.status(500).json({ error: 'Failed to update global attribute' });
  }
});

// DELETE/ARCHIVE global attribute
router.delete('/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const attribute = await GlobalAttribute.findOne({ id: req.params.id });
    if (!attribute) return res.status(404).json({ error: 'Attribute not found' });

    // Check usage in products
    const inUseCount = await Product.countDocuments({
      'attributes.globalAttributeId': attribute.id
    });

    if (inUseCount > 0) {
      attribute.isArchived = true;
      await attribute.save();
      return res.json({ message: 'Attribute archived because it is in use by products', attribute });
    }

    await GlobalAttribute.deleteOne({ id: req.params.id });
    res.json({ message: 'Attribute deleted successfully' });
  } catch (error) {
    console.error('Error deleting global attribute:', error);
    res.status(500).json({ error: 'Failed to delete global attribute' });
  }
});

// POST add term
router.post('/:id/terms', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const attribute = await GlobalAttribute.findOne({ id: req.params.id, isArchived: false });
    if (!attribute) return res.status(404).json({ error: 'Attribute not found' });

    const { label, slug, value, colorValue, imageUrl, imageAlt } = req.body;
    
    if (!label || !value || !slug) {
      return res.status(400).json({ error: 'Label, slug, and value are required' });
    }

    if (attribute.terms.some(t => t.slug === slug && !t.isArchived)) {
      return res.status(400).json({ error: 'Term slug must be unique within this attribute' });
    }

    attribute.terms.push({
      id: randomUUID(),
      label,
      slug,
      value,
      colorValue,
      imageUrl,
      imageAlt,
      position: attribute.terms.length
    });

    await attribute.save();
    res.status(201).json(attribute);
  } catch (error) {
    console.error('Error adding term:', error);
    res.status(500).json({ error: 'Failed to add term' });
  }
});

// PUT update term
router.put('/:id/terms/:termId', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const attribute = await GlobalAttribute.findOne({ id: req.params.id, isArchived: false });
    if (!attribute) return res.status(404).json({ error: 'Attribute not found' });

    const term = attribute.terms.find(t => t.id === req.params.termId);
    if (!term) return res.status(404).json({ error: 'Term not found' });

    const { label, slug, value, colorValue, imageUrl, imageAlt } = req.body;

    if (slug && slug !== term.slug) {
      if (attribute.terms.some(t => t.slug === slug && t.id !== req.params.termId && !t.isArchived)) {
        return res.status(400).json({ error: 'Term slug must be unique within this attribute' });
      }
    }

    if (label) term.label = label;
    if (slug) term.slug = slug;
    if (value) term.value = value;
    if (colorValue !== undefined) term.colorValue = colorValue;
    if (imageUrl !== undefined) term.imageUrl = imageUrl;
    if (imageAlt !== undefined) term.imageAlt = imageAlt;

    await attribute.save();
    res.json(attribute);
  } catch (error) {
    console.error('Error updating term:', error);
    res.status(500).json({ error: 'Failed to update term' });
  }
});

// DELETE/ARCHIVE term
router.delete('/:id/terms/:termId', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const attribute = await GlobalAttribute.findOne({ id: req.params.id, isArchived: false });
    if (!attribute) return res.status(404).json({ error: 'Attribute not found' });

    const termIndex = attribute.terms.findIndex(t => t.id === req.params.termId);
    if (termIndex === -1) return res.status(404).json({ error: 'Term not found' });

    // Check if term is in use by variations
    const productsUsingTerm = await Product.find({
      'attributes.globalAttributeId': attribute.id,
      'attributes.terms.id': req.params.termId
    });

    let inUse = false;
    for (const prod of productsUsingTerm) {
      // Check variations
      if (prod.variations && prod.variations.some(v => v.attributes && ((v.attributes as any).get ? (v.attributes as any).get(attribute.slug) : v.attributes[attribute.slug]) === attribute.terms[termIndex].value)) {
         inUse = true;
         break;
      }
      // Or if simply selected in product terms array
      if (prod.attributes) {
        const attr = prod.attributes.find(a => a.globalAttributeId === attribute.id);
        if (attr && attr.terms && attr.terms.some(t => t.id === req.params.termId)) {
          inUse = true;
          break;
        }
      }
    }

    if (inUse) {
      attribute.terms[termIndex].isArchived = true;
      await attribute.save();
      return res.json({ message: 'Term archived because it is in use by products', attribute });
    }

    attribute.terms.splice(termIndex, 1);
    await attribute.save();
    res.json({ message: 'Term deleted successfully', attribute });
  } catch (error) {
    console.error('Error deleting term:', error);
    res.status(500).json({ error: 'Failed to delete term' });
  }
});

// PUT reorder terms
router.put('/:id/reorder-terms', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { termIds } = req.body;
    if (!Array.isArray(termIds)) {
      return res.status(400).json({ error: 'termIds must be an array of term IDs' });
    }

    const attribute = await GlobalAttribute.findOne({ id: req.params.id, isArchived: false });
    if (!attribute) return res.status(404).json({ error: 'Attribute not found' });

    // Update positions
    termIds.forEach((termId, index) => {
      const term = attribute.terms.find(t => t.id === termId);
      if (term) term.position = index;
    });

    attribute.terms.sort((a, b) => (a.position || 0) - (b.position || 0));

    await attribute.save();
    res.json(attribute);
  } catch (error) {
    console.error('Error reordering terms:', error);
    res.status(500).json({ error: 'Failed to reorder terms' });
  }
});

// GET usage stats
router.get('/:id/usage', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const attributeId = req.params.id;
    const products = await Product.find({ 'attributes.globalAttributeId': attributeId }, 'id name');
    res.json({
      productCount: products.length,
      products
    });
  } catch (error) {
    console.error('Error getting usage:', error);
    res.status(500).json({ error: 'Failed to get usage stats' });
  }
});

export default router;
