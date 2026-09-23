// functions/index.js — server-side dispatcher, runs every minute
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

exports.sendDueReminders = onSchedule("every 1 minutes", async () => {
  const now = new Date();
  const hhmm = now.toTimeString().slice(0, 5);
  const db = getFirestore();

  const due = await db.collection("reminders")
    .where("status", "==", "pending")
    .where("reminderTime", "==", hhmm)
    .get();

  for (const r of due.docs) {
    const familyCode = r.data().familyCode;
    const devices = await db.collection(`families/${familyCode}/devices`).get();
    const tokens = devices.docs.map(d => d.data().token).filter(Boolean);
    if (!tokens.length) continue;

    await getMessaging().sendEachForMulticast({
      tokens,
      data: {
        reminderId: r.id,
        medicineName: r.data().medicineName,
        reminderTime: r.data().reminderTime
      },
      webpush: {
        headers: { Urgency: "high" },          // wakes device from screen-off
        notification: { requireInteraction: true }
      }
    });
  }
});
