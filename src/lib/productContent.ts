import { randomUUID } from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
import { isProductDetailImagePublicId } from './cloudinary.js';

export const SUPPORTED_AGE_GROUPS = ['0-2', '3-5', '6-8', '9-12', '13+'] as const;
export type SupportedAgeGroup = typeof SUPPORTED_AGE_GROUPS[number];
const LEGACY_AGE_GROUP_ALIASES: Record<string, SupportedAgeGroup[]> = {
  '9-11': ['9-12'],
  '8+': ['9-12', '13+']
};
export type ProductDetailBlockType = 'richText' | 'image' | 'html' | 'divider';

export interface ProductDetailBlock {
  id: string;
  type: ProductDetailBlockType;
  enabled: boolean;
  order: number;
  heading?: string;
  content?: string;
  image?: {
    secureUrl: string;
    publicId: string;
    alt: string;
    caption?: string;
  };
  settings?: {
    width?: 'full' | 'large' | 'medium';
    alignment?: 'left' | 'center' | 'right';
  };
}

const cleanText = (value: unknown, maxLength: number) =>
  String(value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);

const sharedAllowedTags = [
  'div', 'section', 'article', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span',
  'strong', 'b', 'em', 'i', 'ul', 'ol', 'li', 'table', 'thead', 'tbody',
  'tr', 'th', 'td', 'blockquote', 'a', 'img', 'br', 'hr'
];

export const sanitizeProductDetailHtml = (value: unknown, maxLength = 20000) =>
  sanitizeHtml(String(value ?? '').slice(0, maxLength), {
    allowedTags: sharedAllowedTags,
    allowedAttributes: {
      '*': ['class', 'title'],
      div: ['class', 'title', 'style'],
      p: ['class', 'title', 'style'],
      h2: ['class', 'title', 'style'],
      h3: ['class', 'title', 'style'],
      h4: ['class', 'title', 'style'],
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['https'], a: ['http', 'https', 'mailto'] },
    allowProtocolRelative: false,
    allowedStyles: {
      '*': {
        'text-align': [/^left$/, /^center$/, /^right$/]
      }
    },
    disallowedTagsMode: 'discard',
    exclusiveFilter: frame =>
      frame.tag === 'img' && !/^https:\/\/res\.cloudinary\.com\//i.test(frame.attribs.src || ''),
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: 'a',
        attribs: {
          href: attribs.href || '#',
          ...(attribs.target === '_blank' ? { target: '_blank' } : {}),
          rel: 'noopener noreferrer'
        }
      }),
      img: (_tagName, attribs) => ({
        tagName: 'img',
        attribs: {
          src: attribs.src || '',
          alt: cleanText(attribs.alt, 180),
          ...(attribs.title ? { title: cleanText(attribs.title, 180) } : {}),
          loading: 'lazy'
        }
      })
    }
  }).trim();

const scopeCssRules = (css: string, wrapper: string): string => {
  let index = 0;
  let output = '';
  while (index < css.length) {
    const open = css.indexOf('{', index);
    if (open === -1) {
      if (css.slice(index).trim()) throw new Error('Custom CSS contains an incomplete rule');
      break;
    }
    const selector = css.slice(index, open).trim();
    let depth = 1;
    let close = open + 1;
    for (; close < css.length && depth > 0; close += 1) {
      if (css[close] === '{') depth += 1;
      if (css[close] === '}') depth -= 1;
    }
    if (depth !== 0) throw new Error('Custom CSS contains an incomplete block');
    const body = css.slice(open + 1, close - 1).trim();
    if (/^@media\s/i.test(selector)) {
      if (!/^@media\s+[a-zA-Z0-9\s():.\/-]+$/.test(selector)) {
        throw new Error('Custom CSS contains an unsafe media query');
      }
      output += `${selector}{${scopeCssRules(body, wrapper)}}`;
    } else {
      if (!selector || selector.startsWith('@')) throw new Error('Only CSS style rules and @media are allowed');
      if (body.includes('{') || body.includes('}')) throw new Error('Custom CSS contains invalid nested rules');
      if (/position\s*:\s*(fixed|sticky)|z-index\s*:/i.test(body)) {
        throw new Error('Custom CSS cannot create fixed, sticky, or global overlay layers');
      }
      const scopedSelectors = selector.split(',').map(rawSelector => {
        const item = rawSelector.trim();
        if (!item) throw new Error('Custom CSS contains an empty selector');
        if (
          /(^|[\s>+~])(html|body|header|nav|footer)([\s>+~.#:[\]]|$)/i.test(item) ||
          /:root|:global|#|\.admin\b|\.checkout\b|\.modal\b|\[data-portal/i.test(item)
        ) {
          throw new Error('Custom CSS selector targets a protected global element');
        }
        return `${wrapper} ${item}`;
      });
      output += `${scopedSelectors.join(',')}{${body}}`;
    }
    index = close;
  }
  return output;
};

export const sanitizeAndScopeProductCss = (value: unknown, slug: string) => {
  const css = String(value ?? '')
    .slice(0, 10000)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();
  if (!css) return { raw: '', scoped: '' };
  if (
    /@import|@font-face|@namespace|expression\s*\(|javascript:|vbscript:|behavior\s*:|-moz-binding|url\s*\(|<\/style/i.test(css)
  ) {
    throw new Error('Custom CSS contains a blocked construct');
  }
  const wrapper = `.product-custom-content[data-product-slug="${slug}"]`;
  return { raw: css, scoped: scopeCssRules(css, wrapper) };
};

export const normalizeAgeGroups = (ageGroups: unknown, legacyAgeGroup?: unknown): SupportedAgeGroup[] => {
  const submittedValues = Array.isArray(ageGroups)
    ? ageGroups.map(value => String(value).trim())
    : legacyAgeGroup
      ? [String(legacyAgeGroup).trim()]
      : [];
  if (submittedValues.length === 0) throw new Error('Select at least one supported age group');
  if (new Set(submittedValues).size !== submittedValues.length) throw new Error('Age groups cannot contain duplicates');
  const values = submittedValues.flatMap(value => LEGACY_AGE_GROUP_ALIASES[value] || [value]);
  if (values.some(value => !SUPPORTED_AGE_GROUPS.includes(value as SupportedAgeGroup))) {
    throw new Error('One or more age groups are not supported');
  }
  return [...new Set(values)] as SupportedAgeGroup[];
};

export const normalizeProductDetailBlocks = (value: unknown): ProductDetailBlock[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error('Product detail blocks must be an array');
  if (value.length > 30) throw new Error('A product can contain at most 30 detail blocks');
  const normalized = value.map((raw: any, index) => {
    const type = String(raw?.type || '') as ProductDetailBlockType;
    if (!['richText', 'image', 'html', 'divider'].includes(type)) {
      throw new Error('Product detail block type is not supported');
    }
    const id = /^[a-zA-Z0-9_-]{1,80}$/.test(String(raw?.id || ''))
      ? String(raw.id)
      : `block-${randomUUID()}`;
    const order = Number(raw?.order ?? index);
    if (!Number.isInteger(order) || order < 0) throw new Error('Product detail block order is invalid');
    const settings = {
      width: ['full', 'large', 'medium'].includes(raw?.settings?.width)
        ? raw.settings.width
        : 'full',
      alignment: ['left', 'center', 'right'].includes(raw?.settings?.alignment)
        ? raw.settings.alignment
        : 'center'
    } as ProductDetailBlock['settings'];
    const block: ProductDetailBlock = {
      id,
      type,
      enabled: raw?.enabled !== false,
      order,
      settings
    };
    if (type === 'richText') {
      block.heading = cleanText(raw?.heading, 140);
      block.content = sanitizeProductDetailHtml(raw?.content, 20000);
      if (!block.heading && !block.content) throw new Error('Rich text blocks require a heading or content');
    }
    if (type === 'html') {
      block.content = sanitizeProductDetailHtml(raw?.content, 30000);
      if (!block.content) throw new Error('Custom HTML blocks cannot be empty');
    }
    if (type === 'image') {
      const secureUrl = String(raw?.image?.secureUrl || '').trim();
      const publicId = String(raw?.image?.publicId || '').trim();
      const alt = cleanText(raw?.image?.alt, 180);
      if (!/^https:\/\/res\.cloudinary\.com\//i.test(secureUrl) || !isProductDetailImagePublicId(publicId)) {
        throw new Error('Image blocks require a valid PlayBimboo Cloudinary image');
      }
      if (!alt) throw new Error('Image block alt text is required');
      block.image = {
        secureUrl,
        publicId,
        alt,
        caption: cleanText(raw?.image?.caption, 300) || undefined
      };
    }
    return block;
  });
  const ids = normalized.map(block => block.id);
  const orders = normalized.map(block => block.order);
  if (new Set(ids).size !== ids.length) throw new Error('Product detail block IDs must be unique');
  if (new Set(orders).size !== orders.length) throw new Error('Product detail block order values must be unique');
  return normalized.sort((a, b) => a.order - b.order);
};

export const productUsesCustomCode = (blocks: unknown, css: unknown) =>
  Boolean(String(css ?? '').trim()) ||
  (Array.isArray(blocks) && blocks.some((block: any) => block?.type === 'html'));
