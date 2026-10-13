export const DEFAULT_BRAND_LOGO_URL = 'https://playbimboo.com/playbimbooLOGO.webp';
const publicHttps = (value: string): string => {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || /^(localhost|127\.|0\.|10\.|192\.168\.|\[::1\])/i.test(url.hostname) || /alvora|elvora/i.test(url.hostname)) throw new Error('Email brand URL must be a public PlayBimboo HTTPS URL');
  return url.href.replace(/\/$/, '');
};
export const getEmailBrand = () => {
  const name = process.env.BRAND_NAME?.trim() || 'PlayBimboo';
  if (!/^PlayBimboo(?: Toys)?$/i.test(name)) throw new Error('BRAND_NAME must identify PlayBimboo');
  const color = (key: string, fallback: string) => {
    const value = process.env[key]?.trim() || fallback;
    if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(key + ' must be a six-digit hex color');
    return value;
  };
  const support = process.env.BRAND_SUPPORT_EMAIL?.trim() || 'sales@playbimboo.com';
  const sender = process.env.SMTP_FROM?.match(/<?([^<>\s]+@[^<>\s]+)>?/)?.[1] || '';
  const fromName = process.env.BRAND_FROM_NAME?.trim() || name;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(support) || /alvora|elvora/i.test(support + sender + fromName)) throw new Error('Invalid PlayBimboo email identity');
  const website = publicHttps(process.env.BRAND_WEBSITE_URL || 'https://playbimboo.com');
  return { name, support, sender, fromName, website,
    logo: publicHttps(process.env.BRAND_LOGO_URL || DEFAULT_BRAND_LOGO_URL),
    admin: publicHttps(process.env.ADMIN_APP_URL || website),
    primary: color('BRAND_PRIMARY_COLOR', '#e11d48'),
    heading: color('BRAND_HEADING_COLOR', '#0f172a'),
    background: color('BRAND_BACKGROUND_COLOR', '#f8fafc') };
};
