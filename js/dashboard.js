// js/dashboard.js
import { db, storage } from "./firebase-config.js";
import {
  collection, doc, addDoc, deleteDoc, onSnapshot, query, where,
  serverTimestamp, setDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const FAMILY_KEY = "voicecare_family_code";

// ---------- UI refs ----------
const joinSection = document.getElementById("joinSection");
const dashboardSection = document.getElementById("dashboardSection");
const familyCodeEl = document.getElementById("familyCode");
const joinCodeInput = document.getElementById("joinCode");
const joinBtn = document.getElementById("joinBtn");
const createFamilyBtn = document.getElementById("createFamilyBtn");
const joinError = document.getElementById("joinError");
const medName = document.getElementById("medName");
const medTime = document.getElementById("medTime");
const recordBtn = document.getElementById("recordBtn");
const recTimer = document.getElementById("recTimer");
const recStatus = document.getElementById("recStatus");
const recPreview = document.getElementById("recPreview");
const saveBtn = document.getElementById("saveBtn");
const saveStatus = document.getElementById("saveStatus");
const reminderList = document.getElementById("reminderList");
const copyCodeBtn = document.getElementById("copyCodeBtn");
const switchFamilyBtn = document.getElementById("switchFamilyBtn");

// ---------- Session / family handling ----------
let familyCode = null;
let unsubscribeReminders = null;

function loadFamily() { return localStorage.getItem(FAMILY_KEY); }

function saveFamily(code) {
  familyCode = code;
  localStorage.setItem(FAMILY_KEY, code);
}

function clearFamily() {
  familyCode = null;
  localStorage.removeItem(FAMILY_KEY);
  if (unsubscribeReminders) { unsubscribeReminders(); unsubscribeReminders = null; }
}

function generateFamilyCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing 0/O/1/I
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function showDashboard() {
  familyCodeEl.textContent = familyCode;
  joinSection.classList.add("hidden");
  dashboardSection.classList.remove("hidden");
  subscribeReminders();
}

function showJoin() {
  dashboardSection.classList.add("hidden");
  joinSection.classList.remove("hidden");
}

async function createFamily() {
  const code = generateFamilyCode();
  const fref = doc(db, "families", code);
  const snap = await getDoc(fref);
  if (snap.exists()) return createFamily(); // collision (very rare) — retry
  await setDoc(fref, { createdAt: serverTimestamp() });
  saveFamily(code);
  showDashboard();
}

async function joinFamily() {
  const code = joinCodeInput.value.trim().toUpperCase();
  joinError.textContent = "";
  if (code.length !== 6) { joinError.textContent = "Code must be 6 characters."; return; }
  const snap = await getDoc(doc(db, "families", code));
  if (!snap.exists()) { joinError.textContent = "Family code not found. Check with your family."; return; }
  saveFamily(code);
  joinCodeInput.value = "";
  showDashboard();
}

// ---------- Realtime reminders (scoped to family only) ----------
function subscribeReminders() {
  if (unsubscribeReminders) unsubscribeReminders();
  const q = query(collection(db, "reminders"), where("familyCode", "==", familyCode));
  unsubscribeReminders = onSnapshot(q, (snap) => {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.reminderTime || "").localeCompare(b.reminderTime || ""));
    reminderList.innerHTML = "";
    if (items.length === 0) {
      reminderList.innerHTML = '<li class="muted">No reminders yet. Add one on the left.</li>';
    }
    items.forEach(item => {
      const li = document.createElement("li");
      li.innerHTML = `
        <span class="med">💊 ${escapeHtml(item.medicineName)} @ ${item.reminderTime}</span>
        <span class="badge ${item.status}">${item.status}</span>
        <button class="btn delete">Delete</button>`;
      li.querySelector(".delete").onclick = () => deleteDoc(doc(db, "reminders", item.id));
      reminderList.appendChild(li);
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// ---------- Voice recording ----------
let mediaRecorder = null;
let audioBlob = null;
let timerInterval = null;

recordBtn.addEventListener("click", async () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    const chunks = [];
    mediaRecorder.ondataavailable = e => chunks.push(e.data);
    mediaRecorder.onstop = () => {
      audioBlob = new Blob(chunks, { type: mediaRecorder.mimeType || "audio/webm" });
      recPreview.src = URL.createObjectURL(audioBlob);
      recPreview.classList.remove("hidden");
      clearInterval(timerInterval);
      recordBtn.classList.remove("recording");
      recordBtn.textContent = "🎙️ Record Again";
      recStatus.textContent = "✅ Recording ready — press play to check it.";
      stream.getTracks().forEach(t => t.stop());
    };
    mediaRecorder.start();
    recordBtn.classList.add("recording");
    recordBtn.textContent = "⏹️ Stop";
    recStatus.textContent = "🔴 Recording...";
    let seconds = 0;
    recTimer.textContent = "00:00";
    timerInterval = setInterval(() => {
      seconds++;
      recTimer.textContent =
        String(Math.floor(seconds / 60)).padStart(2, "0") + ":" +
        String(seconds % 60).padStart(2, "0");
      if (seconds >= 30) mediaRecorder.stop();
    }, 1000);
  } catch (err) {
    recStatus.textContent = "❌ Microphone permission denied.";
  }
});

// ---------- Save reminder ----------
saveBtn.addEventListener("click", async () => {
  const name = medName.value.trim();
  const time = medTime.value;
  saveStatus.textContent = "";

  if (!name || !time) { saveStatus.textContent = "❌ Enter medicine name and time."; return; }
  if (!audioBlob) { saveStatus.textContent = "❌ Please record a voice note first."; return; }

  saveBtn.disabled = true;
  saveStatus.textContent = "⏳ Uploading voice note...";

  try {
    const path = `voice-notes/${familyCode}/${Date.now()}-note.webm`;
    await uploadBytes(ref(storage, path), audioBlob);
    const audioUrl = await getDownloadURL(ref(storage, path));

    await addDoc(collection(db, "reminders"), {
      familyCode,
      medicineName: name,
      reminderTime: time,
      audioUrl,
      audioPath: path,
      status: "pending",
      createdAt: serverTimestamp()
    });

    saveStatus.textContent = "✅ Reminder saved! It will ring on the elder's device.";
    medName.value = "";
    medTime.value = "";
    audioBlob = null;
    recPreview.classList.add("hidden");
    recPreview.removeAttribute("src");
    recStatus.textContent = "";
    recTimer.textContent = "00:00";
    recordBtn.textContent = "🎙️ Record";
  } catch (err) {
    saveStatus.textContent = "❌ Save failed: " + err.message;
  } finally {
    saveBtn.disabled = false;
  }
});

// ---------- Wire up ----------
joinBtn.addEventListener("click", joinFamily);
createFamilyBtn.addEventListener("click", () => createFamily().catch(e => joinError.textContent = e.message));
copyCodeBtn.addEventListener("click", () => navigator.clipboard.writeText(familyCode));
switchFamilyBtn.addEventListener("click", () => {
  if (confirm("Leave this family and join another? This device will forget the current family.")) {
    clearFamily();
    showJoin();
  }
});

if (loadFamily()) showDashboard(); else showJoin();
