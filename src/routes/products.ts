import { Router, Request, Response } from 'express';
import Product from '../models/Product.js';
import multer from 'multer';
import csvParser from 'csv-parser';
import { Parser } from 'json2csv';
import fs from 'fs';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = Router();
const upload = multer({ dest: 'uploads/' });

// GET all products (Supports category, ageGroup, search, isVisible filter)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { category, ageGroup, search, isVisible, limit } = req.query;
    const filter: any = {};

    if (category && category !== 'all') {
      filter.categorySlug = category;
    }
    if (ageGroup && ageGroup !== 'all') {
      filter.ageGroup = ageGroup;
    }
    if (isVisible !== undefined) {
      filter.isVisible = isVisible === 'true';
    }
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    let query = Product.find(filter).sort({ createdAt: -1 });
    if (limit) {
      query = query.limit(Number(limit));
    }

    const products = await query.exec();
    res.json(products);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET single product by slug or ID
router.get('/:idOrSlug', async (req: Request, res: Response) => {
  try {
    const { idOrSlug } = req.params;
    let product = await Product.findOne({ slug: idOrSlug });
    if (!product && idOrSlug.match(/^[0-9a-fA-F]{24}$/)) {
      product = await Product.findById(idOrSlug);
    }

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST Create Product
router.post('/', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const newProduct = new Product(req.body);
    await newProduct.save();
    res.status(201).json(newProduct);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PUT Update Product
router.put('/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const updated = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ error: 'Product not found' });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE Product
router.delete('/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Product deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET Export CSV
router.get('/export/csv', async (req: Request, res: Response) => {
  try {
    const products = await Product.find().lean();
    const fields = ['_id', 'name', 'slug', 'price', 'originalPrice', 'category', 'categorySlug', 'ageGroup', 'brand', 'stockQuantity', 'isVisible', 'deliveryType', 'description'];
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(products);

    res.header('Content-Type', 'text/csv');
    res.attachment('playbimboo-products.csv');
    return res.send(csv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST Import CSV
router.post('/import/csv', authenticateToken, requireAdmin, upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload a CSV file' });
  }

  const results: any[] = [];
  fs.createReadStream(req.file.path)
    .pipe(csvParser())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      try {
        for (const item of results) {
          if (item.name && item.price) {
            const slug = item.slug || item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            await Product.findOneAndUpdate(
              { slug },
              {
                name: item.name,
                slug,
                price: Number(item.price),
                originalPrice: item.originalPrice ? Number(item.originalPrice) : undefined,
                category: item.category || 'Toys',
                categorySlug: item.categorySlug || 'toys',
                ageGroup: item.ageGroup || '3-5',
                brand: item.brand || 'PlayBimboo',
                stockQuantity: Number(item.stockQuantity) || 10,
                description: item.description || 'Quality toy for kids.',
                isVisible: item.isVisible === 'false' ? false : true,
                images: item.images ? item.images.split(',') : ['https://images.unsplash.com/photo-1587654780291-39c9404d746b?auto=format&fit=crop&w=600&q=80']
              },
              { upsert: true, new: true }
            );
          }
        }
        fs.unlinkSync(req.file!.path);
        res.json({ message: `Successfully imported ${results.length} products` });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });
});

export default router;
