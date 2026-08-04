export const NAVIGATION_KEYS = [
  'home',
  'shop',
  'categories',
  'about',
  'contact',
  'wishlist',
  'account'
] as const;

export const HOMEPAGE_SECTION_KEYS = [
  'hero',
  'categories',
  'ageGroups',
  'featuredProducts',
  'brandCampaign',
  'newArrivals'
] as const;

export type NavigationKey = typeof NAVIGATION_KEYS[number];
export type HomepageSectionKey = typeof HOMEPAGE_SECTION_KEYS[number];

export interface StorefrontNavigationItem {
  key: NavigationKey;
  label: string;
  path: string;
  visible: boolean;
  enabled: boolean;
  showOnDesktop: boolean;
  showOnMobile: boolean;
  order: number;
}

export interface HomepageSectionSetting {
  key: HomepageSectionKey;
  name: string;
  enabled: boolean;
  order: number;
  heading?: string;
  subheading?: string;
  ctaLabel?: string;
  ctaLink?: string;
}

export const DEFAULT_STOREFRONT_NAVIGATION: StorefrontNavigationItem[] = [
  { key: 'home', label: 'Home', path: '/', visible: true, enabled: true, showOnDesktop: true, showOnMobile: true, order: 0 },
  { key: 'shop', label: 'Shop', path: '/category/all', visible: true, enabled: true, showOnDesktop: true, showOnMobile: false, order: 1 },
  { key: 'categories', label: 'Shop Categories', path: '/category/all', visible: true, enabled: true, showOnDesktop: true, showOnMobile: true, order: 2 },
  { key: 'about', label: 'About', path: '/about', visible: true, enabled: true, showOnDesktop: true, showOnMobile: false, order: 3 },
  { key: 'contact', label: 'Contact', path: '/contact', visible: true, enabled: true, showOnDesktop: true, showOnMobile: false, order: 4 },
  { key: 'wishlist', label: 'Wishlist', path: '/wishlist', visible: true, enabled: true, showOnDesktop: false, showOnMobile: true, order: 5 },
  { key: 'account', label: 'Account', path: '/account', visible: true, enabled: true, showOnDesktop: false, showOnMobile: true, order: 6 }
];

export const DEFAULT_HOMEPAGE_SECTIONS: HomepageSectionSetting[] = [
  {
    key: 'hero',
    name: 'Hero',
    enabled: true,
    order: 0,
    heading: 'Where Imagination Comes to Play!',
    subheading: 'Discover award-winning toys, STEM sets, plushies, action figures, and more that spark curiosity, inspire learning, and bring families closer together through the power of play.',
    ctaLabel: 'Explore All Toys',
    ctaLink: '/category/all'
  },
  {
    key: 'categories',
    name: 'Shop by Category',
    enabled: true,
    order: 1,
    heading: 'Shop by Category',
    subheading: 'Browse Collections',
    ctaLabel: 'View All Categories',
    ctaLink: '/category/all'
  },
  {
    key: 'ageGroups',
    name: 'Shop by Age Group',
    enabled: true,
    order: 2,
    heading: 'Shop by Age Group',
    subheading: 'Find perfectly developmental and age-appropriate toys designed for your child’s growth.'
  },
  {
    key: 'featuredProducts',
    name: 'Featured Products',
    enabled: true,
    order: 3,
    heading: 'Featured Toys & Bestsellers',
    subheading: 'Hot Picks',
    ctaLabel: 'Shop All Bestsellers',
    ctaLink: '/category/all'
  },
  {
    key: 'brandCampaign',
    name: 'Play, Learn, Grow',
    enabled: true,
    order: 4,
    heading: 'Discover Toys That Make Learning Magical',
    subheading: 'From STEM kits and building sets to creative play essentials, PlayBimboo brings fun, skill-building toys that spark curiosity and joyful learning at every age.',
    ctaLabel: 'Explore PlayBimboo Favorites',
    ctaLink: '/category/all'
  },
  {
    key: 'newArrivals',
    name: 'New Arrivals',
    enabled: true,
    order: 5,
    heading: 'New Arrivals & Restocks',
    subheading: 'Fresh In Store',
    ctaLabel: 'Browse New Additions',
    ctaLink: '/category/all'
  }
];

const cleanText = (value: unknown, maxLength: number) =>
  String(value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);

const safeInternalLink = (value: unknown, fallback: string) => {
  const link = String(value ?? '').trim();
  if (!link) return fallback;
  if (
    link.length > 200 ||
    !/^\/(?!\/)[a-zA-Z0-9/_?=&%+.,#-]*$/.test(link) ||
    /javascript:|data:|vbscript:/i.test(link)
  ) {
    throw new Error('Links must be safe internal storefront paths');
  }
  return link;
};

const assertUniqueKeysAndOrder = (items: Array<{ key: string; order: number }>, knownKeys: readonly string[], label: string) => {
  const keys = items.map(item => item.key);
  if (items.length !== knownKeys.length || new Set(keys).size !== keys.length) {
    throw new Error(`${label} must include every stable key exactly once`);
  }
  if (keys.some(key => !knownKeys.includes(key))) throw new Error(`${label} contains an unknown key`);
  const orders = items.map(item => item.order);
  if (orders.some(order => !Number.isInteger(order) || order < 0) || new Set(orders).size !== orders.length) {
    throw new Error(`${label} order values must be unique non-negative integers`);
  }
};

export const normalizeStoredNavigation = (value: unknown): StorefrontNavigationItem[] => {
  const stored = Array.isArray(value) ? value : [];
  return DEFAULT_STOREFRONT_NAVIGATION.map(defaultItem => {
    const candidate = stored.find(item => item && item.key === defaultItem.key) as Partial<StorefrontNavigationItem> | undefined;
    return {
      ...defaultItem,
      label: cleanText(candidate?.label, 40) || defaultItem.label,
      visible: typeof candidate?.visible === 'boolean' ? candidate.visible : defaultItem.visible,
      enabled: typeof candidate?.enabled === 'boolean' ? candidate.enabled : defaultItem.enabled,
      showOnDesktop: typeof candidate?.showOnDesktop === 'boolean' ? candidate.showOnDesktop : defaultItem.showOnDesktop,
      showOnMobile: typeof candidate?.showOnMobile === 'boolean' ? candidate.showOnMobile : defaultItem.showOnMobile,
      order: Number.isInteger(candidate?.order) ? Number(candidate?.order) : defaultItem.order
    };
  }).sort((a, b) => a.order - b.order);
};

export const normalizeStoredHomepageSections = (value: unknown): HomepageSectionSetting[] => {
  const stored = Array.isArray(value) ? value : [];
  return DEFAULT_HOMEPAGE_SECTIONS.map(defaultSection => {
    const candidate = stored.find(item => item && item.key === defaultSection.key) as Partial<HomepageSectionSetting> | undefined;
    return {
      ...defaultSection,
      enabled: typeof candidate?.enabled === 'boolean' ? candidate.enabled : defaultSection.enabled,
      order: Number.isInteger(candidate?.order) ? Number(candidate?.order) : defaultSection.order,
      heading: cleanText(candidate?.heading, 120) || defaultSection.heading,
      subheading: cleanText(candidate?.subheading, 320) || defaultSection.subheading,
      ctaLabel: defaultSection.ctaLabel
        ? cleanText(candidate?.ctaLabel, 60) || defaultSection.ctaLabel
        : undefined,
      ctaLink: defaultSection.ctaLink
        ? safeInternalLink(candidate?.ctaLink, defaultSection.ctaLink)
        : undefined
    };
  }).sort((a, b) => a.order - b.order);
};

export const validateAppearanceInput = (body: Record<string, unknown>) => {
  if (!Array.isArray(body.storefrontNavigation) || !Array.isArray(body.homepageSections)) {
    throw new Error('Navigation and homepage section settings are required');
  }
  assertUniqueKeysAndOrder(body.storefrontNavigation as any[], NAVIGATION_KEYS, 'Navigation');
  assertUniqueKeysAndOrder(body.homepageSections as any[], HOMEPAGE_SECTION_KEYS, 'Homepage sections');

  const navigation = normalizeStoredNavigation(body.storefrontNavigation).map(item => {
    const submitted = (body.storefrontNavigation as any[]).find(candidate => candidate.key === item.key);
    const label = cleanText(submitted.label, 40);
    if (!label) throw new Error(`Navigation label is required for ${item.key}`);
    return {
      ...item,
      label,
      path: DEFAULT_STOREFRONT_NAVIGATION.find(defaultItem => defaultItem.key === item.key)!.path,
      visible: submitted.visible === true,
      enabled: submitted.enabled === true,
      showOnDesktop: submitted.showOnDesktop === true,
      showOnMobile: submitted.showOnMobile === true,
      order: Number(submitted.order)
    };
  }).sort((a, b) => a.order - b.order);

  const homepageSections = normalizeStoredHomepageSections(body.homepageSections).map(section => {
    const submitted = (body.homepageSections as any[]).find(candidate => candidate.key === section.key);
    const defaultSection = DEFAULT_HOMEPAGE_SECTIONS.find(item => item.key === section.key)!;
    return {
      ...section,
      enabled: submitted.enabled === true,
      order: Number(submitted.order),
      heading: cleanText(submitted.heading, 120) || defaultSection.heading,
      subheading: cleanText(submitted.subheading, 320) || defaultSection.subheading,
      ctaLabel: defaultSection.ctaLabel
        ? cleanText(submitted.ctaLabel, 60) || defaultSection.ctaLabel
        : undefined,
      ctaLink: defaultSection.ctaLink
        ? safeInternalLink(submitted.ctaLink, defaultSection.ctaLink)
        : undefined
    };
  }).sort((a, b) => a.order - b.order);

  return { navigation, homepageSections };
};
