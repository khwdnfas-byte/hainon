/*
 | HAINON © 2026 جميع الحقوق محفوظة
 | لا يُسمح بنسخ أو توزيع أو استخدام هذا الملف أو أي جزء من الكود دون إذن كتابي صريح.
 | هذا الملف جزء من نظام HAINON المحاسبي.
*/

// app.js — الملف الرئيسي: الربط، التنقل، القائمة الجانبية، الإشعارات، الآلة الحاسبة، بدء التشغيل
import { auth, db, rtdb } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref, set, onValue, onDisconnect, serverTimestamp as rtdbTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import {
  doc, getDoc, getDocs, collection, query, where, orderBy,
  onSnapshot, serverTimestamp, updateDoc, addDoc, deleteDoc, limit, setDoc
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
import {
  currentUser, userData, isAdmin, isSuperMod, isMod, isVip, vipLevel,
  loadUserData, loadDashboardPage, loadTransactionsPage, loadDebtsPage,
  loadReportsPage, loadVipRequestsAdmin, loadVipPricingPage, loadVipPaymentPage,
  loadAdminChat, loadVipSupportChat, loadUsersPage, loadSettingsPage,
  archiveDailyTransactions, editTransaction, deleteTransaction,
  calculateNet, calculateProfitLossAccurate, createVipRequest,
  sendMassNotification, loadVipRequestSettingsPage, showVipConfetti,
  viewPublicProfile, loadAccountLevelPage
} from './dashboard.js';

// ========== الحالة العامة ==========
export const state = {
  currentPage: 'dashboard',
  historyStack: [],
  sidebarOpen: false,
  calculatorOpen: false,
  calcExpression: '',
  onlineUsers: {}
};

// ========== التنقل بين الصفحات ==========
export function navigateTo(page) {
  if (window.innerWidth <= 600) closeSidebar();
  state.historyStack.push(state.currentPage);
  state.currentPage = page;
  updateTopbarTitle(page);

  $$('.page').forEach(p => p.classList.remove('active'));
  const targetPage = $(`#page-${page}`);
  if (targetPage) targetPage.classList.add('active');

  switch (page) {
    case 'dashboard': loadDashboardPage(); break;
    case 'transactions': loadTransactionsPage(); break;
    case 'debts': loadDebtsPage(); break;
    case 'reports': loadReportsPage(); break;
    case 'settings': loadSettingsPage(); break;
    case 'privacy': loadPrivacyPage(); break;
    case 'vip-pricing': loadVipPricingPage(); break;
    case 'vip-payment': loadVipPaymentPage(); break;
    case 'users': loadUsersPage(); break;
    case 'admin-chat': loadAdminChat(); break;
    case 'vip-support': loadVipSupportChat(); break;
    case 'account-level': loadAccountLevelPage(); break;
    case 'profile': break; // profile يُبنى من viewPublicProfile مباشرة
    default: break;
  }

  $$('.nav-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.querySelector(`.nav-btn[data-page="${page}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  // إظهار/إخفاء الآلة الحاسبة
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
    'vip-support': 'خدمة العملاء', 'account-level': 'مستوى الحساب', profile: 'الملف الشخصي'
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
  }

  addBtn('vip-support', 'fa-headset', 'خدمة العملاء');
  addBtn('privacy', 'fa-shield-alt', 'سياسة الخصوصية');
  addBtn('settings', 'fa-cog', 'الإعدادات');

  // شريط الكتابة (لـ VIP والمشرفين والأدمن)
  if (isVip || isAdmin || isMod || isSuperMod) {
    const writeBarBtn = document.createElement('button');
    writeBarBtn.className = 'nav-btn nav-btn-vip';
    writeBarBtn.innerHTML = '<i class="fas fa-pen"></i> اكتب شريط';
    writeBarBtn.addEventListener('click', () => $('#write-bar-modal')?.classList.remove('hidden'));
    nav.appendChild(writeBarBtn);
  }
}

// ========== تحديث واجهة المستخدم ==========
export function updateUI() {
  if (!userData) return;
  const av = userData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name||'?')}&background=D4AF37&color=111&size=200&bold=true&format=svg`;
  const headerImg = $('#header-avatar-img');
  const sidebarImg = $('#sidebar-avatar-img');
  if (headerImg) headerImg.src = av;
  if (sidebarImg) sidebarImg.src = av;

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
  if (roleEl) {
    roleEl.innerHTML = getVipBadgeText(userData.role) || '<i class="fas fa-user"></i> مستخدم';
  }

  if (avatarContainer) {
    avatarContainer.style.border = '3px solid var(--gold)';
    avatarContainer.style.boxShadow = getVipGlowStyle(userData.role);
  }

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
        div.innerHTML = `
          <div style="font-size:11px;color:var(--text-muted);">${formatDateEn(notifDate)} ${formatTimeEn(notifDate)}</div>
          <div style="margin:4px 0;">${notif.message}</div>
        `;
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
  const q = query(
    collection(db, 'notifications'),
    where('uid', '==', auth.currentUser.uid),
    where('read', '==', false),
    where('type', 'in', ['vip_upgrade', 'id_upgrade'])
  );
  const snapshot = await getDocs(q);
  for (const docSnap of snapshot.docs) {
    const notif = docSnap.data();
    showVipConfetti(notif.message);
    await updateDoc(doc(db, 'notifications', docSnap.id), { read: true });
  }
}

// ========== الآلة الحاسبة العائمة (قابلة للسحب بحرية) ==========
function setupCalculator() {
  const calc = $('#calculator');
  const header = document.querySelector('.calculator-header');
  const toggleBtn = $('#calc-toggle');
  if (!calc || !header || !toggleBtn) return;

  let isDragging = false, offsetX = 0, offsetY = 0;

  const onStart = (clientX, clientY) => {
    isDragging = true;
    const rect = calc.getBoundingClientRect();
    offsetX = clientX - rect.left;
    offsetY = clientY - rect.top;
    calc.style.transition = 'none';
    calc.style.position = 'fixed';
    calc.style.top = rect.top + 'px';
    calc.style.left = rect.left + 'px';
    calc.style.transform = 'none';
  };

  const onMove = (clientX, clientY) => {
    if (!isDragging) return;
    let left = clientX - offsetX;
    let top = clientY - offsetY;
    left = Math.max(0, Math.min(left, window.innerWidth - calc.offsetWidth));
    top = Math.max(0, Math.min(top, window.innerHeight - calc.offsetHeight));
    calc.style.left = left + 'px';
    calc.style.top = top + 'px';
  };

  const onEnd = () => { isDragging = false; };

  header.addEventListener('mousedown', e => onStart(e.clientX, e.clientY));
  document.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
  document.addEventListener('mouseup', onEnd);

  header.addEventListener('touchstart', e => onStart(e.touches[0].clientX, e.touches[0].clientY), {passive: false});
  document.addEventListener('touchmove', e => onMove(e.touches[0].clientX, e.touches[0].clientY), {passive: false});
  document.addEventListener('touchend', onEnd);

  // جعل زر التبديل قابلاً للسحب أيضاً
  let btnDragging = false, btnOffX = 0, btnOffY = 0;
  toggleBtn.addEventListener('mousedown', e => {
    btnDragging = true;
    const rect = toggleBtn.getBoundingClientRect();
    btnOffX = e.clientX - rect.left;
    btnOffY = e.clientY - rect.top;
    toggleBtn.style.position = 'fixed';
    toggleBtn.style.transition = 'none';
  });
  document.addEventListener('mousemove', e => {
    if (!btnDragging) return;
    let left = e.clientX - btnOffX;
    let top = e.clientY - btnOffY;
    left = Math.max(0, Math.min(left, window.innerWidth - toggleBtn.offsetWidth));
    top = Math.max(0, Math.min(top, window.innerHeight - toggleBtn.offsetHeight));
    toggleBtn.style.left = left + 'px';
    toggleBtn.style.top = top + 'px';
    toggleBtn.style.bottom = 'auto';
    toggleBtn.style.right = 'auto';
  });
  document.addEventListener('mouseup', () => { btnDragging = false; });
}

function toggleCalculator() {
  state.calculatorOpen = !state.calculatorOpen;
  const calc = $('#calculator');
  if (calc) calc.classList.toggle('hidden', !state.calculatorOpen);
  if (state.calculatorOpen) {
    state.calcExpression = '';
    const display = $('#calc-display');
    if (display) display.value = '0';
  }
}

function handleCalcClick(key) {
  const display = $('#calc-display');
  if (!display) return;
  if (key === 'clear') { state.calcExpression = ''; display.value = '0'; return; }
  if (key === '=') {
    try {
      let exp = state.calcExpression.replace(/×/g, '*').replace(/÷/g, '/');
      const result = eval(exp);
      if (!isFinite(result)) throw new Error('Invalid');
      display.value = parseFloat(result.toFixed(10));
      state.calcExpression = result.toString();
    } catch { display.value = 'خطأ'; state.calcExpression = ''; }
    return;
  }
  const ops = ['+', '-', '*', '/', '×', '÷'];
  const lastChar = state.calcExpression.slice(-1);
  if (ops.includes(key) && ops.includes(lastChar)) state.calcExpression = state.calcExpression.slice(0, -1);
  state.calcExpression += key;
  display.value = state.calcExpression;
}

// ========== القائمة الجانبية ==========
function toggleSidebar() {
  state.sidebarOpen = !state.sidebarOpen;
  const sidebar = $('#sidebar');
  if (sidebar) sidebar.classList.toggle('open', state.sidebarOpen);
}
function closeSidebar() {
  state.sidebarOpen = false;
  const sidebar = $('#sidebar');
  if (sidebar) sidebar.classList.remove('open');
}

// ========== العودة للخلف ==========
function goBack() {
  if (state.historyStack.length > 0) {
    const prevPage = state.historyStack.pop();
    navigateTo(prevPage);
  }
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
    if (typeof openCropper === 'function') openCropper('avatar');
  });
  $('#skip-onboarding')?.addEventListener('click', () => completeOnboarding(null));

  $('#sidebar-toggle')?.addEventListener('click', toggleSidebar);
  $('#header-avatar')?.addEventListener('click', () => viewPublicProfile(auth.currentUser?.uid));
  document.querySelector('.sidebar-overlay')?.addEventListener('click', closeSidebar);

  $('#logout-btn')?.addEventListener('click', handleLogout);

  $('#notification-bell')?.addEventListener('click', () => $('#notifications-dropdown')?.classList.toggle('hidden'));
  $('#notifications-close')?.addEventListener('click', () => $('#notifications-dropdown')?.classList.add('hidden'));

  $('#calc-toggle')?.addEventListener('click', toggleCalculator);
  $('#calc-close')?.addEventListener('click', toggleCalculator);
  $$('.calc-btn').forEach(btn => btn.addEventListener('click', () => handleCalcClick(btn.dataset.key)));

  // شريط الكتابة
  setupWriteBar();

  // إرسال إشعار جماعي
  $('#mass-notification-send')?.addEventListener('click', async () => {
    const text = $('#mass-notification-text')?.value.trim();
    if (!text) return showToast('اكتب نص الإشعار', 'error');
    await sendMassNotification(text);
    $('#mass-notification-modal')?.classList.add('hidden');
    const textarea = $('#mass-notification-text');
    if (textarea) textarea.value = '';
  });
  $('#mass-notification-cancel')?.addEventListener('click', () => $('#mass-notification-modal')?.classList.add('hidden'));

  // زر إرسال إشعار جماعي في الشريط السفلي (للأدمن والمشرفين)
  if (isAdmin || isMod || isSuperMod) {
    const bottomBar = document.querySelector('.bottom-bar');
    if (bottomBar) {
      const massBtn = document.createElement('button');
      massBtn.className = 'bottom-bar-btn';
      massBtn.innerHTML = '<i class="fas fa-bullhorn"></i> إرسال إشعار';
      massBtn.addEventListener('click', () => $('#mass-notification-modal')?.classList.remove('hidden'));
      bottomBar.appendChild(massBtn);
    }
  }

  window.addEventListener('click', e => { if (e.target.classList.contains('modal')) e.target.classList.add('hidden'); });
  $('#theme-toggle-btn')?.addEventListener('click', toggleTheme);
  document.addEventListener('navigate', e => navigateTo(e.detail));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (state.sidebarOpen) closeSidebar();
      if (state.calculatorOpen) toggleCalculator();
      $('#notifications-dropdown')?.classList.add('hidden');
    }
  });

  window.addEventListener('popstate', (e) => {
    e.preventDefault();
    goBack();
  });
  history.pushState(null, '', window.location.href);

  setTimeout(setupCalculator, 1000);
}

// ========== شريط الكتابة ==========
function setupWriteBar() {
  const colorsContainer = $('#write-bar-colors');
  if (colorsContainer) {
    colorsContainer.innerHTML = WRITE_BAR_COLORS.map(c => `<span class="write-bar-color" style="background:${c};" data-color="${c}"></span>`).join('');
    colorsContainer.querySelectorAll('.write-bar-color').forEach(el => {
      el.addEventListener('click', () => {
        colorsContainer.querySelectorAll('.write-bar-color').forEach(e => e.classList.remove('active'));
        el.classList.add('active');
      });
    });
  }

  $('#write-bar-send')?.addEventListener('click', async () => {
    const text = $('#write-bar-text')?.value.trim();
    const activeColor = document.querySelector('.write-bar-color.active');
    const color = activeColor?.dataset.color || '#D4AF37';
    if (!text) return showToast('اكتب شيئاً', 'error');
    if (text.length > 90) return showToast('الحد 90 حرفاً', 'error');
    try {
      await addDoc(collection(db, 'vipBars'), {
        uid: auth.currentUser.uid, name: userData?.name, avatar: userData?.avatar,
        text, color, createdAt: serverTimestamp()
      });
      showToast('تم رفع الشريط', 'success');
      $('#write-bar-modal')?.classList.add('hidden');
      const textarea = $('#write-bar-text');
      if (textarea) textarea.value = '';
    } catch (e) { showToast('فشل في الرفع', 'error'); }
  });

  $('#write-bar-cancel')?.addEventListener('click', () => {
    $('#write-bar-modal')?.classList.add('hidden');
    const textarea = $('#write-bar-text');
    if (textarea) textarea.value = '';
  });
}// ... تابع app.js (الجزء 2/2) — الوضع الليلي، سياسة الخصوصية، بدء التشغيل

// ========== الوضع الليلي ==========
function toggleTheme() {
  const html = document.documentElement;
  const isLight = html.classList.contains('light-mode');
  if (isLight) {
    html.classList.remove('light-mode');
    localStorage.setItem('theme', 'dark');
  } else {
    html.classList.add('light-mode');
    localStorage.setItem('theme', 'light');
  }
}

function applySavedTheme() {
  const saved = localStorage.getItem('theme');
  if (saved === 'light') document.documentElement.classList.add('light-mode');
}

// ========== صفحة سياسة الخصوصية ==========
async function loadPrivacyPage() {
  const section = $('#page-privacy');
  if (!section) return;
  section.innerHTML = '<h2><i class="fas fa-shield-alt"></i> سياسة الخصوصية</h2><div id="privacy-content">جاري التحميل...</div>';
  const snap = await getDoc(doc(db, 'settings', 'privacy'));
  let content = snap.exists() ? snap.data().text : 'لم يتم تعيين سياسة الخصوصية بعد.';
  const contentDiv = $('#privacy-content');
  if (contentDiv) {
    contentDiv.innerHTML = `
      <div style="white-space:pre-wrap;line-height:1.8;background:var(--bg-card);padding:20px;border-radius:var(--radius-md);border:1px solid var(--border);">
        ${escapeHtml(content)}
      </div>
      ${isAdmin ? '<button id="edit-privacy-btn" class="btn-outline btn-sm" style="margin-top:12px;"><i class="fas fa-edit"></i> تعديل</button>' : ''}
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
      promoSnap.forEach(doc => {
        const data = doc.data();
        allItems.push({ type: 'promo', text: data.text, color: data.color || '#D4AF37' });
      });
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
        <span style="color:${item.color};">${item.name}: ${escapeHtml(item.text)}</span>
      </div>`;
    }
    currentVipBarIndex++;
  };

  showNext();
  vipBarInterval = setInterval(showNext, 15000);
}

// ========== مراقبة المصادقة وبدء التطبيق ==========
onAuthStateChanged(auth, async (user) => {
  hideLoading();
  if (user) {
    const exists = await loadUserData();
    if (exists) {
      const presenceRef = ref(rtdb, `presence/${user.uid}`);
      const connectedRef = ref(rtdb, '.info/connected');
      onValue(connectedRef, snap => {
        if (snap.val() === true) {
          onDisconnect(presenceRef).set({ status: 'offline', lastSeen: rtdbTimestamp() });
          set(presenceRef, { status: 'online', lastSeen: rtdbTimestamp() });
        }
      });

      if (isAdmin || isSuperMod || isMod) {
        onValue(ref(rtdb, 'presence'), snap => { state.onlineUsers = snap.val() || {}; });
      }

      loadNotifications();
      updateVipTopBar();

      if (userData.blocked) {
        const reason = userData.blockReason || 'غير محدد';
        const expiry = userData.blockExpiry ? formatDateEn(userData.blockExpiry.toDate()) + ' ' + formatTimeEn(userData.blockExpiry.toDate()) : 'دائم';
        await signOut(auth);
        return showToast(`حسابك محظور. السبب: ${reason}. ينتهي: ${expiry}`, 'error');
      }

      if (!userData.emailVerified) {
        showVerifyEmailScreen();
      } else if (!userData.onboardingCompleted) {
        showOnboarding();
      } else {
        $('#auth-screen')?.classList.add('hidden');
        $('#onboarding-screen')?.classList.add('hidden');
        $('#verify-email-screen')?.classList.add('hidden');
        $('#app')?.classList.remove('hidden');
        updateUI();
        applySavedTheme();
        navigateTo('dashboard');
        archiveDailyTransactions();
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
  emailjsScript.onload = () => {
    if (typeof emailjs !== 'undefined') emailjs.init("ILfMM-EFqQXbiBmeZ");
  };
  document.head.appendChild(emailjsScript);

  setupEventListeners();
  showLoading();
});

// ========== معالج تحسين أزرار الرجوع ==========
window.addEventListener('popstate', (e) => {
  e.preventDefault();
  goBack();
});
history.pushState(null, '', window.location.href);