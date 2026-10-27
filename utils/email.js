const { Resend } = require("resend");
const nodemailer = require("nodemailer");

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
  });
};

/**
 * Universal email sender function:
 * 1. Prefers Resend API if RESEND_API_KEY is available.
 * 2. Falls back to Nodemailer (Gmail SMTP) if Resend is not configured.
 */
async function sendEmail({ to, subject, html }) {
  const resend = getResend();

  // Option A: Send via Resend
  if (resend) {
    try {
      const fromEmail = process.env.RESEND_FROM_EMAIL || "Hadeed by Niazi <onboarding@resend.dev>";
      const result = await resend.emails.send({
        from: fromEmail,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
      });

      if (result.error) {
        console.error("❌ Resend error:", result.error);
        return false;
      }

      console.log(`✅ Email sent via Resend to ${to} (ID: ${result.data?.id})`);
      return true;
    } catch (err) {
      console.error("❌ Resend dispatch error:", err.message);
      return false;
    }
  }

  // Option B: Send via Nodemailer (Gmail)
  const transporter = createNodemailerTransporter();
  if (transporter) {
    try {
      const fromEmail = process.env.EMAIL_USER;
      await transporter.sendMail({
        from: `"Hadeed by Niazi" <${fromEmail}>`,
        to,
        subject,
        html,
      });
      console.log(`✅ Email sent via Gmail SMTP to ${to}`);
      return true;
    } catch (err) {
      console.error("❌ Gmail SMTP dispatch error:", err.message);
      return false;
    }
  }

  console.warn("⚠️ No email service configured (Neither RESEND_API_KEY nor EMAIL_USER/PASS found).");
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
  sendCustomerOrderEmail,
  sendAdminNewOrderAlert,
  sendCustomerStatusUpdateEmail,
};
