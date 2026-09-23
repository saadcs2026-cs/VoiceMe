import { db, storage } from './firebase-config.js';
import { collection, adddoc, getdocs, query, where, deleteDoc, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

document.addEventListener("DOMContentLoaded", () => {
  const activeFamilyCode = localStorage.getItem("voicecare_family_code");

  if (activeFamilyCode) {
    showDashboard(activeFamilyCode);
  } else {
    showSetup();
  }

  // Setup Flow elements
  const numEldersInput = document.getElementById("numElders");
  const generateElderInputsBtn = document.getElementById("generateElderInputsBtn");
  const elderNamesContainer = document.getElementById("elderNamesContainer");
  const createFamilyForm = document.getElementById("createFamilyForm");

  if (generateElderInputsBtn) {
    generateElderInputsBtn.addEventListener("click", () => {
      const count = parseInt(numEldersInput.value) || 1;
      elderNamesContainer.innerHTML = "";
      for (let i = 1; i <= count; i++) {
        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = `Name of Elder ${i} (e.g. Grandma)`;
        input.required = true;
        input.className = "elder-name-input";
        elderNamesContainer.appendChild(input);
      }
      document.getElementById("elderNamesStep").classList.remove("hidden");
    });
  }

  if (createFamilyForm) {
    createFamilyForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const nameInputs = document.querySelectorAll(".elder-name-input");
      const elderNames = Array.from(nameInputs).map(input => input.value.trim()).filter(Boolean);

      if (elderNames.length === 0) return alert("Please enter at least one elder name.");

      const familyCode = Math.random().toString(36.substring(2, 8)).toUpperCase();
      
      // Save to Firebase
      await setDoc(doc(db, "families", familyCode), {
        elders: elderNames,
        createdAt: new Date().toISOString()
      });

      localStorage.setItem("voicecare_family_code", familyCode);
      showDashboard(familyCode);
    });
  }

  // Switch family button
  const switchBtn = document.getElementById("switchFamilyBtn");
  if (switchBtn) {
    switchBtn.addEventListener("click", () => {
      if (confirm("Switch family or create a new one?")) {
        localStorage.removeItem("voicecare_family_code");
        location.reload();
      }
    });
  }
});

function showSetup() {
  document.getElementById("setupSection").classList.remove("hidden");
  document.getElementById("dashboardSection").classList.add("hidden");
  document.getElementById("headerCodeArea").classList.add("hidden");
}

async function showDashboard(familyCode) {
  document.getElementById("setupSection").classList.add("hidden");
  document.getElementById("dashboardSection").classList.remove("hidden");
  document.getElementById("headerCodeArea").classList.remove("hidden");
  document.getElementById("displayFamilyCode").innerText = familyCode;

  // Load Elders into Select Dropdown
  const familyDoc = await getDoc(doc(db, "families", familyCode));
  const elderSelect = document.getElementById("targetElderSelect");
  
  let elders = [];
  if (familyDoc.exists()) {
    elders = familyDoc.data().elders || [];
    elderSelect.innerHTML = elders.map(name => `<option value="${name}">${name}</option>`).join("");
  }

  // Initialize Voice Recorder
  setupVoiceRecorder(familyCode);
  loadReminders(familyCode);
}

let mediaRecorder;
let audioChunks = [];
let audioBlob = null;

function setupVoiceRecorder(familyCode) {
  const recordBtn = document.getElementById("recordBtn");
  const recTimer = document.getElementById("recTimer");
  const recPreview = document.getElementById("recPreview");
  const reminderForm = document.getElementById("reminderForm");

  let timerInterval;
  let seconds = 0;

  recordBtn.onmousedown = recordBtn.ontouchstart = async () => {
    audioChunks = [];
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    
    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.onstop = () => {
      audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      recPreview.src = URL.createObjectURL(audioBlob);
      recPreview.classList.remove("hidden");
    };

    mediaRecorder.start();
    recordBtn.classList.add("recording");
    recordBtn.innerText = "🔴 Recording... Release to Stop";
    
    seconds = 0;
    timerInterval = setInterval(() => {
      seconds++;
      let m = Math.floor(seconds / 60).toString().padStart(2, '0');
      let s = (seconds % 60).toString().padStart(2, '0');
      recTimer.innerText = `${m}:${s}`;
    }, 1000);
  };

  recordBtn.onmouseup = recordBtn.ontouchend = () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      clearInterval(timerInterval);
      recordBtn.classList.remove("recording");
      recordBtn.innerText = "🎙️ Hold to Record Voice Message";
    }
  };

  reminderForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!audioBlob) return alert("Please record a voice message first!");

    const medicine = document.getElementById("medName").value;
    const time = document.getElementById("medTime").value;
    const targetElder = document.getElementById("targetElderSelect").value;
    const saveBtn = document.getElementById("saveReminderBtn");

    saveBtn.innerText = "Saving to Cloud...";
    saveBtn.disabled = true;

    // Upload Audio to Firebase Storage
    const audioRef = ref(storage, `reminders/${familyCode}/${Date.now()}.webm`);
    await uploadBytes(audioRef, audioBlob);
    const audioUrl = await getDownloadURL(audioRef);

    // Save Reminder Meta to Firestore
    await addDoc(collection(db, "reminders"), {
      familyCode,
      targetElder,
      medicine,
      time,
      audioUrl,
      status: "pending",
      createdAt: new Date().toISOString()
    });

    saveBtn.innerText = "✨ Save & Schedule Reminder";
    saveBtn.disabled = false;
    reminderForm.reset();
    recPreview.classList.add("hidden");
    audioBlob = null;
    recTimer.innerText = "00:00";

    loadReminders(familyCode);
  };
}

async function loadReminders(familyCode) {
  const listEl = document.getElementById("reminderList");
  const q = query(collection(db, "reminders"), where("familyCode", "==", familyCode));
  const querySnapshot = await getDocs(q);

  listEl.innerHTML = "";
  if (querySnapshot.empty) {
    listEl.innerHTML = `<p style="color:#64748b; text-align:center; font-size:0.9rem;">No reminders active yet.</p>`;
    return;
  }

  querySnapshot.forEach((reminderDoc) => {
    const data = reminderDoc.data();
    const li = document.createElement("li");
    li.className = "reminder-pill-card";
    li.innerHTML = `
      <div class="reminder-info">
        <h4>💊 ${data.medicine} <span style="font-size:0.8rem; color:#4f46e5; background:#eef2ff; padding:2px 8px; border-radius:6px;">For: ${data.targetElder}</span></h4>
        <p>⏰ Scheduled for: <strong>${data.time}</strong></p>
        <audio controls src="${data.audioUrl}" style="height:35px; margin-top:8px;"></audio>
      </div>
      <button class="delete-btn" data-id="${reminderDoc.id}">Delete</button>
    `;

    li.querySelector(".delete-btn").onclick = async () => {
      if (confirm("Delete this reminder?")) {
        await deleteDoc(doc(db, "reminders", reminderDoc.id));
        loadReminders(familyCode);
      }
    };

    listEl.appendChild(li);
  });
}
