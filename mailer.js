'use strict';
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// 日志文件路径，跟随 DATA_DIR（Railway 上挂载到 /data）
const LOG_DIR = process.env.DATA_DIR || __dirname;
const LOG_FILE = path.join(LOG_DIR, 'mail.log');

function writeLog(entry) {
  const line = JSON.stringify(entry) + '\n';
  try {
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch (e) {
    console.error('[MAIL LOG] 写日志失败:', e.message);
  }
}

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
  const base = {
    time: new Date().toISOString(),
    to,
    subject,
    attachments: attachments.map(a => a.filename),
    smtp_host: process.env.SMTP_HOST || '(unset)',
    smtp_user: process.env.SMTP_USER || '(unset)',
    smtp_port: process.env.SMTP_PORT || '(unset)',
  };

  if (!isConfigured()) {
    console.log(`[MAIL FALLBACK] To: ${to} | Subject: ${subject}`);
    writeLog({ ...base, status: 'fallback', reason: 'SMTP env vars not set' });
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
    family: 4,                 // 强制 IPv4（Railway 不支持 IPv6）
    connectionTimeout: 10000,  // 10秒连接超时
    greetingTimeout: 10000,    // 10秒握手超时
    socketTimeout: 30000,      // 30秒传输超时
  });

  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
      attachments,
    });
    writeLog({ ...base, status: 'sent', messageId: info.messageId, response: info.response });
    return info;
  } catch (err) {
    writeLog({ ...base, status: 'error', error: err.message, code: err.code });
    throw err;
  }
}

module.exports = { sendMail, isConfigured };
