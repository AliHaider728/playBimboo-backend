import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import Coupon from '../models/Coupon.js';
import Settings from '../models/Settings.js';
import User from '../models/User.js';

const router = Router();

const INITIAL_CATEGORIES = [
  {
    name: 'Building Sets & Blocks',
    slug: 'building-sets',
    iconName: 'Boxes',
    image: 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?auto=format&fit=crop&w=600&q=80',
    description: 'Constructive building bricks, architectural blocks, and magnetic tiles to spark creativity.',
    itemCount: 42
  },
  {
    name: 'STEM & Robotics',
    slug: 'stem-robotics',
    iconName: 'Cpu',
    image: 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=600&q=80',
    description: 'Interactive science kits, coding robots, and circuit boards for young engineers.',
    itemCount: 28
  },
  {
    name: 'Action Figures & Playsets',
    slug: 'action-figures',
    iconName: 'Sword',
    image: 'https://images.unsplash.com/photo-1608889825205-eebdb9fc5806?auto=format&fit=crop&w=600&q=80',
    description: 'Superheroes, dinosaurs, futuristic bots, and detailed mini figure playsets.',
    itemCount: 56
  },
  {
    name: 'Plush & Soft Toys',
    slug: 'plush-soft-toys',
    iconName: 'Heart',
    image: 'https://images.unsplash.com/photo-1559454403-b8fb88521f11?auto=format&fit=crop&w=600&q=80',
    description: 'Huggable teddy bears, velvet plushies, and soothing sensory companions for toddlers.',
    itemCount: 35
  },
  {
    name: 'Board Games & Puzzles',
    slug: 'board-games',
    iconName: 'Gamepad2',
    image: 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&w=600&q=80',
    description: 'Family strategy board games, jigsaw puzzles, and memory card challenges.',
    itemCount: 49
  },
  {
    name: 'Outdoor & Sports',
    slug: 'outdoor-sports',
    iconName: 'Rocket',
    image: 'https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?auto=format&fit=crop&w=600&q=80',
    description: 'Ride-on scooters, sports balls, water launchers, and active outdoor adventure gear.',
    itemCount: 31
  }
];

const INITIAL_PRODUCTS = [
  {
    name: 'PlayBimboo Galaxy Voyager Space Explorer Mech Kit',
    slug: 'playbimboo-galaxy-voyager-space-explorer-mech-kit',
    price: 3499,
    originalPrice: 4299,
    discountPercent: 18,
    rating: 4.9,
    reviewCount: 128,
    category: 'Building Sets & Blocks',
    categorySlug: 'building-sets',
    ageGroup: '9-11',
    brand: 'PlayBimboo',
    inStock: true,
    stockQuantity: 45,
    images: [
      'https://images.unsplash.com/photo-1587654780291-39c9404d746b?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1563770660941-20978e870e26?auto=format&fit=crop&w=800&q=80'
    ],
    description: 'Fuel your child’s space-age imagination with the PlayBimboo Galaxy Voyager! Featuring 850+ precision interlocking pieces, LED cockpit accents, and poseable lunar rover appendages.',
    isVisible: true,
    deliveryType: 'store_threshold',
    variants: [
      {
        id: 'var-color',
        name: 'Edition',
        options: [
          { id: 'opt-white', name: 'Lunar White', priceOffset: 0, inStock: true },
          { id: 'opt-gold', name: 'Cyber Gold LED', priceOffset: 400, inStock: true }
        ]
      }
    ],
    features: [
      'Over 850 high-precision building bricks',
      'Includes 3 astronaut mini-figures and rover robot',
      'Poseable joints with cockpit hatch mechanism',
      'Full color step-by-step instruction guide'
    ],
    safetyInfo: 'Choking hazard: Contains small parts. Not suitable for children under 3 years.',
    specifications: {
      'Piece Count': '854 pcs',
      'Material': 'Non-Toxic ABS Plastic',
      'Model Height': '32 cm',
      'Weight': '1.2 kg'
    },
    tags: ['building-sets', 'space', 'robot', 'featured', 'bestseller'],
    metaTitle: 'PlayBimboo Galaxy Voyager Space Kit - Buy Online in Pakistan',
    metaDescription: 'Shop PlayBimboo Galaxy Voyager Space Explorer Mech Kit with 850+ pieces in PKR with Cash on Delivery across Pakistan.'
  },
  {
    name: 'Smart Coding Bot & AI Companion Toy',
    slug: 'smart-coding-bot-ai-companion-toy',
    price: 4999,
    originalPrice: 5999,
    discountPercent: 16,
    rating: 4.8,
    reviewCount: 94,
    category: 'STEM & Robotics',
    categorySlug: 'stem-robotics',
    ageGroup: '6-8',
    brand: 'PlayBimboo',
    inStock: true,
    stockQuantity: 28,
    images: [
      'https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=800&q=80'
    ],
    description: 'Introduce kids to basic programming logic! Uses color-coded line tracing and app-free button programming.',
    isVisible: true,
    deliveryType: 'store_threshold',
    features: [
      'App-free block coding buttons',
      'Obstacle detection ultrasound sensor',
      'Rechargeable via USB-C'
    ],
    safetyInfo: 'Child-safe battery compartment.',
    specifications: {
      'Battery Life': '4 Hours',
      'Sensors': 'Infrared & Optical',
      'Material': 'Impact-Resistant Polymer'
    },
    tags: ['stem-robotics', 'coding', 'robot', 'featured'],
    metaTitle: 'Smart Coding Bot - PlayBimboo STEM Toys Pakistan',
    metaDescription: 'Order Smart Coding Bot for kids in Pakistan. Free shipping on orders over Rs. 3,000.'
  },
  {
    name: 'Cuddly Giant Plush Teddy Bear',
    slug: 'cuddly-giant-plush-teddy-bear',
    price: 2499,
    originalPrice: 2999,
    discountPercent: 16,
    rating: 5.0,
    reviewCount: 210,
    category: 'Plush & Soft Toys',
    categorySlug: 'plush-soft-toys',
    ageGroup: '0-2',
    brand: 'PlayBimboo Softies',
    inStock: true,
    stockQuantity: 60,
    images: [
      'https://images.unsplash.com/photo-1559454403-b8fb88521f11?auto=format&fit=crop&w=800&q=80'
    ],
    description: 'Ultra-soft, velvet hypoallergenic giant plush bear designed for endless hugs and cozy bedtime cuddles.',
    isVisible: true,
    deliveryType: 'store_threshold',
    features: [
      '100% Cotton filler & velvet exterior',
      'Washable fabric',
      'Safe embroidered eyes'
    ],
    safetyInfo: '0+ Safe. Passed EN71 plush safety standard.',
    specifications: {
      'Size': '60 cm',
      'Material': 'Ultra-Plush Polyester Velvet'
    },
    tags: ['plush-soft-toys', 'teddy', 'bestseller'],
    metaTitle: 'Giant Plush Teddy Bear - PlayBimboo Pakistan',
    metaDescription: 'Buy soft hypoallergenic teddy bear plush toy in Pakistan with Cash on Delivery.'
  }
];

const INITIAL_COUPONS = [
  {
    code: 'BIMBOO10',
    discountType: 'percentage',
    discountValue: 10,
    minPurchase: 1000,
    isActive: true
  },
  {
    code: 'PLAY500',
    discountType: 'fixed',
    discountValue: 500,
    minPurchase: 4000,
    isActive: true
  }
];

router.post('/', async (req: Request, res: Response) => {
  try {
    await Product.deleteMany({});
    await Category.deleteMany({});
    await Coupon.deleteMany({});
    await Settings.deleteMany({});
    await User.deleteMany({});

    await Category.insertMany(INITIAL_CATEGORIES);
    await Product.insertMany(INITIAL_PRODUCTS);
    await Coupon.insertMany(INITIAL_COUPONS);
    await Settings.create({});

    // Seed Admin User
    const adminPasswordHash = await bcrypt.hash('AdminPassword123!', 10);
    await User.create({
      name: 'PlayBimboo Super Admin',
      email: 'admin@playbimboo.com',
      passwordHash: adminPasswordHash,
      role: 'admin'
    });

    res.json({
      message: 'Database successfully seeded with PlayBimboo PKR catalog data and Admin user!',
      adminCredentials: {
        email: 'admin@playbimboo.com',
        password: 'AdminPassword123!'
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
