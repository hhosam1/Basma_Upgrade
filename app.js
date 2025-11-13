// ================== Elements ==================
const form   = document.getElementById('composer');
const input  = document.getElementById('input');
const list   = document.getElementById('timeline');
const scroll = document.getElementById('scroll');
const btnEn  = document.getElementById('btnEn');
const btnAr  = document.getElementById('btnAr');

// Sidebar
const sidebarEl  = document.getElementById('sidebar');
const threadList = document.getElementById('threadList');
const newChatBtn = document.getElementById('newChatBtn');
const menuBtn    = document.getElementById('menuBtn');

// ================== Utilities ==================
const tz = 'Asia/Bahrain';
function nowStamp(locale = document.documentElement.lang || 'en-BH') {
  const d = new Date();
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute:'2-digit', hour12: true, timeZone: tz });
  const day  = d.toLocaleDateString(locale, { day:'2-digit', month:'2-digit', year:'numeric', timeZone: tz });
  return `${time} ${day}`;
}
function scrollToBottom(){ requestAnimationFrame(() => { scroll.scrollTop = scroll.scrollHeight; }); }
const uid = () => Math.random().toString(36).slice(2,10);
function escapeHTML(s){ return (s??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function debounce(fn, ms=150){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
function safeGet(key, fallback){ try{ const raw = localStorage.getItem(key); return raw? JSON.parse(raw): fallback; }catch{ return fallback; } }
function safeSet(key, value){ try{ localStorage.setItem(key, JSON.stringify(value)); return true; } catch{ return false; } }

let restoring = false;

// ================== Modal (custom confirm) ==================
function injectModalStylesOnce(){
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
function confirmModal({ title, message, confirmText, cancelText }){
  injectModalStylesOnce();
  return new Promise(resolve=>{
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title">
        <h3 id="m-title">${escapeHTML(title||'Confirm')}</h3>
        <p>${escapeHTML(message||'Are you sure?')}</p>
        <div class="actions">
          <button class="btn cancel" data-act="cancel">${escapeHTML(cancelText||'Cancel')}</button>
          <button class="btn danger" data-act="ok">${escapeHTML(confirmText||'Delete')}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const cleanup = (v)=>{ overlay.remove(); resolve(v); };
    overlay.addEventListener('click', (e)=>{ if(e.target===overlay) cleanup(false); });
    overlay.querySelector('[data-act="cancel"]').addEventListener('click', ()=> cleanup(false));
    overlay.querySelector('[data-act="ok"]').addEventListener('click', ()=> cleanup(true));
    const onKey = (e)=>{ if(e.key==='Escape'){cleanup(false);window.removeEventListener('keydown',onKey);} if(e.key==='Enter'){cleanup(true);window.removeEventListener('keydown',onKey);} };
    window.addEventListener('keydown', onKey);
  });
}

// ================== Session Store ==================
const SVER = 4;
const SKEY = 'basma.sessions.v' + SVER;
const UIK  = 'basma.ui.v' + SVER;

const SessionStore = {
  data: safeGet(SKEY, { activeId: null, sessions: [] }),
  save: debounce(function(){ safeSet(SKEY, SessionStore.data); }, 80),

  all(){ return SessionStore.data.sessions; },
  active(){ return SessionStore.data.sessions.find(s => s.id === SessionStore.data.activeId) || null; },

  create({ title = 'New chat', type = 'general', status = 'In Progress' } = {}){
    const s = { id: uid(), title, type, status, createdAt: Date.now(), updatedAt: Date.now(), amount: null, messages: [] };
    SessionStore.data.sessions.unshift(s);
    SessionStore.data.activeId = s.id;
    SessionStore.save();
    renderSidebar();
    return s;
  },

  setActive(id){
    SessionStore.data.activeId = id;
    SessionStore.save();
    renderSidebar();
  },

  appendMessage(id, { who, html = null, text = null }){
    const s = SessionStore.data.sessions.find(x => x.id === id);
    if (!s) return;
    s.messages.push({ who, type: html ? 'html':'text', content: html ?? text ?? '', ts: Date.now() });
    s.updatedAt = Date.now();
    SessionStore.save();
  },

  setTitle(id, title){
    const s = SessionStore.data.sessions.find(x => x.id === id);
    if (s){ s.title = title; s.updatedAt = Date.now(); SessionStore.save(); renderSidebar(); }
  },

  setStatus(id, status){
    const s = SessionStore.data.sessions.find(x => x.id === id);
    if (s){ s.status = status; s.updatedAt = Date.now(); SessionStore.save(); renderSidebar(); }
  },

  setAmount(id, amount){
    const s = SessionStore.data.sessions.find(x => x.id === id);
    if (s){ s.amount = amount; s.updatedAt = Date.now(); SessionStore.save(); renderSidebar(); }
  },

  delete(id){
    SessionStore.data.sessions = SessionStore.data.sessions.filter(s => s.id !== id);
    if (SessionStore.data.activeId === id) SessionStore.data.activeId = SessionStore.data.sessions[0]?.id || null;
    SessionStore.save();
    renderSidebar();
  }
};

// ================== UI State ==================
const UI = {
  get(){ return safeGet(UIK, { lang: document.documentElement.lang || 'en', draft: '', sidebarHidden: false }); },
  save: debounce(function(v){ safeSet(UIK, v); }, 80),
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
function seedGreetingHTML(locale){
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
function seedGreetingOnce(){
  const locale = document.documentElement.lang.startsWith('ar') ? 'ar' : 'en';
  const last = list.lastElementChild?.querySelector('.bubble');
  const hasChipsAlready = !!last?.querySelector('.chips');
  if (!hasChipsAlready) bubble({ html: seedGreetingHTML(locale), who: 'bot' });
}

// ================== Sidebar Render ==================
function renderSidebar(){
  if (!threadList) return;
  const sessions = SessionStore.all();
  const activeId = SessionStore.data.activeId;

  threadList.innerHTML = sessions.map(s => {
    const dt = new Date(s.updatedAt);
    const pretty = dt.toLocaleDateString([], { month:'short', day:'2-digit' }) + ' ' +
                   dt.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
    const amount = (s.amount != null) ? `BD ${Number(s.amount).toFixed(3)}` : '';
    const badgeText = s.status === 'Completed' ? 'Completed'
                     : (s.type === 'payment' ? 'Payment' : 'In Progress');
    const avatarClass = (s.type || 'general').replace(/\s+/g,'').toLowerCase();

    return `
      <div class="thread-card ${s.id===activeId?'active':''}" data-id="${s.id}" role="listitem" tabindex="0" aria-label="${escapeHTML(s.title)}">
        <div class="thread-avatar ${avatarClass}">${(s.type||'G').slice(0,1).toUpperCase()}</div>

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

function openSession(id){
  const s = SessionStore.all().find(x => x.id === id);
  if (!s) return;
  SessionStore.setActive(id);
  list.innerHTML = '';
  restoring = true;
  s.messages.forEach(m => bubble({ who: m.who, html: m.type==='html'?m.content:null, text: m.type==='text'?m.content:null }));
  restoring = false;
}

// ================== Forms ==================
function cprForm(locale = 'en') {
  if (locale === 'ar') {
    return `
      <h4>نموذج تجديد بطاقة الهوية (CPR)</h4>
      <form id="cprForm" class="chatform" novalidate>
        <div class="row">
          <label for="cpr">رقم الهوية (CPR)</label>
          <input id="cpr" name="cpr" inputmode="numeric" placeholder="123456789" required />
          <div class="hint">أدخل رقم الهوية المكون من 9 أرقام (بدون الشرطة).</div>
          <div class="error" data-for="cpr">يرجى إدخال رقم CPR صحيح.</div>
        </div>
        <div class="row">
          <label for="dob">تاريخ الميلاد</label>
          <input id="dob" name="dob" type="date" required />
          <div class="error" data-for="dob">يرجى اختيار تاريخ الميلاد.</div>
        </div>
        <div class="row">
          <label for="mobile">رقم الهاتف</label>
          <input id="mobile" name="mobile" inputmode="tel" placeholder="+973 3xxxxxxx" required />
          <div class="hint">صيغة مقترحة: ‎+973 3xxxxxxx</div>
          <div class="error" data-for="mobile">يرجى إدخال رقم هاتف صالح في البحرين.</div>
        </div>
        <div class="row">
          <label for="email">البريد الإلكتروني</label>
          <input id="email" name="email" type="email" placeholder="name@example.com" required />
          <div class="error" data-for="email">يرجى إدخال بريد إلكتروني صالح.</div>
        </div>
        <div class="actions">
          <button class="btn" type="submit">متابعة</button>
          <button class="btn secondary" type="button" id="cancelCpr">إلغاء</button>
        </div>
      </form>`;
  }
  return `
    <h4>Renew CPR — Quick Form</h4>
    <form id="cprForm" class="chatform" novalidate>
      <div class="row">
        <label for="cpr">CPR Number</label>
        <input id="cpr" name="cpr" inputmode="numeric" placeholder="123456789" required />
        <div class="hint">Enter the 9-digit CPR number (no dash).</div>
        <div class="error" data-for="cpr">Please enter a valid 9-digit CPR.</div>
      </div>
      <div class="row">
        <label for="dob">Date of Birth</label>
        <input id="dob" name="dob" type="date" required />
        <div class="error" data-for="dob">Please select your date of birth.</div>
      </div>
      <div class="row">
        <label for="mobile">Mobile</label>
        <input id="mobile" name="mobile" inputmode="tel" placeholder="+973 3xxxxxxx" required />
        <div class="hint">Suggested format: +973 3xxxxxxx</div>
        <div class="error" data-for="mobile">Please enter a valid Bahrain mobile.</div>
      </div>
      <div class="row">
        <label for="email">Email</label>
        <input id="email" name="email" type="email" placeholder="name@example.com" required />
        <div class="error" data-for="email">Please enter a valid email.</div>
      </div>
      <div class="actions">
        <button class="btn" type="submit">Continue</button>
        <button class="btn secondary" type="button" id="cancelCpr">Cancel</button>
      </div>
    </form>`;
}
function trafficForm(locale = 'en') {
  if (locale === 'ar') {
    return `
      <h4>الاستعلام عن المخالفات المرورية</h4>
      <form id="trafficForm" class="chatform" novalidate>
        <div class="row">
          <label for="tf_cpr">رقم الهوية (CPR)</label>
          <input id="tf_cpr" name="cpr" inputmode="numeric" placeholder="123456789" required />
          <div class="error" data-for="tf_cpr">يرجى إدخال CPR صحيح (9 أرقام).</div>
        </div>
        <div class="row">
          <label for="tf_plate">رقم اللوحة</label>
          <input id="tf_plate" name="plate" placeholder="12345" required />
          <div class="error" data-for="tf_plate">يرجى إدخال رقم لوحة صالح.</div>
        </div>
        <div class="actions">
          <button class="btn" type="submit">استعلام</button>
          <button class="btn secondary" type="button" id="cancelTraffic">إلغاء</button>
        </div>
      </form>`;
  }
  return `
    <h4>Traffic Fines — Lookup</h4>
    <form id="trafficForm" class="chatform" novalidate>
      <div class="row">
        <label for="tf_cpr">CPR Number</label>
        <input id="tf_cpr" name="cpr" inputmode="numeric" placeholder="123456789" required />
        <div class="error" data-for="tf_cpr">Enter a valid 9-digit CPR.</div>
      </div>
      <div class="row">
        <label for="tf_plate">Plate Number</label>
        <input id="tf_plate" name="plate" placeholder="12345" required />
        <div class="error" data-for="tf_plate">Enter a valid plate number.</div>
      </div>
      <div class="actions">
        <button class="btn" type="submit">Lookup</button>
        <button class="btn secondary" type="button" id="cancelTraffic">Cancel</button>
      </div>
    </form>`;
}
function ewaForm(locale = 'en') {
  if (locale === 'ar') {
    return `
      <h4>فاتورة الكهرباء والماء (EWA)</h4>
      <form id="ewaForm" class="chatform" novalidate>
        <div class="row">
          <label for="ewa_acc">رقم الحساب (EWA)</label>
          <input id="ewa_acc" name="account" placeholder="EWA-1234567" required />
          <div class="error" data-for="ewa_acc">يرجى إدخال رقم حساب صالح.</div>
        </div>
        <div class="row">
          <label for="ewa_mobile">رقم الهاتف</label>
          <input id="ewa_mobile" name="mobile" inputmode="tel" placeholder="+973 3xxxxxxx" required />
          <div class="error" data-for="ewa_mobile">يرجى إدخال رقم هاتف صالح.</div>
        </div>
        <div class="actions">
          <button class="btn" type="submit">استعلام</button>
          <button class="btn secondary" type="button" id="cancelEwa">إلغاء</button>
        </div>
      </form>`;
  }
  return `
    <h4>EWA Bill — Lookup</h4>
    <form id="ewaForm" class="chatform" novalidate>
      <div class="row">
        <label for="ewa_acc">EWA Account</label>
        <input id="ewa_acc" name="account" placeholder="EWA-1234567" required />
        <div class="error" data-for="ewa_acc">Enter a valid account.</div>
      </div>
      <div class="row">
        <label for="ewa_mobile">Mobile</label>
        <input id="ewa_mobile" name="mobile" inputmode="tel" placeholder="+973 3xxxxxxx" required />
        <div class="error" data-for="ewa_mobile">Enter a valid Bahrain mobile.</div>
      </div>
      <div class="actions">
        <button class="btn" type="submit">Lookup</button>
        <button class="btn secondary" type="button" id="cancelEwa">Cancel</button>
      </div>
    </form>`;
}

// ================== Mock Data ==================
function mockTrafficFines({ cpr, plate }, locale='en'){
  const fakeNames = [
    { en: "Ahmed Hassan", ar: "أحمد حسن" },
    { en: "Fatima Salman", ar: "فاطمة سلمان" },
    { en: "Mohammed Ali", ar: "محمد علي" },
    { en: "Sara AlBalooshi", ar: "سارة البلوشي" },
    { en: "Yousef AlHaddad", ar: "يوسف الحداد" }
  ];
  const name = fakeNames[parseInt(cpr.slice(-1) || "0", 10) % fakeNames.length];

  const catalog = [
    { code:"SPD-120+", type_en:"Speeding", type_ar:"تجاوز السرعة",
      title_en:"Speeding over 120 km/h", title_ar:"تجاوز السرعة لأكثر من 120 كم/س",
      location:"Shaikh Khalifa Bin Salman Hwy", datetime:"2025-09-14 14:22", amount:50.000 },
    { code:"SEAT-01", type_en:"Seatbelt", type_ar:"حزام الأمان",
      title_en:"Seatbelt not fastened (driver)", title_ar:"حزام الأمان غير مربوط (السائق)",
      location:"Exhibition Ave, Manama", datetime:"2025-10-02 08:10", amount:20.000 },
    { code:"PHONE-02", type_en:"Mobile phone", type_ar:"الهاتف المتحرك",
      title_en:"Using mobile phone while driving", title_ar:"استخدام الهاتف أثناء القيادة",
      location:"Sitra Highway", datetime:"2025-10-18 17:43", amount:25.000 },
    { code:"PRK-03", type_en:"Parking", type_ar:"مخالفة موقف",
      title_en:"No-parking zone", title_ar:"موقف غير مسموح",
      location:"Block 338", datetime:"2025-10-22 21:05", amount:10.000 },
    { code:"RL-01", type_en:"Red light", type_ar:"إشارة حمراء",
      title_en:"Red light violation", title_ar:"تجاوز الإشارة الحمراء",
      location:"Seef Signal", datetime:"2025-09-28 19:02", amount:100.000 }
  ];
  const idx = parseInt(cpr.slice(-2) || "0", 10) % catalog.length;
  const items = [catalog[idx], catalog[(idx+2)%catalog.length]];

  const header = locale==='ar'? `<h4>نتيجة الاستعلام — المخالفات المرورية</h4>` : `<h4>Lookup Result — Traffic Fines</h4>`;
  const labels = {
    name:  locale==='ar' ? 'الاسم':'Name',
    cpr:   locale==='ar' ? 'رقم الهوية (CPR)':'CPR Number',
    plate: locale==='ar' ? 'رقم اللوحة':'Plate Number',
    total: locale==='ar' ? 'الإجمالي المستحق':'Total Due',
    pay:   locale==='ar' ? 'ادفع الآن':'Pay Now'
  };

  const summary = `
    <div class="infoblock">
      <div class="row"><div class="label">${labels.name}</div><div class="value">${locale==='ar'?name.ar:name.en}</div></div>
      <div class="row"><div class="label">${labels.cpr}</div><div class="value">${cpr}</div></div>
      <div class="row"><div class="label">${labels.plate}</div><div class="value">${plate}</div></div>
    </div>`;

  const listHtml = items.map(i=>{
    const title = locale==='ar'? i.title_ar : i.title_en;
    const type  = locale==='ar'? i.type_ar  : i.type_en;
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

  const total = items.reduce((s,i)=>s+i.amount,0);

  return `
    ${header}
    ${summary}
    <div class="fines">${listHtml}</div>
    <div class="payrow">
      <div><strong>${labels.total}:</strong> <span class="money">BD ${total.toFixed(3)}</span></div>
      <button class="btn pay" data-pay="traffic" data-amount="${total.toFixed(3)}">${labels.pay}</button>
    </div>
    <div class="muted">${locale==='ar'?'عرض تجريبي للواجهة فقط.':'UI-only demo — data not real.'}</div>
  `;
}
function mockEwaBill({ account, mobile }, locale='en'){
  const amount = 18.750;
  const header = locale==='ar'? `<h4>نتيجة الاستعلام — فاتورة EWA</h4>` : `<h4>Lookup Result — EWA Bill</h4>`;
  const labels = { acc: locale==='ar'?'الحساب':'Account', mob: locale==='ar'?'الهاتف':'Mobile', due: locale==='ar'?'المبلغ المستحق':'Amount Due', pay: locale==='ar'?'ادفع الآن':'Pay Now' };
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
    <div class="muted">${locale==='ar'?'عرض تجريبي واجهة فقط.':'UI-only demo.'}</div>
  `;
}

// ================== Language ==================
function setLang(lang){
  const en = lang === 'en';
  document.documentElement.lang = en ? 'en' : 'ar';
  document.documentElement.dir  = en ? 'ltr' : 'rtl';
  btnEn?.setAttribute('aria-pressed', en);
  btnAr?.setAttribute('aria-pressed', !en);
  const titleEl = document.getElementById('chatTitle');
  if (titleEl) titleEl.textContent = en ? 'Chat with Basma' : 'الدردشة مع بسمة';
  input.placeholder = en ? 'Ask me anything' : 'اسألني أي شيء';

  const ui = UI.get(); ui.lang = lang; UI.save(ui);
}
btnEn?.addEventListener('click', ()=> setLang('en'));
btnAr?.addEventListener('click', ()=> setLang('ar'));

// ================== Reuse “New chat” ==================
function isTrulyEmptyNewChat(session) {
  if (!session) return false;
  const titleIsNew = /^(new chat|محادثة جديدة)$/i.test(session.title.trim());
  const noUserMsg  = !(session.messages||[]).some(m => m.who === 'user');
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

  if (isFine) {
    convertActiveOrCreate({
      title: locale === 'ar' ? 'استعلام مخالفات' : 'Traffic Fines',
      type : 'traffic'
    });
    bubble({ html: trafficForm(locale), who: 'bot' });

  } else if (isEwa) {
    convertActiveOrCreate({
      title: locale === 'ar' ? 'فاتورة EWA' : 'EWA Bill',
      type : 'ewa'
    });
    bubble({ html: ewaForm(locale), who: 'bot' });

  } else if (isCPR) {
    convertActiveOrCreate({
      title: locale === 'ar' ? 'تجديد CPR' : 'Renew CPR',
      type : 'cpr'
    });
    bubble({ html: cprForm(locale), who: 'bot' });

  } else {
    bubble({
      html: locale==='ar'
        ? 'شكرًا! سيتم تحويل سؤالك إلى الدعم لاحقًا (واجهة فقط).'
        : 'Thanks! Your question will be routed to support later (UI only).',
      who: 'bot'
    });
  }

  input.value = '';
  const ui = UI.get(); ui.draft = ''; UI.save(ui);
  renderSidebar();
});

// ================== Form handlers (delegated) ==================
list.addEventListener('submit', (e) => {
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
    if (!/^(\+973\s?)?3[0-9]{7}$/.test(mobile.replace(/\s+/g,''))) { formEl.querySelector('.error[data-for="mobile"]').style.display = 'block'; ok = false; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { formEl.querySelector('.error[data-for="email"]').style.display = 'block'; ok = false; }
    if (!ok) return;

    const masked = cpr.replace(/^([0-9]{3})([0-9]{3})([0-9]{3})$/, '$1-$2-***');
    const html = locale === 'ar'
      ? `<strong>تم الاستلام.</strong><br/>سنبدأ عملية تجديد CPR للرقم <b>${masked}</b>.<br/><span class="muted">عرض واجهة فقط.</span>`
      : `<strong>Received.</strong><br/>We’ll start the CPR renewal for <b>${masked}</b>.<br/><span class="muted">UI-only demo.</span>`;
    bubble({ html, who: 'bot' });

    const active = SessionStore.active();
    if (active) {
      SessionStore.setTitle(active.id, (locale==='ar' ? 'تجديد CPR' : 'Renew CPR') + ' — ' + masked);
      SessionStore.setStatus(active.id, 'Completed');
    }
  }

  // Traffic
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

    const html = mockTrafficFines({ cpr, plate }, locale);
    bubble({ html, who: 'bot' });

    const active = SessionStore.active();
    if (active) {
      SessionStore.setTitle(active.id, (locale==='ar' ? 'مخالفات' : 'Traffic Fines') + ' — ' + plate.toUpperCase());
      SessionStore.setStatus(active.id, 'In Progress');
    }
  }

  // EWA
  if (e.target && e.target.id === 'ewaForm') {
    e.preventDefault();
    const formEl = e.target;
    const locale = document.documentElement.lang.startsWith('ar') ? 'ar' : 'en';
    const account = formEl.querySelector('#ewa_acc')?.value.trim() || '';
    const mobile  = formEl.querySelector('#ewa_mobile')?.value.trim() || '';

    formEl.querySelectorAll('.error').forEach(el => el.style.display = 'none');
    let ok = true;
    if (!/^[A-Za-z0-9-]{5,}$/.test(account)) { formEl.querySelector('.error[data-for="ewa_acc"]').style.display = 'block'; ok = false; }
    if (!/^(\+973\s?)?3[0-9]{7}$/.test(mobile.replace(/\s+/g,''))) { formEl.querySelector('.error[data-for="ewa_mobile"]').style.display = 'block'; ok = false; }
    if (!ok) return;

    const html = mockEwaBill({ account, mobile }, locale);
    bubble({ html, who: 'bot' });

    const active = SessionStore.active();
    if (active) {
      SessionStore.setTitle(active.id, (locale==='ar' ? 'فاتورة EWA' : 'EWA Bill') + ' — ' + account.toUpperCase());
      SessionStore.setStatus(active.id, 'In Progress');
    }
  }
});

// Cancel buttons
list.addEventListener('click', (e) => {
  const locale = document.documentElement.lang.startsWith('ar') ? 'ar' : 'en';
  if (e.target.closest('#cancelCpr'))     bubble({ html: locale==='ar' ? 'تم الإلغاء.' : 'Cancelled.', who: 'bot' });
  if (e.target.closest('#cancelTraffic')) bubble({ html: locale==='ar' ? 'تم الإلغاء.' : 'Cancelled.', who: 'bot' });
  if (e.target.closest('#cancelEwa'))     bubble({ html: locale==='ar' ? 'تم الإلغاء.' : 'Cancelled.', who: 'bot' });
});

// Pay buttons
list.addEventListener('click', (e) => {
  const btn = e.target.closest('button.btn.pay');
  if (!btn) return;
  const locale = document.documentElement.lang.startsWith('ar') ? 'ar' : 'en';
  const type = btn.dataset.pay; // 'traffic' | 'ewa'
  const amount = Number(btn.dataset.amount || 0).toFixed(3);

  const msg = locale==='ar'
    ? `<strong>تم الدفع بنجاح.</strong><br/>العملية: <span class="tag">${type === 'traffic' ? 'مخالفات' : 'EWA'}</span><br/>المبلغ: <b class="money">BD ${amount}</b><br/><span class="muted">عرض واجهة فقط.</span>`
    : `<strong>Payment successful.</strong><br/>Type: <span class="tag">${type === 'traffic' ? 'Traffic Fines' : 'EWA Bill'}</span><br/>Amount: <b class="money">BD ${amount}</b><br/><span class="muted">UI-only demo.</span>`;
  bubble({ html: msg, who: 'bot' });

  const active = SessionStore.active();
  if (active) SessionStore.setStatus(active.id, 'Completed');

  const payTitle = (locale==='ar' ? 'دفعة' : 'Payment') + ' — ' + (type==='traffic' ? (locale==='ar'?'مخالفات':'Traffic') : 'EWA') + ` (BD ${amount})`;
  const s = SessionStore.create({ title: payTitle, type: 'payment', status: 'Completed' });
  SessionStore.setAmount(s.id, amount);
  renderSidebar();
});

// Sidebar interactions
threadList?.addEventListener('click', (e)=>{
  if (e.target.closest('.thread-del')) return; // handled below
  const item = e.target.closest('.thread-card');
  if (!item) return;
  openSession(item.dataset.id);
});
threadList?.addEventListener('keydown', (e)=>{
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

// Chips + keyboard + draft
list.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  input.value = chip.dataset.text || chip.textContent;
  form.requestSubmit();
});
input.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') form.requestSubmit(); });
input.addEventListener('input', () => { const ui = UI.get(); ui.draft = input.value; UI.save(ui); });

// Sidebar show/hide
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
// Handle inside "Hide sidebar" toggle
// --- Sidebar Show/Hide Control ---
const sidebarToggleBtn = document.getElementById('sidebarToggle');
const sidebarHandleBtn = document.getElementById('sidebarHandle');

// Toggle sidebar visibility
function setSidebarHidden(hidden) {
  if (!sidebarEl) return;

  sidebarEl.classList.toggle('hidden', hidden);
  const ui = UI.get();
  ui.sidebarHidden = hidden;
  UI.save(ui);

  // Hide or show the handle + toggle button
  if (sidebarToggleBtn) sidebarToggleBtn.style.display = hidden ? 'none' : 'inline-block';
  if (sidebarHandleBtn) sidebarHandleBtn.style.display = hidden ? 'flex' : 'none';
}

// Restore sidebar state from saved UI
function applySidebarHiddenFromUI() {
  const ui = UI.get();
  setSidebarHidden(!!ui.sidebarHidden);
}

// Inside sidebar “Hide” button
sidebarToggleBtn?.addEventListener('click', () => {
  const hidden = sidebarEl.classList.contains('hidden');
  setSidebarHidden(!hidden);
});

// The floating handle “☰ Show” button
sidebarHandleBtn?.addEventListener('click', () => setSidebarHidden(false));

// The topbar “⋯ Menu” button also toggles sidebar
menuBtn?.addEventListener('click', () => {
  const hidden = sidebarEl.classList.contains('hidden');
  setSidebarHidden(!hidden);
});

// Close chat -> greeting
document.querySelector('.icon-btn[aria-label="Close chat"]')?.addEventListener('click', ()=>{
  list.innerHTML = '';
  seedGreetingOnce();
});

// New chat
newChatBtn?.addEventListener('click', ()=>{
  const locale = document.documentElement.lang.startsWith('ar') ? 'ar' : 'en';
  SessionStore.create({ title: locale==='ar' ? 'محادثة جديدة' : 'New chat', type: 'general', status: 'In Progress' });
  list.innerHTML = '';
  seedGreetingOnce();
});

// ================== Boot ==================
(function boot(){
  const ui = UI.get();
  setLang(ui.lang && ui.lang.startsWith('ar') ? 'ar' : 'en');
  if (ui.draft) input.value = ui.draft;

  // Ensure app container positions sidebar correctly (defensive)
  const app = document.querySelector('.app');
  if (app && getComputedStyle(app).position === 'static') app.style.position = 'relative';

  if (!SessionStore.data.sessions.length) {
    const locale = document.documentElement.lang.startsWith('ar') ? 'ar' : 'en';
    SessionStore.create({ title: locale==='ar' ? 'محادثة جديدة' : 'New chat', type: 'general' });
    list.innerHTML = '';
    seedGreetingOnce();
  } else {
    renderSidebar();
    openSession(SessionStore.data.activeId || SessionStore.data.sessions[0].id);
  }
  renderSidebar();

  applySidebarHiddenFromUI();

  window.addEventListener('resize', debounce(()=>{
    if (window.innerWidth <= 900) setSidebarHidden(true);
    else applySidebarHiddenFromUI();
  }, 120));
})();
