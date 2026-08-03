import nodemailer from 'nodemailer';

const REQUIRED_SMTP_ENVIRONMENT_VARIABLES = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM'
] as const;

export interface EmailDispatchResult {
  messageId: string;
  acceptedCount: number;
  rejectedCount: number;
}

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export class EmailDispatchError extends Error {
  code: string;

  constructor(code: string) {
    super('Email delivery failed');
    this.name = 'EmailDispatchError';
    this.code = code;
  }
}

export const getMissingEmailEnvironmentVariables = () =>
  REQUIRED_SMTP_ENVIRONMENT_VARIABLES.filter(name => !process.env[name]?.trim());

export const getEmailFailureCode = (error: unknown) => {
  if (error instanceof EmailDispatchError) return error.code;
  const rawCode = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';
  return /^[A-Z0-9_-]{1,80}$/i.test(rawCode) ? rawCode : 'SMTP_SEND_FAILED';
};

const createTransporter = () => {
  const missing = getMissingEmailEnvironmentVariables();
  if (missing.length > 0) throw new EmailDispatchError('SMTP_NOT_CONFIGURED');

  const port = Number(process.env.SMTP_PORT);
  if (!Number.isInteger(port) || port <= 0) throw new EmailDispatchError('SMTP_PORT_INVALID');

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const formatPkr = (value: unknown) =>
  `Rs. ${Math.max(0, Number(value) || 0).toLocaleString('en-PK')}`;

const formatDeliveryDate = (value: unknown) => {
  const date = value ? new Date(String(value)) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return safeDate.toLocaleDateString('en-PK', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Karachi'
  });
};

const sendEmail = async (to: string, content: EmailContent): Promise<EmailDispatchResult> => {
  try {
    const info = await createTransporter().sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject: content.subject,
      html: content.html,
      text: content.text,
      replyTo: 'support@playbimboo.com'
    });
    const acceptedCount = Array.isArray(info.accepted) ? info.accepted.length : 0;
    const rejectedCount = Array.isArray(info.rejected) ? info.rejected.length : 0;
    if (!info.messageId || acceptedCount === 0) {
      throw new EmailDispatchError('SMTP_NOT_ACCEPTED');
    }
    return {
      messageId: String(info.messageId),
      acceptedCount,
      rejectedCount
    };
  } catch (error) {
    if (error instanceof EmailDispatchError) throw error;
    throw new EmailDispatchError(getEmailFailureCode(error));
  }
};

export const verifyEmailTransport = async () => {
  try {
    await createTransporter().verify();
    return true;
  } catch (error) {
    if (error instanceof EmailDispatchError) throw error;
    throw new EmailDispatchError(getEmailFailureCode(error));
  }
};

export const buildOrderDeliveredEmail = (order: any): EmailContent => {
  const customerName = escapeHtml(order.customerName || order.shippingAddress?.fullName || 'Customer');
  const orderId = escapeHtml(order.orderId || 'Order');
  const deliveryDate = formatDeliveryDate(order.deliveredAt || new Date());
  const items = Array.isArray(order.items) ? order.items : [];
  const itemRows = items.map((item: any) => {
    const itemName = escapeHtml(item.name || 'PlayBimboo product');
    const variant = item.selectedVariant
      ? `<div style="color:#64748b;font-size:12px;margin-top:4px;">${escapeHtml(item.selectedVariant)}</div>`
      : '';
    return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #e2e8f0;">
          <strong style="color:#0f172a;">${itemName}</strong>${variant}
        </td>
        <td style="padding:12px 8px;border-bottom:1px solid #e2e8f0;text-align:center;color:#475569;">${Math.max(1, Number(item.quantity) || 1)}</td>
        <td style="padding:12px 0;border-bottom:1px solid #e2e8f0;text-align:right;color:#0f172a;font-weight:700;">${formatPkr((Number(item.price) || 0) * Math.max(1, Number(item.quantity) || 1))}</td>
      </tr>`;
  }).join('');
  const productNames = items.map((item: any) => String(item.name || 'PlayBimboo product')).join(', ');
  const total = formatPkr(order.total);
  const subject = `Your PlayBimboo Order Has Been Delivered - ${String(order.orderId || 'Order')}`;

  const html = `<!doctype html>
  <html lang="en">
    <body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#334155;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:24px 12px;">
        <tr><td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e2e8f0;border-radius:20px;overflow:hidden;">
            <tr><td style="background:#0f172a;padding:28px;text-align:center;">
              <div style="display:inline-block;background:#fbbf24;color:#0f172a;font-weight:900;font-size:20px;padding:10px 12px;border-radius:12px;">PB</div>
              <h1 style="color:#ffffff;font-size:26px;margin:14px 0 4px;">PlayBimboo</h1>
              <p style="color:#cbd5e1;margin:0;font-size:14px;">Delivered with smiles</p>
            </td></tr>
            <tr><td style="padding:32px 28px;">
              <h2 style="color:#0f172a;font-size:24px;margin:0 0 16px;">Your order has been delivered!</h2>
              <p style="margin:0 0 12px;line-height:1.6;">Hi <strong>${customerName}</strong>,</p>
              <p style="margin:0 0 22px;line-height:1.6;">Great news—your PlayBimboo order <strong>#${orderId}</strong> was delivered on <strong>${escapeHtml(deliveryDate)}</strong>.</p>
              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:14px;padding:16px;margin-bottom:22px;">
                <strong style="color:#166534;">Delivery confirmed</strong>
                <div style="color:#15803d;font-size:13px;margin-top:4px;">We hope this order brings plenty of happy playtime.</div>
              </div>
              <h3 style="color:#0f172a;font-size:16px;margin:0 0 8px;">Order summary</h3>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                <tr style="color:#64748b;font-size:12px;text-transform:uppercase;">
                  <th align="left" style="padding-bottom:8px;">Product</th><th style="padding-bottom:8px;">Qty</th><th align="right" style="padding-bottom:8px;">Amount</th>
                </tr>
                ${itemRows}
              </table>
              <p style="font-size:18px;text-align:right;color:#e11d48;font-weight:800;margin:18px 0 26px;">Total: ${total}</p>
              <p style="line-height:1.6;margin:0 0 12px;">If anything is missing or damaged, reply to this email or contact <a href="mailto:support@playbimboo.com" style="color:#e11d48;">support@playbimboo.com</a>.</p>
              <p style="line-height:1.6;margin:0;">Thank you for choosing PlayBimboo!</p>
            </td></tr>
            <tr><td style="background:#f8fafc;padding:18px 28px;text-align:center;color:#94a3b8;font-size:12px;">PlayBimboo Toys · Customer Support: support@playbimboo.com</td></tr>
          </table>
        </td></tr>
      </table>
    </body>
  </html>`;

  const text = [
    'PlayBimboo - Your order has been delivered!',
    `Hi ${String(order.customerName || order.shippingAddress?.fullName || 'Customer')},`,
    `Order #${String(order.orderId || 'Order')} was delivered on ${deliveryDate}.`,
    `Products: ${productNames || 'PlayBimboo product'}`,
    `Total: ${total}`,
    'Need help? Reply to this email or contact support@playbimboo.com.'
  ].join('\n\n');

  return { subject, html, text };
};

export const sendOrderDeliveredEmail = (order: any) =>
  sendEmail(String(order.email || ''), buildOrderDeliveredEmail(order));

export const buildOrderConfirmationEmail = (order: any): EmailContent => {
  const items = Array.isArray(order.items) ? order.items : [];
  const itemLines = items.map((item: any) => {
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const variant = item.selectedVariant ? ` (${String(item.selectedVariant)})` : '';
    return `${String(item.name || 'PlayBimboo product')}${variant} x ${quantity} at ${formatPkr(item.price)}`;
  }).join('\n');
  const itemsHtml = items.map((item: any) => {
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const itemPrice = Number(item.price) || 0;
    const variant = item.selectedVariant
      ? `<div style="color:#64748b;font-size:12px;margin-top:4px;">${escapeHtml(item.selectedVariant)}</div>`
      : '';
    return `<tr>
      <td style="padding:13px 0;border-bottom:1px solid #e2e8f0;"><strong style="color:#0f172a;">${escapeHtml(item.name || 'PlayBimboo product')}</strong>${variant}</td>
      <td style="padding:13px 8px;border-bottom:1px solid #e2e8f0;text-align:center;color:#475569;">${quantity}</td>
      <td style="padding:13px 8px;border-bottom:1px solid #e2e8f0;text-align:right;color:#475569;">${formatPkr(itemPrice)}</td>
      <td style="padding:13px 0;border-bottom:1px solid #e2e8f0;text-align:right;color:#0f172a;font-weight:700;">${formatPkr(itemPrice * quantity)}</td>
    </tr>`;
  }).join('');
  const address = order.shippingAddress || {};
  const fullAddress = [address.street, address.city, address.state, address.postalCode, address.country]
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .join(', ');
  const customerName = String(order.customerName || address.fullName || 'Customer');
  const orderId = String(order.orderId || 'Order');
  const orderDate = formatDeliveryDate(order.createdAt || order.date || new Date());
  const paymentMethod = String(order.paymentMethod || 'Cash on Delivery (COD)');
  const orderStatus = String(order.status || 'Pending');
  const contactPhone = String(address.phone || order.phone || '').trim();
  const discount = Math.max(0, Number(order.discountAmount) || 0);
  const discountHtml = discount > 0
    ? `<tr><td style="padding:5px 0;color:#64748b;">Discount</td><td style="padding:5px 0;text-align:right;color:#15803d;font-weight:700;">-${formatPkr(discount)}</td></tr>`
    : '';
  const subject = `Your PlayBimboo Order Is Confirmed - ${orderId}`;
  const html = `<!doctype html>
  <html lang="en"><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#334155;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:24px 12px;"><tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e2e8f0;border-radius:20px;overflow:hidden;">
        <tr><td style="background:#0f172a;padding:28px;text-align:center;">
          <div style="display:inline-block;background:#fbbf24;color:#0f172a;font-weight:900;font-size:20px;padding:10px 12px;border-radius:12px;">PB</div>
          <h1 style="color:#ffffff;font-size:26px;margin:14px 0 4px;">PlayBimboo</h1><p style="color:#cbd5e1;margin:0;font-size:14px;">Happy playtime starts here</p>
        </td></tr>
        <tr><td style="padding:32px 28px;">
          <h2 style="color:#0f172a;font-size:24px;margin:0 0 16px;">Your order is confirmed!</h2>
          <p style="margin:0 0 12px;line-height:1.6;">Hi <strong>${escapeHtml(customerName)}</strong>,</p>
          <p style="margin:0 0 20px;line-height:1.6;">Thank you for shopping with PlayBimboo. We have received order <strong>#${escapeHtml(orderId)}</strong> placed on <strong>${escapeHtml(orderDate)}</strong>.</p>
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;padding:16px;margin-bottom:22px;"><strong style="color:#1d4ed8;">What happens next?</strong><div style="color:#1e40af;font-size:13px;line-height:1.5;margin-top:4px;">Our team will contact you to confirm the order before it is dispatched.</div></div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:20px;background:#f8fafc;border-radius:12px;padding:12px;">
            <tr><td style="padding:5px;color:#64748b;">Order number</td><td style="padding:5px;text-align:right;font-weight:700;color:#0f172a;">${escapeHtml(orderId)}</td></tr>
            <tr><td style="padding:5px;color:#64748b;">Order date</td><td style="padding:5px;text-align:right;font-weight:700;color:#0f172a;">${escapeHtml(orderDate)}</td></tr>
            <tr><td style="padding:5px;color:#64748b;">Status</td><td style="padding:5px;text-align:right;font-weight:700;color:#b45309;">${escapeHtml(orderStatus)}</td></tr>
            <tr><td style="padding:5px;color:#64748b;">Payment</td><td style="padding:5px;text-align:right;font-weight:700;color:#0f172a;">${escapeHtml(paymentMethod)}</td></tr>
          </table>
          <h3 style="color:#0f172a;font-size:16px;margin:0 0 8px;">Order summary</h3>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;"><tr style="color:#64748b;font-size:11px;text-transform:uppercase;"><th align="left" style="padding-bottom:8px;">Product</th><th style="padding-bottom:8px;">Qty</th><th align="right" style="padding-bottom:8px;">Price</th><th align="right" style="padding-bottom:8px;">Amount</th></tr>${itemsHtml}</table>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:16px 0 24px;">
            <tr><td style="padding:5px 0;color:#64748b;">Subtotal</td><td style="padding:5px 0;text-align:right;font-weight:700;">${formatPkr(order.subtotal)}</td></tr>
            <tr><td style="padding:5px 0;color:#64748b;">Delivery charges</td><td style="padding:5px 0;text-align:right;font-weight:700;">${formatPkr(order.deliveryCharge)}</td></tr>${discountHtml}
            <tr><td style="padding:10px 0 0;color:#0f172a;font-size:17px;font-weight:800;">Final total</td><td style="padding:10px 0 0;text-align:right;color:#e11d48;font-size:19px;font-weight:900;">${formatPkr(order.total)}</td></tr>
          </table>
          <div style="background:#f8fafc;border-radius:14px;padding:16px;margin-bottom:22px;"><h3 style="color:#0f172a;font-size:16px;margin:0 0 8px;">Delivery address</h3><p style="margin:0;line-height:1.6;color:#334155;"><strong>${escapeHtml(address.fullName || customerName)}</strong><br/>${escapeHtml(fullAddress)}${contactPhone ? `<br/>Phone: ${escapeHtml(contactPhone)}` : ''}</p></div>
          <p style="line-height:1.6;margin:0 0 12px;">Questions about your order? Reply to this email or contact <a href="mailto:support@playbimboo.com" style="color:#e11d48;">support@playbimboo.com</a>.</p><p style="line-height:1.6;margin:0;">Thank you for choosing PlayBimboo!</p>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:18px 28px;text-align:center;color:#94a3b8;font-size:12px;">PlayBimboo Toys &middot; Customer Support: support@playbimboo.com</td></tr>
      </table>
    </td></tr></table>
  </body></html>`;
  const text = [
    'PlayBimboo - Your order is confirmed!', `Hi ${customerName},`,
    `Order #${orderId} was placed on ${orderDate}.`, `Status: ${orderStatus}`, `Payment: ${paymentMethod}`,
    `Products:\n${itemLines || 'PlayBimboo product'}`, `Subtotal: ${formatPkr(order.subtotal)}`,
    `Delivery charges: ${formatPkr(order.deliveryCharge)}`,
    ...(discount > 0 ? [`Discount: -${formatPkr(discount)}`] : []),
    `Final total: ${formatPkr(order.total)}`,
    `Delivery address: ${String(address.fullName || customerName)}, ${fullAddress}${contactPhone ? `, Phone: ${contactPhone}` : ''}`,
    'Our team will contact you to confirm the order before it is dispatched.',
    'Need help? Reply to this email or contact support@playbimboo.com.'
  ].join('\n\n');
  return { subject, html, text };
};

export const sendOrderConfirmationEmail = (order: any) =>
  sendEmail(String(order.email || ''), buildOrderConfirmationEmail(order));

export const sendOrderStatusEmail = async (order: any) => {
  const content: EmailContent = {
    subject: `Order Update #${String(order.orderId || 'Order')} - ${String(order.status || 'Updated')}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:16px;"><h2 style="color:#f43f5e;">PlayBimboo Order Update</h2><p>Hi <strong>${escapeHtml(order.customerName || 'Customer')}</strong>,</p><p>Order <strong>#${escapeHtml(order.orderId || 'Order')}</strong> is now <strong>${escapeHtml(order.status || 'Updated')}</strong>.</p>${order.trackingNumber ? `<p>Tracking code: <strong>${escapeHtml(order.trackingNumber)}</strong></p>` : ''}<p>Support: support@playbimboo.com</p></div>`,
    text: `PlayBimboo order #${String(order.orderId || 'Order')} is now ${String(order.status || 'Updated')}. Support: support@playbimboo.com.`
  };
  return sendEmail(String(order.email || ''), content);
};
