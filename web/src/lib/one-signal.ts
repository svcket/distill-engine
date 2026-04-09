import { prisma } from './prisma';

/**
 * Sends a push notification via OneSignal.
 * Uses a dynamic require to avoid Turbopack resolution issues in development
 * for the legacy 'onesignal-node' package.
 */
export async function sendPushNotification(userId: string, title: string, message: string, url?: string) {
  try {
    // 1. Fetch user's Push preferences and OneSignal ID
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { preferences: true }
    });

    if (!user || !('oneSignalUserId' in user && user.oneSignalUserId) || !user.preferences?.notifyPush) {
      // console.log(`Push skipped for user ${userId}: Disabled or no ID.`);
      return;
    }

    // 2. Dynamically load OneSignal (Server-side only)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const OneSignal = require('onesignal-node');
    const client = new OneSignal.Client(
      process.env.ONESIGNAL_APP_ID || '',
      process.env.ONESIGNAL_API_KEY || ''
    );

    // 3. Create the notification
    const notification = {
      contents: {
        'en': message,
      },
      headings: {
        'en': title,
      },
      include_external_user_ids: [userId],
      url: url || process.env.NEXT_PUBLIC_APP_URL,
    };

    // 4. Send
    const response = await client.createNotification(notification);
    // console.log(`Push sent to user ${userId}:`, response.body);
    return response;
  } catch (error) {
    console.error(`Failed to send push to user ${userId}:`, error);
  }
}
