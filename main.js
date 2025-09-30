(function(){
  // --- Utilities ---
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

  // --- Local DB (profiles stored as ecrypt_{id}) ---
  const DB = {
    key: (id)=>`ecrypt_${id}`,
    createProfile(id, name){ localStorage.setItem(this.key(id), JSON.stringify({ id, name: name||'', createdAt: nowISO(), messages: [] })); },
    getProfile(id){ const raw = localStorage.getItem(this.key(id)); return raw ? JSON.parse(raw) : null; },
    addMessage(id, msg){ const p = this.getProfile(id); if(!p) return false; p.messages.unshift(msg); localStorage.setItem(this.key(id), JSON.stringify(p)); return true; },
    delMessage(id, idx){ const p = this.getProfile(id); if(!p) return false; p.messages.splice(idx,1); localStorage.setItem(this.key(id), JSON.stringify(p)); return true; },
    countAll(){ return Object.keys(localStorage).filter(k=>k.startsWith('ecrypt_')).reduce((n,k)=>{ try{ const p = JSON.parse(localStorage.getItem(k)); return n + (p.messages?.length || 0); }catch(e){ return n; } }, 0); }
  };

  // --- Theme toggle (keeps your existing .light-theme approach) ---
  const toggleBtn = $('#toggleTheme');
  if(toggleBtn){
    toggleBtn.addEventListener('click', ()=>{
      document.body.classList.toggle('light-theme');
      const isLight = document.body.classList.contains('light-theme');
      toast(isLight ? 'Light theme' : 'Dark theme');
    });
  }

  // --- Router (switch views based on hash) ---
  function route(){
    const hash = location.hash.slice(1);
    const [_, view, id] = hash.split('/');
    $$('[data-view]').forEach(v=>v.classList.remove('active'));

    if(view === 'send' && id){
      $('#view-send').classList.add('active');
      const profile = DB.getProfile(id);
      $('#sendToName').textContent = profile?.name || 'Ecrypt user';
      $('#sendLink').value = location.href;
      return;
    }

    if(view === 'inbox' && id){
      $('#view-inbox').classList.add('active');
      renderInbox(id);
      return;
    }

    // default -> home
    $('#view-home').classList.add('active');
    const kpi = $('#kpiMessages'); if(kpi) kpi.textContent = DB.countAll();
  }
  window.addEventListener('hashchange', route);

  // --- Create links (home) ---
  const createBtn = $('#createLink');
  if(createBtn){
    createBtn.addEventListener('click', ()=>{
      const name = $('#displayName')?.value.trim();
      const id = uid();
      DB.createProfile(id, name);

      const inbox = `${location.origin}${location.pathname}#/inbox/${id}`;
      const send = `${location.origin}${location.pathname}#/send/${id}`;

      const live = $('#livePreview');
      if(live){
        live.innerHTML = `
          <div class="card preview" style="margin:0; >
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
        // attach listeners to new buttons
        live.querySelector('.copyInbox')?.addEventListener('click', ()=>navigator.clipboard.writeText(inbox).then(()=>toast('Inbox link copied')));
        live.querySelector('.copyPublic')?.addEventListener('click', ()=>navigator.clipboard.writeText(send).then(()=>toast('Public link copied')));
      }

      toast('Your Ecrypt links are ready');
      const kpi = $('#kpiMessages'); if(kpi) kpi.textContent = DB.countAll();
    });
  }

  // --- Send page logic (public) ---
  const sendBtn = $('#sendBtn');
  if(sendBtn){
    sendBtn.addEventListener('click', ()=>{
      const parts = location.hash.split('/');
      const id = parts[2];
      const text = $('#msg')?.value.trim();
      const alias = $('#alias')?.value.trim().slice(0,30);
      if(!id) return toast('Invalid link');
      if(!text) return toast('Write a message first');
      const ok = DB.addMessage(id, { text, alias, at: nowISO() });
      if(!ok) return toast('Inbox not found');
      $('#msg').value = ''; $('#alias').value = '';
      toast('Message sent anonymously ✅');
    });
  }

  // --- Inbox rendering (owner) ---
  function renderInbox(id){
    const p = DB.getProfile(id) || { messages: [], name: '' };
    $('#inboxOwner').textContent = p.name ? `— ${p.name}` : '';
    $('#publicLink').value = `${location.origin}${location.pathname}#/send/${id}`;

    const list = $('#messagesList');
    list.innerHTML = '';
    const items = p.messages || [];
    if(items.length === 0){ $('#emptyInbox').style.display='block'; return } else { $('#emptyInbox').style.display='none'; }

    items.forEach((m,i)=>{
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
          <button class="btn small ghost danger" aria-label="Delete" data-del="${i}">Delete</button>
        </div>`;
      list.appendChild(el);
    });

    // attach delete handlers
    $$('#messagesList [data-del]').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        const idx = Number(e.currentTarget.getAttribute('data-del'));
        DB.delMessage(id, idx);
        toast('Message deleted');
        renderInbox(id);
      });
    });
  }

   // --- Copy buttons (inbox / share) ---
  $('#copyPublic')?.addEventListener('click', ()=>navigator.clipboard.writeText($('#publicLink').value).then(()=>toast('Public link copied')));
  $('#btnSharePublic')?.addEventListener('click', ()=>navigator.clipboard.writeText($('#publicLink').value).then(()=>toast('Public link copied')));
  $('#copySend')?.addEventListener('click', ()=>navigator.clipboard.writeText($('#sendLink').value).then(()=>toast('Send page link copied')));

  // --- Make KPI cards clickable ---
  $('#openInbox')?.addEventListener('click', ()=>{
    const keys = Object.keys(localStorage).filter(k=>k.startsWith('ecrypt_'));
    if(keys.length){
      const id = keys[0].replace('ecrypt_',''); // open first profile inbox
      location.hash = `#/inbox/${id}`;
    } else {
      toast('No inbox found. Create your link first!');
    }
  });

  $('#openLinks')?.addEventListener('click', ()=>{
    // scrolls smoothly to Live Preview section
    document.getElementById('live-preview')?.scrollIntoView({ behavior: 'smooth' });
  });

  $('#openSenders')?.addEventListener('click', ()=>{
    toast('Unlimited anonymous senders can message you.');
  });

  // --- Boot ---
  route();
})();