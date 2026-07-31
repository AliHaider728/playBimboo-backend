import nodemailer from 'nodemailer';

// Create Nodemailer Transporter
const port = Number(process.env.SMTP_PORT) || 587;
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: port,
  secure: port === 465,
  auth: process.env.SMTP_USER ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  } : undefined
});

export const sendOrderConfirmationEmail = async (order: any) => {
  if (!process.env.SMTP_USER) {
    console.log(`[Email Simulation] Sent Order Confirmation Email for Order #${order.orderId} to ${order.email}`);
    return;
  }

  const itemsHtml = order.items.map((it: any) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">
        <img src="${it.image}" alt="${it.name}" width="50" style="border-radius: 8px;" />
      </td>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">
        <strong>${it.name}</strong> ${it.selectedVariant ? `(${it.selectedVariant})` : ''}
        <br/><small style="color: #666;">Qty: ${it.quantity}</small>
      </td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">
        Rs. ${(it.price * it.quantity).toLocaleString()}
      </td>
    </tr>
  `).join('');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; padding: 24px; border-radius: 16px; border: 1px solid #eaeaea;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #f43f5e; margin: 0;">PlayBimboo</h1>
        <p style="color: #64748b; font-size: 14px;">Order Confirmation #${order.orderId}</p>
      </div>

      <p>Hi <strong>${order.customerName}</strong>,</p>
      <p>Thank you for shopping at PlayBimboo! Your Cash on Delivery (COD) order has been received and is being prepared with care.</p>

      <div style="background: #f8fafc; padding: 16px; border-radius: 12px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #0f172a;">Order Details</h3>
        <table style="width: 100%; border-collapse: collapse;">
          ${itemsHtml}
        </table>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;" />
        <p style="margin: 4px 0; text-align: right;"><strong>Delivery Fee:</strong> Rs. ${order.deliveryCharge}</p>
        <p style="margin: 4px 0; text-align: right;"><strong>Discount:</strong> -Rs. ${order.discountAmount}</p>
        <h3 style="margin: 8px 0 0 0; text-align: right; color: #e11d48;">Total (COD): Rs. ${order.total.toLocaleString()}</h3>
      </div>

      <div style="background: #eff6ff; padding: 16px; border-radius: 12px; margin: 20px 0;">
        <h4 style="margin: 0 0 8px 0; color: #1e40af;">Shipping Address</h4>
        <p style="margin: 0; color: #334155;">${order.shippingAddress.fullName}</p>
        <p style="margin: 0; color: #334155;">${order.shippingAddress.street}, ${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.postalCode}</p>
        <p style="margin: 4px 0 0 0; color: #334155;">Phone: ${order.shippingAddress.phone}</p>
      </div>

      <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 30px;">
        Note: You may request order cancellation within 24 hours directly from your Account Page or by reaching out to support@playbimboo.com.
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || '"PlayBimboo Toys" <orders@playbimboo.com>',
      to: order.email,
      subject: `Order Confirmation #${order.orderId} - PlayBimboo`,
      html
    });
    console.log(`Order confirmation email dispatched to ${order.email}`);
  } catch (err) {
    console.error(`Failed to send order email to ${order.email}:`, err);
  }
};

export const sendOrderStatusEmail = async (order: any) => {
  if (!process.env.SMTP_USER) {
    console.log(`[Email Simulation] Sent Status Update (${order.status}) for Order #${order.orderId} to ${order.email}`);
    return;
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; padding: 24px; border-radius: 16px; border: 1px solid #eaeaea;">
      <h2 style="color: #f43f5e;">PlayBimboo Order Update</h2>
      <p>Hi <strong>${order.customerName}</strong>,</p>
      <p>Your order <strong>#${order.orderId}</strong> status has been updated to: <span style="font-weight: bold; color: #0284c7;">${order.status}</span>.</p>
      ${order.trackingNumber ? `<p style="background: #f0f9ff; padding: 12px; border-radius: 8px;">Courier Tracking Code: <strong>${order.trackingNumber}</strong></p>` : ''}
      <p>Thank you for choosing PlayBimboo!</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || '"PlayBimboo Toys" <orders@playbimboo.com>',
      to: order.email,
      subject: `Order Update #${order.orderId} - ${order.status}`,
      html
    });
  } catch (err) {
    console.error('Failed to send status email:', err);
  }
};
