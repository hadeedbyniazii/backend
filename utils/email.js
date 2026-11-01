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
 *
 * Can return an object if returnDetails=true (useful for /api/admin/test-email)
 */
async function sendEmail({ to, subject, html }, returnDetails = false) {
  const domain = getRecipientDomain(Array.isArray(to) ? to[0] : to);
  let providerUsed = null;
  let lastError = null;

  // ─────────────────────────────────────────────
  // 1. PRIMARY: Resend HTTPS API
  // ─────────────────────────────────────────────
  const resend = getResend();
  if (resend) {
    providerUsed = "Resend";
    const configuredFrom = process.env.RESEND_FROM_EMAIL;

    if (!configuredFrom) {
      console.warn("⚠️ [Resend] RESEND_FROM_EMAIL is not set. Defaulting to onboarding@resend.dev (Note: Resend will only deliver to the verified Resend account owner until domain DNS is verified).");
    }

    const fromEmail = configuredFrom || "Hadeed by Niazi <onboarding@resend.dev>";

    try {
      // Promise.race with 10s timeout
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
  } else {
    console.log("ℹ️ [Resend] RESEND_API_KEY not configured. Checking secondary provider...");
  }

  // ─────────────────────────────────────────────
  // 2. SECONDARY FALLBACK: Gmail SMTP (Nodemailer)
  // ─────────────────────────────────────────────
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
        setTimeout(() => reject(new Error("SMTP connection timed out after 10000ms (likely blocked outbound port on host)")), 10000)
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

  if (!resend && !transporter) {
    console.warn("⚠️ No email provider configured on server (RESEND_API_KEY or EMAIL_USER/EMAIL_PASS missing).");
    lastError = "No email provider configured on server";
  }

  if (returnDetails) {
    return {
      success: false,
      provider: providerUsed || "None",
      error: lastError || "Email dispatch failed across configured providers",
    };
  }

  return false;
}

// Format items list into HTML table rows
const formatItemsTable = (items = []) => {
  return items
    .map(
      (item) => `
      <tr style="border-bottom: 1px solid #f0f0f0;">
        <td style="padding: 10px 8px; font-size: 14px; color: #222;">
          <strong>${item.name || "Product"}</strong>
          <span style="color: #777; font-size: 12px; display: block;">${item.size || "1 KG"}</span>
        </td>
        <td style="padding: 10px 8px; font-size: 14px; text-align: center; color: #555;">${item.quantity || 1}</td>
        <td style="padding: 10px 8px; font-size: 14px; text-align: right; color: #111; font-weight: 600;">Rs. ${(item.price || 0) * (item.quantity || 1)}</td>
      </tr>
    `
    )
    .join("");
};

/**
 * 1. Send Order Confirmation Email to Customer
 */
async function sendCustomerOrderEmail(order) {
  try {
    if (!order.customerEmail) {
      console.log(`ℹ️ Customer email not provided for order ${order.orderNumber}. Skipping customer notification.`);
      return false;
    }

    const addressStr = `${order.address?.street || ""}, ${order.address?.city || ""}, ${order.address?.province || ""}`.replace(/^, |, $/g, "");

    const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #10b981 0%, #047857 100%); padding: 24px; text-align: center; color: #ffffff;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.5px;">HADEED BY NIAZI</h1>
          <p style="margin: 8px 0 0; font-size: 15px; opacity: 0.95;">Shukriya! Aapka Order Receive Ho Gaya Hai 🎉</p>
        </div>

        <div style="padding: 24px;">
          <p style="font-size: 15px; color: #374151; margin-top: 0;">
            Assalam-o-Alaikum <strong>${order.customerName}</strong>,
          </p>
          <p style="font-size: 14px; color: #4b5563; line-height: 1.6;">
            Aapka order kamyabi ke sath record kar liya gaya hai. Hamari team jald hi aapka order pack karke rawana karegi.
          </p>

          <div style="background: #f9fafb; border-radius: 6px; padding: 14px 18px; margin: 20px 0; border-left: 4px solid #10b981;">
            <p style="margin: 3px 0; font-size: 14px; color: #374151;"><strong>Order Number:</strong> <span style="color: #047857; font-weight: 700;">${order.orderNumber}</span></p>
            <p style="margin: 3px 0; font-size: 14px; color: #374151;"><strong>Status:</strong> <span style="text-transform: capitalize; background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 12px;">${order.status || "Pending"}</span></p>
            <p style="margin: 3px 0; font-size: 14px; color: #374151;"><strong>Delivery Address:</strong> ${addressStr || "Provided by customer"}</p>
            <p style="margin: 3px 0; font-size: 14px; color: #374151;"><strong>Phone:</strong> ${order.customerPhone || "N/A"}</p>
          </div>

          <h3 style="font-size: 16px; color: #111827; margin: 20px 0 10px; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px;">Order Summary</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
            <thead>
              <tr style="background: #f3f4f6; color: #4b5563; text-align: left; font-size: 12px; text-transform: uppercase;">
                <th style="padding: 8px;">Item</th>
                <th style="padding: 8px; text-align: center;">Qty</th>
                <th style="padding: 8px; text-align: right;">Price</th>
              </tr>
            </thead>
            <tbody>
              ${formatItemsTable(order.items)}
            </tbody>
          </table>

          <div style="text-align: right; margin-top: 10px; font-size: 14px; color: #4b5563;">
            <p style="margin: 4px 0;">Subtotal: <strong>Rs. ${order.subtotal || 0}</strong></p>
            <p style="margin: 4px 0;">Delivery: <strong>${order.deliveryCharge === 0 ? "FREE" : "Rs. " + (order.deliveryCharge || 0)}</strong></p>
            <p style="margin: 6px 0; font-size: 16px; color: #111827; font-weight: 700;">Total Amount: <span style="color: #047857;">Rs. ${order.totalAmount}</span></p>
          </div>

          <div style="margin-top: 28px; padding-top: 18px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 13px;">
            <p style="margin: 4px 0;">Aap apna order hamari website par kisi bhi waqt track kar sakte hain.</p>
            <p style="margin: 4px 0;">Kisi bhi sawal ya madad ke liye rabta karein: <strong>hadeedbyniazii@gmail.com</strong></p>
          </div>
        </div>
      </div>
    `;

    return await sendEmail({
      to: order.customerEmail,
      subject: `Order Confirmed: ${order.orderNumber} - Hadeed by Niazi`,
      html,
    });
  } catch (err) {
    console.error("❌ Error sending customer order email:", err.message);
    return false;
  }
}

/**
 * 2. Send New Order Alert to Admin
 */
async function sendAdminNewOrderAlert(order) {
  try {
    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.EMAIL_USER || "hadeedbyniazii@gmail.com";
    const addressStr = `${order.address?.street || ""}, ${order.address?.city || ""}, ${order.address?.province || ""}`.replace(/^, |, $/g, "");

    const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
        <div style="background: #1e293b; padding: 20px; text-align: center; color: #ffffff;">
          <h2 style="margin: 0; font-size: 20px;">🚨 Naya Order Receive Hua Hai!</h2>
          <p style="margin: 6px 0 0; font-size: 14px; opacity: 0.9;">Order: <strong>${order.orderNumber}</strong> | Total: <strong>Rs. ${order.totalAmount}</strong></p>
        </div>

        <div style="padding: 24px;">
          <h3 style="font-size: 15px; color: #111827; margin: 0 0 12px; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px;">Customer Details</h3>
          <p style="margin: 4px 0; font-size: 14px; color: #374151;"><strong>Name:</strong> ${order.customerName}</p>
          <p style="margin: 4px 0; font-size: 14px; color: #374151;"><strong>Phone:</strong> <a href="tel:${order.customerPhone}" style="color: #2563eb; text-decoration: none;">${order.customerPhone}</a></p>
          <p style="margin: 4px 0; font-size: 14px; color: #374151;"><strong>Email:</strong> ${order.customerEmail || "Not provided"}</p>
          <p style="margin: 4px 0; font-size: 14px; color: #374151;"><strong>Address:</strong> ${addressStr}</p>
          ${order.customerNote ? `<p style="margin: 4px 0; font-size: 14px; color: #b45309; background: #fef3c7; padding: 8px; border-radius: 4px;"><strong>Customer Note:</strong> ${order.customerNote}</p>` : ""}

          <h3 style="font-size: 15px; color: #111827; margin: 20px 0 12px; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px;">Ordered Items</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
            <thead>
              <tr style="background: #f3f4f6; color: #4b5563; text-align: left; font-size: 12px;">
                <th style="padding: 8px;">Item</th>
                <th style="padding: 8px; text-align: center;">Qty</th>
                <th style="padding: 8px; text-align: right;">Price</th>
              </tr>
            </thead>
            <tbody>
              ${formatItemsTable(order.items)}
            </tbody>
          </table>

          <div style="text-align: right; margin-top: 10px; font-size: 14px; color: #374151;">
            <p style="margin: 4px 0;">Subtotal: <strong>Rs. ${order.subtotal || 0}</strong></p>
            <p style="margin: 4px 0;">Delivery: <strong>Rs. ${order.deliveryCharge || 0}</strong></p>
            <p style="margin: 6px 0; font-size: 16px; font-weight: 700; color: #047857;">Total: Rs. ${order.totalAmount}</p>
          </div>

          <div style="margin-top: 24px; text-align: center;">
            <p style="font-size: 13px; color: #6b7280;">Aap Admin Dashboard par ja kar order ko process kar sakte hain.</p>
          </div>
        </div>
      </div>
    `;

    return await sendEmail({
      to: adminEmail,
      subject: `🚨 Naya Order: ${order.orderNumber} - Rs. ${order.totalAmount} (${order.customerName})`,
      html,
    });
  } catch (err) {
    console.error("❌ Error sending admin order alert:", err.message);
    return false;
  }
}

/**
 * 3. Send Status Update Email to Customer
 */
async function sendCustomerStatusUpdateEmail(order, newStatus) {
  try {
    if (!order.customerEmail) {
      console.log(`ℹ️ No customer email for order ${order.orderNumber}. Skipping status notification.`);
      return false;
    }

    const statusDetails = {
      pending: { title: "Order Pending", color: "#f59e0b", desc: "Aapka order receive ho chuka hai aur pending verification hai." },
      confirmed: { title: "Order Confirmed", color: "#3b82f6", desc: "Aapka order confirm ho gaya hai aur packing start ho chuki hai." },
      processing: { title: "Order Processing", color: "#8b5cf6", desc: "Aapka parcel pack ho raha hai." },
      shipped: { title: "Order Shipped (Rawana ho gaya)", color: "#06b6d4", desc: "Aapka order courier service ko hand over kar diya gaya hai." },
      delivered: { title: "Order Delivered 🎉", color: "#10b981", desc: "Aapka order kamyabi se deliver ho gaya hai. Hadeed by Niazi choose karne ka shukriya!" },
      cancelled: { title: "Order Cancelled", color: "#ef4444", desc: "Aapka order cancel kar diya gaya hai. Agar koi issue ho toh humse rabta karein." },
    };

    const currentDetail = statusDetails[newStatus.toLowerCase()] || {
      title: `Status: ${newStatus}`,
      color: "#3b82f6",
      desc: `Aapke order ka status ab "${newStatus}" update ho chuka hai.`,
    };

    const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
        <div style="background: ${currentDetail.color}; padding: 24px; text-align: center; color: #ffffff;">
          <h1 style="margin: 0; font-size: 22px; font-weight: 700;">HADEED BY NIAZI</h1>
          <p style="margin: 8px 0 0; font-size: 15px; opacity: 0.95;">${currentDetail.title}</p>
        </div>

        <div style="padding: 24px;">
          <p style="font-size: 15px; color: #374151; margin-top: 0;">
            Assalam-o-Alaikum <strong>${order.customerName}</strong>,
          </p>
          <p style="font-size: 14px; color: #4b5563; line-height: 1.6;">
            ${currentDetail.desc}
          </p>

          <div style="background: #f9fafb; border-radius: 6px; padding: 14px 18px; margin: 20px 0; border-left: 4px solid ${currentDetail.color};">
            <p style="margin: 3px 0; font-size: 14px; color: #374151;"><strong>Order Number:</strong> ${order.orderNumber}</p>
            <p style="margin: 3px 0; font-size: 14px; color: #374151;"><strong>New Status:</strong> <span style="font-weight: 700; color: ${currentDetail.color}; text-transform: uppercase;">${newStatus}</span></p>
            ${order.courier ? `<p style="margin: 3px 0; font-size: 14px; color: #374151;"><strong>Courier:</strong> ${order.courier}</p>` : ""}
            ${order.trackingNumber ? `<p style="margin: 3px 0; font-size: 14px; color: #374151;"><strong>Tracking Number:</strong> <strong>${order.trackingNumber}</strong></p>` : ""}
            <p style="margin: 3px 0; font-size: 14px; color: #374151;"><strong>Total Amount:</strong> Rs. ${order.totalAmount}</p>
          </div>

          <div style="margin-top: 24px; padding-top: 18px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 13px;">
            <p style="margin: 4px 0;">Kisi bhi sawal ke liye rabta karein: <strong>hadeedbyniazii@gmail.com</strong></p>
          </div>
        </div>
      </div>
    `;

    return await sendEmail({
      to: order.customerEmail,
      subject: `Order Update [${currentDetail.title}]: ${order.orderNumber} - Hadeed by Niazi`,
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
