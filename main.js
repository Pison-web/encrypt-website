// main.js (module) - REPLACE YOUR FILE WITH THIS
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, collection, addDoc, getDocs,
  deleteDoc, query, orderBy, serverTimestamp, where, onSnapshot
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  deleteUser,
  reauthenticateWithCredential,   // ✅ new
  EmailAuthProvider               // new
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";


import { sendEmailVerification } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";


/* ----------------------------
   Firebase config (your project)
   ---------------------------- */
const firebaseConfig = {
  apiKey: "AIzaSyBNp0PBVgtczW5HXK7MbfivIPSgk6w5LqE",
  authDomain: "encrypt-website-b1067.firebaseapp.com",
  projectId: "encrypt-website-b1067",
  storageBucket: "encrypt-website-b1067.appspot.com",
  messagingSenderId: "1035092157297",
  appId: "1:1035092157297:web:ff2b186b957ded99ba0cd0"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

/* ----------------------------
   LIGHT THEME AS DEFAULT (5TH OCT, 2025-11:27pm)
   ---------------------------- */
document.body.classList.add('light-theme');


/* ----------------------------
   Utilities
   ---------------------------- */
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const toast = (msg) => {
  const t = $('#toast');
  if(!t) return alert(msg);
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=> t.classList.remove('show'), 2200);
};
const uid = () => crypto.getRandomValues(new Uint8Array(12)).reduce((a,b)=>a+('0'+b.toString(16)).slice(-2),'');
const nowISO = () => new Date().toISOString();
const esc = (str='') => String(str).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
// Generate initials (e.g., "Pison Lawd Saaboane" → "PS")
function getInitials(fullName = "") {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || "?";
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ----------------------------
   Auth persistence + initial auth ready promise
   ---------------------------- */
let currentUser = null;
let _resolveAuthReady = null;
const authReady = new Promise(res => { _resolveAuthReady = res; });

// Try to set persistence (so anon UID survives reloads)
(async ()=>{
  try { await setPersistence(auth, browserLocalPersistence); }
  catch(e){ console.warn('setPersistence failed (non-fatal):', e); }
})();
/* ----------------------------
   Auto logout after 12 hours of inactivity
   ---------------------------- */
const LOGOUT_TIMEOUT = 6 * 60 * 60 * 1000; // 16 hours in milliseconds

function checkLastActive() {
  const lastActive = localStorage.getItem('encrypt_last_active');
  if (lastActive && Date.now() - parseInt(lastActive) > LOGOUT_TIMEOUT) {
    // Too long since last visit -> auto logout
    if (auth.currentUser) {
      signOut(auth).then(() => {
        localStorage.removeItem('encrypt_last_active');
        toast("Session expired — you’ve been logged out.");
        location.hash = "#/account"; // redirect to login
      });
    }
  } else {
    // Update timestamp
    localStorage.setItem('encrypt_last_active', Date.now().toString());
  }
}

// Check immediately on load
window.addEventListener('load', checkLastActive);

// Update timestamp whenever user interacts
['click', 'mousemove', 'keypress', 'touchstart', 'scroll'].forEach(evt => {
  window.addEventListener(evt, () => {
    localStorage.setItem('encrypt_last_active', Date.now().toString());
  });
});


// Track auth state and resolve initial promise once
onAuthStateChanged(auth, (user) => {
  currentUser = user;

  // 🔹 Show/hide top logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.style.display = user ? 'inline-block' : 'none';
  }

  // 🔹 Optional: Hide “Create Account” card if already signed in
  const createAccountCard = document.querySelector('[onclick="location.hash=\'#/account\'"]');
  if (createAccountCard) {
    createAccountCard.style.display = user ? 'none' : 'block';
  }

  // 🔹 Update KPI when user logs in/out
  const kpi = document.getElementById('kpiMessages');
  if (kpi) {
    if (user) DB.countAll().then((n) => (kpi.textContent = String(n)));
    else kpi.textContent = '0';
  }

    // 🔹 Update KPI for inbox count
  const kpiInboxes = document.getElementById('kpiInboxes');
  if (kpiInboxes) {
    if (user) DB.countInboxes().then((n) => (kpiInboxes.textContent = String(n)));
    else kpiInboxes.textContent = '0';
  }

  // 🔹 Resolve the initial auth promise (only once)
  if (_resolveAuthReady) {
    _resolveAuthReady();
    _resolveAuthReady = null;
  }
});

/* ----------------------------
   DB wrapper using Firestore
   ---------------------------- */
const DB = {
  // ensure signed in (used for createProfile)
  async ensureSignedIn() {
    if(auth.currentUser) return auth.currentUser;
    try {
      const res = await signInAnonymously(auth);
      // wait until onAuthStateChanged runs
      await authReady;
      return auth.currentUser;
    } catch(e) {
      console.error('ensureSignedIn error:', e);
      throw e;
    }
  },

  async createProfile(profileId, name="", secretId) {
  const ownerUid = auth.currentUser?.uid || null;
  if (!ownerUid) throw new Error('No auth uid available');

  // If no name provided, use their account first name if available
  let finalName = name;
  if (!finalName) {
    const userDoc = await getDoc(doc(db, "users", ownerUid));
    if (userDoc.exists()) {
      const d = userDoc.data();
      finalName = `${d.firstName || ''} ${d.lastName || ''}`.trim() || "Anonymous";
    } else {
      finalName = "Anonymous";
    }
  }

  await setDoc(doc(db, "profiles", profileId), {
    id: profileId,
    secret: secretId,
    name: finalName,
    createdAt: serverTimestamp(),
    ownerUid
  });
  return { ownerUid, secret: secretId };
},

  async getProfile(id) {
    const snap = await getDoc(doc(db, "profiles", id));
    if(!snap.exists()) return null;
    const data = snap.data();
    if(data.createdAt && data.createdAt.toDate) data.createdAtISO = data.createdAt.toDate().toISOString();
    return data;
  },

    async listProfilesByOwner() {
    if (!auth.currentUser) return [];
    const q = query(collection(db, "profiles"), where("ownerUid", "==", auth.currentUser.uid));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data());
  },

  // Add a message (anyone can call this)
  async addMessage(id, msg) {
    const profileRef = doc(db, "profiles", id);
    const profileSnap = await getDoc(profileRef);
    if(!profileSnap.exists()) return false;
    await addDoc(collection(profileRef, "messages"), {
      text: msg.text,
      alias: msg.alias || null,
      at: serverTimestamp()
    });
    return true;
  },

  // Get messages: fetch all docs (so older docs missing `at` are included),
  // then use snapshot.createTime or fallback, and sort client-side by date desc.
  async getMessages(id) {
    const msgsRef = collection(doc(db, "profiles", id), "messages");
    const qs = await getDocs(msgsRef);
const items = qs.docs.map(d=>{
  const data = d.data();
  if (!data.at) return null; // skip old messages with no timestamp
  return {
    id: d.id,
    text: data.text,
    alias: data.alias || null,
    at: data.at.toDate().toISOString()
  };
}).filter(Boolean);

    // sort by at desc (newest first)
    items.sort((a,b) => new Date(b.at) - new Date(a.at));
    return items;
  },

  async delMessage(profileId, messageId) {
    await deleteDoc(doc(db, "profiles", profileId, "messages", messageId));
    return true;
  },

  // Count messages only for profiles owned by current user (so public visitors don't see totals)
    async countAll() {
    if(!auth.currentUser) return 0;
    const uid = auth.currentUser.uid;
    const q = query(collection(db, "profiles"), where("ownerUid", "==", uid));
    const ps = await getDocs(q);
    let total = 0;
    for (const p of ps.docs) {
      const msgs = await getDocs(collection(db, "profiles", p.id, "messages"));
      msgs.forEach(m => {
        if (m.data().at) total++;  // only count valid messages
      });
    }
    return total;   // ✅ missing!
  },

  // ✅ Count inboxes created by current user
  async countInboxes() {
    if (!auth.currentUser) return 0;
    const uid = auth.currentUser.uid;
    const q = query(collection(db, "profiles"), where("ownerUid", "==", uid));
    const snap = await getDocs(q);
    return snap.size; // total inboxes
  }
};

/* ----------------------------
   UI / App logic
   ---------------------------- */

/* Theme toggle */
$('#toggleTheme')?.addEventListener('click', ()=>{
  document.body.classList.toggle('light-theme');
  const isLight = document.body.classList.contains('light-theme');
  toast(isLight ? 'Light theme' : 'Dark theme');
});

/* Routing */
async function route(){
  const hash = location.hash.slice(1);
  const [_, view, id] = hash.split('/');
  $$('[data-view]').forEach(v=>v.classList.remove('active'));

  if (view === 'send' && id) {
  $('#view-send').classList.add('active');
  const profileId = id.split('-')[0];

  // 🔹 Wait until Firebase Auth + Firestore are ready before fetching
  await authReady;
  let profile = null;

  try {
    profile = await DB.getProfile(profileId);
  } catch (err) {
    console.warn('Could not load profile:', err);
  }

  if (profile?.name) {
    $('#sendToName').textContent = profile.name;
  } else {
    $('#sendToName').textContent = 'Encrypt user';
  }

  $('#sendLink').value = location.href;
  return;
}

  if(view === 'inbox' && id){
    $('#view-inbox').classList.add('active');
    await renderInbox(id);
    return;
  }
  
    if(view === 'my-inboxes'){
    $('#view-my-inboxes').classList.add('active');
    await renderMyInboxes();
    return;
  }

    if(view === 'account'){
    $('#view-account').classList.add('active');
    initAccountPage(); // 💡 new helper we’ll define next
    return;
  }

  if (view === 'profile') {
  $('#view-profile').classList.add('active');
  await renderProfilePage();
  return;
}


  // default -> home
  $('#view-home').classList.add('active');
  const kpi = $('#kpiMessages');
  if(kpi) kpi.textContent = String(await DB.countAll());

  const kpiInboxes = $('#kpiInboxes'); 
  if (kpiInboxes) kpiInboxes.textContent = String(await DB.countInboxes());

}
window.addEventListener('hashchange', route);

/* Create links */
$('#createLink')?.addEventListener('click', async ()=>{
  if (!auth.currentUser) return toast('Please log in first!');
  if (!auth.currentUser.emailVerified) return toast('Verify your email before creating an inbox.');


  const name = $('#displayName')?.value.trim();
  const profileId = uid();    // public id
  const secretId  = uid();    // private secret

  let profileData;
try {
  profileData = await DB.createProfile(profileId, name, secretId);
} catch(e) {
  toast("Could not create profile — check console.");
  console.error(e);
  return;
}

const inbox = `${location.origin}${location.pathname}#/inbox/${profileId}-${profileData.secret}`;
const send  = `${location.origin}${location.pathname}#/send/${profileId}`;

  const live = $('#livePreview');
  if(live){
    live.innerHTML = `
      <div class="card preview" style="margin:0;">
        <p style="margin:0 0 8px"><strong>Your links</strong></p>
        <div class="copybox" style="margin:6px 0 8px">
          <input class="input" value="${inbox}" readonly>
          <button class="btn small copyInbox">Copy inbox</button>
        </div>
        <div class="copybox">
          <input class="input" value="${send}" readonly>
          <button class="btn small copyPublic">Copy public</button>
        </div>
        <div class="row" style="margin-top:12px">
          <a class="btn secondary" href="${inbox}">Open Inbox</a>
          <a class="btn" href="${send}">Open Public Page</a>
        </div>
      </div>`;

    //Scroll the full "Live Preview" section
const liveCard = document.getElementById("live-preview");
if (liveCard) {
  liveCard.scrollIntoView({ behavior: "smooth", block: "center" });
}   
    live.querySelector('.copyInbox')?.addEventListener('click', ()=>navigator.clipboard.writeText(inbox).then(()=>toast('Inbox link copied')));
    live.querySelector('.copyPublic')?.addEventListener('click', ()=>{
  const message = `💬 Send me an anonymous message via Encrypts: ${send}`;
  navigator.clipboard.writeText(message).then(()=>{
    toast('Public link (with message) copied!');
  });
});
  }

  toast('Your Encrypts links are ready');
  const kpi = $('#kpiMessages'); if(kpi) kpi.textContent = String(await DB.countAll());
});

/* Send page logic (public) */
$('#sendBtn')?.addEventListener('click', async () => {
  const hash = location.hash;
  const match = hash.match(/#\/send\/([^/]+)/);
  const profileId = match ? match[1].split('-')[0] : null;

  const text = $('#msg')?.value.trim();
  const alias = $('#alias')?.value.trim().slice(0, 30);

  if (!profileId) return toast('Invalid link');
  if (!text) return toast('Write a message first');

  const inboxRef = doc(db, "profiles", profileId);
  const inboxSnap = await getDoc(inboxRef);
  if (inboxSnap.exists() && inboxSnap.data().paused) {
  return toast("This inbox is currently paused and not accepting messages.");
}
  const ok = await DB.addMessage(profileId, { text, alias });
  if (!ok) return toast('Inbox not found');

  $('#msg').value = '';
  $('#alias').value = '';
  toast('Message sent anonymously ✅');
});

/* Inbox rendering (owner, now REAL-TIME) */
async function renderInbox(hashId){
  const [profileId, secretId] = hashId.split('-');
  let profile;

  try {
    profile = await DB.getProfile(profileId);
  } catch(e){
    console.error(e);
    toast('Error loading profile');
    return;
  }

  // verify secret
  if(profile.secret !== secretId){
    $('#emptyInbox').textContent = 'Invalid inbox link (secret mismatch)';
    $('#emptyInbox').style.display = 'block';
    return;
  }

  $('#inboxOwner').textContent = profile?.name ? `— ${profile.name}` : '';
  $('#publicLink').value = `${location.origin}${location.pathname}#/send/${profileId}`;

  const list = $('#messagesList');
  list.innerHTML = '';

  // ✅ Real-time listener
  const msgsRef = collection(doc(db, "profiles", profileId), "messages");
  const q = query(msgsRef, orderBy("at", "desc"));
  let initialLoad = true;

  onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      $('#emptyInbox').style.display = 'block';
      list.innerHTML = '';
      return;
    }

    $('#emptyInbox').style.display = 'none';
    list.innerHTML = '';

    // Collect all messages first
let allMessages = snapshot.docs.map((d) => {
  const m = d.data();
  const when = m.at?.toDate
  ? m.at.toDate().toLocaleString("en-GB", {
      weekday: "short",   // "Mon", "Tue", etc.
      day: "2-digit",     // "22"
      month: "long",      // "October"
      hour: "2-digit",    // "03"
      minute: "2-digit",  // "45"
      hour12: true        // 12-hour format (AM/PM)
    }).replace(",", "•") // makes it like "Wed — 22 October, 3:45 PM"
  : "Just now";
  const who = m.alias || "Anonymous";
  return {
    id: d.id,
    text: m.text,
    alias: who,
    time: when
  };
});

// Function to render messages (filtered)
function renderMessages(filter = "") {
  list.innerHTML = "";
  const q = filter.toLowerCase();

  const filtered = allMessages.filter(
    (m) =>
      m.text.toLowerCase().includes(q) ||
      m.alias.toLowerCase().includes(q) ||
      m.time.toLowerCase().includes(q)
  );

  if (filtered.length === 0) {
    list.innerHTML = `<p class="muted" style="text-align:center;">No messages match your search.</p>`;
    return;
  }

  filtered.forEach((m) => {
    const el = document.createElement("div");
    el.className = "message clickable";
    el.dataset.text = m.text;
    el.dataset.alias = m.alias;
    el.dataset.time = m.time;

    el.innerHTML = `
      <div class="meta">
        <div>From: <strong>${m.alias}</strong></div>
        <div>${m.time}</div>
      </div>
      <div class="text">${esc(m.text.substring(0,80))}${m.text.length > 80 ? "…" : ""}</div>
      <div class="row" style="margin-top:10px;justify-content:flex-end">
        <button class="btn small ghost danger" data-id="${m.id}">Delete</button>
      </div>
    `;
    list.appendChild(el);
  });
}

// Render initial messages
renderMessages();

// ✅ Add search filter listener
const searchInput = document.getElementById("searchMessages");
if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    const val = e.target.value.trim();
    renderMessages(val);
  });
}

    // 🔔 Notify on new messages
    if (!initialLoad && snapshot.docChanges().some(c => c.type === "added")) {
      const notifEnabled = localStorage.getItem("encrypt_notif_enabled") === "true";
      if (notifEnabled) {
        const audio = new Audio("notify.mp3");
        audio.volume = 0.6;
        if (Notification.permission === "granted") {
          new Notification("New message received on Encrypt 💬", {
            body: "Someone sent you a new anonymous message.",
            icon: "icon.png"
          });
        }
        audio.play().catch(() => console.log("Sound blocked (needs user action first)."));
      }
    }

    initialLoad = false;

    // Modal (popup)
    const modal = $("#messageModal");
    const modalTitle = $("#modalTitle");
    const modalBody = $("#modalBody");
    const modalTime = $("#modalTime");
    const closeModal = $("#closeModal");
    const modalContent = modal.querySelector(".modal-content");

    document.querySelectorAll(".message.clickable").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.tagName === "BUTTON") return;
        const text = card.dataset.text;
        const alias = card.dataset.alias;
        const time = card.dataset.time;
        modalTitle.textContent = `Message from : ${alias}`;
        modalBody.innerHTML = `<strong>${esc(text)}</strong>`;
        modalTime.textContent = time;
        modal.style.display = "flex";

// 🎨 Random color generator with auto-contrast
function randomColor() {
  const r = Math.floor(Math.random() * 200);
  const g = Math.floor(Math.random() * 200);
  const b = Math.floor(Math.random() * 200);
  return { color: `rgb(${r}, ${g}, ${b})`, brightness: (r*0.299 + g*0.587 + b*0.114) };
}

const { color, brightness } = randomColor();
modalContent.style.transition = "background 0.5s ease-in-out, color 0.5s ease-in-out";
modalContent.style.background = color;
modalContent.style.color = brightness > 140 ? "#000" : "#fff";

// ✨ Glow effect
modalContent.classList.add("glow");
setTimeout(() => modalContent.classList.remove("glow"), 800);

      });
    });

    // Close modal on (X) button click
closeModal?.addEventListener("click", () => {
  modal.style.display = "none";
});

// ✅ Improved modal close for iOS + all platforms
["click", "touchstart", "touchend", "pointerup"].forEach(evt => {
  modal.addEventListener(evt, (e) => {
    // Only close if the user tapped outside the modal content
    if (e.target === modal) {
      e.preventDefault();
      e.stopPropagation();
      modal.style.display = "none";
    }
  }, { passive: false });
});

    // Delete button
    $$('#messagesList [data-id]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const messageId = e.currentTarget.getAttribute('data-id');
        try {
          await DB.delMessage(profileId, messageId);
          toast('Message deleted');
        } catch (err) {
          console.error(err);
          toast('Could not delete (check owner)');
        }
      });
    });
  });
}

async function renderMyInboxes() {
  const list = $('#inboxesList');
  list.innerHTML = '';

  let profiles = [];
  try {
    profiles = await DB.listProfilesByOwner();
  } catch (e) {
    console.error(e);
    toast('Could not load inboxes');
    return;
  }

  if (profiles.length === 0) {
    $('#emptyInboxes').style.display = 'block';
    return;
  } else {
    $('#emptyInboxes').style.display = 'none';
  }

  // Render each inbox card
  profiles.forEach((p) => {
    const el = document.createElement('div');
    el.className = `card inbox-card ${p.paused ? 'paused' : ''}`;
    el.innerHTML = `
      <div class="inbox-header" style="display:flex;justify-content:space-between;align-items:center;">
        <h3 style="margin:0">${esc(p.name || 'Unnamed Inbox')}</h3>
        <div class="menu-wrapper" style="position:relative;">
          <button class="menu-btn" data-id="${p.id}" style="background:none;border:none;font-size:20px;cursor:pointer;">⋯</button>
          <div class="menu-dropdown" id="menu-${p.id}" style="display:none;flex-direction:column;position:absolute;right:0;top:25px;background:#fff;border:1px solid #ddd;border-radius:8px;min-width:130px;z-index:10;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
            <button class="menu-item pause" data-id="${p.id}" style="padding:8px 12px;text-align:left;background:none;border:none;cursor:pointer;">
              ${p.paused ? 'Resume Link' : 'Pause Link'}
            </button>
            <button class="menu-item delete" data-id="${p.id}" style="padding:8px 12px;text-align:left;background:none;border:none;color:#d9534f;cursor:pointer;">
              Delete Inbox
            </button>
          </div>
        </div>
      </div>
      <p class="muted" style="margin:6px 0">Created: ${
        p.createdAt?.toDate ? p.createdAt.toDate().toLocaleString() : 'unknown'
      }</p>
      ${p.paused ? `<p class="muted danger paused-tag">⏸ Inbox paused</p>` : ''}
      <div class="row" style="margin-top:8px">
        <a class="btn small" href="#/inbox/${p.id}-${p.secret}">Open Inbox</a>
        <a class="btn small secondary" href="#/send/${p.id}">Open Public</a>
      </div>
    `;
    list.appendChild(el);
  });

  // Toggle menu dropdown
  document.querySelectorAll('.menu-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = e.target.dataset.id;
      document.querySelectorAll('.menu-dropdown').forEach((m) => (m.style.display = 'none'));
      const dropdown = document.getElementById(`menu-${id}`);
      if (dropdown) dropdown.style.display = dropdown.style.display === 'flex' ? 'none' : 'flex';
    });
  });

  // Pause / Resume inbox toggle
  document.querySelectorAll('.menu-item.pause').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.dataset.id;
      const ref = doc(db, 'profiles', id);
      const snap = await getDoc(ref);
      if (!snap.exists()) return toast('Inbox not found.');

      const paused = snap.data().paused === true;
      try {
        await setDoc(ref, { paused: !paused }, { merge: true });
        toast(paused ? 'Inbox resumed ✅' : 'Inbox paused ⏸');
        await renderMyInboxes(); // refresh
      } catch (err) {
        console.error(err);
        toast('Error: ' + err.message);
      }
    });
  });

  // Delete inbox
  document.querySelectorAll('.menu-item.delete').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.dataset.id;
      if (!confirm('Delete this inbox permanently?')) return;
      try {
        await deleteDoc(doc(db, 'profiles', id));
        toast('Inbox deleted 🗑️');
        await renderMyInboxes(); // refresh list
      } catch (err) {
        console.error(err);
        toast('Error deleting inbox: ' + err.message);
      }
    });
  });
}

/* ----------------------------
   ACCOUNT (Register / Login)
   ---------------------------- */
async function initAccountPage() {
  const container = $('#view-account');
  if (!container) return;

  // Smooth animation between login/register cards
  function animateReplace(html) {
    const card = container.querySelector('.auth-card');
    if (card) card.classList.add('fade-out');
    setTimeout(() => {
      container.innerHTML = html;
      requestAnimationFrame(() => {
        const newCard = container.querySelector('.auth-card');
        if (newCard) newCard.classList.add('active');
      });
    }, 350);
  }

  // If user is already signed in
  if (auth.currentUser) {
    container.innerHTML = `
      <div class="auth-card card active" style="text-align:center;">
        <h2>Account</h2>
        <p>Signed in as: <strong>${esc(auth.currentUser.email || 'Anonymous')}</strong></p>
        <p class="muted">${auth.currentUser.emailVerified ? '✅ Email verified' : '❌ Not verified'}</p>
        <button class="btn" id="logoutBtn" style="margin-top:10px;">Sign Out</button>
      </div>
    `;
    $('#logoutBtn')?.addEventListener('click', async () => {
      await signOut(auth);
      toast('Signed out');
      location.hash = '#/';
    });
    return;
  }

  showLoginForm();

  /* ------------------------
     LOGIN & REGISTER FORMS
     ------------------------ */
  function showLoginForm() {
    animateReplace(`
      <div class="auth-card card">
        <h3>Login</h3>
        <input class="input" id="email" placeholder="Email address" type="email" />
        <div class="password-wrapper" style="position:relative;">
          <input class="input" id="password" placeholder="Password" type="password" style="padding-right:60px;">
          <span id="togglePassword" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);cursor:pointer;color:var(--muted-color,#999);font-size:14px;">Show</span>
        </div>
        <button class="btn" id="loginBtn" style="margin-top:10px;">Login</button>
        <p class="muted" style="margin-top:8px;text-align:center;"><a href="#" id="forgotPwLink">Forgot password?</a>
        </p>
        <h5><p class="muted" style="margin-top:12px;">Don’t have an account? <a href="#" id="showRegister">Sign up</a></p></h5>
      </div>
    `);
    setTimeout(attachLoginHandlers, 360);
  }

  function showRegisterForm() {
    animateReplace(`
      <div class="auth-card card">
        <h3>Register</h3>
        <input class="input" id="firstName" placeholder="First Name" type="text" />
        <input class="input" id="lastName" placeholder="Last Name" type="text" />
        <input class="input" id="email" placeholder="Email address" type="email" />
        <div class="password-wrapper" style="position:relative;">
          <input class="input" id="password" placeholder="Password" type="password" style="padding-right:60px;">
          <span id="togglePassword" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);cursor:pointer;color:var(--muted-color,#999);font-size:14px;">Show</span>
        </div>
        <button class="btn" id="registerBtn" style="margin-top:10px;">Register</button>
        <h5><p class="muted" style="margin-top:12px;">Already have an account? <a href="#" id="showLogin">Login</a></p></h5>
      </div>
    `);
    setTimeout(attachRegisterHandlers, 360);
  }

  function showForgotPwForm() {
  animateReplace(`
    <div class="auth-card card">
      <h3>Reset Password</h3>
      <p class="muted" style="margin-bottom:10px;">
        Enter your email to receive a password reset link.
      </p>
      <input class="input" id="resetEmail" placeholder="Email address" type="email" />
      <button class="btn" id="resetPwBtn" style="margin-top:10px;">Send Reset Link</button>
      <p class="muted" style="margin-top:12px;text-align:center;">
        <a href="#" id="backToLogin">Back to Login</a>
      </p>
    </div>
  `);

  setTimeout(() => {
    $('#resetPwBtn')?.addEventListener('click', async () => {
      const email = $('#resetEmail')?.value.trim();
      if (!email) return toast('Enter your email address.');

      try {
        const { sendPasswordResetEmail } = await import("https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js");
        await sendPasswordResetEmail(auth, email);
        toast('Password reset email sent!');
        showLoginForm();
      } catch (err) {
        toast('Error: ' + err.message);
      }
    });

    $('#backToLogin')?.addEventListener('click', (e) => {
      e.preventDefault();
      showLoginForm();
    });
  }, 360);
}

  /* ------------------------
     LOGIN LOGIC
     ------------------------ */
  function attachLoginHandlers() {
    $('#showRegister')?.addEventListener('click', (e) => {
      e.preventDefault();
      showRegisterForm();
    });
    $('#forgotPwLink')?.addEventListener('click', (e) => {
      e.preventDefault();
      showForgotPwForm();
    });


    const pw = $('#password');
    const toggle = $('#togglePassword');
    toggle?.addEventListener('click', () => {
      if (!pw) return;
      pw.type = pw.type === 'password' ? 'text' : 'password';
      toggle.textContent = pw.type === 'password' ? 'Show' : 'Hide';
    });

    $('#loginBtn')?.addEventListener('click', async () => {
      const email = $('#email')?.value.trim();
      const password = $('#password')?.value.trim();
      if (!email || !password) return toast('Enter your email and password');
      try {
        const userCred = await signInWithEmailAndPassword(auth, email, password);
        await userCred.user.reload();
        if (!userCred.user.emailVerified) {
          try {
            await sendEmailVerification(userCred.user);
            toast('Please verify your email first — verification email resent.');
          } catch (err) {
            toast('Could not resend verification: ' + err.message);
          }
          await signOut(auth);
          return;
        }
        toast('Login successful');
        location.hash = '#/';
      } catch (err) {
        toast('Login failed - Invalid credential ');
      }
    });
  }

  /* ------------------------
     REGISTER LOGIC
     ------------------------ */
  function attachRegisterHandlers() {
    $('#showLogin')?.addEventListener('click', (e) => {
      e.preventDefault();
      showLoginForm();
    });

    const pw = $('#password');
    const toggle = $('#togglePassword');
    toggle?.addEventListener('click', () => {
      if (!pw) return;
      pw.type = pw.type === 'password' ? 'text' : 'password';
      toggle.textContent = pw.type === 'password' ? 'Show' : 'Hide';
    });

    $('#registerBtn')?.addEventListener('click', async () => {
      const firstName = $('#firstName')?.value.trim();
      const lastName = $('#lastName')?.value.trim();
      const email = $('#email')?.value.trim();
      const password = $('#password')?.value.trim();

      if (!firstName || !lastName || !email || !password)
        return toast('Please fill in all fields');

      try {
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(userCred.user);
        toast('Verification email sent! Check your inbox or spam folder.');

        await setDoc(doc(db, "users", userCred.user.uid), {
          firstName,
          lastName,
          email,
          createdAt: serverTimestamp()
        });

        animateReplace(`
          <div class="auth-card card" style="text-align:center;">
            <h2>📧 Verify Your Email</h2>
            <p class="muted">We sent a verification email to <strong>${esc(email)}</strong>.</p>
            <p class="muted" style="margin-top:6px;">Didn’t get an email? check your <strong>Spam or Junk folders or click on Resend</strong>  <a href="#" id="resendBtn">Resend</a>.</p>
            <p class="muted" style="margin-top:10px;">Once verified, <a href="#" id="goLogin">click here to log in</a>.</p>
          </div>
        `);

        setTimeout(() => {
          $('#resendBtn')?.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
              await sendEmailVerification(userCred.user);
              toast('Verification email resent!');
            } catch (err) {
              toast('Error: ' + err.message);
            }
          });

          $('#goLogin')?.addEventListener('click', (e) => {
            e.preventDefault();
            showLoginForm();
          });
        }, 360);

        await signOut(auth);
      } catch (err) {
        toast('Registration failed: ' + err.message);
      }
    });
  }
}

/* Copy buttons — with preset message */
$('#copyPublic')?.addEventListener('click', ()=>{
  const link = $('#publicLink')?.value;
  const message = `💬 Send me an anonymous message via Encrypts: ${link}`;
  navigator.clipboard.writeText(message).then(()=>{
    toast('Public link (with message) copied!');
  });
});

$('#btnSharePublic')?.addEventListener('click', ()=>{
  const link = $('#publicLink')?.value;
  const message = `💬 Send me an anonymous message via Encrypts: ${link}`;
  navigator.clipboard.writeText(message).then(()=>{
    toast('Public link (with message) copied!');
  });
});

// 🌈 Share Public Link — Snapchat-style share menu
$('#copySend')?.addEventListener('click', async () => {
  const link = $('#sendLink')?.value.trim();
  const name = $('#sendToName')?.textContent || "an Encrypts user";
  const message = `💌 Send an anonymous message to ${name} on Encrypts!\n\n${link}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: `Send ${name} an anonymous message 💬`,
        text: message,
        url: link,
      });
      toast("Shared successfully!");
    } catch (err) {
      if (err.name !== "AbortError") {
        toast("Couldn't share. Try again!");
        console.error("Share failed:", err);
      }
    }
  } else {
    // fallback for browsers without Web Share API
    navigator.clipboard.writeText(message);
    toast("Link copied to clipboard!");
  }
});

/* KPI click handlers */
$('#openInbox')?.addEventListener('click', async ()=>{
  if (!auth.currentUser) return toast('Please log in first!');
  
  // Query inboxes owned by the current user only
  const q = query(collection(db, "profiles"), where("ownerUid", "==", auth.currentUser.uid));
  const ps = await getDocs(q);

  if (ps.empty) {
    toast('No inbox found. Create your link first!');
    return;
  }

  // ✅ Pick the first (or latest) inbox owned by this user
  const firstDoc = ps.docs[0];
  const profile = firstDoc.data();

  // Redirect to the correct inbox view
  location.hash = `#/inbox/${profile.id}-${profile.secret}`;
});

$('#openLinks')?.addEventListener('click', ()=>document.getElementById('live-preview')?.scrollIntoView({ behavior: 'smooth' }));
$('#openSenders')?.addEventListener('click', ()=>toast('Unlimited anonymous senders can message you.'));
$('#logoutBtn')?.addEventListener('click', async ()=>{
  await signOut(auth);
  toast('Signed out');
  location.hash = '#/';
});

// =======================================
// PROFILE PAGE — VIEW / UPDATE / DELETE (NO PHOTO UPLOAD)
// =======================================
async function renderProfilePage() {
  const container = $('#profileContainer');
  if (!container) return;

  if (!auth.currentUser) {
    container.innerHTML = `<p>Please log in to view your profile.</p>`;
    return;
  }

  const user = auth.currentUser;
  const snap = await getDoc(doc(db, "users", user.uid));
  const data = snap.exists() ? snap.data() : {};

  const first = data.firstName || "";
  const last = data.lastName || "";
  const initials = (first[0] || "?").toUpperCase() + (last[0] || "").toUpperCase();
  // 🎨 Generate a consistent gradient based on initials
function generateGradient(seed) {
  const hash = [...seed].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const hue1 = hash % 360;
  const hue2 = (hash * 1.5) % 360;
  return `linear-gradient(135deg, hsl(${hue1}, 70%, 55%), hsl(${hue2}, 75%, 50%))`;
}

  const joined = data.createdAt?.toDate
    ? data.createdAt.toDate().toLocaleString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : "Unknown";

  container.innerHTML = `
    <h2 style="margin-bottom:15px;">My Profile</h2>

    <div class="profile-avatar-section">
      <div class="avatar-circle" style="background:${generateGradient(initials)};">${esc(initials)}</div>
    </div>

    <div class="profile-info">
      <p><strong>First Name:</strong> ${esc(first || "—")}</p>
      <p><strong>Last Name:</strong> ${esc(last || "—")}</p>
      <p><strong>Email:</strong> ${esc(user.email)}</p>
      <p><strong>Joined:</strong> ${joined}</p>
    </div>

    <div class="profile-divider"></div>

    <div class="profile-actions">
      <button class="btn small secondary" id="changePwBtn">Change Password</button>
      <button class="btn small ghost danger" id="deleteAccBtn">Delete Account</button>
    </div>

    <!-- Hidden password form -->
    <div id="changePwForm" style="display:none;margin-top:12px;">
      <input class="input" id="newPw" type="password" placeholder="New Password" style="margin-bottom:6px;">
      <input class="input" id="confirmPw" type="password" placeholder="Re-enter Password">
      <button class="btn small" id="savePwBtn" style="margin-top:8px;">Save New Password</button>
    </div>

    <!-- Hidden delete form -->
    <div id="deleteAccForm" style="display:none;margin-top:10px;">
      <p class="muted" style="font-size:14px;">Deleting your account will erase all data.</p>
      <input class="input" id="delEmail" type="email" placeholder="Confirm Email">
      <input class="input" id="delPw" type="password" placeholder="Confirm Password" style="margin-top:6px;">
      <button class="btn ghost danger" id="confirmDelBtn" style="margin-top:8px;">Delete Permanently</button>
      <p id="cancelDel" class="muted" style="cursor:pointer;text-decoration:underline;margin-top:6px;">Cancel</p>
    </div>
  `;

  // === Password and delete actions ===
  $('#changePwBtn')?.addEventListener('click', () => {
    const f = $('#changePwForm');
    f.style.display = f.style.display === 'none' ? 'block' : 'none';
  });

  $('#savePwBtn')?.addEventListener('click', async () => {
    const pw1 = $('#newPw').value.trim();
    const pw2 = $('#confirmPw').value.trim();
    if (!pw1 || pw1 !== pw2) return toast("Passwords don’t match.");
    try {
      await updatePassword(user, pw1);
      toast("Password updated ✅");
      $('#changePwForm').style.display = 'none';
    } catch (err) {
      toast("Error: " + err.message);
    }
  });

  $('#deleteAccBtn')?.addEventListener('click', () => {
    const f = $('#deleteAccForm');
    f.style.display = f.style.display === 'none' ? 'block' : 'none';
  });

  $('#cancelDel')?.addEventListener('click', () => $('#deleteAccForm').style.display = 'none');

  $('#confirmDelBtn')?.addEventListener('click', async () => {
    const email = $('#delEmail')?.value.trim();
    const password = $('#delPw')?.value.trim();
    if (!email || !password) return toast("Enter email & password.");

    try {
      const credential = EmailAuthProvider.credential(email, password);
      await reauthenticateWithCredential(user, credential);
      await deleteDoc(doc(db, "users", user.uid));
      await deleteUser(user);
      toast("Account deleted.");
      location.hash = "#/";
    } catch (err) {
      toast("Error: " + err.message);
    }
  });
}

  
/* Boot: wait for auth to be initialized, then route */
authReady.then(()=>{ route(); });