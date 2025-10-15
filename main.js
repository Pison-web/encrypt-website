// main.js (module) - REPLACE YOUR FILE WITH THIS
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, collection, addDoc, getDocs,
  deleteDoc, query, orderBy, serverTimestamp, where
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
  storageBucket: "encrypt-website-b1067.firebasestorage.app",
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

/* Inbox rendering (owner) */
async function renderInbox(hashId){
  // split into public profileId and private secretId
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
  // show only public send link
  $('#publicLink').value = `${location.origin}${location.pathname}#/send/${profileId}`;

  const list = $('#messagesList');
  list.innerHTML = '';

  // fetch messages
  let items = [];
  try {
    items = await DB.getMessages(profileId);  // ✅ use profileId, not id
  } catch(e) {
    console.error(e);
    $('#emptyInbox').textContent = 'You must be the owner to view this inbox (open this link in the browser that created it).';
    $('#emptyInbox').style.display = 'block';
    return;
  }

  if(items.length === 0){
    $('#emptyInbox').style.display = 'block';
    return;
  } else {
    $('#emptyInbox').style.display = 'none';
  }

  items.forEach((m) => {
  const el = document.createElement("div");
  el.className = "message clickable";
  const when = new Date(m.at || Date.now()).toLocaleString();
  const who = m.alias ? esc(m.alias) : "Anonymous";

  el.dataset.text = m.text;
  el.dataset.alias = who;
  el.dataset.time = when;

  el.innerHTML = `
    <div class="meta">
      <div>From: <strong>${who}</strong></div>
      <div>${when}</div>
    </div>
    <div class="text">${esc(m.text.substring(0, 80))}${
    m.text.length > 80 ? "…" : ""
  }</div>
    <div class="row" style="margin-top:10px; justify-content:flex-end">
      <button class="btn small ghost danger" aria-label="Delete" data-id="${m.id}">Delete</button>
    </div>
  `;

  list.appendChild(el);
});

// 💬 Pop-up modal for messages
const modal = document.getElementById("messageModal");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
const modalTime = document.getElementById("modalTime");
const closeModal = document.getElementById("closeModal");

document.querySelectorAll(".message.clickable").forEach((card) => {
  card.addEventListener("click", (e) => {
    // prevent button clicks (like Delete) from triggering popup
    if (e.target.tagName === "BUTTON") return;

    const text = card.dataset.text;
    const alias = card.dataset.alias;
    const time = card.dataset.time;

    modalTitle.textContent = `Message from ${alias}`;
    modalBody.textContent = text;
    modalTime.textContent = time;

    modal.style.display = "flex";
  });
});

closeModal?.addEventListener("click", () => {
  modal.style.display = "none";
});

window.addEventListener("click", (e) => {
  if (e.target === modal) modal.style.display = "none";
});

  // attach delete handlers
  $$('#messagesList [data-id]').forEach(btn=>{
    btn.addEventListener('click', async (e)=>{
      const messageId = e.currentTarget.getAttribute('data-id');
      try {
        await DB.delMessage(profileId, messageId); // ✅ use profileId
        toast('Message deleted');
        await renderInbox(hashId); // reload same inbox
      } catch(err) {
        console.error(err);
        toast('Could not delete (check owner & permissions)');
      }
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
        <a class="btn small secondary" href="#/send/${p.id}">Public Link</a>
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

$('#copySend')?.addEventListener('click', ()=>{
  const link = $('#sendLink')?.value;
  const message = `💌 Send me an anonymous message via Encrypts: ${link}`;
  navigator.clipboard.writeText(message).then(()=>{
    toast('Send link (with message) copied!');
  });
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
// PROFILE PAGE — VIEW / UPDATE / DELETE
// =======================================
async function renderProfilePage() {
  const container = $('#profileContainer');
  if (!container) {
    console.error("Profile container not found in HTML");
    return;
  }

  if (!auth.currentUser) {
    container.innerHTML = `<p>Please log in to view your profile.</p>`;
    return;
  }

  const user = auth.currentUser;

  // Fetch user data
  const snap = await getDoc(doc(db, "users", user.uid));
  const data = snap.exists() ? snap.data() : {};
  const joined = data.createdAt?.toDate
  ? data.createdAt.toDate().toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  : "Unknown";

  container.innerHTML = `
    <div style="max-width:420px;margin:auto;">
      <p><strong>First Name:</strong> ${esc(data.firstName || "-")}</p>
      <p><strong>Last Name:</strong> ${esc(data.lastName || "-")}</p>
      <p><strong>Email:</strong> ${esc(user.email)}</p>
      <h5><p class="muted">You joined Encrypts on ${joined}</p></h5>
      <hr>

      <button class="btn" id="changePwBtn">Change Password</button>
      <div id="changePwForm" style="display:none;margin-top:10px;">
        <div style="position:relative; margin-bottom:8px;">
          <input class="input" id="newPw" type="password" placeholder="New Password" style="padding-right:60px;">
          <span id="toggleNewPw" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);cursor:pointer;color:#999;font-size:14px;">Show</span>
        </div>
        <div style="position:relative;">
          <input class="input" id="confirmPw" type="password" placeholder="Re-enter Password" style="padding-right:60px;">
          <span id="toggleConfirmPw" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);cursor:pointer;color:#999;font-size:14px;">Show</span>
        </div>
        <button class="btn small" id="savePwBtn" style="margin-top:8px;">Save New Password</button>
      </div>

      <button class="btn ghost danger" id="deleteAccBtn" style="margin-top:14px;">Delete Account</button>
<div id="deleteAccForm" style="display:none;margin-top:10px;">
  <p class="muted" style="font-size:14px;">Deleting your account will erase all your data with Encrypt. Please confirm your email and password to continue.</p>
  <input class="input" id="delEmail" type="email" placeholder="Confirm Email" style="margin-top:6px;">
  <div class="password-wrapper" style="position:relative;margin-top:6px;">
    <input class="input" id="delPw" type="password" placeholder="Confirm Password" style="padding-right:60px;">
    <span id="toggleDelPw" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);cursor:pointer;color:var(--muted-color,#999);font-size:14px;">Show</span>
  </div>
  <button class="btn" id="confirmDelBtn" 
  style="margin-top:10px; background:#fff; color:#d9534f; border:1px solid #d9534f;">
  Delete Permanently
</button>
  <p class="muted" id="cancelDel" style="margin-top:6px;cursor:pointer;text-decoration:underline;">Cancel</p>
</div>
    </div>
  `;

  // Password toggle buttons
  const newPwInput = $('#newPw');
  const confirmPwInput = $('#confirmPw');
  const toggleNewPw = $('#toggleNewPw');
  const toggleConfirmPw = $('#toggleConfirmPw');

  toggleNewPw?.addEventListener('click', () => {
    newPwInput.type = newPwInput.type === 'password' ? 'text' : 'password';
    toggleNewPw.textContent = newPwInput.type === 'password' ? 'Show' : 'Hide';
  });

  toggleConfirmPw?.addEventListener('click', () => {
    confirmPwInput.type = confirmPwInput.type === 'password' ? 'text' : 'password';
    toggleConfirmPw.textContent = confirmPwInput.type === 'password' ? 'Show' : 'Hide';
  });

  // Show/Hide Change Password Form
  $('#changePwBtn')?.addEventListener('click', () => {
    const form = $('#changePwForm');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  });

  // Save new password
  $('#savePwBtn')?.addEventListener('click', async () => {
    const pw1 = $('#newPw').value.trim();
    const pw2 = $('#confirmPw').value.trim();
    if (!pw1 || pw1 !== pw2) return toast("Passwords don’t match.");

    try {
      await updatePassword(user, pw1);
      toast("Password updated ✅");
      $('#changePwForm').style.display = 'none';
    } catch (err) {
      console.error(err);
      if (err.code === "auth/requires-recent-login") {
        toast("Please log in again to change your password.");
      } else {
        toast("Error: " + err.message);
      }
    }
  });

// delete account (inline, cleaner with email verification + reauth)
$('#deleteAccBtn')?.addEventListener('click', () => {
  const form = $('#deleteAccForm');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
});

// show/hide password in delete form
$('#toggleDelPw')?.addEventListener('click', () => {
  const input = $('#delPw');
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    $('#toggleDelPw').textContent = 'Hide';
  } else {
    input.type = 'password';
    $('#toggleDelPw').textContent = 'Show';
  }
});

// cancel delete form
$('#cancelDel')?.addEventListener('click', () => {
  $('#deleteAccForm').style.display = 'none';
});

// confirm delete
$('#confirmDelBtn')?.addEventListener('click', async () => {
  const user = auth.currentUser;
  if (!user) return toast("No user logged in.");
  if (!user.emailVerified) return toast("Please verify your email before deleting your account.");

  const email = $('#delEmail')?.value.trim();
  const password = $('#delPw')?.value.trim();
  if (!email || !password) return toast("Enter your email and password to confirm.");

  try {
    const credential = EmailAuthProvider.credential(email, password);
    await reauthenticateWithCredential(user, credential);

    await deleteDoc(doc(db, "users", user.uid));
    await deleteUser(user);

    toast("Account deleted successfully.");
    location.hash = "#/";
  } catch (err) {
    console.error(err);
    toast("Deletion failed: " + err.message);
  }
});
}

/* Boot: wait for auth to be initialized, then route */
authReady.then(()=>{ route(); });