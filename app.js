/*
 | HAINON © 2026 جميع الحقوق محفوظة
 | لا يُسمح بنسخ أو توزيع أو استخدام هذا الملف أو أي جزء من الكود دون إذن كتابي صريح.
 | هذا الملف جزء من نظام HAINON المحاسبي.
*/

// app.js — الإصدار المُحسَّن (Lazy Loading)
import { auth, db, rtdb } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref, set, onValue, onDisconnect, serverTimestamp as rtdbTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import {
  doc, getDoc, getDocs, collection, query, where, orderBy,
  onSnapshot, serverTimestamp, updateDoc, addDoc, deleteDoc, setDoc, limit
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  $, $$, showToast, showLoading, hideLoading, showConfirm, formatCurrency,
  getTypeLabel, escapeHtml, getVipAvatarClass, getVipNameClass, getVipFrameClass,
  sendEmailCode, getUserLocation, getDeviceInfo, formatDateEn, formatTimeEn, formatDateTimeEn,
  getAutoVipLevel, getVipGlowStyle, getVipBadgeText, WRITE_BAR_COLORS
} from './utils.js';
import {
  handleRegister, handleLogin, handleLogout, verifyEmailCode, resendVerificationCode,
  handleForgotPassword, handleResetPassword, showOnboarding, completeOnboarding
} from './auth.js';

// ========== الحالة العامة ==========
export const state = {
  currentPage: 'dashboard',
  historyStack: [],
  sidebarOpen: false,
  calculatorOpen: false,
  calcExpression: '',
  onlineUsers: {}
};

// ========== التحميل الذكي للوحدات (Lazy Loading) ==========
const moduleCache = {};

async function getTransactionsModule() {
  if (!moduleCache.transactions) {
    moduleCache.transactions = await import('./transactions.js');
  }
  return moduleCache.transactions;
}

async function getDashboardModule() {
  if (!moduleCache.dashboard) {
    moduleCache.dashboard = await import('./dashboard.js');
  }
  return moduleCache.dashboard;
}

// ========== التنقل بين الصفحات ==========
export async function navigateTo(page) {
  if (window.innerWidth <= 600) closeSidebar();
  state.historyStack.push(state.currentPage);
  state.currentPage = page;
  updateTopbarTitle(page);

  $$('.page').forEach(p => p.classList.remove('active'));
  const targetPage = $(`#page-${page}`);
  if (targetPage) targetPage.classList.add('active');

  const transMod = await getTransactionsModule();

  switch (page) {
    case 'dashboard': transMod.loadDashboardPage(); break;
    case 'transactions': transMod.loadTransactionsPage(); break;
    case 'debts': transMod.loadDebtsPage(); break;
    case 'reports': transMod.loadReportsPage(); break;
    case 'account-level': transMod.loadAccountLevelPage(); break;
    case 'settings': { const dm = await getDashboardModule(); dm.loadSettingsPage(); break; }
    case 'privacy': loadPrivacyPage(); break;
    case 'vip-pricing': { const dm = await getDashboardModule(); dm.loadVipPricingPage(); break; }
    case 'vip-payment': { const dm = await getDashboardModule(); dm.loadVipPaymentPage(); break; }
    case 'users': { const dm = await getDashboardModule(); dm.loadUsersPage(); break; }
    case 'admin-chat': { const dm = await getDashboardModule(); dm.loadAdminChat(); break; }
    case 'vip-support': { const dm = await getDashboardModule(); dm.loadVipSupportChat(); break; }
    case 'profile': break;
    case 'site-management': { const dm = await getDashboardModule(); dm.loadSiteManagementPage(); break; }
    case 'vip-users': { const dm = await getDashboardModule(); dm.loadVipUsersList(); break; }
    case 'vip-request-settings': { const dm = await getDashboardModule(); dm.loadVipRequestSettingsPage(); break; }
    default: break;
  }

  $$('.nav-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.querySelector(`.nav-btn[data-page="${page}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  const calcToggle = $('#calc-toggle');
  if (calcToggle) {
    const showPages = ['dashboard', 'reports', 'transactions'];
    if (showPages.includes(page)) calcToggle.classList.remove('hidden');
    else calcToggle.classList.add('hidden');
  }
}

function updateTopbarTitle(page) {
  const titles = {
    dashboard: 'نظام الإدارة المالية', transactions: 'العمليات المؤرشفة',
    debts: 'الديون', reports: 'التقارير المالية', settings: 'الإعدادات',
    privacy: 'سياسة الخصوصية', 'vip-pricing': 'أسعار VIP', 'vip-payment': 'الدفع',
    users: 'إدارة المستخدمين', 'admin-chat': 'محادثة الإدارة',
    'vip-support': 'خدمة العملاء', 'account-level': 'مستوى الحساب',
    profile: 'الملف الشخصي', 'site-management': 'إدارة الموقع', 'vip-users': 'المستخدمين المميزين',
    'vip-request-settings': 'إعدادات طلب VIP'
  };
  const subtitle = $('#topbar-subtitle');
  if (subtitle) subtitle.textContent = titles[page] || '';
}

// ========== بناء القائمة الجانبية ==========
export function buildSidebar() {
  const nav = $('#sidebar-nav');
  if (!nav) return;
  nav.innerHTML = '';

  const addBtn = (page, icon, label, cls = '') => {
    const b = document.createElement('button');
    b.className = `nav-btn ${cls}`;
    b.dataset.page = page;
    b.innerHTML = `<i class="fas ${icon}"></i> ${label}`;
    b.addEventListener('click', () => navigateTo(page));
    nav.appendChild(b);
  };

  const isVip = state.isVip;
  const isAdmin = state.isAdmin;
  const isSuperMod = state.isSuperMod;
  const isMod = state.isMod;

  if (!isVip && !isAdmin && !isSuperMod && !isMod) {
    addBtn('vip-pricing', 'fa-star', 'تفعيل VIP', 'nav-btn-vip');
  }

  addBtn('dashboard', 'fa-chart-pie', 'الرئيسية');
  addBtn('reports', 'fa-file-invoice', 'التقارير');
  addBtn('debts', 'fa-hand-holding-usd', 'الديون');
  addBtn('transactions', 'fa-exchange-alt', 'العمليات');
  addBtn('account-level', 'fa-chart-line', 'مستوى الحساب');

  if (isAdmin || isSuperMod || isMod) {
    addBtn('users', 'fa-users', 'إدارة المستخدمين');
    addBtn('admin-chat', 'fa-comments', 'محادثة الإدارة');
    addBtn('site-management', 'fa-cogs', 'إدارة الموقع');
  }

  addBtn('vip-support', 'fa-headset', 'خدمة العملاء');
  addBtn('privacy', 'fa-shield-alt', 'سياسة الخصوصية');
  addBtn('settings', 'fa-cog', 'الإعدادات');

  if (isVip || isAdmin || isMod || isSuperMod) {
    const writeBarBtn = document.createElement('button');
    writeBarBtn.className = 'nav-btn nav-btn-vip';
    writeBarBtn.id = 'sidebar-write-bar-btn';
    writeBarBtn.innerHTML = '<i class="fas fa-pen"></i> اكتب شريط';
    writeBarBtn.addEventListener('click', () => openWriteBar());
    nav.appendChild(writeBarBtn);
  }
}

// ========== تحديث واجهة المستخدم ==========
export function updateUI() {
  const userData = state.userData;
  if (!userData) return;
  const av = userData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name||'?')}&background=D4AF37&color=111&size=200&bold=true&format=svg`;
  const headerImg = $('#header-avatar-img');
  const sidebarImg = $('#sidebar-avatar-img');
  if (headerImg) headerImg.src = av;
  if (sidebarImg) sidebarImg.src = av;

  const topbarLogo = $('#topbar-logo');
  if (topbarLogo) topbarLogo.textContent = userData.company || 'HAINON';

  const username = $('#sidebar-username');
  const idEl = $('#sidebar-id');
  const bioEl = $('#sidebar-bio');
  const roleEl = $('#sidebar-role');
  const avatarContainer = $('#sidebar-avatar-container');

  if (username) {
    username.textContent = `${userData.name || 'مستخدم'} • LV ${userData.accountLevel || 0}`;
    username.className = 'sidebar-username';
    const vipNameClass = getVipNameClass(userData.role);
    if (vipNameClass) username.classList.add(vipNameClass);
  }
  if (idEl) idEl.textContent = `ID: ${userData.serialId || '----'}`;
  if (bioEl) bioEl.textContent = userData.bio || '';
  if (roleEl) roleEl.innerHTML = getVipBadgeText(userData.role) || '<i class="fas fa-user"></i> مستخدم';
  if (avatarContainer) {
    avatarContainer.style.border = '3px solid var(--gold)';
    avatarContainer.style.boxShadow = getVipGlowStyle(userData.role);
  }

  updateWriteBarButton();
  buildSidebar();
}

// ========== الإشعارات ==========
export function loadNotifications() {
  if (!auth.currentUser) return;
  const q = query(
    collection(db, 'notifications'),
    where('uid', '==', auth.currentUser.uid),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  onSnapshot(q, (snapshot) => {
    const list = $('#notifications-list');
    const badge = $('#notification-badge');
    if (!list) return;
    let unreadCount = 0;
    list.innerHTML = '';
    if (snapshot.empty) {
      list.innerHTML = '<div class="notifications-item" style="color:var(--text-muted);">لا توجد إشعارات</div>';
    } else {
      snapshot.forEach(docSnap => {
        const notif = docSnap.data();
        if (!notif.read) unreadCount++;
        const notifDate = notif.createdAt?.toDate() || new Date();
        const div = document.createElement('div');
        div.className = `notifications-item ${notif.read ? '' : 'unread'}`;
        div.innerHTML = `<div style="font-size:11px;color:var(--text-muted);">${formatDateEn(notifDate)} ${formatTimeEn(notifDate)}</div><div style="margin:4px 0;">${notif.message}</div>`;
        div.addEventListener('click', async () => {
          if (!notif.read) await updateDoc(doc(db, 'notifications', docSnap.id), { read: true });
          $('#notifications-dropdown')?.classList.add('hidden');
          if (notif.type === 'vip_upgrade' || notif.type === 'id_upgrade') showVipConfetti(notif.message);
          else if (notif.link) navigateTo(notif.link);
        });
        list.appendChild(div);
      });
    }
    if (badge) {
      if (unreadCount > 0) { badge.classList.remove('hidden'); badge.textContent = unreadCount > 9 ? '9+' : unreadCount; }
      else badge.classList.add('hidden');
    }
  });
}

export async function checkVipNotifications() {
  if (!auth.currentUser) return;
  const q = query(collection(db, 'notifications'), where('uid', '==', auth.currentUser.uid), where('read', '==', false), where('type', 'in', ['vip_upgrade', 'id_upgrade']));
  const snapshot = await getDocs(q);
  for (const docSnap of snapshot.docs) {
    const notif = docSnap.data();
    showVipConfetti(notif.message);
    await updateDoc(doc(db, 'notifications', docSnap.id), { read: true });
  }
}

// ========== الآلة الحاسبة ==========
function setupCalculator() {
  const calc = $('#calculator');
  const toggleBtn = $('#calc-toggle');
  if (!calc || !toggleBtn) return;

  let isDragging = false, offsetX = 0, offsetY = 0;
  const onStart = (clientX, clientY) => {
    isDragging = true;
    const rect = toggleBtn.getBoundingClientRect();
    offsetX = clientX - rect.left;
    offsetY = clientY - rect.top;
    toggleBtn.style.transition = 'none';
    toggleBtn.style.position = 'fixed';
    toggleBtn.style.left = rect.left + 'px';
    toggleBtn.style.top = rect.top + 'px';
    toggleBtn.style.bottom = 'auto';
    toggleBtn.style.right = 'auto';
  };
  const onMove = (clientX, clientY) => {
    if (!isDragging) return;
    let left = clientX - offsetX;
    let top = clientY - offsetY;
    left = Math.max(0, Math.min(left, window.innerWidth - toggleBtn.offsetWidth));
    top = Math.max(0, Math.min(top, window.innerHeight - toggleBtn.offsetHeight));
    toggleBtn.style.left = left + 'px';
    toggleBtn.style.top = top + 'px';
  };
  const onEnd = () => { isDragging = false; };

  toggleBtn.addEventListener('mousedown', e => onStart(e.clientX, e.clientY));
  document.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
  document.addEventListener('mouseup', onEnd);
  toggleBtn.addEventListener('touchstart', e => onStart(e.touches[0].clientX, e.touches[0].clientY), {passive: false});
  document.addEventListener('touchmove', e => onMove(e.touches[0].clientX, e.touches[0].clientY), {passive: false});
  document.addEventListener('touchend', onEnd);
}

function toggleCalculator() {
  state.calculatorOpen = !state.calculatorOpen;
  const calc = $('#calculator');
  if (calc) calc.classList.toggle('hidden', !state.calculatorOpen);
  if (state.calculatorOpen) { state.calcExpression = ''; const display = $('#calc-display'); if (display) display.value = '0'; }
}

function handleCalcClick(key) {
  const display = $('#calc-display');
  if (!display) return;
  if (key === 'clear') { state.calcExpression = ''; display.value = '0'; return; }
  if (key === '=') {
    try { let exp = state.calcExpression.replace(/×/g, '*').replace(/÷/g, '/'); const result = eval(exp); if (!isFinite(result)) throw new Error('Invalid'); display.value = parseFloat(result.toFixed(10)); state.calcExpression = result.toString(); }
    catch { display.value = 'خطأ'; state.calcExpression = ''; }
    return;
  }
  const ops = ['+', '-', '*', '/', '×', '÷'];
  const lastChar = state.calcExpression.slice(-1);
  if (ops.includes(key) && ops.includes(lastChar)) state.calcExpression = state.calcExpression.slice(0, -1);
  state.calcExpression += key;
  display.value = state.calcExpression;
}

function toggleSidebar() { state.sidebarOpen = !state.sidebarOpen; const s = $('#sidebar'); if (s) s.classList.toggle('open', state.sidebarOpen); }
function closeSidebar() { state.sidebarOpen = false; const s = $('#sidebar'); if (s) s.classList.remove('open'); }

function goBack() {
  if (state.historyStack.length > 0) { const prevPage = state.historyStack.pop(); navigateTo(prevPage); }
}

// ========== شريط الكتابة ==========
function openWriteBar() {
  const modal = $('#write-bar-modal');
  const title = $('#write-bar-title');
  const textarea = $('#write-bar-text');
  if (!modal) return;

  if (state.userData?.currentBarId) {
    if (title) title.textContent = 'تعديل الشريط المكتوب';
    getDoc(doc(db, 'vipBars', state.userData.currentBarId)).then(snap => {
      if (snap.exists() && textarea) textarea.value = snap.data().text || '';
    });
  } else {
    if (title) title.textContent = 'اكتب شريط';
    if (textarea) textarea.value = '';
  }

  const colorsContainer = $('#write-bar-colors');
  if (colorsContainer) {
    colorsContainer.innerHTML = WRITE_BAR_COLORS.map(c =>
      `<span class="write-bar-color" style="background:${c};" data-color="${c}"></span>`
    ).join('');
    colorsContainer.querySelectorAll('.write-bar-color').forEach(el => {
      el.addEventListener('click', () => {
        colorsContainer.querySelectorAll('.write-bar-color').forEach(e => e.classList.remove('active'));
        el.classList.add('active');
      });
    });
    const firstColor = colorsContainer.querySelector('.write-bar-color');
    if (firstColor) firstColor.classList.add('active');
  }

  modal.classList.remove('hidden');
}

function setupWriteBar() {
  $('#write-bar-send')?.addEventListener('click', async () => {
    const text = $('#write-bar-text')?.value.trim();
    const activeColor = document.querySelector('.write-bar-color.active');
    const color = activeColor?.dataset.color || '#D4AF37';
    if (!text) return showToast('اكتب شيئاً', 'error');
    if (text.length > 90) return showToast('الحد 90 حرفاً', 'error');

    const lastTime = state.userData?.lastWriteBarTime?.toDate?.() || null;
    if (lastTime && !state.userData.currentBarId) {
      const hoursDiff = (Date.now() - lastTime.getTime()) / (1000 * 60 * 60);
      if (hoursDiff < 42) {
        const remaining = Math.ceil(42 - hoursDiff);
        return showToast(`يجب الانتظار ${remaining} ساعة قبل كتابة شريط جديد`, 'error');
      }
    }

    try {
      if (state.userData?.currentBarId) {
        await updateDoc(doc(db, 'vipBars', state.userData.currentBarId), { text, color });
        showToast('تم تعديل الشريط', 'success');
      } else {
        const docRef = await addDoc(collection(db, 'vipBars'), {
          uid: auth.currentUser.uid, name: state.userData?.name, avatar: state.userData?.avatar,
          text, color, createdAt: serverTimestamp()
        });
        await updateDoc(doc(db, 'users', auth.currentUser.uid), {
          currentBarId: docRef.id, lastWriteBarTime: serverTimestamp()
        });
        state.userData.currentBarId = docRef.id;
        state.userData.lastWriteBarTime = { toDate: () => new Date() };
      }
      $('#write-bar-modal')?.classList.add('hidden');
      const textarea = $('#write-bar-text');
      if (textarea) textarea.value = '';
      updateWriteBarButton();
    } catch (e) { showToast('فشل في الرفع', 'error'); }
  });

  $('#write-bar-cancel')?.addEventListener('click', () => {
    $('#write-bar-modal')?.classList.add('hidden');
    const textarea = $('#write-bar-text');
    if (textarea) textarea.value = '';
  });
}

function updateWriteBarButton() {
  const btn = $('#sidebar-write-bar-btn');
  if (!btn) return;
  if (state.userData?.currentBarId) {
    btn.innerHTML = '<i class="fas fa-pen"></i> تعديل الشريط';
  } else {
    btn.innerHTML = '<i class="fas fa-pen"></i> اكتب شريط';
  }
}

// ========== الوضع الليلي ==========
function toggleTheme() {
  const html = document.documentElement;
  if (html.classList.contains('light-mode')) {
    html.classList.remove('light-mode');
    localStorage.setItem('theme', 'dark');
  } else {
    html.classList.add('light-mode');
    localStorage.setItem('theme', 'light');
  }
}

function applySavedTheme() {
  if (localStorage.getItem('theme') === 'light') document.documentElement.classList.add('light-mode');
}

// ========== سياسة الخصوصية ==========
async function loadPrivacyPage() {
  const section = $('#page-privacy');
  if (!section) return;
  section.innerHTML = '<h2><i class="fas fa-shield-alt"></i> سياسة الخصوصية</h2><div id="privacy-content">جاري التحميل...</div>';
  const snap = await getDoc(doc(db, 'settings', 'privacy'));
  let content = snap.exists() ? snap.data().text : 'لم يتم تعيين سياسة الخصوصية بعد.';
  const contentDiv = $('#privacy-content');
  if (contentDiv) {
    contentDiv.innerHTML = `
      <div style="white-space:pre-wrap;line-height:1.8;background:var(--bg-card);padding:20px;border-radius:var(--radius-md);border:1px solid var(--border);">${escapeHtml(content)}</div>
      ${state.isAdmin ? '<button id="edit-privacy-btn" class="btn-outline btn-sm" style="margin-top:12px;"><i class="fas fa-edit"></i> تعديل</button>' : ''}
    `;
    $('#edit-privacy-btn')?.addEventListener('click', () => {
      const newText = prompt('أدخل نص سياسة الخصوصية الجديد:', content);
      if (newText !== null) {
        setDoc(doc(db, 'settings', 'privacy'), { text: newText }).then(() => {
          showToast('تم تحديث سياسة الخصوصية', 'success');
          loadPrivacyPage();
        });
      }
    });
  }
}

// ========== شريط VIP العلوي ==========
function updateVipTopBar() {
  const promoQuery = query(collection(db, 'vipPromotions'), where('expiresAt', '>', new Date()), orderBy('expiresAt', 'asc'));
  const barsQuery = query(collection(db, 'vipBars'), orderBy('createdAt', 'asc'));
  let allItems = [];

  onSnapshot(promoQuery, (promoSnap) => {
    onSnapshot(barsQuery, (barsSnap) => {
      allItems = [];
      promoSnap.forEach(doc => allItems.push({ type: 'promo', text: doc.data().text, color: doc.data().color || '#D4AF37' }));
      barsSnap.forEach(doc => {
        const data = doc.data();
        allItems.push({ type: 'user', name: data.name, avatar: data.avatar, text: data.text, color: data.color || '#D4AF37' });
      });
      startVipBarDisplay(allItems);
    });
  });
}

let vipBarInterval = null;
let currentVipBarIndex = 0;

function startVipBarDisplay(items) {
  if (vipBarInterval) clearInterval(vipBarInterval);
  currentVipBarIndex = 0;
  const bar = $('#vip-top-bar');
  const content = $('#vip-top-bar-content');
  if (!bar || !content) return;

  if (state.userData?.showVipBar === false) { bar.classList.add('hidden'); return; }
  if (items.length === 0) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');

  const showNext = () => {
    if (currentVipBarIndex >= items.length) currentVipBarIndex = 0;
    const item = items[currentVipBarIndex];
    if (item.type === 'promo') {
      content.innerHTML = `<div class="vip-top-bar-item"><span style="color:${item.color};font-size:14px;">${escapeHtml(item.text)}</span></div>`;
    } else {
      content.innerHTML = `<div class="vip-top-bar-item">
        <img src="${item.avatar || 'https://ui-avatars.com/api/?name='+encodeURIComponent(item.name||'?')}" alt="${item.name}">
        <span style="color:${item.color};">${item.name}: ${escapeHtml(item.text)}</span></div>`;
    }
    currentVipBarIndex++;
  };

  showNext();
  vipBarInterval = setInterval(showNext, 15000);
}

// ========== إعداد الأحداث ==========
function setupEventListeners() {
  $('#tab-login')?.addEventListener('click', () => {
    $('#tab-login').classList.add('active'); $('#tab-register').classList.remove('active');
    $('#login-form').classList.add('active'); $('#register-form').classList.remove('active');
  });
  $('#tab-register')?.addEventListener('click', () => {
    $('#tab-register').classList.add('active'); $('#tab-login').classList.remove('active');
    $('#register-form').classList.add('active'); $('#login-form').classList.remove('active');
  });

  $('#login-form')?.addEventListener('submit', handleLogin);
  $('#register-form')?.addEventListener('submit', handleRegister);
  $('#forgot-password-btn')?.addEventListener('click', () => $('#forgot-password-modal')?.classList.remove('hidden'));
  $('#forgot-send')?.addEventListener('click', handleForgotPassword);
  $('#forgot-cancel')?.addEventListener('click', () => $('#forgot-password-modal')?.classList.add('hidden'));

  $('#verify-code-btn')?.addEventListener('click', verifyEmailCode);
  $('#resend-verify-btn')?.addEventListener('click', resendVerificationCode);
  $('#reset-save')?.addEventListener('click', handleResetPassword);
  $('#reset-cancel')?.addEventListener('click', () => $('#reset-password-modal')?.classList.add('hidden'));

  $('#upload-avatar-btn')?.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('open-cropper', { detail: 'avatar' }));
  });
  $('#skip-onboarding')?.addEventListener('click', () => completeOnboarding(null));

  $('#sidebar-toggle')?.addEventListener('click', toggleSidebar);
  $('#header-avatar')?.addEventListener('click', async () => { const dm = await getDashboardModule(); dm.viewPublicProfile(auth.currentUser?.uid); });
  document.querySelector('.sidebar-overlay')?.addEventListener('click', closeSidebar);

  $('#logout-btn')?.addEventListener('click', handleLogout);
  $('#notification-bell')?.addEventListener('click', () => $('#notifications-dropdown')?.classList.toggle('hidden'));
  $('#notifications-close')?.addEventListener('click', () => $('#notifications-dropdown')?.classList.add('hidden'));

  $('#calc-toggle')?.addEventListener('click', toggleCalculator);
  $('#calc-close')?.addEventListener('click', toggleCalculator);
  $$('.calc-btn').forEach(btn => btn.addEventListener('click', () => handleCalcClick(btn.dataset.key)));

  setupWriteBar();

  // مودال الإشعار الجماعي
  $('#mass-notification-send')?.addEventListener('click', async () => {
    const text = $('#mass-notification-text')?.value.trim();
    if (!text) return showToast('اكتب نص الإشعار', 'error');
    const tm = await getTransactionsModule();
    await tm.sendMassNotification(text);
    $('#mass-notification-modal')?.classList.add('hidden');
    const textarea = $('#mass-notification-text'); if (textarea) textarea.value = '';
  });
  $('#mass-notification-cancel')?.addEventListener('click', () => $('#mass-notification-modal')?.classList.add('hidden'));

  // مودال الحظر
  $('#block-confirm')?.addEventListener('click', async () => { const dm = await getDashboardModule(); dm.blockUserByAdmin(); });
  $('#block-cancel')?.addEventListener('click', () => $('#block-modal').classList.add('hidden'));
  $('#block-duration')?.addEventListener('change', function() {
    const customDate = $('#block-custom-date');
    if (this.value === 'custom') customDate.classList.remove('hidden');
    else customDate.classList.add('hidden');
  });

  // أزرار الشريط السفلي
  $('#bottom-btn-vip-users')?.addEventListener('click', () => navigateTo('vip-users'));
  $('#bottom-btn-back')?.addEventListener('click', () => navigateTo('dashboard'));

  // Lightbox
  $('#lightbox-close')?.addEventListener('click', () => $('#image-lightbox')?.classList.add('hidden'));
  $('#image-lightbox')?.addEventListener('click', (e) => { if (e.target === $('#image-lightbox')) $('#image-lightbox').classList.add('hidden'); });

  window.addEventListener('click', e => { if (e.target.classList.contains('modal')) e.target.classList.add('hidden'); });
  $('#theme-toggle-btn')?.addEventListener('click', toggleTheme);
  document.addEventListener('navigate', e => navigateTo(e.detail));
  document.addEventListener('ui-update', () => updateUI());
  document.addEventListener('show-confetti', async e => { const dm = await getDashboardModule(); dm.showVipConfetti(e.detail); });
  document.addEventListener('open-cropper', e => { if (typeof openCropper === 'function') openCropper(e.detail); });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (state.sidebarOpen) closeSidebar();
      if (state.calculatorOpen) toggleCalculator();
      $('#notifications-dropdown')?.classList.add('hidden');
    }
  });

  window.addEventListener('popstate', (e) => { e.preventDefault(); goBack(); });
  history.pushState(null, '', window.location.href);

  setTimeout(setupCalculator, 1000);
}

// ========== مراقبة المصادقة وبدء التشغيل (محسّن) ==========
onAuthStateChanged(auth, async (user) => {
  hideLoading();
  if (user) {
    const transMod = await getTransactionsModule();
    const exists = await transMod.loadUserData();
    
    // تحديث الحالة العامة
    state.userData = transMod.userData;
    state.isAdmin = transMod.isAdmin;
    state.isSuperMod = transMod.isSuperMod;
    state.isMod = transMod.isMod;
    state.isVip = transMod.isVip;
    state.vipLevel = transMod.vipLevel;
    
    if (exists) {
      const presenceRef = ref(rtdb, `presence/${user.uid}`);
      onValue(ref(rtdb, '.info/connected'), snap => {
        if (snap.val() === true) {
          onDisconnect(presenceRef).set({ status: 'offline', lastSeen: rtdbTimestamp() });
          set(presenceRef, { status: 'online', lastSeen: rtdbTimestamp() });
        }
      });

      if (state.isAdmin || state.isSuperMod || state.isMod) {
        onValue(ref(rtdb, 'presence'), snap => { state.onlineUsers = snap.val() || {}; });
      }

      loadNotifications();
      updateVipTopBar();

      if (state.userData.blocked) {
        const reason = state.userData.blockReason || 'غير محدد';
        const expiry = state.userData.blockExpiry ? formatDateEn(state.userData.blockExpiry.toDate()) + ' ' + formatTimeEn(state.userData.blockExpiry.toDate()) : 'دائم';
        await signOut(auth);
        return showToast(`حسابك محظور. السبب: ${reason}. ينتهي: ${expiry}`, 'error');
      }

      if (!state.userData.emailVerified) {
        showVerifyEmailScreen();
      } else if (!state.userData.onboardingCompleted) {
        showOnboarding();
      } else {
        $('#auth-screen')?.classList.add('hidden');
        $('#onboarding-screen')?.classList.add('hidden');
        $('#verify-email-screen')?.classList.add('hidden');
        $('#app')?.classList.remove('hidden');
        updateUI();
        applySavedTheme();
        navigateTo('dashboard');
        transMod.archiveDailyTransactions();
        checkVipNotifications();
      }
    } else {
      showOnboarding();
    }
  } else {
    $('#app')?.classList.add('hidden');
    $('#onboarding-screen')?.classList.add('hidden');
    $('#verify-email-screen')?.classList.add('hidden');
    $('#auth-screen')?.classList.remove('hidden');
  }
});

// ========== بدء تحميل DOM ==========
document.addEventListener('DOMContentLoaded', () => {
  const emailjsScript = document.createElement('script');
  emailjsScript.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js";
  emailjsScript.onload = () => { if (typeof emailjs !== 'undefined') emailjs.init("ILfMM-EFqQXbiBmeZ"); };
  document.head.appendChild(emailjsScript);
  setupEventListeners();
  showLoading();
});

function showVerifyEmailScreen() {
  $('#auth-screen')?.classList.add('hidden');
  $('#app')?.classList.add('hidden');
  $('#onboarding-screen')?.classList.add('hidden');
  $('#verify-email-screen')?.classList.remove('hidden');
}
