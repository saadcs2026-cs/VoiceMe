// firebase-messaging-sw.js — runs even when elder.html is closed / screen off
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

// ⬇️ SAME config values as js/firebase-config.js
firebase.initializeApp({
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { medicineName, reminderTime, reminderId } = payload.data;
  self.registration.showNotification(
    "💊 Time for your medicine!",
    {
      body: `Please take your ${medicineName} — tap to hear your family's message.`,
      tag: "voicecare-alarm",
      requireInteraction: true,          // stays until user taps it
      vibrate: [500, 200, 500, 200, 500],
      data: { url: "/elder.html?fire=" + reminderId }
    }
  );
});

// Tapping the notification opens the full alarm screen
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
