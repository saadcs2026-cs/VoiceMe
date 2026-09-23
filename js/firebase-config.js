// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { getMessaging, isSupported } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js";

// ⬇️ REPLACE ALL VALUES with yours from the Firebase Console (Step 4 of guide)
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);

export { app };
export const db = getFirestore(app);
export const storage = getStorage(app);

// Messaging is not supported on some browsers (e.g. iOS in normal Safari tab),
// so we only create it when supported.
let messaging = null;
export async function getMessagingIfSupported() {
  if (messaging) return messaging;
  if (await isSupported()) messaging = getMessaging(app);
  return messaging;
}
