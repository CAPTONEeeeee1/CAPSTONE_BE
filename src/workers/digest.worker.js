const cron = require('node-cron');
const { prisma } = require('../shared/prisma');
const { sendEmail } = require('../services/email.service');

/**
 * Generates the HTML content for a digest email.
 * @param {string} userName - The full name of the user.
 * @param {Array<object>} notifications - A list of notification objects.
 * @returns {string} The HTML string for the email body.
 */
function getDigestEmailTemplate(userName, notifications) {
  const notificationItems = notifications.map(n => 
    `<li>
      <strong>${n.title}</strong>: ${n.message}
      <br>
      <small style="color:#666;">${new Date(n.createdAt).toLocaleString('vi-VN')}</small>
    </li>`
  ).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
        ul { list-style-type: none; padding: 0; }
        li { margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #eee; }
        li:last-child { border-bottom: none; }
        .footer { margin-top: 20px; font-size: 12px; color: #777; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>Xin chào ${userName},</h2>
        <p>Đây là bản tin tóm tắt các thông báo gần đây của bạn trên PlanNex:</p>
        <ul>
          ${notificationItems}
        </ul>
        <div class="footer">
          <p>Bạn nhận được email này vì bạn đã bật tính năng email tổng hợp trong cài đặt thông báo của mình.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Checks if it's time to send a digest based on frequency and last sent time.
 * @param {string} frequency - 'HOURLY', 'DAILY', 'WEEKLY'.
 * @param {Date|null} lastSentAt - The timestamp of the last sent digest.
 * @param {Date} now - The current time.
 * @returns {boolean}
 */
function isTimeToSend(frequency, lastSentAt, now) {
  if (!lastSentAt) {
    return true; // Send immediately if it's the first time.
  }
  const diffInMs = now.getTime() - lastSentAt.getTime();
  const diffInHours = diffInMs / (1000 * 60 * 60);

  switch (frequency) {
    case 'HOURLY':
      return diffInHours >= 1;
    case 'DAILY':
      return diffInHours >= 24;
    case 'WEEKLY':
      return diffInHours >= 24 * 7;
    default:
      return false;
  }
}

/**
 * The main function for the digest worker.
 * Fetches users who need a digest, gathers their notifications, and sends emails.
 */
async function processEmailDigests() {
  console.log(`[Digest Worker] Running at ${new Date().toISOString()}`);
  
  const now = new Date();
  
  // 1. Find all users with email digests enabled.
  const settingsToProcess = await prisma.notificationSetting.findMany({
    where: {
      emailDigestEnabled: true,
      emailDigestFrequency: { not: 'NEVER' },
    },
    include: {
      user: true,
    },
  });

  console.log(`[Digest Worker] Found ${settingsToProcess.length} users with digests enabled.`);

  for (const settings of settingsToProcess) {
    const { user, emailDigestFrequency, lastDigestSentAt } = settings;

    // 2. Check if it's time to send the digest for this user.
    if (!isTimeToSend(emailDigestFrequency, lastDigestSentAt, now)) {
      continue; // Skip this user for now.
    }

    console.log(`[Digest Worker] Processing digest for user: ${user.email}`);

    // 3. Gather all new, un-emailed notifications.
    const newNotifications = await prisma.notification.findMany({
      where: {
        receiverId: user.id,
        emailedAt: null, // The crucial filter
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (newNotifications.length === 0) {
      console.log(`[Digest Worker] No new notifications for ${user.email}. Skipping.`);
      continue;
    }

    console.log(`[Digest Worker] Found ${newNotifications.length} new notifications for ${user.email}.`);

    // 4. Generate and send the digest email.
    try {
      const emailHtml = getDigestEmailTemplate(user.fullName, newNotifications);
      await sendEmail({
        to: user.email,
        subject: `📬 Bản tin thông báo của bạn từ PlanNex`,
        html: emailHtml,
      });

      // 5. Update the database after successful sending.
      const notificationIds = newNotifications.map(n => n.id);
      
      await prisma.$transaction([
        // Mark notifications as emailed
        prisma.notification.updateMany({
          where: {
            id: { in: notificationIds },
          },
          data: {
            emailedAt: now,
          },
        }),
        // Update the last sent time for the user
        prisma.notificationSetting.update({
          where: {
            id: settings.id,
          },
          data: {
            lastDigestSentAt: now,
          },
        })
      ]);

      console.log(`[Digest Worker] Successfully sent digest to ${user.email}.`);

    } catch (error) {
      console.error(`[Digest Worker] Failed to send digest to ${user.email}:`, error);
    }
  }
}

/**
 * Schedules the digest worker to run periodically.
 * Runs every 5 minutes.
 */
function scheduleDigestWorker() {
  // We run this every 5 minutes to check. The `isTimeToSend` function ensures
  // that digests are only sent at the correct frequency (e.g., hourly, daily).
  cron.schedule('*/5 * * * *', processEmailDigests);

  console.log('[Cron] Email digest worker scheduled to run every 5 minutes.');
}

module.exports = {
  scheduleDigestWorker,
  processEmailDigests // Export for potential manual triggering
};
