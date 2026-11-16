import type { NotificationType, Prisma } from "@prisma/client";
import { prisma } from "../db.js";

/**
 * Creates an in-app notification and (best-effort) sends an Expo push message
 * if the user has a registered push token. Push failures never block the
 * request — they're logged and swallowed.
 */
export async function notify(params: {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  data?: Prisma.InputJsonValue;
}): Promise<void> {
  const { userId, type, title, body = "", data } = params;

  await prisma.notification.create({
    data: { userId, type, title, body, data: data ?? undefined },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pushToken: true },
  });

  // Re-checked here as well as on write: rows predating the validation on
  // PUT /auth/push-token could otherwise steer this fetch with arbitrary content.
  if (!user?.pushToken || !/^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,128}\]$/.test(user.pushToken)) return;

  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        to: user.pushToken,
        title,
        body,
        data: { type, ...(data as object | undefined) },
        sound: "default",
      }),
    });
  } catch (err) {
    console.warn("Expo push failed", err);
  }
}
