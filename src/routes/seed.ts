import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import Product, { IProduct } from '../models/Product.js';
import Category from '../models/Category.js';
import Coupon, { ICoupon } from '../models/Coupon.js';
import Settings from '../models/Settings.js';
import User from '../models/User.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

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
    name: 'Galaxy Explorer Cosmic Rocket Ship',
    slug: 'galaxy-explorer-cosmic-rocket-ship',
    price: 3499,
    originalPrice: 4299,
    discountPercent: 18,
    rating: 4.9,
    reviewCount: 128,
    category: 'Building Sets & Blocks',
    categorySlug: 'building-sets',
    ageGroups: ['8+'],
    brand: 'PlayBimboo',
    inStock: true,
    stockQuantity: 45,
    images: [
      'https://images.unsplash.com/photo-1587654780291-39c9404d746b?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1563770660941-20978e870e26?auto=format&fit=crop&w=800&q=80'
    ],
    description: 'Fuel your child’s space-age imagination with the Galaxy Explorer Cosmic Rocket Ship! Featuring 850+ precision interlocking pieces, LED cockpit accents, and poseable lunar rover appendages.',
    isVisible: true,
    deliveryType: 'store_threshold' as const,
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
    metaTitle: 'Galaxy Explorer Cosmic Rocket Ship - Buy Online in Pakistan',
    metaDescription: 'Shop Galaxy Explorer Cosmic Rocket Ship with 850+ pieces in PKR with Cash on Delivery across Pakistan.'
  },
  {
    name: 'RoboBot Junior STEM Coding Robot',
    slug: 'robobot-junior-stem-coding-robot',
    price: 4999,
    originalPrice: 5999,
    discountPercent: 16,
    rating: 4.8,
    reviewCount: 94,
    category: 'STEM & Robotics',
    categorySlug: 'stem-robotics',
    ageGroups: ['6-8'],
    brand: 'PlayBimboo',
    inStock: true,
    stockQuantity: 28,
    images: [
      'https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=800&q=80'
    ],
    description: 'Introduce kids to basic programming logic! Uses color-coded line tracing and app-free button programming.',
    isVisible: true,
    deliveryType: 'store_threshold' as const,
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
    metaTitle: 'RoboBot Junior STEM Coding Robot - PlayBimboo STEM Toys Pakistan',
    metaDescription: 'Order RoboBot Junior STEM Coding Robot for kids in Pakistan. Free shipping on orders over Rs. 3,000.'
  },
  {
    name: 'CuddlePal Plush Giant Teddy Bear',
    slug: 'cuddlepal-plush-giant-teddy-bear',
    price: 2499,
    originalPrice: 2999,
    discountPercent: 16,
    rating: 5.0,
    reviewCount: 210,
    category: 'Plush & Soft Toys',
    categorySlug: 'plush-soft-toys',
    ageGroups: ['0-2'],
    brand: 'PlayBimboo Softies',
    inStock: true,
    stockQuantity: 60,
    images: [
      'https://images.unsplash.com/photo-1559454403-b8fb88521f11?auto=format&fit=crop&w=800&q=80'
    ],
    description: 'Ultra-soft, velvet hypoallergenic giant plush bear designed for endless hugs and cozy bedtime cuddles.',
    isVisible: true,
    deliveryType: 'store_threshold' as const,
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
    metaTitle: 'CuddlePal Plush Giant Teddy Bear - PlayBimboo Pakistan',
    metaDescription: 'Buy soft hypoallergenic teddy bear plush toy in Pakistan with Cash on Delivery.'
  },
  {
    name: 'MagnaTiles 100-Piece Rainbow Building Set',
    slug: 'magnatiles-100-piece-rainbow-building-set',
    price: 6599,
    originalPrice: 7599,
    discountPercent: 13,
    rating: 4.9,
    reviewCount: 342,
    category: 'Building Sets & Blocks',
    categorySlug: 'building-sets',
    ageGroups: ['3-5'],
    brand: 'PlayBimboo',
    inStock: true,
    stockQuantity: 120,
    images: [
      'https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?auto=format&fit=crop&w=800&q=80'
    ],
    description: 'Vibrant magnetic tiles that inspire endless creativity and develop spatial reasoning skills.',
    isVisible: true,
    deliveryType: 'store_threshold' as const,
    features: [
      '100 magnetic shapes in vibrant colors',
      'Strong, durable magnets',
      'Includes squares, triangles, and windows'
    ],
    safetyInfo: 'Made from food-grade ABS plastic. BPA-free.',
    specifications: {
      'Piece Count': '100 pcs',
      'Material': 'Food-grade ABS plastic'
    },
    tags: ['building-sets', 'magnetic', 'educational'],
    metaTitle: 'MagnaTiles 100-Piece Rainbow Set',
    metaDescription: 'Shop MagnaTiles 100-Piece Rainbow Building Set in Pakistan.'
  },
  {
    name: 'Super Hero Action Figure Collection',
    slug: 'super-hero-action-figure-collection',
    price: 1999,
    originalPrice: 2499,
    discountPercent: 20,
    rating: 4.7,
    reviewCount: 85,
    category: 'Action Figures & Playsets',
    categorySlug: 'action-figures',
    ageGroups: ['6-8'],
    brand: 'PlayBimboo',
    inStock: true,
    stockQuantity: 15,
    images: [
      'https://images.unsplash.com/photo-1608889825205-eebdb9fc5806?auto=format&fit=crop&w=800&q=80'
    ],
    description: 'A set of 5 highly detailed and poseable superhero action figures ready to save the day!',
    isVisible: true,
    deliveryType: 'store_threshold' as const,
    features: [
      '5 detailed action figures',
      'Multiple points of articulation',
      'Includes character accessories'
    ],
    safetyInfo: 'Not for children under 3. Small parts.',
    specifications: {
      'Figure Height': '15 cm',
      'Material': 'Durable PVC'
    },
    tags: ['action-figures', 'superhero'],
    metaTitle: 'Super Hero Action Figure Collection',
    metaDescription: 'Buy Super Hero Action Figures online.'
  },
  {
    name: 'Outdoor Adventure Explorer Kit',
    slug: 'outdoor-adventure-explorer-kit',
    price: 2999,
    originalPrice: 3499,
    discountPercent: 14,
    rating: 4.6,
    reviewCount: 52,
    category: 'Outdoor & Sports',
    categorySlug: 'outdoor-sports',
    ageGroups: ['6-8'],
    brand: 'PlayBimboo',
    inStock: true,
    stockQuantity: 40,
    images: [
      'https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?auto=format&fit=crop&w=800&q=80'
    ],
    description: 'Get kids exploring nature with this comprehensive outdoor kit including binoculars, compass, and magnifying glass.',
    isVisible: true,
    deliveryType: 'store_threshold' as const,
    features: [
      '4x30 Magnification Binoculars',
      'Lensatic Compass for navigation',
      'LED Flashlight (batteries included)'
    ],
    safetyInfo: 'Adult supervision recommended for outdoor use.',
    specifications: {
      'Contents': '6 items',
      'Material': 'Plastic and Glass'
    },
    tags: ['outdoor-sports', 'nature', 'educational'],
    metaTitle: 'Outdoor Adventure Explorer Kit',
    metaDescription: 'Outdoor Explorer Kit for kids.'
  },
  {
    name: 'Classic Wooden Chess Set',
    slug: 'classic-wooden-chess-set',
    price: 1599,
    originalPrice: 1999,
    discountPercent: 20,
    rating: 4.8,
    reviewCount: 110,
    category: 'Board Games & Puzzles',
    categorySlug: 'board-games',
    ageGroups: ['8+'],
    brand: 'PlayBimboo',
    inStock: true,
    stockQuantity: 80,
    images: [
      'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&w=800&q=80'
    ],
    description: 'A beautifully crafted wooden chess set, perfect for learning strategy and critical thinking.',
    isVisible: true,
    deliveryType: 'store_threshold' as const,
    features: [
      'Foldable wooden board',
      'Hand-carved wooden pieces',
      'Felt-lined storage interior'
    ],
    safetyInfo: 'Not suitable for children under 3 years due to small parts.',
    specifications: {
      'Board Size': '30x30 cm',
      'Material': 'Solid Wood'
    },
    tags: ['board-games', 'educational', 'strategy'],
    metaTitle: 'Classic Wooden Chess Set',
    metaDescription: 'Buy a classic wooden chess set.'
  },
  {
    name: 'Interactive Solar System Planetarium',
    slug: 'interactive-solar-system-planetarium',
    price: 2199,
    originalPrice: 2599,
    discountPercent: 15,
    rating: 4.7,
    reviewCount: 75,
    category: 'STEM & Robotics',
    categorySlug: 'stem-robotics',
    ageGroups: ['6-8'],
    brand: 'PlayBimboo',
    inStock: true,
    stockQuantity: 50,
    images: [
      'https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=800&q=80'
    ],
    description: 'Build and paint your own glowing solar system model. Learn about astronomy in a fun, hands-on way!',
    isVisible: true,
    deliveryType: 'store_threshold' as const,
    features: [
      'Rotating planetarium stand',
      'Glow-in-the-dark paint included',
      'Educational planet guide'
    ],
    safetyInfo: 'Contains small parts and paint. Adult supervision recommended.',
    specifications: {
      'Dimensions': '25x25 cm',
      'Material': 'Plastic model kit'
    },
    tags: ['stem-robotics', 'space', 'educational'],
    metaTitle: 'Interactive Solar System Planetarium',
    metaDescription: 'Learn about space with our solar system kit.'
  }
];

const INITIAL_COUPONS = [
  {
    code: 'BIMBOO10',
    discountType: 'percentage' as const,
    discountValue: 10,
    minPurchase: 1000,
    isActive: true
  },
  {
    code: 'PLAY500',
    discountType: 'fixed' as const,
    discountValue: 500,
    minPurchase: 4000,
    isActive: true
  }
];

router.post('/', authenticateToken, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const categoryResult = await Category.bulkWrite(
      INITIAL_CATEGORIES.map((category) => ({
        updateOne: {
          filter: { slug: category.slug },
          update: { $setOnInsert: category },
          upsert: true
        }
      }))
    );
    const productResult = await Product.bulkWrite(
      INITIAL_PRODUCTS.map((product) => ({
        updateOne: {
          filter: { slug: product.slug },
          update: { $setOnInsert: product as unknown as Partial<IProduct> },
          upsert: true
        }
      }))
    );
    const couponResult = await Coupon.bulkWrite(
      INITIAL_COUPONS.map((coupon) => ({
        updateOne: {
          filter: { code: coupon.code },
          update: { $setOnInsert: coupon as Partial<ICoupon> },
          upsert: true
        }
      }))
    );

    const settingsExist = Boolean(await Settings.exists({}));
    if (!settingsExist) {
      await Settings.create({});
    }

    const adminExists = Boolean(
      await User.exists({ email: 'playbimboo@gmail.com' })
    );
    if (!adminExists) {
      const adminPasswordHash = await bcrypt.hash('admin123', 10);
      await User.create({
        name: 'PlayBimboo Super Admin',
        email: 'playbimboo@gmail.com',
        passwordHash: adminPasswordHash,
        role: 'super_admin'
      });
    }

    res.json({
      message: 'Missing PlayBimboo setup records were added without changing existing data.',
      recordsCreated: {
        categories: categoryResult.upsertedCount,
        products: productResult.upsertedCount,
        coupons: couponResult.upsertedCount,
        settings: settingsExist ? 0 : 1,
        admin: adminExists ? 0 : 1
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
