// js/elder.js
import { db, app, getMessagingIfSupported } from "./firebase-config.js";
import {
  collection, query, where, onSnapshot, updateDoc, doc, setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getToken, onMessage
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js";

// ⬇️ REPLACE with your VAPID Public Key (guide Step 7)
const VAPID_KEY = "YOUR_VAPID_PUBLIC_KEY";

const FAMILY_KEY = "voicecare_family_code";

const waitingScreen = document.getElementById("waitingScreen");
const alarmOverlay = document.getElementById("alarmOverlay");
const alarmMedicine = document.getElementById("alarmMedicine");
const alarmTime = document.getElementById("alarmTime");
const alarmAudio = document.getElementById("alarmAudio");
const tookItBtn = document.getElementById("tookItBtn");
const liveClock = document.getElementById("liveClock");
const elderFamilyCode = document.getElementById("elderFamilyCode");
const pushStatus = document.getElementById("pushStatus");

let reminders = [];
let activeReminderId = null;
let firedKeys = new Set(); // prevent double-firing within the same minute

// ---- Session handling: bound to the family code saved by the dashboard ----
const familyCode = localStorage.getItem(FAMILY_KEY);
if (!familyCode) {
  waitingScreen.innerHTML =
    '<h1>⚠️ No family code found</h1><p>Open the Family Dashboard first, join/create a family, then come back here.</p>';
} else {
  elderFamilyCode.textContent = familyCode;

  // Realtime listener — this powers the on-screen alarm while the page is open
  const q = query(collection(db, "reminders"), where("familyCode", "==", familyCode));
  onSnapshot(q, snap => {
    reminders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  });

  // Client-side poller (primary while page is open)
  setInterval(checkAlarms, 5000);

  // Register for background push notifications (screen off / app closed)
  registerPush();

  // Foreground push: page is open but in another tab — trigger alarm directly
  const messaging = await getMessagingIfSupported();
  if (messaging) {
    onMessage(messaging, (payload) => {
      const r = reminders.find(x => x.id === payload.data?.reminderId);
      if (r && r.status === "pending") {
        firedKeys.add(`${new Date().toDateString()}-${r.reminderTime}` + r.id);
        triggerAlarm(r);
      }
    });
  }

  // Deep link from notification tap: /elder.html?fire=<reminderId>
  const fireId = new URLSearchParams(location.search).get("fire");
  if (fireId) {
    const tryFire = setInterval(() => {
      const r = reminders.find(x => x.id === fireId && x.status === "pending");
      if (r) { clearInterval(tryFire); triggerAlarm(r); }
    }, 1000);
    setTimeout(() => clearInterval(tryFire), 60000); // give up after 1 min
  }
}

// ---- Push registration: saves this device's FCM token to Firestore ----
async function registerPush() {
  const messaging = await getMessagingIfSupported();
  if (!messaging) {
    pushStatus.textContent = "⚠️ Push notifications not supported on this browser — keep this page open instead.";
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      pushStatus.textContent = "⚠️ Notifications blocked. Enable them in browser settings to get alerts when the page is closed.";
      return;
    }
    const swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
    if (token) {
      // Save device token under this family — the cloud function notifies every
      // registered elder device of this family. Other families never see it.
      await setDoc(doc(db, "families", familyCode, "devices", token), {
        token,
        familyCode,
        updatedAt: serverTimestamp()
      });
      pushStatus.textContent = "🔔 Notifications ready — you'll get alerts even with the screen off!";
    }
  } catch (e) {
    console.error("Push registration failed:", e);
    pushStatus.textContent = "⚠️ Notification setup issue: " + e.message;
  }
}

// ---- Live clock ----
setInterval(() => {
  const now = new Date();
  liveClock.textContent = now.toTimeString().slice(0, 5);
}, 1000);

// ---- Alarm checker ----
function checkAlarms() {
  if (!alarmOverlay.classList.contains("hidden")) return; // alarm already showing
  const now = new Date();
  const hhmm = now.toTimeString().slice(0, 5);
  const minuteKey = `${now.toDateString()}-${hhmm}`;

  for (const r of reminders) {
    if (r.status !== "pending" || !r.audioUrl) continue;
    if (r.reminderTime === hhmm && !firedKeys.has(minuteKey + r.id)) {
      firedKeys.add(minuteKey + r.id);
      triggerAlarm(r);
      break;
    }
  }
}

async function triggerAlarm(reminder) {
  alarmMedicine.textContent = "💊 " + reminder.medicineName;
  alarmTime.textContent = "It is " + reminder.reminderTime + " — time for your medicine!";
  alarmAudio.src = reminder.audioUrl;
  alarmOverlay.classList.remove("hidden");
  activeReminderId = reminder.id;

  // Browser autoplay policy: try autoplay; if blocked, one tap starts it.
  try { await alarmAudio.play(); } catch (_) {
    const start = () => { alarmAudio.play(); document.removeEventListener("click", start); };
    document.addEventListener("click", start);
  }
}

tookItBtn.addEventListener("click", async () => {
  alarmAudio.pause();
  alarmAudio.currentTime = 0;
  alarmOverlay.classList.add("hidden");
  if (activeReminderId) {
    try { await updateDoc(doc(db, "reminders", activeReminderId), { status: "completed" }); }
    catch (e) { console.error("Failed to log compliance:", e); }
  }
  activeReminderId = null;
});
