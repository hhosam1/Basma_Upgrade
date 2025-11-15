// ================== Elements (both pages) ==================
const form   = document.getElementById('composer');   // chat composer (chat page)
const input  = document.getElementById('input');
const list   = document.getElementById('timeline');
const scroll = document.getElementById('scroll');

// Sidebar (chat page)
const sidebarEl  = document.getElementById('sidebar');
const threadList = document.getElementById('threadList');
const newChatBtn = document.getElementById('newChatBtn');
const menuBtn    = document.getElementById('menuBtn');
const clearAllBtn= document.getElementById('clearAllBtn');

// Page detection
const IS_CHAT  = !!document.getElementById('composer');
const IS_LOGIN = !!document.getElementById('loginForm');

// ================== Storage keys & profile ==================
const PKEY = 'basma.profile.v1';
const SVER = 4;
const SKEY = 'basma.sessions.v' + SVER;
const UIK  = 'basma.ui.v' + SVER;

const DEFAULT_PROFILE = {
  name: 'Jasim Salman',
  cpr: '123456789',
  dob: '1990-05-12',
  mobile: '+973 35555555',
  email: 'hosam@example.com',
  plate: '12345',
  ewaAccount: 'EWA-1234567'
};

function safeGet(key, fallback) { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } }
function safeSet(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }

function loadProfile() { try { return { ...DEFAULT_PROFILE, ...(JSON.parse(localStorage.getItem(PKEY)) || {}) }; } catch { return { ...DEFAULT_PROFILE }; } }
function saveProfile(p) { try { localStorage.setItem(PKEY, JSON.stringify(p)); } catch { } }

let PROFILE = loadProfile();
let restoring = false;

// ================== Utilities ==================
const tz = 'Asia/Bahrain';
const uid = () => Math.random().toString(36).slice(2, 10);
function nowStamp(locale = document.documentElement.lang || 'en-BH') {
  const d = new Date();
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: tz });
  const day  = d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: tz });
  return `${time} ${day}`;
}
function scrollToBottom() { requestAnimationFrame(() => { scroll && (scroll.scrollTop = scroll.scrollHeight); }); }
function escapeHTML(s) { return (s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function debounce(fn, ms = 150) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// ================== Modal (confirm) ==================
function injectModalStylesOnce() {
  if (document.getElementById('basma-modal-style')) return;
  const css = `
  .modal-overlay{position:fixed;inset:0;background:rgba(15,23,42,.55);backdrop-filter:saturate(120%) blur(2px);display:flex;align-items:center;justify-content:center;z-index:60;}
  .modal{background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(2,12,27,.25);max-width:420px;width:92%;padding:18px;}
  .modal h3{margin:0 0 8px 0;font-size:18px;color:#0f172a}
  .modal p{margin:0 0 16px;color:#475569}
  .modal .actions{display:flex;gap:10px;justify-content:flex-end}
  .modal .btn{height:38px;padding:0 14px;border:0;border-radius:10px;cursor:pointer;font-weight:800}
  .modal .btn.cancel{background:#e2e8f0;color:#0f172a}
  .modal .btn.danger{background:#e32645;color:#fff;box-shadow:0 6px 16px rgba(227,38,69,.25)}
  `;
  const s = document.createElement('style'); s.id = 'basma-modal-style'; s.textContent = css; document.head.appendChild(s);
}
function confirmModal({ title, message, confirmText, cancelText }) {
  injectModalStylesOnce();
  return new Promise(res => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title">
        <h3 id="m-title">${escapeHTML(title || 'Confirm')}</h3>
        <p>${escapeHTML(message || 'Are you sure?')}</p>
        <div class="actions">
          <button class="btn cancel" data-act="cancel">${escapeHTML(cancelText || 'Cancel')}</button>
          <button class="btn danger" data-act="ok">${escapeHTML(confirmText || 'Delete')}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const cleanup = v => { overlay.remove(); res(v); };
    overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(false); });
    overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => cleanup(false));
    overlay.querySelector('[data-act="ok"]').addEventListener('click', () => cleanup(true));
    const onKey = e => { if (e.key === 'Escape') { cleanup(false); window.removeEventListener('keydown', onKey); } if (e.key === 'Enter') { cleanup(true); window.removeEventListener('keydown', onKey); } };
    window.addEventListener('keydown', onKey);
  });
}

// ================== OTP modal (animated autofill) ==================
function injectOtpStylesOnce() {
  if (document.getElementById('basma-otp-style')) return;
  const css = `
  .otp-wrap { display:grid; gap:12px; margin:10px 0 4px; }
  .otp-inputs { display:flex; gap:8px; justify-content:center; }
  .otp-box { width:40px; height:46px; text-align:center; font-size:20px; font-weight:800; border:1px solid #e5e7eb; border-radius:10px; outline:none; transition:transform .12s ease, box-shadow .12s ease; }
  .otp-box.filled { transform: scale(1.06); box-shadow: 0 4px 14px rgba(2,12,27,.08); }
  .otp-hint { font-size:12px; color:#64748b; text-align:center; }
  .otp-error { font-size:12px; color:#dc2626; display:none; text-align:center; }
  .modal .actions .btn.neutral { background:#eef2ff; color:#1e3a8a; }`;
  const s = document.createElement('style'); s.id = 'basma-otp-style'; s.textContent = css; document.head.appendChild(s);
}
/** otpVerify({ title, message, digits=6, dummy='123456', autoFillAfter=2000, perDigitDelay=140, autoConfirmWhenFilled=true, locale }) */
function otpVerify(opts = {}) {
  injectModalStylesOnce(); injectOtpStylesOnce();
  const {
    title = 'OTP Verification', message = 'Enter the 6-digit code sent to your phone.', digits = 6, dummy = '123456',
    autoFillAfter = 2000, perDigitDelay = 140, autoConfirmWhenFilled = true
  } = opts;

  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="otp-title">
        <h3 id="otp-title">${escapeHTML(title)}</h3>
        <p>${escapeHTML(message)}</p>
        <div class="otp-wrap">
          <div class="otp-inputs" role="group" aria-label="OTP">
            ${Array.from({ length: digits }).map(() => `<input class="otp-box" type="text" inputmode="numeric" maxlength="1" />`).join('')}
          </div>
          <div class="otp-hint">OTP will auto-fill shortly…</div>
          <div class="otp-error">Code incomplete</div>
        </div>
        <div class="actions">
          <button class="btn cancel" data-act="cancel">Cancel</button>
          <button class="btn neutral" type="button" data-act="resend">Resend</button>
          <button class="btn danger" data-act="verify" disabled>Confirm</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const boxes    = [...overlay.querySelectorAll('.otp-box')];
    const verifyBtn= overlay.querySelector('[data-act="verify"]');
    const cancelBtn= overlay.querySelector('[data-act="cancel"]');
    const resendBtn= overlay.querySelector('[data-act="resend"]');
    const errEl    = overlay.querySelector('.otp-error');

    const val = () => boxes.map(b => b.value).join('');
    const setEnable = () => verifyBtn.disabled = val().length !== digits;

    boxes.forEach((box, idx) => {
      box.addEventListener('input', () => {
        box.value = (box.value || '').replace(/\D/g, '').slice(0, 1);
        box.classList.toggle('filled', !!box.value);
        errEl.style.display = 'none';
        if (box.value && idx < boxes.length - 1) boxes[idx + 1].focus();
        setEnable();
      });
      box.addEventListener('keydown', e => {
        if (e.key === 'Backspace' && !box.value && idx > 0) {
          boxes[idx - 1].focus(); boxes[idx - 1].value = ''; boxes[idx - 1].classList.remove('filled'); setEnable();
        }
      });
      box.addEventListener('paste', e => {
        const t = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, digits);
        if (!t) return;
        e.preventDefault();
        boxes.forEach((b, i) => { b.value = t[i] || ''; b.classList.toggle('filled', !!t[i]); });
        setEnable();
      });
    });

    const cleanup = ok => { overlay.remove(); resolve(ok); };
    cancelBtn.addEventListener('click', () => cleanup(false));
    overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(false); });
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') cleanup(false);
      if (e.key === 'Enter') { if (val().length === digits) cleanup(true); else errEl.style.display = 'block'; }
    }, { once: true });
    verifyBtn.addEventListener('click', () => { if (val().length === digits) cleanup(true); else errEl.style.display = 'block'; });

    boxes[0].focus();

    // animated auto-fill
    let autoTimer, delayTimer;
    const startAutoFill = () => {
      const chars = (dummy + '').replace(/\D/g, '').slice(0, digits).split('');
      let i = 0;
      const step = () => {
        if (i >= boxes.length) { setEnable(); if (autoConfirmWhenFilled) { setTimeout(() => { if (document.body.contains(overlay)) verifyBtn.click(); }, 220); } return; }
        boxes[i].focus(); boxes[i].value = chars[i] || ''; boxes[i].classList.toggle('filled', !!boxes[i].value);
        i += 1; autoTimer = setTimeout(step, perDigitDelay);
      };
      step();
    };
    delayTimer = setTimeout(startAutoFill, Math.max(0, autoFillAfter));

    resendBtn.addEventListener('click', () => {
      clearTimeout(delayTimer); clearTimeout(autoTimer);
      boxes.forEach(b => { b.value = ''; b.classList.remove('filled'); });
      errEl.style.display = 'none'; verifyBtn.disabled = true; boxes[0].focus();
      delayTimer = setTimeout(startAutoFill, 800);
    });
  });
}

// ================== Success Popup (green tick) ==================
function injectSuccessStylesOnce() {
  if (document.getElementById('basma-success-style')) return;
  const css = `
  .success-overlay{position:fixed;inset:0;background:rgba(15,23,42,.45);backdrop-filter:saturate(120%) blur(2px);display:flex;align-items:center;justify-content:center;z-index:70;}
  .success-card{ width:min(420px,92vw); background:#fff; border-radius:16px; padding:20px; box-shadow:0 20px 60px rgba(2,12,27,.25); text-align:center; }
  .success-title{margin:10px 0 6px; font-size:18px; color:#0f172a; font-weight:800;}
  .success-msg{margin:0 0 8px; color:#475569;}
  .success-actions{display:flex; gap:10px; justify-content:center; margin-top:8px;}
  .success-actions .btn{height:38px;padding:0 14px;border:0;border-radius:10px;cursor:pointer;font-weight:800;background:#e2e8f0;color:#0f172a}
  .tick-wrap{display:grid; place-items:center; margin-top:4px;}
  .tick-svg{width:68px; height:68px;}
  .tick-circle,.tick-check{fill:none; stroke:#10b981; stroke-width:4; stroke-linecap:round; stroke-linejoin:round;}
  .tick-circle{ stroke-dasharray:210; stroke-dashoffset:210; animation: tick-draw 850ms ease forwards; }
  .tick-check{ stroke-dasharray:48; stroke-dashoffset:48; animation: tick-check 600ms 350ms ease-out forwards; }
  .tick-pop{animation: tick-pop 320ms ease-out both;}
  @keyframes tick-draw { to { stroke-dashoffset: 0; } }
  @keyframes tick-check { to { stroke-dashoffset: 0; } }
  @keyframes tick-pop { 0%{transform:scale(.8); opacity:.0} 100%{transform:scale(1); opacity:1} }`;
  const s = document.createElement('style'); s.id = 'basma-success-style'; s.textContent = css; document.head.appendChild(s);
}
function successPopup(opts = {}) {
  injectSuccessStylesOnce();
  const { title = 'Completed', message = 'The process completed successfully.', okText = 'OK', autoClose = 1400 } = opts;
  return new Promise(resolve => {
    const overlay = document.createElement('div'); overlay.className = 'success-overlay';
    overlay.innerHTML = `
      <div class="success-card" role="dialog" aria-modal="true" aria-labelledby="succ-title">
        <div class="tick-wrap tick-pop" aria-hidden="true">
          <svg class="tick-svg" viewBox="0 0 72 72">
            <circle class="tick-circle" cx="36" cy="36" r="30"/>
            <path class="tick-check" d="M22 37 L32 47 L50 27"/>
          </svg>
        </div>
        <div class="success-title" id="succ-title">${escapeHTML(title)}</div>
        <p class="success-msg">${escapeHTML(message)}</p>
        <div class="success-actions" ${autoClose > 0 ? 'style="display:none"' : ''}>
          <button class="btn" data-act="ok">${escapeHTML(okText)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const cleanup = () => { overlay.remove(); resolve(true); };
    if (autoClose > 0) { setTimeout(cleanup, autoClose); overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(); }); }
    else { overlay.querySelector('[data-act="ok"]').addEventListener('click', cleanup); overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(); }); window.addEventListener('keydown', e => { if (e.key === 'Escape') cleanup(); }, { once: true }); }
  });
}

// ================== Session store & UI (chat page) ==================
const SessionStore = {
  data: safeGet(SKEY, { activeId: null, sessions: [] }),
  save: debounce(() => safeSet(SKEY, SessionStore.data), 80),
  all() { return SessionStore.data.sessions; },
  active() { return SessionStore.data.sessions.find(s => s.id === SessionStore.data.activeId) || null; },
  create({ title = 'New chat', type = 'general', status = 'In Progress' } = {}) {
    const s = { id: uid(), title, type, status, createdAt: Date.now(), updatedAt: Date.now(), amount: null, messages: [] };
    SessionStore.data.sessions.unshift(s); SessionStore.data.activeId = s.id; SessionStore.save(); renderSidebar(); return s;
  },
  setActive(id) { SessionStore.data.activeId = id; SessionStore.save(); renderSidebar(); },
  appendMessage(id, { who, html = null, text = null }) { const s = SessionStore.data.sessions.find(x => x.id === id); if (!s) return; s.messages.push({ who, type: html ? 'html' : 'text', content: html ?? text ?? '', ts: Date.now() }); s.updatedAt = Date.now(); SessionStore.save(); },
  setTitle(id, title) { const s = SessionStore.data.sessions.find(x => x.id === id); if (s) { s.title = title; s.updatedAt = Date.now(); SessionStore.save(); renderSidebar(); } },
  setStatus(id, status) { const s = SessionStore.data.sessions.find(x => x.id === id); if (s) { s.status = status; s.updatedAt = Date.now(); SessionStore.save(); renderSidebar(); } },
  setAmount(id, amount) { const s = SessionStore.data.sessions.find(x => x.id === id); if (s) { s.amount = amount; s.updatedAt = Date.now(); SessionStore.save(); renderSidebar(); } },
  delete(id) { SessionStore.data.sessions = SessionStore.data.sessions.filter(s => s.id !== id); if (SessionStore.data.activeId === id) SessionStore.data.activeId = SessionStore.data.sessions[0]?.id || null; SessionStore.save(); renderSidebar(); }
};
const UI = { get() { return safeGet(UIK, { lang: 'en', draft: '', sidebarHidden: false }); }, save: debounce(v => safeSet(UIK, v), 80) };

// ================== Bubbles (chat) ==================
function bubble({ html, text, who = 'user', avatar = null }) {
  const section = document.createElement('section');
  section.className = `msg ${who}`; section.setAttribute('aria-label', who === 'user' ? 'User message' : 'Basma message');

  const avatarEl = document.createElement('div'); avatarEl.className = `avatar ${who}`; avatarEl.setAttribute('aria-hidden', 'true');
  if (who === 'bot') { const img = document.createElement('img'); img.src = 'basma.png'; img.alt = 'Basma avatar'; avatarEl.appendChild(img); } else { avatarEl.textContent = avatar || 'H'; }

  const time = document.createElement('div'); time.className = 'time'; time.textContent = nowStamp();
  const bubbleEl = document.createElement('div'); bubbleEl.className = 'bubble'; if (html) bubbleEl.innerHTML = html; else bubbleEl.textContent = text || '';

  const right = document.createElement('div'); right.appendChild(bubbleEl); right.appendChild(time);

  if (who === 'user') { section.appendChild(right); section.appendChild(avatarEl); } else { section.appendChild(avatarEl); section.appendChild(right); }
  list.appendChild(section); scrollToBottom();

  if (!restoring) { const active = SessionStore.active() || SessionStore.create(); SessionStore.appendMessage(active.id, { who, html, text }); }
  return section;
}

// ================== Greeting & forms (chat) ==================
function seedGreetingHTML() {
  const first = (PROFILE?.name || 'Friend').split(' ')[0];
  return `
    <p><strong>Good evening ${escapeHTML(first)}!</strong> <span>Select a service to get started.</span></p>
    <div class="chips">
      <button class="chip" data-text="Renew CPR" type="button">Renew CPR</button>
      <button class="chip" data-text="Traffic fines" type="button">Traffic Fines</button>
      <button class="chip" data-text="EWA bill" type="button">EWA Bill</button>
    </div>`;
}
function seedGreetingOnce() {
  const last = list?.lastElementChild?.querySelector?.('.bubble');
  const hasChips = last?.querySelector?.('.chips');
  if (!hasChips) {
    bubble({ html: seedGreetingHTML(), who: 'bot' });
  }
}

function cprForm(profile = PROFILE) {
  return `
    <h4>Renew CPR — Confirm your details</h4>
    <div class="hint">Please review your info and click <b>Continue</b> to confirm.</div>
    <form id="cprForm" class="chatform" novalidate>
      <div class="row"><label for="cpr">CPR Number</label><input id="cpr" name="cpr" inputmode="numeric" value="${escapeHTML(profile.cpr)}" required /><div class="hint">9 digits (no dash).</div><div class="error" data-for="cpr">Please enter a valid 9-digit CPR.</div></div>
      <div class="row"><label for="dob">Date of Birth</label><input id="dob" name="dob" type="date" value="${escapeHTML(profile.dob)}" required /><div class="error" data-for="dob">Please select your date of birth.</div></div>
      <div class="row"><label for="mobile">Mobile</label><input id="mobile" name="mobile" inputmode="tel" value="${escapeHTML(profile.mobile)}" required /><div class="error" data-for="mobile">Please enter a valid Bahrain mobile.</div></div>
      <div class="row"><label for="email">Email</label><input id="email" name="email" type="email" value="${escapeHTML(profile.email)}" required /><div class="error" data-for="email">Please enter a valid email.</div></div>
      <div class="actions"><button class="btn" type="submit">Continue</button><button class="btn secondary" type="button" id="cancelCpr">Cancel</button></div>
    </form>`;
}

function trafficForm(profile = PROFILE) {
  return `
    <h4>Traffic Fines — Confirm</h4>
    <div class="hint">Review your info and click <b>Lookup</b>.</div>
    <form id="trafficForm" class="chatform" novalidate>
      <div class="row"><label for="tf_cpr">CPR Number</label><input id="tf_cpr" name="cpr" inputmode="numeric" value="${escapeHTML(profile.cpr)}" required /><div class="error" data-for="tf_cpr">Enter a valid 9-digit CPR.</div></div>
      <div class="row"><label for="tf_plate">Plate Number</label><input id="tf_plate" name="plate" value="${escapeHTML(profile.plate)}" required /><div class="error" data-for="tf_plate">Enter a valid plate number.</div></div>
      <div class="actions"><button class="btn" type="submit">Lookup</button><button class="btn secondary" type="button" id="cancelTraffic">Cancel</button></div>
    </form>`;
}

function ewaForm(profile = PROFILE) {
  return `
    <h4>EWA Bill — Confirm</h4>
    <div class="hint">Review your info and click <b>Lookup</b>.</div>
    <form id="ewaForm" class="chatform" novalidate>
      <div class="row"><label for="ewa_acc">EWA Account</label><input id="ewa_acc" name="account" value="${escapeHTML(profile.ewaAccount)}" required /><div class="error" data-for="ewa_acc">Enter a valid account.</div></div>
      <div class="row"><label for="ewa_mobile">Mobile</label><input id="ewa_mobile" name="mobile" inputmode="tel" value="${escapeHTML(profile.mobile)}" required /><div class="error" data-for="ewa_mobile">Enter a valid Bahrain mobile.</div></div>
      <div class="actions"><button class="btn" type="submit">Lookup</button><button class="btn secondary" type="button" id="cancelEwa">Cancel</button></div>
    </form>`;
}

// ================== Mock data (chat) ==================
function mockTrafficFines({ cpr, plate }) {
  const names = ["Ahmed Hassan","Fatima Salman","Mohammed Ali","Sara AlBalooshi","Yousef AlHaddad"];
  const name = names[parseInt(cpr.slice(-1) || "0",10) % names.length];
  const catalog = [
    { code:"SPD-120+", type:"Speeding", title:"Speeding over 120 km/h",          location:"Shaikh Khalifa Bin Salman Hwy", datetime:"2025-09-14 14:22", amount:50 },
    { code:"SEAT-01",  type:"Seatbelt", title:"Seatbelt not fastened (driver)",  location:"Exhibition Ave, Manama",       datetime:"2025-10-02 08:10", amount:20 },
    { code:"PHONE-02", type:"Mobile phone", title:"Using mobile phone while driving", location:"Sitra Highway",        datetime:"2025-10-18 17:43", amount:25 },
    { code:"PRK-03",   type:"Parking", title:"No-parking zone",                   location:"Block 338",                   datetime:"2025-10-22 21:05", amount:10 },
    { code:"RL-01",    type:"Red light", title:"Red light violation",             location:"Seef Signal",                 datetime:"2025-09-28 19:02", amount:100 }
  ];
  const idx = parseInt(cpr.slice(-2) || "0",10) % catalog.length;
  const items = [catalog[idx], catalog[(idx+2)%catalog.length]];
  const header = `<h4>Lookup Result — Traffic Fines</h4>`;
  const summary = `
    <div class="infoblock">
      <div class="row"><div class="label">Name</div><div class="value">${name}</div></div>
      <div class="row"><div class="label">CPR Number</div><div class="value">${cpr}</div></div>
      <div class="row"><div class="label">Plate Number</div><div class="value">${plate}</div></div>
    </div>`;
  const listHtml = items.map(i => `
      <div class="item">
        <div>
          <div class="title">${i.title}</div>
          <div class="meta">${i.code} · ${i.datetime} · ${i.location}</div>
          <div class="tags"><span class="tag">${i.type}</span></div>
        </div>
        <div class="money">BD ${i.amount.toFixed(3)}</div>
      </div>`).join('');
  const total = items.reduce((s,i)=>s+i.amount,0);
  return `${header}${summary}<div class="fines">${listHtml}</div>
    <div class="payrow"><div><strong>Total Due:</strong> <span class="money">BD ${total.toFixed(3)}</span></div>
    <button class="btn pay" data-pay="traffic" data-amount="${total.toFixed(3)}">Pay Now</button></div>
    <div class="muted">UI-only demo — data not real.</div>`;
}
function mockEwaBill({ account, mobile }) {
  const amount = 18.750;
  return `
    <h4>Lookup Result — EWA Bill</h4>
    <div class="infoblock">
      <div class="row"><div class="label">Account</div><div class="value">${account}</div></div>
      <div class="row"><div class="label">Mobile</div><div class="value">${mobile}</div></div>
      <div class="row"><div class="label">Amount Due</div><div class="value money">BD ${amount.toFixed(3)}</div></div>
    </div>
    <div class="payrow"><div><strong>Amount Due:</strong> <span class="money">BD ${amount.toFixed(3)}</span></div>
      <button class="btn pay" data-pay="ewa" data-amount="${amount.toFixed(3)}">Pay Now</button>
    </div>
    <div class="muted">UI-only demo.</div>`;
}

// ================== Language (force English) ==================
function setLang() {
  document.documentElement.lang = 'en';
  document.documentElement.dir  = 'ltr';
  const titleEl = document.getElementById('chatTitle'); if (titleEl) titleEl.textContent = 'Chat with Basma';
  if (input) input.placeholder = 'Ask me anything';
  const ui = UI.get(); ui.lang = 'en'; UI.save(ui);
}

// ================== Sidebar render (chat) ==================
function renderSidebar() {
  if (!threadList) return;
  const sessions = SessionStore.all(); const activeId = SessionStore.data.activeId;
  threadList.innerHTML = sessions.map(s => {
    const dt = new Date(s.updatedAt);
    const pretty = dt.toLocaleDateString([], { month: 'short', day: '2-digit' }) + ' ' + dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const amount = (s.amount != null) ? `BD ${Number(s.amount).toFixed(3)}` : '';
    const badgeText = s.status === 'Completed' ? 'Completed' : (s.type === 'payment' ? 'Payment' : 'In Progress');
    const avatarClass = (s.type || 'general').replace(/\s+/g, '').toLowerCase();
    return `
      <div class="thread-card ${s.id === activeId ? 'active' : ''}" data-id="${s.id}" role="listitem" tabindex="0" aria-label="${escapeHTML(s.title)}">
        <div class="thread-avatar ${avatarClass}">${(s.type || 'G').slice(0, 1).toUpperCase()}</div>
        <div class="thread-body">
          <div class="thread-title">${escapeHTML(s.title)}</div>
          <div class="thread-meta">
            <span class="thread-badge">${badgeText}</span>
            <span>${escapeHTML(s.type || 'general')}</span>
            ${amount ? `<span class="thread-amount">${amount}</span>` : ''}
            <span class="thread-date">${pretty}</span>
          </div>
        </div>
        <div class="thread-actions">
          <button class="thread-del" title="Delete chat" aria-label="Delete chat" data-id="${s.id}">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>`;
  }).join('');
}
function openSession(id) {
  const s = SessionStore.all().find(x => x.id === id); if (!s) return;
  SessionStore.setActive(id); list.innerHTML = ''; restoring = true;
  s.messages.forEach(m => bubble({ who: m.who, html: m.type === 'html' ? m.content : null, text: m.type === 'text' ? m.content : null }));
  restoring = false;
}

// ================== Router (chat) ==================
function isTrulyEmptyNewChat(session) { if (!session) return false; const titleIsNew = /^new chat$/i.test(session.title.trim()); const noUserMsg = !(session.messages || []).some(m => m.who === 'user'); return session.type === 'general' && titleIsNew && noUserMsg; }
function convertActiveOrCreate({ title, type, status = 'In Progress' }) { const s = SessionStore.active(); if (isTrulyEmptyNewChat(s)) { s.title = title; s.type = type; s.status = status; s.updatedAt = Date.now(); SessionStore.save(); renderSidebar(); return s; } return SessionStore.create({ title, type, status }); }

form?.addEventListener('submit', e => {
  e.preventDefault(); const value = input.value.trim(); if (!value) return;
  bubble({ text: value, who: 'user', avatar: 'H' });

  const v = value.toLowerCase();
  const isCPR = /(cpr|renew cpr|renewal|identity)/i.test(v);
  const isFine= /(traffic|fine|fines|ticket)/i.test(v);
  const isEwa = /(ewa|bill|electric|water)/i.test(v);

  let section;
  if (isFine) { convertActiveOrCreate({ title: 'Traffic Fines', type: 'traffic' }); section = bubble({ html: trafficForm(PROFILE), who: 'bot' }); }
  else if (isEwa) { convertActiveOrCreate({ title: 'EWA Bill', type: 'ewa' }); section = bubble({ html: ewaForm(PROFILE), who: 'bot' }); }
  else if (isCPR) { convertActiveOrCreate({ title: 'Renew CPR', type: 'cpr' }); section = bubble({ html: cprForm(PROFILE), who: 'bot' }); }
  else { section = bubble({ html: 'Thanks! Your question will be routed to support later (UI only).', who: 'bot' }); }

  section?.querySelector?.('button[type="submit"]')?.focus?.({ preventScroll: true }); section?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  input.value = ''; const ui = UI.get(); ui.draft = ''; UI.save(ui); renderSidebar();
});

// ================== Form handlers (delegated) ==================
list?.addEventListener('submit', async (e) => {
  // CPR
  if (e.target && e.target.id === 'cprForm') {
    e.preventDefault();
    const f = e.target;
    const cpr    = f.querySelector('#cpr')?.value.trim() || '';
    const dob    = f.querySelector('#dob')?.value.trim() || '';
    const mobile = f.querySelector('#mobile')?.value.trim() || '';
    const email  = f.querySelector('#email')?.value.trim() || '';
    f.querySelectorAll('.error').forEach(el => el.style.display = 'none');
    let ok = true;
    if (!/^[0-9]{9}$/.test(cpr)) { f.querySelector('.error[data-for="cpr"]').style.display = 'block'; ok = false; }
    if (!dob) { f.querySelector('.error[data-for="dob"]').style.display = 'block'; ok = false; }
    if (!/^(\+973\s?)?3[0-9]{7}$/.test(mobile.replace(/\s+/g, ''))) { f.querySelector('.error[data-for="mobile"]').style.display = 'block'; ok = false; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { f.querySelector('.error[data-for="email"]').style.display = 'block'; ok = false; }
    if (!ok) return;

    PROFILE = { ...PROFILE, cpr, dob, mobile, email }; saveProfile(PROFILE);
    const mobMask = mobile.replace(/(\+973\s?)?(3)(\d{3})(\d{4})/, '+973 $2***$4');
    const verified = await otpVerify({
      title: 'OTP Verification',
      message: `Enter the 6-digit code sent to ${mobMask}.`,
      dummy: '482913', autoFillAfter: 2000, perDigitDelay: 140, autoConfirmWhenFilled: true
    });
    if (!verified) { bubble({ html: 'Cancelled.', who: 'bot' }); return; }

    await successPopup({ title: 'CPR Renewed', message: 'Your CPR renewal has been completed successfully.', autoClose: 1400 });

    const masked = cpr.replace(/^([0-9]{3})([0-9]{3})([0-9]{3})$/, '$1-$2-***');
    const html = `<strong>CPR renewed successfully.</strong><br/>Completed renewal for <b>${masked}</b>.<br/><span class="muted">A confirmation Email was sent to you.</span>`;
    bubble({ html, who: 'bot' });
    const active = SessionStore.active(); if (active) { SessionStore.setTitle(active.id, 'Renew CPR — ' + masked); SessionStore.setStatus(active.id, 'Completed'); }
  }

  // Traffic lookup
  if (e.target && e.target.id === 'trafficForm') {
    e.preventDefault(); const f = e.target;
    const cpr   = f.querySelector('#tf_cpr')?.value.trim() || '';
    const plate = f.querySelector('#tf_plate')?.value.trim() || '';
    f.querySelectorAll('.error').forEach(el => el.style.display = 'none');
    let ok = true;
    if (!/^[0-9]{9}$/.test(cpr)) { f.querySelector('.error[data-for="tf_cpr"]').style.display = 'block'; ok = false; }
    if (!/^[A-Za-z0-9-]{3,}$/.test(plate)) { f.querySelector('.error[data-for="tf_plate"]').style.display = 'block'; ok = false; }
    if (!ok) return;
    PROFILE = { ...PROFILE, cpr, plate }; saveProfile(PROFILE);
    bubble({ html: mockTrafficFines({ cpr, plate }), who: 'bot' });
    const active = SessionStore.active(); if (active) { SessionStore.setTitle(active.id, 'Traffic Fines — ' + plate.toUpperCase()); SessionStore.setStatus(active.id, 'In Progress'); }
  }

  // EWA lookup
  if (e.target && e.target.id === 'ewaForm') {
    e.preventDefault(); const f = e.target;
    const account = f.querySelector('#ewa_acc')?.value.trim() || '';
    const mobile  = f.querySelector('#ewa_mobile')?.value.trim() || '';
    f.querySelectorAll('.error').forEach(el => el.style.display = 'none');
    let ok = true;
    if (!/^[A-Za-z0-9-]{5,}$/.test(account)) { f.querySelector('.error[data-for="ewa_acc"]').style.display = 'block'; ok = false; }
    if (!/^(\+973\s?)?3[0-9]{7}$/.test(mobile.replace(/\s+/g, ''))) { f.querySelector('.error[data-for="ewa_mobile"]').style.display = 'block'; ok = false; }
    if (!ok) return;
    PROFILE = { ...PROFILE, ewaAccount: account, mobile }; saveProfile(PROFILE);
    bubble({ html: mockEwaBill({ account, mobile }), who: 'bot' });
    const active = SessionStore.active(); if (active) { SessionStore.setTitle(active.id, 'EWA Bill — ' + account.toUpperCase()); SessionStore.setStatus(active.id, 'In Progress'); }
  }
});

// ================== Pay Now (Traffic/EWA) ==================
list?.addEventListener('click', async (e) => {
  const btn = e.target.closest('button.btn.pay'); if (!btn) return;
  const type = btn.dataset.pay; const amount = Number(btn.dataset.amount || 0).toFixed(3);
  const mobMask = (PROFILE?.mobile || '+973 3xxxxxxx').replace(/(\+973\s?)?(3)(\d{3})(\d{4})/, '+973 $2***$4');
  const verified = await otpVerify({
    title: 'Verify Payment',
    message: `Enter the 6-digit code sent to ${mobMask} to complete your payment.`,
    dummy: '730164', autoFillAfter: 2000, perDigitDelay: 140, autoConfirmWhenFilled: true
  });
  if (!verified) { bubble({ html: 'Payment cancelled.', who: 'bot' }); return; }

  await successPopup({ title: 'Payment Complete', message: `Your payment (BD ${amount}) was processed successfully.`, autoClose: 1400 });

  const msg = `<strong>Payment successful.</strong><br/>Type: <span class="tag">${type === 'traffic' ? 'Traffic Fines' : 'EWA Bill'}</span><br/>Amount: <b class="money">BD ${amount}</b><br/><span class="muted">A confirmation Email was sent to you.</span>`;
  bubble({ html: msg, who: 'bot' });

  const active = SessionStore.active(); if (active) SessionStore.setStatus(active.id, 'Completed');
  const payTitle = 'Payment — ' + (type === 'traffic' ? 'Traffic' : 'EWA') + ` (BD ${amount})`;
  const s = SessionStore.create({ title: payTitle, type: 'payment', status: 'Completed' }); SessionStore.setAmount(s.id, amount); renderSidebar();
});

// Cancel buttons
list?.addEventListener('click', e => {
  if (e.target.closest('#cancelCpr')) bubble({ html: 'Cancelled.', who: 'bot' });
  if (e.target.closest('#cancelTraffic')) bubble({ html: 'Cancelled.', who: 'bot' });
  if (e.target.closest('#cancelEwa')) bubble({ html: 'Cancelled.', who: 'bot' });
});

// Sidebar interactions
threadList?.addEventListener('click', e => { if (e.target.closest('.thread-del')) return; const item = e.target.closest('.thread-card'); if (!item) return; openSession(item.dataset.id); });
threadList?.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { const item = e.target.closest('.thread-card'); if (item) openSession(item.dataset.id); } });
threadList?.addEventListener('click', async e => {
  const delBtn = e.target.closest('.thread-del'); if (!delBtn) return; e.stopPropagation();
  const id = delBtn.dataset.id;
  const ok = await confirmModal({ title: 'Delete Chat', message: 'Do you want to delete this chat? This cannot be undone.', confirmText: 'Delete', cancelText: 'Cancel' });
  if (!ok) return;
  const wasActive = SessionStore.data.activeId === id; SessionStore.delete(id);
  if (!SessionStore.all().length) { SessionStore.create({ title: 'New chat', type: 'general', status: 'In Progress' }); list.innerHTML = ''; seedGreetingOnce(); }
  else if (wasActive) { openSession(SessionStore.data.activeId || SessionStore.all()[0].id); }
  else { renderSidebar(); }
});

// Chips + keyboard + draft
list?.addEventListener('click', e => { const chip = e.target.closest('.chip'); if (!chip) return; input.value = chip.dataset.text || chip.textContent; form.requestSubmit(); });
input?.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') form.requestSubmit(); });
input?.addEventListener('input', () => { const ui = UI.get(); ui.draft = input.value; UI.save(ui); });

// Sidebar show/hide + persistent state
function setSidebarHidden(hidden) { if (!sidebarEl) return; sidebarEl.classList.toggle('hidden', !!hidden); const ui = UI.get(); ui.sidebarHidden = !!hidden; UI.save(ui); }
function applySidebarHiddenFromUI() { if (!sidebarEl) return; const ui = UI.get(); sidebarEl.classList.toggle('hidden', !!ui.sidebarHidden); }
menuBtn?.addEventListener('click', () => { const hidden = sidebarEl?.classList.contains('hidden'); setSidebarHidden(!hidden); });

// Delete all chats button
clearAllBtn?.addEventListener('click', async () => {
  const ok = await confirmModal({
    title: 'Delete All Chats',
    message: 'This will permanently delete all chats. This cannot be undone.',
    confirmText: 'Delete', cancelText: 'Cancel'
  });
  if (!ok) return;
  SessionStore.data.sessions = []; SessionStore.data.activeId = null; SessionStore.save();
  list.innerHTML = ''; SessionStore.create({ title: 'New chat', type: 'general', status: 'In Progress' }); renderSidebar(); seedGreetingOnce();
});

// Close chat → greeting
document.querySelector('.icon-btn[aria-label="Close chat"]')?.addEventListener('click', () => { list.innerHTML = ''; seedGreetingOnce(); });

// New chat
newChatBtn?.addEventListener('click', () => { SessionStore.create({ title: 'New chat', type: 'general', status: 'In Progress' }); list.innerHTML = ''; seedGreetingOnce(); });

// ================== Boot (chat page only) ==================
if (IS_CHAT) {
  (function boot() {
    const ui = UI.get(); setLang(); if (ui.draft && input) input.value = ui.draft;
    const app = document.querySelector('.app'); if (app && getComputedStyle(app).position === 'static') app.style.position = 'relative';
    if (!SessionStore.data.sessions.length) { SessionStore.create({ title: 'New chat', type: 'general' }); list.innerHTML = ''; seedGreetingOnce(); }
    else { renderSidebar(); openSession(SessionStore.data.activeId || SessionStore.data.sessions[0].id); }
    renderSidebar(); applySidebarHiddenFromUI();
    window.addEventListener('resize', debounce(() => { if (window.innerWidth <= 900) setSidebarHidden(true); else applySidebarHiddenFromUI(); }, 120));
  })();
}

// ================== Busy overlay for login (lightweight) ==================
function injectBusyStylesOnce() {
  if (document.getElementById('basma-busy-style')) return;
  const s = document.createElement('style'); s.id = 'basma-busy-style';
  s.textContent = ''; // CSS is in styles.css; this function is a no-op gate.
  document.head.appendChild(s);
}
let __busyEl = null;
function showBusy(text = 'Working…') {
  injectBusyStylesOnce();
  if (__busyEl) return;
  const el = document.createElement('div');
  el.className = 'busy-overlay';
  el.innerHTML = `<div class="busy-card">
      <div class="spinner" aria-hidden="true"></div>
      <div class="busy-text">${text}</div>
    </div>`;
  document.body.appendChild(el);
  __busyEl = el;
}
function hideBusy() {
  if (__busyEl) { __busyEl.remove(); __busyEl = null; }
}

// ================== Login page logic (English-only, error-on-interaction) ==================
if (IS_LOGIN) {
  const loginForm = document.getElementById('loginForm');
  const nameEl    = document.getElementById('name');
  const contactEl = document.getElementById('contact');
  const consent   = document.getElementById('consent');
  const startBtn  = document.getElementById('startBtn');
  const errName   = document.getElementById('errName');
  const errContact= document.getElementById('errContact');
  const errConsent= document.getElementById('errConsent');
  const ekeyBtn   = document.getElementById('ekeyBtn');

  // Prefill from profile
  const PROF = { ...DEFAULT_PROFILE, ...(safeGet(PKEY, {}) || {}) };
  if (PROF.name) nameEl.value = PROF.name;
  if (PROF.mobile || PROF.email) contactEl.value = PROF.mobile || PROF.email || '';

  // Helpers
  function isEmail(v) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v); }
  function isBhMobile(v) { v = v.replace(/\s+/g, ''); return /^(\+973)?3\d{7}$/.test(v); }

  // --- Show errors only after interaction / submit ---
  let touchedName = false;
  let touchedContact = false;
  let touchedConsent = false;
  let triedSubmit = false;

  function validate(showErrors = false){
    const vName    = nameEl.value.trim();
    const vContact = contactEl.value.trim();
    const okName    = !!vName;
    const okContact = isEmail(vContact) || isBhMobile(vContact);
    const okConsent = consent.checked;

    // enable/disable CTA
    if (startBtn) startBtn.disabled = !(okName && okContact && okConsent);

    // decide whether to show error messages
    const showNameErr    = showErrors || touchedName;
    const showContactErr = showErrors || touchedContact;
    const showConsentErr = showErrors || touchedConsent;

    if (errName)    errName.style.display    = (!okName    && showNameErr)    ? 'block' : 'none';
    if (errContact) errContact.style.display = (!okContact && showContactErr) ? 'block' : 'none';
    if (errConsent) errConsent.style.display = (!okConsent && showConsentErr) ? 'block' : 'none';

    return okName && okContact && okConsent;
  }

  // mark fields as "touched" and revalidate
  nameEl.addEventListener('blur',   ()=>{ touchedName = true;    validate(triedSubmit); });
  contactEl.addEventListener('blur',()=>{ touchedContact = true; validate(triedSubmit); });
  consent.addEventListener('change',()=>{ touchedConsent = true; validate(triedSubmit); });
  nameEl.addEventListener('input',   ()=>validate(triedSubmit));
  contactEl.addEventListener('input',()=>validate(triedSubmit));

  // eKey 2.0 dummy login (does NOT require filling/consent)
  ekeyBtn?.addEventListener('click', async () => {
    ekeyBtn.disabled = true;

    showBusy('Signing in with eKey 2.0…');
    await new Promise(r => setTimeout(r, 900));

    const eKeyIdentity = {
      version: '2.0',
      id: 'EKY-DEMO-001',
      assurance: 'Substantial',
      given_name: 'Jasim',
      family_name: 'Salman',
      cpr: '941234567',
      email: 'hosam.ekey@gov.bh',
      mobile: '+973 35551234'
    };

    const existing = safeGet(PKEY, {}) || {};
    const profile = {
      ...existing,
      name: `${eKeyIdentity.given_name} ${eKeyIdentity.family_name}`,
      cpr: eKeyIdentity.cpr,
      email: eKeyIdentity.email,
      mobile: eKeyIdentity.mobile,
      ekey: { version: eKeyIdentity.version, id: eKeyIdentity.id, assurance: eKeyIdentity.assurance }
    };
    safeSet(PKEY, profile);
    safeSet(UIK, { lang: 'en' });

    hideBusy();

    if (typeof successPopup === 'function') {
      await successPopup({
        title: 'Signed in',
        message: 'You’ve been authenticated via eKey 2.0.',
        autoClose: 900
      });
    }

    const url = new URL('index.html', window.location.href);
    window.location.href = url.toString();
  });

  // Normal submit path (requires validation)
  loginForm.addEventListener('submit', e => {
    e.preventDefault();
    triedSubmit = true;                 // show errors if any on submit
    if (!validate(true)) return;

    const v = contactEl.value.trim();
    const profile = { ...(safeGet(PKEY, {}) || {}) };
    profile.name = nameEl.value.trim();
    if (isEmail(v)) profile.email = v;
    else profile.mobile = v.startsWith('+973') ? v : '+973 ' + v.replace(/^(\+973)?/, '');
    safeSet(PKEY, profile);
    safeSet(UIK, { lang: 'en' });

    const url = new URL('index.html', window.location.href);
    window.location.href = url.toString();
  });

  // Initial state: hide all errors, set button disabled/enabled correctly
  validate(false);
}
