// Import Firebase SDKs (Using CDN modular approach)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// TODO: Replace with your actual Firebase project config credentials
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// Global variables for recording
let mediaRecorder;
let audioChunks = [];
let audioBlob = null;

document.addEventListener("DOMContentLoaded", () => {
  // 1. Voice Recording Logic
  const recordBtn = document.getElementById("recordBtn");
  const recTimer = document.getElementById("recTimer");
  const audioPlayback = document.getElementById("audioPlayback");

  if (recordBtn) {
    let recording = false;
    let timerInterval;
    let seconds = 0;

    recordBtn.addEventListener("click", async () => {
      if (!recording) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          mediaRecorder = new MediaRecorder(stream);
          audioChunks = [];

          mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
          };

          mediaRecorder.onstop = () => {
            audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
            const audioUrl = URL.createObjectURL(audioBlob);
            if (audioPlayback) {
              audioPlayback.src = audioUrl;
              audioPlayback.classList.remove("hidden");
            }
          };

          mediaRecorder.start();
          recording = true;
          recordBtn.textContent = "🛑 Stop Recording";
          recordBtn.classList.add("recording");

          // Start timer
          seconds = 0;
          if (recTimer) recTimer.textContent = "00:00";
          timerInterval = setInterval(() => {
            seconds++;
            let mins = Math.floor(seconds / 60).toString().padStart(2, '0');
            let secs = (seconds % 60).toString().padStart(2, '0');
            if (recTimer) recTimer.textContent = `${mins}:${secs}`;
          }, 1000);

        } catch (err) {
          alert("Microphone permission denied or not supported on this browser.");
          console.error(err);
        }
      } else {
        mediaRecorder.stop();
        recording = false;
        recordBtn.textContent = "🎙️ Record Voice Note";
        recordBtn.classList.remove("recording");
        clearInterval(timerInterval);
      }
    });
  }

  // 2. Form Submission & Firebase Upload Logic
  const reminderForm = document.getElementById("reminderForm");
  if (reminderForm) {
    reminderForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const medicineName = document.getElementById("medName").value;
      const reminderTime = document.getElementById("medTime").value;

      if (!audioBlob) {
        alert("Please record a voice note first!");
        return;
      }

      const submitBtn = reminderForm.querySelector("button[type='submit']");
      submitBtn.textContent = "Uploading & Saving...";
      submitBtn.disabled = true;

      try {
        // Upload audio blob to Firebase Storage
        const fileName = `voice-notes/${Date.now()}.mp3`;
        const storageRef = ref(storage, fileName);
        await uploadBytes(storageRef, audioBlob);
        const audioUrl = await getDownloadURL(storageRef);

        // Save metadata into Firestore Database
        await addDoc(collection(db, "reminders"), {
          medicineName,
          reminderTime,
          audioUrl,
          createdAt: new Date().toISOString()
        });

        alert("Reminder successfully created!");
        reminderForm.reset();
        if (audioPlayback) audioPlayback.classList.add("hidden");
        audioBlob = null;
        
        // Reload list if function exists
        if (typeof loadReminders === 'function') loadReminders();

      } catch (error) {
        console.error("Error saving reminder: ", error);
        alert("Failed to save reminder. Check console for details.");
      } finally {
        submitBtn.textContent = "Save Reminder";
        submitBtn.disabled = false;
      }
    });
  }

  // Initial load execution if on dashboard
  if (typeof loadReminders === 'function') {
    loadReminders();
  }
});
