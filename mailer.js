'use strict';
const nodemailer = require('nodemailer');

function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/**
 * 发送邮件。若 SMTP 未配置则降级为 console.log，不抛错。
 * @param {string} to - 收件人
 * @param {string} subject - 主题
 * @param {string} html - 正文 HTML
 * @param {Array}  attachments - [{ filename, content: Buffer }]
 */
async function sendMail(to, subject, html, attachments = []) {
  if (!isConfigured()) {
    console.log(`[MAIL FALLBACK] To: ${to} | Subject: ${subject}`);
    if (attachments.length) {
      console.log(`[MAIL FALLBACK] Attachments: ${attachments.map(a => a.filename).join(', ')}`);
    }
    return { fallback: true };
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: parseInt(process.env.SMTP_PORT || '587') === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    html,
    attachments,
  });
}

module.exports = { sendMail, isConfigured };
