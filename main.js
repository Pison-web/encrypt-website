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
  signOut
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
  try {
    await this.ensureSignedIn();
  } catch(e) {
    throw e;
  }
  const ownerUid = auth.currentUser?.uid || null;
  if(!ownerUid) throw new Error('No auth uid available');

  await setDoc(doc(db, "profiles", profileId), {
    id: profileId,
    secret: secretId,          // 🔑 save private secret
    name,
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

  // default -> home
  $('#view-home').classList.add('active');
  const kpi = $('#kpiMessages');
  if(kpi) kpi.textContent = String(await DB.countAll());
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
    live.querySelector('.copyPublic')?.addEventListener('click', ()=>navigator.clipboard.writeText(send).then(()=>toast('Public link copied')));
  }

  toast('Your Ecrypt links are ready');
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

  const ok = await DB.addMessage(profileId, { text, alias });
  if (!ok) return toast('Inbox not found');

  $('#msg').value = '';
  $('#alias').value = '';
  toast('Message sent anonymously ✅');
});

/* Inbox rendering (owner) */
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

  items.forEach((m)=>{
    const el = document.createElement('div');
    el.className='message';
    const when = new Date(m.at || Date.now()).toLocaleString();
    const who = m.alias ? esc(m.alias) : 'Anonymous';
    el.innerHTML = `
      <div class="meta">
        <div>From: <strong>${who}</strong></div>
        <div>${when}</div>
      </div>
      <div class="text">${esc(m.text)}</div>
      <div class="row" style="margin-top:10px; justify-content:flex-end">
        <button class="btn small ghost danger" aria-label="Delete" data-id="${m.id}">Delete</button>
      </div>`;
    list.appendChild(el);
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

async function renderMyInboxes(){
  const list = $('#inboxesList');
  list.innerHTML = '';

  let profiles = [];
  try {
    profiles = await DB.listProfilesByOwner();
  } catch(e){
    console.error(e);
    toast('Could not load inboxes');
    return;
  }

  if(profiles.length === 0){
    $('#emptyInboxes').style.display = 'block';
    return;
  } else {
    $('#emptyInboxes').style.display = 'none';
  }

  profiles.forEach(p => {
    const el = document.createElement('div');
    el.className = 'card clickable';
    el.innerHTML = `
      <h3 style="margin:0">${esc(p.name || 'Unnamed Inbox')}</h3>
      <p class="muted" style="margin:6px 0">Created: ${p.createdAt?.toDate ? p.createdAt.toDate().toLocaleString() : 'unknown'}</p>
      <div class="row" style="margin-top:8px">
        <a class="btn small" href="#/inbox/${p.id}-${p.secret}">Open Inbox</a>
        <a class="btn small secondary" href="#/send/${p.id}">Public Link</a>
      </div>
    `;
    list.appendChild(el);
  });
}

/* ----------------------------
   ACCOUNT (Register / Login)
   ---------------------------- */
async function initAccountPage() {
  const container = $('#view-account');
  if (!container) return;

  container.innerHTML = `
    <div class="card" style="max-width:400px;margin:auto;">
      <h2>👤 Account</h2>
      ${auth.currentUser ? `
        <p>Signed in as: <strong>${auth.currentUser.email || 'Anonymous'}</strong></p>
        <p class="muted">${auth.currentUser.emailVerified ? '✅ Email verified' : '❌ Not verified'}</p>
        <button class="btn" id="logoutBtn">Sign Out</button>
      ` : `
        <input class="input" id="email" placeholder="Email address" type="email" />

    <div class="password-wrapper" style="position:relative;">
  <input class="input" id="password" placeholder="Password" type="password" style="padding-right:60px;" />
  <span id="togglePassword" style="
    position:absolute;
    right:10px;
    top:50%;
    transform:translateY(-50%);
    cursor:pointer;
    color:var(--muted-color, #999);
    font-size:14px;
    user-select:none;
  ">Show</span>
    </div>
        <div class="row" style="margin-top:10px;gap:8px;">
          <button class="btn" id="registerBtn">Register</button>
          <button class="btn secondary" id="loginBtn">Login</button>
        </div>
      `}
    </div>
  `;
  // 👁️ Password show/hide toggle
const passwordInput = $('#password');
const toggle = $('#togglePassword');
toggle?.addEventListener('click', () => {
  if (!passwordInput) return;
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    toggle.textContent = 'Hide';
  } else {
    passwordInput.type = 'password';
    toggle.textContent = 'Show';
  }
});


  $('#registerBtn')?.addEventListener('click', async () => {
  const email = $('#email')?.value.trim();
  const password = $('#password')?.value.trim();
  if (!email || !password) return toast('Please enter both email & password');

  try {
    const userCred = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(userCred.user);
    toast('Verification email sent! Check your inbox or spam folder.');

    // 💡 Show resend option immediately after registration
    container.innerHTML = `
      <div class="card" style="max-width:400px;margin:auto;text-align:center;">
        <h2>Email Verification Sent</h2>
        <p class="muted">We sent a verification email to <strong>${email}</strong>.<br>
        Please verify before logging in.</p>
        <p class="muted" style="margin-top:6px;">Didn’t get the email? Check your spam folder or resend below.</p>
        <button class="btn" id="resendBtn">Resend Verification Email</button>
        <p class="muted" style="margin-top:10px;">
        Once verified, <a href="#/account" id="gotoLoginLink">click here to log in</a>.</p>
      </div>
    `;

    // 🔁 Add resend verification button handler
    $('#resendBtn')?.addEventListener('click', async () => {
      try {
        await sendEmailVerification(userCred.user);
        toast('Verification email resent!');
      } catch (err) {
        console.error(err);
        toast('Could not resend email: ' + err.message);
      }
    });

    await signOut(auth);
  } catch (e) {
    console.error(e);
    toast('Registration failed: ' + e.message);
  }
});

  // 🔁 Redirect to login page after verification
  $('#gotoLoginLink')?.addEventListener('click', (e) => {
  e.preventDefault();
  toast('Once your email is verified, log in below');
  location.hash = '#/account';
});



  $('#loginBtn')?.addEventListener('click', async () => {
    const email = $('#email')?.value.trim();
    const password = $('#password')?.value.trim();
    if (!email || !password) return toast('Enter your email and password');
    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      await userCred.user.reload(); // refresh Firebase user state
    if (!userCred.user.emailVerified) {
     toast('Please verify your email first, then try again.');
     await signOut(auth);
  return;
}
      toast('Login successful');
      location.hash = '#/';
    } catch (e) {
      console.error(e);
      toast('Login failed: ' + e.message);
    }
  });

  $('#logoutBtn')?.addEventListener('click', async () => {
    await signOut(auth);
    toast('Signed out');
    location.hash = '#/';
  });
}


/* Copy buttons */
$('#copyPublic')?.addEventListener('click', ()=>navigator.clipboard.writeText($('#publicLink').value).then(()=>toast('Public link copied')));
$('#btnSharePublic')?.addEventListener('click', ()=>navigator.clipboard.writeText($('#publicLink').value).then(()=>toast('Public link copied')));
$('#copySend')?.addEventListener('click', ()=>navigator.clipboard.writeText($('#sendLink').value).then(()=>toast('Send page link copied')));

/* KPI click handlers */
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


/* Boot: wait for auth to be initialized, then route */
authReady.then(()=>{ route(); });