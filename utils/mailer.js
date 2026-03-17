/**
 * Email utility for sending invitation emails.
 * Uses nodemailer if available and configured via environment variables:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 *
 * If nodemailer is not installed or SMTP is not configured, this is a no-op.
 */

let transporter = null;

try {
  const nodemailer = require("nodemailer");

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });
  }
} catch (_) {
  // nodemailer not installed — email sending will be silently skipped
}

/**
 * Send an invitation email.
 * @param {string} toEmail
 * @param {string} inviteLink
 * @param {string} branch
 * @param {string} role
 */
async function sendInviteEmail(toEmail, inviteLink, branch, role) {
  if (!transporter) return;

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@example.com";

  await transporter.sendMail({
    from,
    to: toEmail,
    subject: "You've been invited to DOJ-PPA File System",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1e40af;">DOJ-PPA Centralized File System</h2>
        <p>You have been invited to join as <strong>${role}</strong> for branch <strong>${branch}</strong>.</p>
        <p>Click the button below to create your account:</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${inviteLink}" style="background: #2563eb; color: #fff; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: 600;">
            Accept Invitation
          </a>
        </p>
        <p style="color: #6b7280; font-size: 13px;">This link expires in 7 days. If you did not expect this invitation, please ignore this email.</p>
      </div>
    `
  });
}

module.exports = sendInviteEmail;
