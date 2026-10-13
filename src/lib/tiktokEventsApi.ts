import { buildTikTokPayload, clientIp, sendTikTokPayload } from './tiktokEventsCore.js';

export const sendTikTokPurchase = async ({ order, eventId, req }: { order: any; eventId: string; req: any }) => {
  const pixelId = process.env.TIKTOK_PIXEL_ID?.trim();
  const token = process.env.TIKTOK_ACCESS_TOKEN?.trim();
  if (!pixelId || !token) {
    console.error('[TikTok Events API] Purchase not delivered: TIKTOK_PIXEL_ID/TIKTOK_ACCESS_TOKEN missing');
    throw new Error('TikTok backend credentials missing');
  }
  const context = req.body?.tiktokContext || {};
  return sendTikTokPayload(buildTikTokPayload({
    pixelId, event: 'Purchase', eventId,
    eventTime: Math.floor(new Date(order.createdAt || Date.now()).getTime() / 1000),
    eventData: {
      email: order.guestEmail || order.email, phone: order.guestPhone || order.phone,
      value: Number(order.total), currency: 'PKR',
      contents: order.items.map((item: any) => ({ content_id: item.productId, content_name: item.productName || item.name, quantity: Number(item.quantity), price: Number(item.price) }))
    },
    context: { ...context, page_url: context.page_url || req.headers.origin && req.headers.origin + '/checkout' },
    cookieHeader: req.headers.cookie || '',
    ip: clientIp(req.headers['x-forwarded-for'], req.socket?.remoteAddress),
    userAgent: req.headers['user-agent'], testEventCode: process.env.TIKTOK_TEST_EVENT_CODE
  }), token);
};
