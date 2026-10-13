import crypto from 'node:crypto';
import { isIP } from 'node:net';

export const TIKTOK_ENDPOINT = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';
export const TIKTOK_EVENTS = new Set(['ViewContent', 'Search', 'AddToWishlist', 'AddToCart', 'InitiateCheckout', 'AddPaymentInfo', 'Purchase', 'CompleteRegistration']);
export const normalizePhone = (input: unknown): string | undefined => {
  if (typeof input !== 'string') return undefined;
  const digits = input.replace(/\D/g, '');
  if (/^92[0-9]{10}$/.test(digits)) return '+' + digits;
  if (/^03[0-9]{9}$/.test(digits)) return '+92' + digits.slice(1);
  if (/^3[0-9]{9}$/.test(digits)) return '+92' + digits;
  if (input.trim().startsWith('+') && /^[1-9][0-9]{7,14}$/.test(digits)) return '+' + digits;
  return undefined;
};
export const hashIdentifier = (input: unknown): string | undefined => {
  if (typeof input !== 'string' || !input.trim()) return undefined;
  return crypto.createHash('sha256').update(input.trim().toLowerCase()).digest('hex');
};
export const readCookies = (header: string = ''): Record<string, string> => {
  const cookies: Record<string, string> = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    try { cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim()); }
    catch { /* Ignore malformed cookies, keep processing the others. */ }
  }
  return cookies;
};
const text = (input: unknown, max = 2048): string | undefined =>
  typeof input === 'string' && input.trim() ? input.trim().slice(0, max) : undefined;
export const clientIp = (forwarded: unknown, fallback?: unknown): string | undefined => {
  const candidate = text(forwarded)?.split(',')[0].trim() || text(fallback);
  const normalized = candidate?.replace(/^::ffff:/, '');
  return normalized && isIP(normalized) ? normalized : undefined;
};
const url = (input: unknown): string | undefined => {
  try { const parsed = new URL(String(input)); return /^https?:$/.test(parsed.protocol) ? parsed.href : undefined; }
  catch { return undefined; }
};
export interface TikTokContext {
  ttclid?: string; ttp?: string; page_url?: string; page_referrer?: string;
}
export const buildTikTokPayload = ({ pixelId, event, eventId, eventData, context = {}, cookieHeader = '', ip, userAgent, eventTime = Math.floor(Date.now() / 1000), testEventCode }: {
  pixelId: string; event: string; eventId: string; eventData: Record<string, any>;
  context?: TikTokContext; cookieHeader?: string; ip?: string; userAgent?: string;
  eventTime?: number; testEventCode?: string;
}) => {
  if (!TIKTOK_EVENTS.has(event) || !text(eventId, 200)) throw new Error('Invalid TikTok event or event_id');
  if (!Number.isInteger(eventTime) || eventTime > Math.floor(Date.now()/1000) + 60 || eventTime < Math.floor(Date.now()/1000) - 7*86400) throw new Error('TikTok event_time must be recent Unix seconds');
  const cookies = readCookies(cookieHeader);
  const properties: Record<string, any> = { content_type: 'product' };
  for (const key of ['content_id', 'content_name', 'search_string', 'query', 'quantity']) {
    if (eventData[key] !== undefined) properties[key] = eventData[key];
  }
  if (eventData.value !== undefined) {
    const value = Number(eventData.value);
    if (!Number.isFinite(value) || value < 0) throw new Error('Invalid TikTok value');
    properties.value = value;
    properties.currency = String(eventData.currency || 'PKR').toUpperCase();
    if (!/^[A-Z]{3}$/.test(properties.currency)) throw new Error('Invalid currency');
  }
  if (Array.isArray(eventData.contents)) {
    properties.contents = eventData.contents.map((item: any) => ({
      content_id: String(item.content_id), content_type: 'product',
      ...(item.content_name ? { content_name: String(item.content_name) } : {}),
      ...(item.quantity !== undefined ? { quantity: Number(item.quantity) } : {}),
      ...(item.price !== undefined ? { price: Number(item.price) } : {})
    }));
  }
  const pageUrl = url(context.page_url);
  const referrer = url(context.page_referrer);
  return {
    event_source: 'web', event_source_id: pixelId.trim(),
    ...(text(testEventCode) ? { test_event_code: testEventCode!.trim() } : {}),
    data: [{ event, event_time: eventTime, event_id: eventId,
      user: {
        email: hashIdentifier(eventData.email), phone: hashIdentifier(normalizePhone(eventData.phone)),
        ttclid: text(context.ttclid || cookies.ttclid), ttp: text(context.ttp || cookies._ttp),
        ip: clientIp(ip), user_agent: text(userAgent)
      },
      ...(pageUrl ? { page: { url: pageUrl, ...(referrer ? { referrer } : {}) } } : {}),
      properties
    }]
  };
};
export const sendTikTokPayload = async (payload: ReturnType<typeof buildTikTokPayload>, accessToken: string) => {
  if (!accessToken.trim() || !payload.event_source_id) throw new Error('TikTok server credentials missing');
  try {
    const response = await fetch(TIKTOK_ENDPOINT, {
      method: 'POST', headers: { 'Access-Token': accessToken.trim(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(8000)
    });
    const body = await response.text();
    // Log the entire response, never the token, request identifiers or customer data.
    console.log('[TikTok Events API] response', JSON.stringify({ status: response.status, body }));
    let result: any;
    try { result = JSON.parse(body); } catch { throw new Error('TikTok returned a non-JSON response'); }
    if (!response.ok || result.code !== 0) throw new Error('TikTok rejected event: HTTP ' + response.status + ', code ' + result.code + ', message ' + result.message + ', request_id ' + result.request_id);
    return result;
  } catch (error) {
    console.error('[TikTok Events API] delivery failed', error);
    throw error;
  }
};
