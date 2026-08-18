import crypto from 'crypto';

const hashData = (data: string) => {
  if (!data) return undefined;
  const trimmed = data.trim().toLowerCase();
  return crypto.createHash('sha256').update(trimmed).digest('hex');
};

export const sendTikTokPurchase = async ({
  order,
  eventId,
  req,
}: {
  order: any;
  eventId: string;
  req: any;
}) => {
  const pixelId = process.env.TIKTOK_PIXEL_ID;
  const accessToken = process.env.TIKTOK_ACCESS_TOKEN;

  if (!pixelId || !accessToken) {
    console.warn('[TikTok Events API] Missing TIKTOK_PIXEL_ID or TIKTOK_ACCESS_TOKEN');
    return;
  }

  const clientIpAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const clientUserAgent = req.headers['user-agent'];

  const eventTime = Math.floor(Date.now() / 1000);

  const payload = {
    event_source: 'web',
    event_source_id: pixelId,
    data: [
      {
        event_name: 'PlaceAnOrder',
        event_time: eventTime,
        event_id: eventId,
        user: {
          email: hashData(order.email),
          phone_number: hashData(order.phone),
          client_ip_address: clientIpAddress,
          client_user_agent: clientUserAgent,
        },
        properties: {
          contents: order.items.map((item: any) => ({
            content_id: item.productId,
            quantity: item.quantity,
            price: item.price,
          })),
          content_type: 'product',
          value: order.total,
          currency: 'PKR',
        }
      },
      {
        event_name: 'Purchase',
        event_time: eventTime,
        event_id: eventId,
        user: {
          email: hashData(order.email),
          phone_number: hashData(order.phone),
          client_ip_address: clientIpAddress,
          client_user_agent: clientUserAgent,
        },
        properties: {
          contents: order.items.map((item: any) => ({
            content_id: item.productId,
            quantity: item.quantity,
            price: item.price,
          })),
          content_type: 'product',
          value: order.total,
          currency: 'PKR',
        }
      }
    ]
  };

  try {
    const response = await fetch('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
      method: 'POST',
      headers: {
        'Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok || data.code !== 0) {
      console.error('[TikTok Events API] Track failed:', data);
    }
  } catch (error) {
    console.error('[TikTok Events API] Fetch error:', error);
  }
};
