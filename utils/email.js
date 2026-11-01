const { Resend } = require("resend");
const nodemailer = require("nodemailer");

/**
 * Helper to mask recipient email and get domain safely for secret-free logs
 */
const getRecipientDomain = (email) => {
  if (!email || typeof email !== "string") return "unknown";
  const parts = email.split("@");
  return parts.length > 1 ? `@${parts[1]}` : "invalid-email";
};

// Initialize Resend client if API key is present
const getResend = () => {
  if (process.env.RESEND_API_KEY) {
    return new Resend(process.env.RESEND_API_KEY);
  }
  return null;
};

// Fallback nodemailer transporter if Gmail credentials are provided
const createNodemailerTransporter = () => {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS ? process.env.EMAIL_PASS.replace(/\s+/g, "") : "";

  if (!user || !pass) return null;

  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000,
  });
};

/**
 * Universal email sender function:
 * 1. PRIMARY: Resend (HTTPS API). Works reliably on cloud environments (e.g. Render free tier
 *    where outbound SMTP ports 25/465/587 are blocked).
 * 2. SECONDARY FALLBACK: Gmail SMTP (Nodemailer), protected with ~8-10s timeout so blocked ports
 *    never hang requests.
 */
async function sendEmail({ to, subject, html }, returnDetails = false) {
  const domain = getRecipientDomain(Array.isArray(to) ? to[0] : to);
  let providerUsed = null;
  let lastError = null;

  // 1. PRIMARY: Resend HTTPS API
  const resend = getResend();
  if (resend) {
    providerUsed = "Resend";
    const configuredFrom = process.env.RESEND_FROM_EMAIL;

    if (!configuredFrom) {
      console.warn("⚠️ [Resend] RESEND_FROM_EMAIL is not set. Defaulting to onboarding@resend.dev.");
    }

    const fromEmail = configuredFrom || "Hadeed by Niazi <onboarding@resend.dev>";

    try {
      const resendPromise = resend.emails.send({
        from: fromEmail,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Resend API call timed out after 10000ms")), 10000)
      );

      const result = await Promise.race([resendPromise, timeoutPromise]);

      if (result.error) {
        const errMsg = result.error.message || JSON.stringify(result.error);
        console.error(`❌ [Resend] API returned error for recipient domain ${domain}:`, {
          name: result.error.name || "ResendError",
          message: errMsg,
        });
        lastError = `Resend error: ${errMsg}`;
      } else {
        console.log(`✅ [Resend] Email successfully sent to recipient domain ${domain} (ID: ${result.data?.id || "ok"})`);
        if (returnDetails) return { success: true, provider: "Resend" };
        return true;
      }
    } catch (err) {
      console.error(`❌ [Resend] Dispatch failed for recipient domain ${domain}:`, {
        code: err.code || "ERR_RESEND",
        message: err.message,
      });
      lastError = `Resend exception: ${err.message}`;
    }
  }

  // 2. SECONDARY FALLBACK: Gmail SMTP
  const transporter = createNodemailerTransporter();
  if (transporter) {
    providerUsed = providerUsed ? `${providerUsed} -> Gmail SMTP` : "Gmail SMTP";
    try {
      const fromEmail = process.env.EMAIL_USER;

      const smtpPromise = transporter.sendMail({
        from: `"Hadeed by Niazi" <${fromEmail}>`,
        to,
        subject,
        html,
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("SMTP connection timed out after 10000ms")), 10000)
      );

      await Promise.race([smtpPromise, timeoutPromise]);
      console.log(`✅ [Gmail SMTP] Email successfully sent to recipient domain ${domain}`);
      if (returnDetails) return { success: true, provider: "Gmail SMTP" };
      return true;
    } catch (err) {
      console.error(`❌ [Gmail SMTP] Dispatch failed for recipient domain ${domain}:`, {
        code: err.code || "ERR_SMTP",
        command: err.command,
        message: err.message,
      });
      lastError = `Gmail SMTP error: ${err.message}`;
    }
  }

  if (returnDetails) {
    return {
      success: false,
      provider: providerUsed || "None",
      error: lastError || "Email dispatch failed",
    };
  }

  return false;
}

// Format items list into modern HTML table rows
const formatItemsTable = (items = []) => {
  return items
    .map(
      (item) => `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 14px 12px; font-size: 14px; color: #1e293b;">
          <strong style="color: #0b1a4a; display: block; font-size: 15px;">${item.name || "Product"}</strong>
          <span style="color: #64748b; font-size: 13px; display: inline-block; margin-top: 2px;">Size: ${item.size || "1 KG"}</span>
        </td>
        <td style="padding: 14px 12px; font-size: 14px; text-align: center; color: #475569; font-weight: 600;">${item.quantity || 1}</td>
        <td style="padding: 14px 12px; font-size: 15px; text-align: right; color: #0b1a4a; font-weight: 700;">Rs. ${((item.price || 0) * (item.quantity || 1)).toLocaleString()}</td>
      </tr>
    `
    )
    .join("");
};

/**
 * 1. Customer Order Confirmation Email (Clean, English, Luxury Branding)
 */
async function sendCustomerOrderEmail(order) {
  try {
    if (!order.customerEmail) {
      console.log(`ℹ️ Customer email not provided for order ${order.orderNumber}. Skipping customer notification.`);
      return false;
    }

    const addressStr = `${order.address?.street || ""}, ${order.address?.city || ""}, ${order.address?.province || ""}`.replace(/^, |, $/g, "");

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Order Confirmation</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 30px 15px;">
          <tr>
            <td align="center">
              <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
                
                <!-- Brand Header -->
                <tr>
                  <td align="center" style="background: linear-gradient(135deg, #0b1a4a 0%, #1e293b 100%); padding: 36px 20px; border-bottom: 3px solid #c59a3f;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase;">HADEED BY NIAZI</h1>
                    <p style="margin: 8px 0 0; color: #c59a3f; font-size: 14px; letter-spacing: 1px; font-weight: 500;">TRADITIONAL BELAONA CHURNED & PURE ORGANIC FOODS</p>
                  </td>
                </tr>

                <!-- Content Body -->
                <tr>
                  <td style="padding: 32px 28px;">
                    <div style="text-align: center; margin-bottom: 24px;">
                      <span style="display: inline-block; background-color: #ecfdf5; color: #059669; font-weight: 700; font-size: 13px; padding: 6px 16px; border-radius: 50px; text-transform: uppercase; letter-spacing: 0.5px;">
                        ✓ Order Confirmed
                      </span>
                      <h2 style="margin: 14px 0 6px; color: #0f172a; font-size: 22px; font-weight: 700;">Thank You for Your Order!</h2>
                      <p style="margin: 0; color: #64748b; font-size: 15px; line-height: 1.5;">Dear <strong>${order.customerName}</strong>, we have received your order and our kitchen is preparing it with genuine care.</p>
                    </div>

                    <!-- Order Details Card -->
                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 28px;">
                      <tr>
                        <td style="padding: 18px 20px;">
                          <table width="100%" border="0" cellspacing="0" cellpadding="0">
                            <tr>
                              <td style="padding: 4px 0; font-size: 14px; color: #64748b;">Order Number:</td>
                              <td style="padding: 4px 0; font-size: 15px; color: #0b1a4a; font-weight: 700; text-align: right;">${order.orderNumber}</td>
                            </tr>
                            <tr>
                              <td style="padding: 4px 0; font-size: 14px; color: #64748b;">Payment Method:</td>
                              <td style="padding: 4px 0; font-size: 14px; color: #1e293b; font-weight: 600; text-align: right;">Cash on Delivery (COD)</td>
                            </tr>
                            <tr>
                              <td style="padding: 4px 0; font-size: 14px; color: #64748b;">Shipping Address:</td>
                              <td style="padding: 4px 0; font-size: 14px; color: #1e293b; text-align: right; max-width: 280px;">${addressStr}</td>
                            </tr>
                            <tr>
                              <td style="padding: 4px 0; font-size: 14px; color: #64748b;">Contact Phone:</td>
                              <td style="padding: 4px 0; font-size: 14px; color: #1e293b; text-align: right;">${order.customerPhone || "N/A"}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <!-- Items Table -->
                    <h3 style="margin: 0 0 12px; color: #0b1a4a; font-size: 16px; font-weight: 700; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">Order Summary</h3>
                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 20px;">
                      <thead>
                        <tr style="background-color: #f1f5f9; text-align: left;">
                          <th style="padding: 10px 12px; font-size: 12px; color: #475569; text-transform: uppercase; letter-spacing: 0.5px;">Product</th>
                          <th style="padding: 10px 12px; font-size: 12px; color: #475569; text-align: center; text-transform: uppercase; letter-spacing: 0.5px;">Qty</th>
                          <th style="padding: 10px 12px; font-size: 12px; color: #475569; text-align: right; text-transform: uppercase; letter-spacing: 0.5px;">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${formatItemsTable(order.items)}
                      </tbody>
                    </table>

                    <!-- Totals Breakdown -->
                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 28px;">
                      <tr>
                        <td align="right">
                          <table border="0" cellspacing="0" cellpadding="0" style="min-width: 220px;">
                            <tr>
                              <td style="padding: 4px 0; font-size: 14px; color: #64748b;">Subtotal:</td>
                              <td style="padding: 4px 0; font-size: 14px; color: #1e293b; text-align: right; font-weight: 600;">Rs. ${(order.subtotal || 0).toLocaleString()}</td>
                            </tr>
                            <tr>
                              <td style="padding: 4px 0; font-size: 14px; color: #64748b;">Delivery Fee:</td>
                              <td style="padding: 4px 0; font-size: 14px; color: #059669; text-align: right; font-weight: 600;">${order.deliveryCharge === 0 ? "FREE" : "Rs. " + (order.deliveryCharge || 0)}</td>
                            </tr>
                            <tr style="border-top: 2px solid #e2e8f0;">
                              <td style="padding: 8px 0; font-size: 16px; color: #0b1a4a; font-weight: 700;">Grand Total:</td>
                              <td style="padding: 8px 0; font-size: 18px; color: #0b1a4a; text-align: right; font-weight: 800;">Rs. ${(order.totalAmount || 0).toLocaleString()}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <!-- Tracking Button -->
                    <div style="text-align: center; margin: 30px 0 10px;">
                      <a href="https://hadeedbyniazi.com/track-order" target="_blank" style="display: inline-block; background-color: #c59a3f; color: #ffffff; font-weight: 700; font-size: 14px; padding: 14px 28px; text-decoration: none; border-radius: 8px; letter-spacing: 0.5px; text-transform: uppercase;">
                        Track Your Order Online
                      </a>
                    </div>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="background-color: #f1f5f9; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
                    <p style="margin: 0 0 6px; font-size: 13px; color: #64748b;">Need help or have questions regarding your order?</p>
                    <p style="margin: 0; font-size: 13px; color: #0b1a4a; font-weight: 600;">
                      Email: <a href="mailto:hadeedbyniazii@gmail.com" style="color: #0b1a4a; text-decoration: underline;">hadeedbyniazii@gmail.com</a> | WhatsApp: <a href="https://wa.me/923237655723" style="color: #059669; text-decoration: none; font-weight: 700;">+92 323 7655723</a>
                    </p>
                    <p style="margin: 12px 0 0; font-size: 12px; color: #94a3b8;">&copy; ${new Date().getFullYear()} Hadeed by Niazi. All rights reserved.</p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    return await sendEmail({
      to: order.customerEmail,
      subject: `Order Confirmed #${order.orderNumber} – Hadeed by Niazi`,
      html,
    });
  } catch (err) {
    console.error("❌ Error sending customer order email:", err.message);
    return false;
  }
}

/**
 * 2. Admin New Order Alert Email (Professional English Dashboard Alert)
 */
async function sendAdminNewOrderAlert(order) {
  try {
    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.EMAIL_USER || "hadeedbyniazii@gmail.com";
    const addressStr = `${order.address?.street || ""}, ${order.address?.city || ""}, ${order.address?.province || ""}`.replace(/^, |, $/g, "");

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>New Order Alert</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 25px 15px;">
          <tr>
            <td align="center">
              <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 10px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                
                <!-- Admin Alert Header -->
                <tr>
                  <td style="background-color: #0f172a; padding: 24px; text-align: center; border-bottom: 3px solid #059669;">
                    <span style="background-color: #059669; color: #ffffff; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 4px; text-transform: uppercase; letter-spacing: 1px;">Admin Notification</span>
                    <h1 style="margin: 10px 0 4px; color: #ffffff; font-size: 22px; font-weight: 700;">New Customer Order Received</h1>
                    <p style="margin: 0; color: #94a3b8; font-size: 14px;">Order #${order.orderNumber} • Rs. ${(order.totalAmount || 0).toLocaleString()} (COD)</p>
                  </td>
                </tr>

                <!-- Details -->
                <tr>
                  <td style="padding: 24px;">
                    <!-- Customer Information Block -->
                    <h3 style="margin: 0 0 10px; font-size: 15px; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">Customer Information</h3>
                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 20px; font-size: 14px;">
                      <tr>
                        <td style="padding: 4px 0; color: #64748b; width: 120px;">Name:</td>
                        <td style="padding: 4px 0; color: #0f172a; font-weight: 600;">${order.customerName}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; color: #64748b;">Phone:</td>
                        <td style="padding: 4px 0; color: #0284c7; font-weight: 600;"><a href="tel:${order.customerPhone}" style="color: #0284c7; text-decoration: none;">${order.customerPhone}</a></td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; color: #64748b;">Email:</td>
                        <td style="padding: 4px 0; color: #0f172a;">${order.customerEmail || "Not provided"}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; color: #64748b;">Delivery Address:</td>
                        <td style="padding: 4px 0; color: #0f172a;">${addressStr}</td>
                      </tr>
                      ${order.customerNote ? `
                      <tr>
                        <td style="padding: 4px 0; color: #64748b;">Note:</td>
                        <td style="padding: 4px 0; color: #b45309; font-weight: 500;">"${order.customerNote}"</td>
                      </tr>` : ""}
                    </table>

                    <!-- Items -->
                    <h3 style="margin: 0 0 10px; font-size: 15px; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">Ordered Items</h3>
                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 20px;">
                      <thead>
                        <tr style="background-color: #f8fafc; text-align: left;">
                          <th style="padding: 8px 10px; font-size: 12px; color: #475569; text-transform: uppercase;">Item</th>
                          <th style="padding: 8px 10px; font-size: 12px; color: #475569; text-align: center; text-transform: uppercase;">Qty</th>
                          <th style="padding: 8px 10px; font-size: 12px; color: #475569; text-align: right; text-transform: uppercase;">Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${formatItemsTable(order.items)}
                      </tbody>
                    </table>

                    <!-- Totals -->
                    <div style="background-color: #f8fafc; padding: 14px 18px; border-radius: 8px; text-align: right; margin-bottom: 24px;">
                      <span style="font-size: 14px; color: #64748b; margin-right: 15px;">Subtotal: Rs. ${(order.subtotal || 0).toLocaleString()}</span>
                      <span style="font-size: 14px; color: #64748b; margin-right: 15px;">Delivery: Rs. ${(order.deliveryCharge || 0).toLocaleString()}</span>
                      <strong style="font-size: 16px; color: #059669;">Total: Rs. ${(order.totalAmount || 0).toLocaleString()}</strong>
                    </div>

                    <!-- Dashboard Action -->
                    <div style="text-align: center;">
                      <a href="https://hadeedbyniazi.com/admin" target="_blank" style="display: inline-block; background-color: #0f172a; color: #ffffff; font-weight: 700; font-size: 14px; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
                        Open Admin Dashboard
                      </a>
                    </div>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    return await sendEmail({
      to: adminEmail,
      subject: `🚨 [New Order] #${order.orderNumber} – Rs. ${(order.totalAmount || 0).toLocaleString()} (${order.customerName})`,
      html,
    });
  } catch (err) {
    console.error("❌ Error sending admin order alert:", err.message);
    return false;
  }
}

/**
 * 3. Status Update Email to Customer (English & Clean Branding)
 */
async function sendCustomerStatusUpdateEmail(order, newStatus) {
  try {
    if (!order.customerEmail) {
      console.log(`ℹ️ No customer email for order ${order.orderNumber}. Skipping status notification.`);
      return false;
    }

    const statusConfig = {
      pending: { title: "Order Pending", color: "#f59e0b", desc: "Your order is placed and currently awaiting verification." },
      confirmed: { title: "Order Confirmed", color: "#2563eb", desc: "Your order has been confirmed and forwarded to our kitchen for packing." },
      processing: { title: "Order In Preparation", color: "#7c3aed", desc: "Your pure Belaona jars are being packed with safety seals." },
      shipped: { title: "Order Dispatched", color: "#0284c7", desc: "Your parcel has been handed over to our courier partner for fast delivery." },
      delivered: { title: "Order Delivered", color: "#059669", desc: "Your order has been safely delivered. Thank you for choosing Hadeed by Niazi!" },
      cancelled: { title: "Order Cancelled", color: "#dc2626", desc: "Your order has been cancelled. Please contact our support team if this was unintentional." },
    };

    const current = statusConfig[newStatus.toLowerCase()] || {
      title: `Order Status: ${newStatus}`,
      color: "#0b1a4a",
      desc: `Your order status has been updated to ${newStatus}.`,
    };

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Order Status Update</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 30px 15px;">
          <tr>
            <td align="center">
              <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 20px rgba(0,0,0,0.05);">
                
                <!-- Status Header -->
                <tr>
                  <td align="center" style="background-color: ${current.color}; padding: 32px 20px; color: #ffffff;">
                    <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 1px;">HADEED BY NIAZI</h1>
                    <p style="margin: 8px 0 0; font-size: 15px; opacity: 0.95; font-weight: 600;">${current.title}</p>
                  </td>
                </tr>

                <tr style="padding: 30px 25px;">
                  <td style="padding: 30px 25px;">
                    <p style="margin: 0 0 12px; font-size: 16px; color: #0f172a;">Dear <strong>${order.customerName}</strong>,</p>
                    <p style="margin: 0 0 24px; font-size: 15px; color: #475569; line-height: 1.6;">${current.desc}</p>

                    <!-- Status Card -->
                    <div style="background-color: #f8fafc; border-left: 4px solid ${current.color}; padding: 16px 20px; border-radius: 6px; margin-bottom: 24px;">
                      <p style="margin: 4px 0; font-size: 14px; color: #64748b;">Order Number: <strong style="color: #0f172a;">${order.orderNumber}</strong></p>
                      <p style="margin: 4px 0; font-size: 14px; color: #64748b;">Current Status: <strong style="color: ${current.color}; text-transform: uppercase;">${newStatus}</strong></p>
                      ${order.courier ? `<p style="margin: 4px 0; font-size: 14px; color: #64748b;">Courier Partner: <strong style="color: #0f172a;">${order.courier}</strong></p>` : ""}
                      ${order.trackingNumber ? `<p style="margin: 4px 0; font-size: 14px; color: #64748b;">Tracking ID: <strong style="color: #0f172a;">${order.trackingNumber}</strong></p>` : ""}
                      <p style="margin: 4px 0; font-size: 14px; color: #64748b;">Total Amount: <strong style="color: #0f172a;">Rs. ${(order.totalAmount || 0).toLocaleString()}</strong></p>
                    </div>

                    <div style="text-align: center; margin: 30px 0 10px;">
                      <a href="https://hadeedbyniazi.com/track-order" target="_blank" style="display: inline-block; background-color: #0b1a4a; color: #ffffff; font-weight: 700; font-size: 14px; padding: 12px 26px; text-decoration: none; border-radius: 8px;">
                        Live Tracking on Website
                      </a>
                    </div>
                  </td>
                </tr>

                <tr>
                  <td style="background-color: #f1f5f9; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
                    &copy; ${new Date().getFullYear()} Hadeed by Niazi • 100% Pure & Traditional Desi Products
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    return await sendEmail({
      to: order.customerEmail,
      subject: `Order Update [${current.title}]: #${order.orderNumber} – Hadeed by Niazi`,
      html,
    });
  } catch (err) {
    console.error("❌ Error sending customer status update email:", err.message);
    return false;
  }
}

module.exports = {
  sendEmail,
  sendCustomerOrderEmail,
  sendAdminNewOrderAlert,
  sendCustomerStatusUpdateEmail,
};
