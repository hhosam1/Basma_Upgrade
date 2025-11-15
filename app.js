// ================== Elements ==================
const form = document.getElementById('composer');
const input = document.getElementById('input');
const list = document.getElementById('timeline');
const scroll = document.getElementById('scroll');
const btnEn = document.getElementById('btnEn');
const btnAr = document.getElementById('btnAr');

// ===== Dummy user profile (persisted) =====
const PKEY = 'basma.profile.v1';
const DEFAULT_PROFILE = {
  // Identity
  name: 'Hosam Al Khalifa',
  cpr: '123456789',
  dob: '1990-05-12',       // yyyy-mm-dd
  mobile: '+973 35555555',
  email: 'hosam@example.com',

  // Traffic
  plate: '12345',

  // EWA
  ewaAccount: 'EWA-1234567'
};

function loadProfile() {
  try {
    return { ...DEFAULT_PROFILE, ...(JSON.parse(localStorage.getItem(PKEY)) || {}) };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}
function saveProfile(p) {
  try { localStorage.setItem(PKEY, JSON.stringify(p)); } catch { }
}

let PROFILE = loadProfile();

// Sidebar
const sidebarEl = document.getElementById('sidebar');
const threadList = document.getElementById('threadList');
const newChatBtn = document.getElementById('newChatBtn');
const menuBtn = document.getElementById('menuBtn');
const clearAllBtn  = document.getElementById('clearAllBtn');

// ================== Utilities ==================
const tz = 'Asia/Bahrain';
function nowStamp(locale = document.documentElement.lang || 'en-BH') {
  const d = new Date();
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: tz });
  const day = d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: tz });
  return `${time} ${day}`;
}
function scrollToBottom() { requestAnimationFrame(() => { scroll.scrollTop = scroll.scrollHeight; }); }
const uid = () => Math.random().toString(36).slice(2, 10);
function escapeHTML(s) { return (s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function debounce(fn, ms = 150) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function safeGet(key, fallback) { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } }
function safeSet(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }

let restoring = false;

// ================== Modal (custom confirm) ==================
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
  const style = document.createElement('style');
  style.id = 'basma-modal-style';
  style.textContent = css;
  document.head.appendChild(style);
}
function confirmModal({ title, message, confirmText, cancelText }) {
  injectModalStylesOnce();
  return new Promise(resolve => {
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
    const cleanup = (v) => { overlay.remove(); resolve(v); };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });
    overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => cleanup(false));
    overlay.querySelector('[data-act="ok"]').addEventListener('click', () => cleanup(true));
    const onKey = (e) => { if (e.key === 'Escape') { cleanup(false); window.removeEventListener('keydown', onKey); } if (e.key === 'Enter') { cleanup(true); window.removeEventListener('keydown', onKey); } };
    window.addEventListener('keydown', onKey);
  });
}
clearAllBtn?.addEventListener('click', async () => {
  const ar = document.documentElement.lang.startsWith('ar');

  const ok = await confirmModal({
    title:   ar ? 'حذف جميع المحادثات' : 'Delete All Chats',
    message: ar ? 'سيتم حذف جميع المحادثات نهائيًا. لا يمكن التراجع.' : 'This will permanently delete all chats. This cannot be undone.',
    confirmText: ar ? 'حذف الكل' : 'Delete All',
    cancelText:  ar ? 'إلغاء'   : 'Cancel'
  });
  if (!ok) return;

  // Clear session store
  SessionStore.data.sessions = [];
  SessionStore.data.activeId = null;
  SessionStore.save();

  // Reset UI: empty timeline, create a fresh chat, and show greeting
  list.innerHTML = '';
  const locale = ar ? 'ar' : 'en';
  SessionStore.create({ title: ar ? 'محادثة جديدة' : 'New chat', type: 'general', status: 'In Progress' });
  renderSidebar();
  seedGreetingOnce();
});

// ============ OTP Modal (verification flow) ============
// (includes animated digit-by-digit auto-fill)
function injectOtpStylesOnce() {
  if (document.getElementById('basma-otp-style')) return;
  const css = `
  .otp-wrap { display:grid; gap:12px; margin:10px 0 4px; }
  .otp-inputs { display:flex; gap:8px; justify-content:center; }
  .otp-box {
    width:40px; height:46px; text-align:center; font-size:20px; font-weight:800;
    border:1px solid #e5e7eb; border-radius:10px; outline:none; transition:transform .12s ease, box-shadow .12s ease;
  }
  .otp-box.filled { transform: scale(1.06); box-shadow: 0 4px 14px rgba(2,12,27,.08); }
  .otp-hint { font-size:12px; color:#64748b; text-align:center; }
  .otp-error { font-size:12px; color:#dc2626; display:none; text-align:center; }
  .modal .actions .btn.neutral { background:#eef2ff; color:#1e3a8a; }
  `;
  const style = document.createElement('style');
  style.id = 'basma-otp-style';
  style.textContent = css;
  document.head.appendChild(style);
}

/**
 * Animated OTP modal.
 * opts: { title, message, digits=6, dummy='123456', autoFillAfter=2000, perDigitDelay=140, autoConfirmWhenFilled=true, locale }
 */
function otpVerify(opts = {}) {
  injectModalStylesOnce();
  injectOtpStylesOnce();

  const {
    title = 'OTP Verification',
    message = 'Enter the 6-digit code sent to your phone.',
    digits = 6,
    dummy = '123456',
    autoFillAfter = 2000,
    perDigitDelay = 140,
    autoConfirmWhenFilled = true,
    locale = document.documentElement.lang.startsWith('ar') ? 'ar' : 'en'
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
            ${Array.from({ length: digits }).map((_, i) => `<input class="otp-box" type="text" inputmode="numeric" maxlength="1" aria-label="Digit ${i + 1}" />`).join('')}
          </div>
          <div class="otp-hint">${locale === 'ar' ? 'سيتم إدخال الرمز تلقائيًا قريبًا…' : 'OTP will auto-fill shortly…'}</div>
          <div class="otp-error">${locale === 'ar' ? 'رمز غير مكتمل' : 'Code incomplete'}</div>
        </div>

        <div class="actions">
          <button class="btn cancel" data-act="cancel">${locale === 'ar' ? 'إلغاء' : 'Cancel'}</button>
          <button class="btn neutral" type="button" data-act="resend">${locale === 'ar' ? 'إرسال مجددًا' : 'Resend'}</button>
          <button class="btn danger" data-act="verify" disabled>${locale === 'ar' ? 'تأكيد' : 'Confirm'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const boxes = [...overlay.querySelectorAll('.otp-box')];
    const verifyBtn = overlay.querySelector('[data-act="verify"]');
    const cancelBtn = overlay.querySelector('[data-act="cancel"]');
    const resendBtn = overlay.querySelector('[data-act="resend"]');
    const errEl = overlay.querySelector('.otp-error');

    const val = () => boxes.map(b => b.value).join('');
    const setEnable = () => { verifyBtn.disabled = val().length !== digits; };

    // Manual typing UX
    boxes.forEach((box, idx) => {
      box.addEventListener('input', () => {
        box.value = (box.value || '').replace(/\D/g, '').slice(0, 1);
        box.classList.toggle('filled', !!box.value);
        errEl.style.display = 'none';
        if (box.value && idx < boxes.length - 1) boxes[idx + 1].focus();
        setEnable();
      });
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !box.value && idx > 0) {
          boxes[idx - 1].focus();
          boxes[idx - 1].value = '';
          boxes[idx - 1].classList.remove('filled');
          setEnable();
        }
      });
      // Paste full code
      box.addEventListener('paste', (e) => {
        const t = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, digits);
        if (!t) return;
        e.preventDefault();
        boxes.forEach((b, i) => {
          b.value = t[i] || '';
          b.classList.toggle('filled', !!t[i]);
        });
        setEnable();
      });
    });

    // Buttons
    const cleanup = (ok) => { overlay.remove(); resolve(ok); };
    cancelBtn.addEventListener('click', () => cleanup(false));
    verifyBtn.addEventListener('click', () => {
      if (val().length === digits) cleanup(true);
      else errEl.style.display = 'block';
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') cleanup(false);
      if (e.key === 'Enter') { if (val().length === digits) cleanup(true); else errEl.style.display = 'block'; }
    }, { once: true });

    // Start focus
    boxes[0].focus();

    // Animated auto-fill
    let autoTimer;
    const startAutoFill = () => {
      const chars = (dummy + '').replace(/\D/g, '').slice(0, digits).split('');
      let i = 0;
      const step = () => {
        if (i >= boxes.length) {
          setEnable();
          if (autoConfirmWhenFilled) {
            setTimeout(() => {
              if (document.body.contains(overlay)) verifyBtn.click();
            }, 220);
          }
          return;
        }
        boxes[i].focus();
        boxes[i].value = chars[i] || '';
        boxes[i].classList.toggle('filled', !!boxes[i].value);
        i += 1;
        autoTimer = setTimeout(step, perDigitDelay);
      };
      step();
    };
    let delayTimer = setTimeout(startAutoFill, Math.max(0, autoFillAfter));

    // Resend -> clear and re-run auto-fill quickly
    resendBtn.addEventListener('click', () => {
      clearTimeout(delayTimer);
      clearTimeout(autoTimer);
      boxes.forEach(b => { b.value = ''; b.classList.remove('filled'); });
      errEl.style.display = 'none';
      verifyBtn.disabled = true;
      boxes[0].focus();
      delayTimer = setTimeout(startAutoFill, 800);
    });
  });
}

// ============ Success Popup (green tick) ============
function injectSuccessStylesOnce() {
  if (document.getElementById('basma-success-style')) return;
  const css = `
  .success-overlay{position:fixed;inset:0;background:rgba(15,23,42,.45);backdrop-filter:saturate(120%) blur(2px);display:flex;align-items:center;justify-content:center;z-index:70;}
  .success-card{
    width:min(420px,92vw); background:#fff; border-radius:16px; padding:20px;
    box-shadow:0 20px 60px rgba(2,12,27,.25); text-align:center;
  }
  .success-title{margin:10px 0 6px; font-size:18px; color:#0f172a; font-weight:800;}
  .success-msg{margin:0 0 8px; color:#475569;}
  .success-actions{display:flex; gap:10px; justify-content:center; margin-top:8px;}
  .success-actions .btn{height:38px;padding:0 14px;border:0;border-radius:10px;cursor:pointer;font-weight:800;background:#e2e8f0;color:#0f172a}
  .tick-wrap{display:grid; place-items:center; margin-top:4px;}
  .tick-svg{width:68px; height:68px;}
  .tick-circle, .tick-check{fill:none; stroke:#10b981; stroke-width:4; stroke-linecap:round; stroke-linejoin:round;}
  .tick-circle{ stroke-dasharray:210; stroke-dashoffset:210; animation: tick-draw 850ms ease forwards; }
  .tick-check{ stroke-dasharray:48; stroke-dashoffset:48; animation: tick-check 600ms 350ms ease-out forwards; }
  .tick-pop{animation: tick-pop 320ms ease-out both;}
  @keyframes tick-draw { to { stroke-dashoffset: 0; } }
  @keyframes tick-check { to { stroke-dashoffset: 0; } }
  @keyframes tick-pop { 0%{transform:scale(.8); opacity:.0} 100%{transform:scale(1); opacity:1} }
  `;
  const style = document.createElement('style');
  style.id = 'basma-success-style';
  style.textContent = css;
  document.head.appendChild(style);
}
function successPopup(opts = {}) {
  injectSuccessStylesOnce();
  const locale = document.documentElement.lang.startsWith('ar') ? 'ar' : 'en';
  const {
    title = (locale === 'ar' ? 'تم بنجاح' : 'Completed'),
    message = (locale === 'ar' ? 'تمت العملية بنجاح.' : 'The process completed successfully.'),
    okText = (locale === 'ar' ? 'حسنًا' : 'OK'),
    autoClose = 1400
  } = opts;

  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'success-overlay';
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
      </div>
    `;
    document.body.appendChild(overlay);

    const cleanup = () => { overlay.remove(); resolve(true); };

    if (autoClose > 0) {
      setTimeout(cleanup, autoClose);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });
    } else {
      overlay.querySelector('[data-act="ok"]').addEventListener('click', cleanup);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });
      window.addEventListener('keydown', (e) => { if (e.key === 'Escape') cleanup(); }, { once: true });
    }
  });
}

// ================== Session Store ==================
const SVER = 4;
const SKEY = 'basma.sessions.v' + SVER;
const UIK = 'basma.ui.v' + SVER;

const SessionStore = {
  data: safeGet(SKEY, { activeId: null, sessions: [] }),
  save: debounce(function () { safeSet(SKEY, SessionStore.data); }, 80),

  all() { return SessionStore.data.sessions; },
  active() { return SessionStore.data.sessions.find(s => s.id === SessionStore.data.activeId) || null; },

  create({ title = 'New chat', type = 'general', status = 'In Progress' } = {}) {
    const s = { id: uid(), title, type, status, createdAt: Date.now(), updatedAt: Date.now(), amount: null, messages: [] };
    SessionStore.data.sessions.unshift(s);
    SessionStore.data.activeId = s.id;
    SessionStore.save();
    renderSidebar();
    return s;
  },

  setActive(id) {
    SessionStore.data.activeId = id;
    SessionStore.save();
    renderSidebar();
  },

  appendMessage(id, { who, html = null, text = null }) {
    const s = SessionStore.data.sessions.find(x => x.id === id);
    if (!s) return;
    s.messages.push({ who, type: html ? 'html' : 'text', content: html ?? text ?? '', ts: Date.now() });
    s.updatedAt = Date.now();
    SessionStore.save();
  },

  setTitle(id, title) {
    const s = SessionStore.data.sessions.find(x => x.id === id);
    if (s) { s.title = title; s.updatedAt = Date.now(); SessionStore.save(); renderSidebar(); }
  },

  setStatus(id, status) {
    const s = SessionStore.data.sessions.find(x => x.id === id);
    if (s) { s.status = status; s.updatedAt = Date.now(); SessionStore.save(); renderSidebar(); }
  },

  setAmount(id, amount) {
    const s = SessionStore.data.sessions.find(x => x.id === id);
    if (s) { s.amount = amount; s.updatedAt = Date.now(); SessionStore.save(); renderSidebar(); }
  },

  delete(id) {
    SessionStore.data.sessions = SessionStore.data.sessions.filter(s => s.id !== id);
    if (SessionStore.data.activeId === id) SessionStore.data.activeId = SessionStore.data.sessions[0]?.id || null;
    SessionStore.save();
    renderSidebar();
  }
};

// ================== UI State ==================
const UI = {
  get() { return safeGet(UIK, { lang: document.documentElement.lang || 'en', draft: '', sidebarHidden: false }); },
  save: debounce(function (v) { safeSet(UIK, v); }, 80),
};

// ================== Bubbles ==================
function bubble({ html, text, who = 'user', avatar = null }) {
  const section = document.createElement('section');
  section.className = `msg ${who}`;
  section.setAttribute('aria-label', who === 'user' ? 'User message' : 'Basma message');

  const avatarEl = document.createElement('div');
  avatarEl.className = `avatar ${who}`;
  avatarEl.setAttribute('aria-hidden', 'true');

  if (who === 'bot') {
    const img = document.createElement('img');
    img.src = 'basma.png';
    img.alt = 'Basma avatar';
    avatarEl.appendChild(img);
  } else {
    avatarEl.textContent = avatar || 'H';
  }

  const time = document.createElement('div');
  time.className = 'time';
  time.textContent = nowStamp();

  const bubbleEl = document.createElement('div');
  bubbleEl.className = 'bubble';
  if (html) bubbleEl.innerHTML = html; else bubbleEl.textContent = text || '';

  const right = document.createElement('div');
  right.appendChild(bubbleEl);
  right.appendChild(time);

  if (who === 'user') {
    section.appendChild(right);
    section.appendChild(avatarEl);
  } else {
    section.appendChild(avatarEl);
    section.appendChild(right);
  }

  list.appendChild(section);
  scrollToBottom();

  if (!restoring) {
    const active = SessionStore.active() || SessionStore.create();
    SessionStore.appendMessage(active.id, { who, html, text });
  }

  return section;
}

// ================== Greeting ==================
function seedGreetingHTML(locale) {
  return locale === 'ar'
    ? `<p><strong>مساء الخير يا حسام!</strong> <span>اختر خدمة للبدء.</span></p>
       <div class="chips">
         <button class="chip" data-text="تجديد بطاقة الهوية (CPR)" type="button">تجديد بطاقة الهوية (CPR)</button>
         <button class="chip" data-text="الاستعلام عن المخالفات المرورية" type="button">الاستعلام عن المخالفات المرورية</button>
         <button class="chip" data-text="فاتورة الكهرباء والماء EWA" type="button">فاتورة الكهرباء والماء EWA</button>
       </div>`
    : `<p><strong>Good evening Hosam!</strong> <span>Select a service to get started.</span></p>
       <div class="chips">
         <button class="chip" data-text="Renew CPR" type="button">Renew CPR</button>
         <button class="chip" data-text="Traffic fines" type="button">Traffic Fines</button>
         <button class="chip" data-text="EWA bill" type="button">EWA Bill</button>
       </div>`;
}
function seedGreetingOnce() {
  const locale = document.documentElement.lang.startsWith('ar') ? 'ar' : 'en';
  const last = list.lastElementChild?.querySelector('.bubble');
  const hasChipsAlready = !!last?.querySelector('.chips');
  if (!hasChipsAlready) bubble({ html: seedGreetingHTML(locale), who: 'bot' });
}

// ================== Sidebar Render ==================
function renderSidebar() {
  if (!threadList) return;
  const sessions = SessionStore.all();
  const activeId = SessionStore.data.activeId;

  threadList.innerHTML = sessions.map(s => {
    const dt = new Date(s.updatedAt);
    const pretty = dt.toLocaleDateString([], { month: 'short', day: '2-digit' }) + ' ' +
      dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const amount = (s.amount != null) ? `BD ${Number(s.amount).toFixed(3)}` : '';
    const badgeText = s.status === 'Completed' ? 'Completed'
      : (s.type === 'payment' ? 'Payment' : 'In Progress');
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
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>`;
  }).join('');
}

function openSession(id) {
  const s = SessionStore.all().find(x => x.id === id);
  if (!s) return;
  SessionStore.setActive(id);
  list.innerHTML = '';
  restoring = true;
  s.messages.forEach(m => bubble({ who: m.who, html: m.type === 'html' ? m.content : null, text: m.type === 'text' ? m.content : null }));
  restoring = false;
}

// ================== Forms (prefilled with PROFILE) ==================
function cprForm(locale = 'en', profile = PROFILE) {
  if (locale === 'ar') {
    return `
      <h4>تجديد بطاقة الهوية (CPR)</h4>
      <div class="hint">راجِع بياناتك ثم اضغط <b>متابعة</b> للتأكيد.</div>
      <form id="cprForm" class="chatform" novalidate>
        <div class="row">
          <label for="cpr">رقم الهوية (CPR)</label>
          <input id="cpr" name="cpr" inputmode="numeric" value="${escapeHTML(profile.cpr)}" required />
          <div class="hint">9 أرقام (بدون شرطة).</div>
          <div class="error" data-for="cpr">يرجى إدخال رقم CPR صحيح.</div>
        </div>
        <div class="row">
          <label for="dob">تاريخ الميلاد</label>
          <input id="dob" name="dob" type="date" value="${escapeHTML(profile.dob)}" required />
          <div class="error" data-for="dob">يرجى اختيار تاريخ الميلاد.</div>
        </div>
        <div class="row">
          <label for="mobile">رقم الهاتف</label>
          <input id="mobile" name="mobile" inputmode="tel" value="${escapeHTML(profile.mobile)}" required />
          <div class="error" data-for="mobile">يرجى إدخال رقم هاتف صالح في البحرين.</div>
        </div>
        <div class="row">
          <label for="email">البريد الإلكتروني</label>
          <input id="email" name="email" type="email" value="${escapeHTML(profile.email)}" required />
          <div class="error" data-for="email">يرجى إدخال بريد إلكتروني صالح.</div>
        </div>
        <div class="actions">
          <button class="btn" type="submit">متابعة</button>
          <button class="btn secondary" type="button" id="cancelCpr">إلغاء</button>
        </div>
      </form>
    `;
  }
  return `
    <h4>Renew CPR — Confirm your details</h4>
    <div class="hint">Please review your info and click <b>Continue</b> to confirm.</div>
    <form id="cprForm" class="chatform" novalidate>
      <div class="row">
        <label for="cpr">CPR Number</label>
        <input id="cpr" name="cpr" inputmode="numeric" value="${escapeHTML(profile.cpr)}" required />
        <div class="hint">9 digits (no dash).</div>
        <div class="error" data-for="cpr">Please enter a valid 9-digit CPR.</div>
      </div>
      <div class="row">
        <label for="dob">Date of Birth</label>
        <input id="dob" name="dob" type="date" value="${escapeHTML(profile.dob)}" required />
        <div class="error" data-for="dob">Please select your date of birth.</div>
      </div>
      <div class="row">
        <label for="mobile">Mobile</label>
        <input id="mobile" name="mobile" inputmode="tel" value="${escapeHTML(profile.mobile)}" required />
        <div class="error" data-for="mobile">Please enter a valid Bahrain mobile.</div>
      </div>
      <div class="row">
        <label for="email">Email</label>
        <input id="email" name="email" type="email" value="${escapeHTML(profile.email)}" required />
        <div class="error" data-for="email">Please enter a valid email.</div>
      </div>
      <div class="actions">
        <button class="btn" type="submit">Continue</button>
        <button class="btn secondary" type="button" id="cancelCpr">Cancel</button>
      </div>
    </form>
  `;
}

function trafficForm(locale = 'en', profile = PROFILE) {
  if (locale === 'ar') {
    return `
      <h4>الاستعلام عن المخالفات المرورية</h4>
      <div class="hint">راجِع البيانات ثم اضغط <b>استعلام</b>.</div>
      <form id="trafficForm" class="chatform" novalidate>
        <div class="row">
          <label for="tf_cpr">رقم الهوية (CPR)</label>
          <input id="tf_cpr" name="cpr" inputmode="numeric" value="${escapeHTML(profile.cpr)}" required />
          <div class="error" data-for="tf_cpr">يرجى إدخال CPR صحيح (9 أرقام).</div>
        </div>
        <div class="row">
          <label for="tf_plate">رقم اللوحة</label>
          <input id="tf_plate" name="plate" value="${escapeHTML(profile.plate)}" required />
          <div class="error" data-for="tf_plate">يرجى إدخال رقم لوحة صالح.</div>
        </div>
        <div class="actions">
          <button class="btn" type="submit">استعلام</button>
          <button class="btn secondary" type="button" id="cancelTraffic">إلغاء</button>
        </div>
      </form>
    `;
  }
  return `
    <h4>Traffic Fines — Confirm</h4>
    <div class="hint">Review your info and click <b>Lookup</b>.</div>
    <form id="trafficForm" class="chatform" novalidate>
      <div class="row">
        <label for="tf_cpr">CPR Number</label>
        <input id="tf_cpr" name="cpr" inputmode="numeric" value="${escapeHTML(profile.cpr)}" required />
        <div class="error" data-for="tf_cpr">Enter a valid 9-digit CPR.</div>
      </div>
      <div class="row">
        <label for="tf_plate">Plate Number</label>
        <input id="tf_plate" name="plate" value="${escapeHTML(profile.plate)}" required />
        <div class="error" data-for="tf_plate">Enter a valid plate number.</div>
      </div>
      <div class="actions">
        <button class="btn" type="submit">Lookup</button>
        <button class="btn secondary" type="button" id="cancelTraffic">Cancel</button>
      </div>
    </form>
  `;
}

function ewaForm(locale = 'en', profile = PROFILE) {
  if (locale === 'ar') {
    return `
      <h4>فاتورة الكهرباء والماء (EWA)</h4>
      <div class="hint">راجِع بياناتك ثم اضغط <b>استعلام</b>.</div>
      <form id="ewaForm" class="chatform" novalidate>
        <div class="row">
          <label for="ewa_acc">رقم الحساب (EWA)</label>
          <input id="ewa_acc" name="account" value="${escapeHTML(profile.ewaAccount)}" required />
          <div class="error" data-for="ewa_acc">يرجى إدخال رقم حساب صالح.</div>
        </div>
        <div class="row">
          <label for="ewa_mobile">رقم الهاتف</label>
          <input id="ewa_mobile" name="mobile" inputmode="tel" value="${escapeHTML(profile.mobile)}" required />
          <div class="error" data-for="ewa_mobile">يرجى إدخال رقم هاتف صالح.</div>
        </div>
        <div class="actions">
          <button class="btn" type="submit">استعلام</button>
          <button class="btn secondary" type="button" id="cancelEwa">إلغاء</button>
        </div>
      </form>
    `;
  }
  return `
    <h4>EWA Bill — Confirm</h4>
    <div class="hint">Review your info and click <b>Lookup</b>.</div>
    <form id="ewaForm" class="chatform" novalidate>
      <div class="row">
        <label for="ewa_acc">EWA Account</label>
        <input id="ewa_acc" name="account" value="${escapeHTML(profile.ewaAccount)}" required />
        <div class="error" data-for="ewa_acc">Enter a valid account.</div>
      </div>
      <div class="row">
        <label for="ewa_mobile">Mobile</label>
        <input id="ewa_mobile" name="mobile" inputmode="tel" value="${escapeHTML(profile.mobile)}" required />
        <div class="error" data-for="ewa_mobile">Enter a valid Bahrain mobile.</div>
      </div>
      <div class="actions">
        <button class="btn" type="submit">Lookup</button>
        <button class="btn secondary" type="button" id="cancelEwa">Cancel</button>
      </div>
    </form>
  `;
}

// ================== Mock Data ==================
function mockTrafficFines({ cpr, plate }, locale = 'en') {
  const fakeNames = [
    { en: "Ahmed Hassan", ar: "أحمد حسن" },
    { en: "Fatima Salman", ar: "فاطمة سلمان" },
    { en: "Mohammed Ali", ar: "محمد علي" },
    { en: "Sara AlBalooshi", ar: "سارة البلوشي" },
    { en: "Yousef AlHaddad", ar: "يوسف الحداد" }
  ];
  const name = fakeNames[parseInt(cpr.slice(-1) || "0", 10) % fakeNames.length];

  const catalog = [
    { code: "SPD-120+", type_en: "Speeding", type_ar: "تجاوز السرعة", title_en: "Speeding over 120 km/h", title_ar: "تجاوز السرعة لأكثر من 120 كم/س", location: "Shaikh Khalifa Bin Salman Hwy", datetime: "2025-09-14 14:22", amount: 50.000 },
    { code: "SEAT-01", type_en: "Seatbelt", type_ar: "حزام الأمان", title_en: "Seatbelt not fastened (driver)", title_ar: "حزام الأمان غير مربوط (السائق)", location: "Exhibition Ave, Manama", datetime: "2025-10-02 08:10", amount: 20.000 },
    { code: "PHONE-02", type_en: "Mobile phone", type_ar: "الهاتف المتحرك", title_en: "Using mobile phone while driving", title_ar: "استخدام الهاتف أثناء القيادة", location: "Sitra Highway", datetime: "2025-10-18 17:43", amount: 25.000 },
    { code: "PRK-03", type_en: "Parking", type_ar: "مخالفة موقف", title_en: "No-parking zone", title_ar: "موقف غير مسموح", location: "Block 338", datetime: "2025-10-22 21:05", amount: 10.000 },
    { code: "RL-01", type_en: "Red light", type_ar: "إشارة حمراء", title_en: "Red light violation", title_ar: "تجاوز الإشارة الحمراء", location: "Seef Signal", datetime: "2025-09-28 19:02", amount: 100.000 }
  ];
  const idx = parseInt(cpr.slice(-2) || "0", 10) % catalog.length;
  const items = [catalog[idx], catalog[(idx + 2) % catalog.length]];

  const header = locale === 'ar' ? `<h4>نتيجة الاستعلام — المخالفات المرورية</h4>` : `<h4>Lookup Result — Traffic Fines</h4>`;
  const labels = {
    name: locale === 'ar' ? 'الاسم' : 'Name',
    cpr: locale === 'ar' ? 'رقم الهوية (CPR)' : 'CPR Number',
    plate: locale === 'ar' ? 'رقم اللوحة' : 'Plate Number',
    total: locale === 'ar' ? 'الإجمالي المستحق' : 'Total Due',
    pay: locale === 'ar' ? 'ادفع الآن' : 'Pay Now'
  };

  const summary = `
    <div class="infoblock">
      <div class="row"><div class="label">${labels.name}</div><div class="value">${locale === 'ar' ? name.ar : name.en}</div></div>
      <div class="row"><div class="label">${labels.cpr}</div><div class="value">${cpr}</div></div>
      <div class="row"><div class="label">${labels.plate}</div><div class="value">${plate}</div></div>
    </div>`;

  const listHtml = items.map(i => {
    const title = locale === 'ar' ? i.title_ar : i.title_en;
    const type = locale === 'ar' ? i.type_ar : i.type_en;
    return `
      <div class="item">
        <div>
          <div class="title">${title}</div>
          <div class="meta">${i.code} · ${i.datetime} · ${i.location}</div>
          <div class="tags"><span class="tag">${type}</span></div>
        </div>
        <div class="money">BD ${i.amount.toFixed(3)}</div>
      </div>`;
  }).join('');

  const total = items.reduce((s, i) => s + i.amount, 0);

  return `
    ${header}
    ${summary}
    <div class="fines">${listHtml}</div>
    <div class="payrow">
      <div><strong>${labels.total}:</strong> <span class="money">BD ${total.toFixed(3)}</span></div>
      <button class="btn pay" data-pay="traffic" data-amount="${total.toFixed(3)}">${labels.pay}</button>
    </div>
    <div class="muted">${locale === 'ar' ? 'عرض تجريبي للواجهة فقط.' : 'UI-only demo — data not real.'}</div>
  `;
}
function mockEwaBill({ account, mobile }, locale = 'en') {
  const amount = 18.750;
  const header = locale === 'ar' ? `<h4>نتيجة الاستعلام — فاتورة EWA</h4>` : `<h4>Lookup Result — EWA Bill</h4>`;
  const labels = { acc: locale === 'ar' ? 'الحساب' : 'Account', mob: locale === 'ar' ? 'الهاتف' : 'Mobile', due: locale === 'ar' ? 'المبلغ المستحق' : 'Amount Due', pay: locale === 'ar' ? 'ادفع الآن' : 'Pay Now' };
  return `
    ${header}
    <div class="infoblock">
      <div class="row"><div class="label">${labels.acc}</div><div class="value">${account}</div></div>
      <div class="row"><div class="label">${labels.mob}</div><div class="value">${mobile}</div></div>
      <div class="row"><div class="label">${labels.due}</div><div class="value money">BD ${amount.toFixed(3)}</div></div>
    </div>
    <div class="payrow">
      <div><strong>${labels.due}:</strong> <span class="money">BD ${amount.toFixed(3)}</span></div>
      <button class="btn pay" data-pay="ewa" data-amount="${amount.toFixed(3)}">${labels.pay}</button>
    </div>
    <div class="muted">${locale === 'ar' ? 'عرض تجريبي واجهة فقط.' : 'UI-only demo.'}</div>
  `;
}

// ================== Language ==================
function setLang(lang) {
  const en = lang === 'en';
  document.documentElement.lang = en ? 'en' : 'ar';
  document.documentElement.dir = en ? 'ltr' : 'rtl';
  btnEn?.setAttribute('aria-pressed', en);
  btnAr?.setAttribute('aria-pressed', !en);
  const titleEl = document.getElementById('chatTitle');
  if (titleEl) titleEl.textContent = en ? 'Chat with Basma' : 'الدردشة مع بسمة';
  input.placeholder = en ? 'Ask me anything' : 'اسألني أي شيء';

  const ui = UI.get(); ui.lang = lang; UI.save(ui);
}
btnEn?.addEventListener('click', () => setLang('en'));
btnAr?.addEventListener('click', () => setLang('ar'));

// ================== Reuse “New chat” ==================
function isTrulyEmptyNewChat(session) {
  if (!session) return false;
  const titleIsNew = /^(new chat|محادثة جديدة)$/i.test(session.title.trim());
  const noUserMsg = !(session.messages || []).some(m => m.who === 'user');
  return session.type === 'general' && titleIsNew && noUserMsg;
}
function convertActiveOrCreate({ title, type, status = 'In Progress' }) {
  const s = SessionStore.active();
  if (isTrulyEmptyNewChat(s)) {
    s.title = title;
    s.type = type;
    s.status = status;
    s.updatedAt = Date.now();
    SessionStore.save();
    renderSidebar();
    return s;
  }
  return SessionStore.create({ title, type, status });
}

// ================== Router ==================
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const value = input.value.trim();
  if (!value) return;

  bubble({ text: value, who: 'user', avatar: 'H' });

  const locale = document.documentElement.lang.startsWith('ar') ? 'ar' : 'en';
  const v = value.toLowerCase();

  const isCPR  = /(cpr|renew cpr|renewal|identity|هوية|بطاقة|تجديد)/i.test(v);
  const isFine = /(traffic|fine|fines|ticket|مخال|مرور)/i.test(v);
  const isEwa  = /(ewa|bill|electric|water|كهرب|ماء|فاتور)/i.test(v);

  let section;

  if (isFine) {
    convertActiveOrCreate({ title: locale === 'ar' ? 'استعلام مخالفات' : 'Traffic Fines', type: 'traffic' });
    section = bubble({ html: trafficForm(locale, PROFILE), who: 'bot' });
  } else if (isEwa) {
    convertActiveOrCreate({ title: locale === 'ar' ? 'فاتورة EWA' : 'EWA Bill', type: 'ewa' });
    section = bubble({ html: ewaForm(locale, PROFILE), who: 'bot' });
  } else if (isCPR) {
    convertActiveOrCreate({ title: locale === 'ar' ? 'تجديد CPR' : 'Renew CPR', type: 'cpr' });
    section = bubble({ html: cprForm(locale, PROFILE), who: 'bot' });
  } else {
    section = bubble({
      html: locale === 'ar'
        ? 'شكرًا! سيتم تحويل سؤالك إلى الدعم لاحقًا (واجهة فقط).'
        : 'Thanks! Your question will be routed to support later (UI only).',
      who: 'bot'
    });
  }

  // Tiny UX touch: focus primary in shown form
  const primaryBtn = section?.querySelector?.('button[type="submit"]');
  primaryBtn?.focus?.({ preventScroll: true });
  section?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });

  input.value = '';
  const ui = UI.get(); ui.draft = ''; UI.save(ui);
  renderSidebar();
});

// ================== Form handlers (delegated) ==================
// Submit handlers (CPR / Traffic / EWA) — with OTP for CPR
list.addEventListener('submit', async (e) => {
  // CPR
  if (e.target && e.target.id === 'cprForm') {
    e.preventDefault();
    const formEl = e.target;
    const locale = document.documentElement.lang.startsWith('ar') ? 'ar' : 'en';
    const cpr    = formEl.querySelector('#cpr')?.value.trim() || '';
    const dob    = formEl.querySelector('#dob')?.value.trim() || '';
    const mobile = formEl.querySelector('#mobile')?.value.trim() || '';
    const email  = formEl.querySelector('#email')?.value.trim() || '';

    formEl.querySelectorAll('.error').forEach(el => el.style.display = 'none');
    let ok = true;
    if (!/^[0-9]{9}$/.test(cpr)) { formEl.querySelector('.error[data-for="cpr"]').style.display = 'block'; ok = false; }
    if (!dob) { formEl.querySelector('.error[data-for="dob"]').style.display = 'block'; ok = false; }
    if (!/^(\+973\s?)?3[0-9]{7}$/.test(mobile.replace(/\s+/g, ''))) { formEl.querySelector('.error[data-for="mobile"]').style.display = 'block'; ok = false; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { formEl.querySelector('.error[data-for="email"]').style.display = 'block'; ok = false; }
    if (!ok) return;

    // Persist to profile
    PROFILE = { ...PROFILE, cpr, dob, mobile, email };
    saveProfile(PROFILE);

    // === OTP step before completing ===
    const mobMask = mobile.replace(/(\+973\s?)?(3)(\d{3})(\d{4})/, '+973 $2***$4');
    const verified = await otpVerify({
      title:   locale === 'ar' ? 'التحقق من الرمز' : 'OTP Verification',
      message: locale === 'ar'
        ? `أدخل الرمز المكون من 6 أرقام المرسل إلى ${mobMask}.`
        : `Enter the 6-digit code sent to ${mobMask}.`,
      dummy: '482913',
      autoFillAfter: 2000,
      perDigitDelay: 140,
      autoConfirmWhenFilled: true,
      locale
    });
    if (!verified) {
      bubble({ html: locale === 'ar' ? 'تم الإلغاء.' : 'Cancelled.', who: 'bot' });
      return;
    }

    // Success popup (green tick)
    await successPopup({
      title:   locale === 'ar' ? 'تم تجديد CPR' : 'CPR Renewed',
      message: locale === 'ar' ? 'تمت عملية التجديد بنجاح.' : 'Your CPR renewal has been completed successfully.',
      autoClose: 1400
    });

    // Success confirmation to chat
    const masked = cpr.replace(/^([0-9]{3})([0-9]{3})([0-9]{3})$/, '$1-$2-***');
    const html = locale === 'ar'
      ? `<strong>تم التجديد بنجاح.</strong><br/>تم إكمال تجديد CPR للرقم <b>${masked}</b>.<br/><span class="muted">عرض واجهة فقط.</span>`
      : `<strong>CPR renewed successfully.</strong><br/>Completed renewal for <b>${masked}</b>.<br/><span class="muted">A confirmation Email was sent to you.</span>`;
    bubble({ html, who: 'bot' });

    const active = SessionStore.active();
    if (active) {
      SessionStore.setTitle(active.id, (locale === 'ar' ? 'تجديد CPR' : 'Renew CPR') + ' — ' + masked);
      SessionStore.setStatus(active.id, 'Completed');
    }
  }

  // Traffic (lookup only; OTP happens on Pay Now)
  if (e.target && e.target.id === 'trafficForm') {
    e.preventDefault();
    const formEl = e.target;
    const locale = document.documentElement.lang.startsWith('ar') ? 'ar' : 'en';
    const cpr   = formEl.querySelector('#tf_cpr')?.value.trim() || '';
    const plate = formEl.querySelector('#tf_plate')?.value.trim() || '';

    formEl.querySelectorAll('.error').forEach(el => el.style.display = 'none');
    let ok = true;
    if (!/^[0-9]{9}$/.test(cpr)) { formEl.querySelector('.error[data-for="tf_cpr"]').style.display = 'block'; ok = false; }
    if (!/^[A-Za-z0-9-]{3,}$/.test(plate)) { formEl.querySelector('.error[data-for="tf_plate"]').style.display = 'block'; ok = false; }
    if (!ok) return;

    PROFILE = { ...PROFILE, cpr, plate };
    saveProfile(PROFILE);

    const html = mockTrafficFines({ cpr, plate }, locale);
    bubble({ html, who: 'bot' });

    const active = SessionStore.active();
    if (active) {
      SessionStore.setTitle(active.id, (locale === 'ar' ? 'مخالفات' : 'Traffic Fines') + ' — ' + plate.toUpperCase());
      SessionStore.setStatus(active.id, 'In Progress');
    }
  }

  // EWA (lookup only; OTP happens on Pay Now)
  if (e.target && e.target.id === 'ewaForm') {
    e.preventDefault();
    const formEl = e.target;
    const locale = document.documentElement.lang.startsWith('ar') ? 'ar' : 'en';
    const account = formEl.querySelector('#ewa_acc')?.value.trim() || '';
    const mobile  = formEl.querySelector('#ewa_mobile')?.value.trim() || '';

    formEl.querySelectorAll('.error').forEach(el => el.style.display = 'none');
    let ok = true;
    if (!/^[A-Za-z0-9-]{5,}$/.test(account)) { formEl.querySelector('.error[data-for="ewa_acc"]').style.display = 'block'; ok = false; }
    if (!/^(\+973\s?)?3[0-9]{7}$/.test(mobile.replace(/\s+/g, ''))) { formEl.querySelector('.error[data-for="ewa_mobile"]').style.display = 'block'; ok = false; }
    if (!ok) return;

    PROFILE = { ...PROFILE, ewaAccount: account, mobile };
    saveProfile(PROFILE);

    const html = mockEwaBill({ account, mobile }, locale);
    bubble({ html, who: 'bot' });

    const active = SessionStore.active();
    if (active) {
      SessionStore.setTitle(active.id, (locale === 'ar' ? 'فاتورة EWA' : 'EWA Bill') + ' — ' + account.toUpperCase());
      SessionStore.setStatus(active.id, 'In Progress');
    }
  }
});

// ================== Pay Now (Traffic + EWA) — with OTP + Success tick ==================
list.addEventListener('click', async (e) => {
  const btn = e.target.closest('button.btn.pay');
  if (!btn) return;

  const locale = document.documentElement.lang.startsWith('ar') ? 'ar' : 'en';
  const type   = btn.dataset.pay; // 'traffic' | 'ewa'
  const amount = Number(btn.dataset.amount || 0).toFixed(3);

  // OTP verification
  const mobMask = (PROFILE?.mobile || '+973 3xxxxxxx').replace(/(\+973\s?)?(3)(\d{3})(\d{4})/, '+973 $2***$4');
  const verified = await otpVerify({
    title:   locale==='ar' ? 'التحقق من الدفع' : 'Verify Payment',
    message: locale==='ar'
      ? `أدخل الرمز المكون من 6 أرقام المرسل إلى ${mobMask} لإتمام الدفع.`
      : `Enter the 6-digit code sent to ${mobMask} to complete your payment.`,
    dummy: '730164',
    autoFillAfter: 2000,
    perDigitDelay: 140,
    autoConfirmWhenFilled: true,
    locale
  });
  if (!verified) {
    bubble({ html: locale==='ar' ? 'تم إلغاء الدفع.' : 'Payment cancelled.', who: 'bot' });
    return;
  }

  // Success popup (green tick)
  await successPopup({
    title:   locale==='ar' ? 'تم الدفع' : 'Payment Complete',
    message: locale==='ar'
      ? `تمت معالجة الدفع بنجاح (BD ${amount}).`
      : `Your payment (BD ${amount}) was processed successfully.`,
    autoClose: 1400
  });

  // Success message to chat + session bookkeeping
  const msg = locale==='ar'
    ? `<strong>تم الدفع بنجاح.</strong><br/>العملية: <span class="tag">${type === 'traffic' ? 'مخالفات' : 'EWA'}</span><br/>المبلغ: <b class="money">BD ${amount}</b><br/><span class="muted">عرض واجهة فقط.</span>`
    : `<strong>Payment successful.</strong><br/>Type: <span class="tag">${type === 'traffic' ? 'Traffic Fines' : 'EWA Bill'}</span><br/>Amount: <b class="money">BD ${amount}</b><br/><span class="muted">A confirmation Email was sent to you.</span>`;
  bubble({ html: msg, who: 'bot' });

  const active = SessionStore.active();
  if (active) SessionStore.setStatus(active.id, 'Completed');

  const payTitle = (locale==='ar' ? 'دفعة' : 'Payment') + ' — ' + (type==='traffic' ? (locale==='ar'?'مخالفات':'Traffic') : 'EWA') + ` (BD ${amount})`;
  const s = SessionStore.create({ title: payTitle, type: 'payment', status: 'Completed' });
  SessionStore.setAmount(s.id, amount);
  renderSidebar();
});

// ================== Cancel buttons ==================
list.addEventListener('click', (e) => {
  const locale = document.documentElement.lang.startsWith('ar') ? 'ar' : 'en';
  if (e.target.closest('#cancelCpr')) bubble({ html: locale === 'ar' ? 'تم الإلغاء.' : 'Cancelled.', who: 'bot' });
  if (e.target.closest('#cancelTraffic')) bubble({ html: locale === 'ar' ? 'تم الإلغاء.' : 'Cancelled.', who: 'bot' });
  if (e.target.closest('#cancelEwa')) bubble({ html: locale === 'ar' ? 'تم الإلغاء.' : 'Cancelled.', who: 'bot' });
});

// ================== Sidebar interactions ==================
threadList?.addEventListener('click', (e) => {
  if (e.target.closest('.thread-del')) return; // handled below
  const item = e.target.closest('.thread-card');
  if (!item) return;
  openSession(item.dataset.id);
});
threadList?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    const item = e.target.closest('.thread-card');
    if (item) openSession(item.dataset.id);
  }
});
threadList?.addEventListener('click', async (e) => {
  const delBtn = e.target.closest('.thread-del');
  if (!delBtn) return;
  e.stopPropagation();

  const id = delBtn.dataset.id;
  const ar = document.documentElement.lang.startsWith('ar');
  const ok = await confirmModal({
    title: ar ? 'حذف المحادثة' : 'Delete Chat',
    message: ar ? 'هل تريد حذف هذه المحادثة؟ لا يمكن التراجع.' : 'Do you want to delete this chat? This cannot be undone.',
    confirmText: ar ? 'حذف' : 'Delete',
    cancelText: ar ? 'إلغاء' : 'Cancel'
  });
  if (!ok) return;

  const wasActive = SessionStore.data.activeId === id;
  SessionStore.delete(id);

  if (!SessionStore.all().length) {
    const locale = ar ? 'ar' : 'en';
    SessionStore.create({ title: ar ? 'محادثة جديدة' : 'New chat', type: 'general', status: 'In Progress' });
    list.innerHTML = '';
    seedGreetingOnce();
  } else if (wasActive) {
    openSession(SessionStore.data.activeId || SessionStore.all()[0].id);
  } else {
    renderSidebar();
  }
});

// ================== Chips + keyboard + draft ==================
list.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  input.value = chip.dataset.text || chip.textContent;
  form.requestSubmit();
});
input.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') form.requestSubmit(); });
input.addEventListener('input', () => { const ui = UI.get(); ui.draft = input.value; UI.save(ui); });

// ================== Sidebar show/hide (Menu button persists state) ==================
function setSidebarHidden(hidden) {
  if (!sidebarEl) return;
  sidebarEl.classList.toggle('hidden', !!hidden);
  const ui = UI.get(); ui.sidebarHidden = !!hidden; UI.save(ui);
}
function applySidebarHiddenFromUI() {
  if (!sidebarEl) return;
  const ui = UI.get();
  sidebarEl.classList.toggle('hidden', !!ui.sidebarHidden);
}
menuBtn?.addEventListener('click', () => {
  const hidden = sidebarEl?.classList.contains('hidden');
  setSidebarHidden(!hidden);
});

// ================== Close chat -> greeting ==================
document.querySelector('.icon-btn[aria-label="Close chat"]')?.addEventListener('click', () => {
  list.innerHTML = '';
  seedGreetingOnce();
});

// ================== New chat ==================
newChatBtn?.addEventListener('click', () => {
  const locale = document.documentElement.lang.startsWith('ar') ? 'ar' : 'en';
  SessionStore.create({ title: locale === 'ar' ? 'محادثة جديدة' : 'New chat', type: 'general', status: 'In Progress' });
  list.innerHTML = '';
  seedGreetingOnce();
});

// ================== Boot ==================
(function boot() {
  const ui = UI.get();
  setLang(ui.lang && ui.lang.startsWith('ar') ? 'ar' : 'en');
  if (ui.draft) input.value = ui.draft;

  // Ensure app container positions sidebar correctly (defensive)
  const app = document.querySelector('.app');
  if (app && getComputedStyle(app).position === 'static') app.style.position = 'relative';

  if (!SessionStore.data.sessions.length) {
    const locale = document.documentElement.lang.startsWith('ar') ? 'ar' : 'en';
    SessionStore.create({ title: locale === 'ar' ? 'محادثة جديدة' : 'New chat', type: 'general' });
    list.innerHTML = '';
    seedGreetingOnce();
  } else {
    renderSidebar();
    openSession(SessionStore.data.activeId || SessionStore.data.sessions[0].id);
  }
  renderSidebar();

  applySidebarHiddenFromUI();

  window.addEventListener('resize', debounce(() => {
    if (window.innerWidth <= 900) setSidebarHidden(true);
    else applySidebarHiddenFromUI();
  }, 120));
})();
