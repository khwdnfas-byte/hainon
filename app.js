// app.js — الملف الرئيسي: الربط، التنقل، القائمة الجانبية، الإشعارات، الآلة الحاسبة، بدء التشغيل
import { auth, db, rtdb } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref, set, onValue, onDisconnect, serverTimestamp as rtdbTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import {
  doc, getDoc, getDocs, collection, query, where, orderBy,
  onSnapshot, serverTimestamp, updateDoc, addDoc, deleteDoc, Timestamp, limit
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  $, $$, showToast, showLoading, hideLoading, showConfirm, formatCurrency,
  getTypeLabel, escapeHtml, getVipAvatarClass, getVipNameClass, getVipFrameClass,
  sendEmailCode, getUserLocation, getDeviceInfo, formatDateEn, formatTimeEn, formatDateTimeEn
} from './utils.js';
import {
  handleRegister, handleLogin, handleLogout, verifyEmailCode, resendVerificationCode,
  handleForgotPassword, handleResetPassword, showOnboarding, completeOnboarding,
  saveProfile, changePassword, changeEmail, updateAvatar, updateCover, updatePrivacy
} from './auth.js';
import {
  currentUser, userData, isAdmin, isSuperMod, isMod, isVip, vipLevel,
  loadUserData, loadDashboardPage, loadTransactionsPage, loadDebtsPage,
  loadReportsPage, loadVipRequestsAdmin, loadVipPricingPage, loadVipPaymentPage,
  loadAdminChat, loadVipSupportChat, loadUsersPage, loadSettingsPage,
  archiveDailyTransactions, editTransaction, deleteTransaction,
  calculateNet, calculateProfitLossAccurate, createVipRequest
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
  updateBottomBar(page);

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
    default: break;
  }

  $$('.nav-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.querySelector(`.nav-btn[data-page="${page}"]`);
  if (activeBtn) activeBtn.classList.add('active');
}

function updateTopbarTitle(page) {
  const titles = {
    dashboard: 'نظام الإدارة المالية',
    transactions: 'العمليات المؤرشفة',
    debts: 'الديون',
    reports: 'التقارير المالية',
    settings: 'الإعدادات',
    privacy: 'سياسة الخصوصية',
    'vip-pricing': 'أسعار VIP',
    'vip-payment': 'الدفع',
    users: 'إدارة المستخدمين',
    'admin-chat': 'محادثة الإدارة',
    'vip-support': 'خدمة العملاء'
  };
  const subtitle = $('#topbar-subtitle');
  if (subtitle) subtitle.textContent = titles[page] || '';
}

function updateBottomBar(page) {
  const btnUsers = $('#bottom-btn-users');
  const btnBack = $('#bottom-btn-back');
  if (!btnUsers || !btnBack) return;
  if (page === 'dashboard') {
    btnUsers.classList.remove('hidden');
    btnBack.classList.add('hidden');
    btnUsers.innerHTML = '<i class="fas fa-users"></i> عرض المستخدمين';
  } else if (page === 'userslist') {
    btnUsers.classList.add('hidden');
    btnBack.classList.remove('hidden');
  } else {
    btnUsers.classList.add('hidden');
    btnBack.classList.add('hidden');
  }
}

// ========== بناء القائمة الجانبية ==========
export function buildSidebar() {
  const nav = $('#sidebar-nav');
  if (!nav) return;
  nav.innerHTML = '';

  const addBtn = (page, icon, label) => {
    const b = document.createElement('button');
    b.className = 'nav-btn';
    b.dataset.page = page;
    b.innerHTML = `<i class="fas ${icon}"></i> ${label}`;
    b.addEventListener('click', () => navigateTo(page));
    nav.appendChild(b);
  };

  // أزرار أساسية للجميع
  addBtn('dashboard', 'fa-chart-pie', 'الرئيسية');
  addBtn('reports', 'fa-file-invoice', 'التقارير');
  addBtn('debts', 'fa-hand-holding-usd', 'الديون');
  addBtn('transactions', 'fa-exchange-alt', 'العمليات');

  // زر إدارة المستخدمين (للأدمن والمشرفين فقط)
  if (isAdmin || isSuperMod || isMod) {
    addBtn('users', 'fa-users', 'إدارة المستخدمين');
  }

  // محادثة الإدارة (للأدمن والمشرفين فقط)
  if (isAdmin || isSuperMod || isMod) {
    addBtn('admin-chat', 'fa-comments', 'محادثة الإدارة');
  }

  // زر VIP / خدمة العملاء
  if (!isVip && !isAdmin && !isSuperMod && !isMod) {
    // مستخدم عادي: زر للترقية إلى VIP
    addBtn('vip-pricing', 'fa-star', 'ترقية VIP');
  } else if (isVip) {
    // مستخدم VIP: زر خدمة العملاء
    addBtn('vip-support', 'fa-headset', 'خدمة العملاء');
  }

  addBtn('settings', 'fa-cog', 'الإعدادات');
  addBtn('privacy', 'fa-shield-alt', 'سياسة الخصوصية');
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

  if (username) username.textContent = userData.name || 'مستخدم';
  if (idEl) {
    idEl.textContent = `ID: ${userData.serialId || '----'}`;
    idEl.className = `sidebar-id ${vipLevel > 0 ? 'vip-id-vip'+vipLevel : ''}`;
  }
  if (bioEl) bioEl.textContent = userData.bio || '';
  if (roleEl) {
    let roleText = '<i class="fas fa-user"></i> مستخدم';
    if (isAdmin) roleText = '<i class="fas fa-crown"></i> مدير';
    else if (isSuperMod) roleText = '<i class="fas fa-shield-alt"></i> مشرف مميز';
    else if (isMod) roleText = '<i class="fas fa-shield-alt"></i> مشرف';
    else if (vipLevel > 0) roleText = `<i class="fas fa-star"></i> VIP ${vipLevel}`;
    roleEl.innerHTML = roleText;
  }

  // تأثيرات VIP على الصورة والاسم
  const avatarContainer = $('#sidebar-avatar-container');
  const usernameEl = $('#sidebar-username');
  if (avatarContainer) {
    avatarContainer.className = 'sidebar-avatar';
    const vipAvatarClass = getVipAvatarClass(userData.role);
    if (vipAvatarClass) avatarContainer.classList.add(vipAvatarClass);
    avatarContainer.style.border = '3px solid var(--gold)';
    if (vipLevel === 3) avatarContainer.style.boxShadow = '0 0 20px rgba(138,43,226,0.8)';
    else if (vipLevel === 2) avatarContainer.style.boxShadow = '0 0 15px rgba(0,200,83,0.5)';
    else if (vipLevel === 1) avatarContainer.style.boxShadow = '0 0 8px rgba(139,69,19,0.3)';
  }
  if (usernameEl) {
    usernameEl.className = 'sidebar-username';
    const vipNameClass = getVipNameClass(userData.role);
    if (vipNameClass) usernameEl.classList.add(vipNameClass);
  }

  buildSidebar();
}

// ========== الإشعارات ==========
async function sendNotification(targetUid, message, type, link = '') {
  try {
    await addDoc(collection(db, 'notifications'), {
      uid: targetUid, message, type, link,
      read: false, createdAt: serverTimestamp()
    });
  } catch (e) { console.error('فشل إرسال الإشعار:', e); }
}

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
          if (!notif.read) {
            await updateDoc(doc(db, 'notifications', docSnap.id), { read: true });
          }
          $('#notifications-dropdown').classList.add('hidden');
          if (notif.type === 'vip_upgrade' || notif.type === 'id_upgrade') {
            showVipConfetti(notif.message);
          } else if (notif.link) {
            navigateTo(notif.link);
          }
        });
        list.appendChild(div);
      });
    }
    if (badge) {
      if (unreadCount > 0) {
        badge.classList.remove('hidden');
        badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
      } else {
        badge.classList.add('hidden');
      }
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
    if (notif.type === 'vip_upgrade' || notif.type === 'id_upgrade') {
      showVipConfetti(notif.message);
    }
    await updateDoc(doc(db, 'notifications', docSnap.id), { read: true });
  }
}

// ========== تأثير كونفيتي VIP ==========
export function showVipConfetti(message = 'مبروك! تمت ترقيتك إلى VIP') {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:10000;display:flex;align-items:center;justify-content:center;flex-direction:column;';
  const box = document.createElement('div');
  box.style.cssText = 'background:var(--bg-secondary);border:2px solid var(--gold);border-radius:16px;padding:32px;text-align:center;max-width:400px;';
  box.innerHTML = `<div style="font-size:48px;"><i class="fas fa-gift"></i></div><h2 style="color:var(--gold);margin:16px 0;">تهانينا!</h2><p style="color:var(--text-primary);font-size:16px;">${message}</p><button id="vip-confetti-close" class="btn-primary" style="margin-top:20px;">شكراً</button>`;
  overlay.appendChild(box);
  for (let i = 0; i < 50; i++) {
    const confetti = document.createElement('div');
    confetti.style.cssText = `position:fixed;top:-10px;left:${Math.random()*100}%;width:10px;height:10px;background:var(--gold);opacity:0.8;z-index:10001;animation:confettiFall ${Math.random()*3+2}s linear infinite;`;
    overlay.appendChild(confetti);
  }
  if (!document.getElementById('confetti-style')) {
    const style = document.createElement('style');
    style.id = 'confetti-style';
    style.textContent = '@keyframes confettiFall{0%{transform:translateY(-10px) rotate(0deg);opacity:1}100%{transform:translateY(100vh) rotate(720deg);opacity:0}}';
    document.head.appendChild(style);
  }
  document.body.appendChild(overlay);
  overlay.querySelector('#vip-confetti-close').addEventListener('click', () => overlay.remove());
  setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 5000);
}

// ========== الآلة الحاسبة ==========
function setupCalculator() {
  // اختصره للضرورة، لكن أبقي المنطق الأساسي
  let isDragging = false, calcOffsetX = 0, calcOffsetY = 0;
  const calc = $('#calculator');
  const header = document.querySelector('.calculator-header');
  if (!header || !calc) return;
  header.addEventListener('mousedown', (e) => {
    isDragging = true;
    const rect = calc.getBoundingClientRect();
    calcOffsetX = e.clientX - rect.left;
    calcOffsetY = e.clientY - rect.top;
    calc.style.transition = 'none';
  });
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    let left = e.clientX - calcOffsetX;
    let top = e.clientY - calcOffsetY;
    left = Math.max(0, Math.min(left, window.innerWidth - calc.offsetWidth));
    top = Math.max(0, Math.min(top, window.innerHeight - calc.offsetHeight));
    calc.style.left = left + 'px';
    calc.style.top = top + 'px';
  });
  document.addEventListener('mouseup', () => { isDragging = false; });
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
  if (ops.includes(key) && ops.includes(lastChar)) {
    state.calcExpression = state.calcExpression.slice(0, -1);
  }
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

// ========== إعدادات عامة للأحداث ==========
function setupEventListeners() {
  // تبويبات المصادقة
  $('#tab-login')?.addEventListener('click', () => {
    $('#tab-login').classList.add('active');
    $('#tab-register').classList.remove('active');
    $('#login-form').classList.add('active');
    $('#register-form').classList.remove('active');
  });
  $('#tab-register')?.addEventListener('click', () => {
    $('#tab-register').classList.add('active');
    $('#tab-login').classList.remove('active');
    $('#register-form').classList.add('active');
    $('#login-form').classList.remove('active');
  });

  // نماذج المصادقة
  $('#login-form')?.addEventListener('submit', handleLogin);
  $('#register-form')?.addEventListener('submit', handleRegister);
  $('#forgot-password-btn')?.addEventListener('click', () => $('#forgot-password-modal').classList.remove('hidden'));
  $('#forgot-send')?.addEventListener('click', handleForgotPassword);
  $('#forgot-cancel')?.addEventListener('click', () => $('#forgot-password-modal').classList.add('hidden'));

  // تأكيد البريد
  $('#verify-code-btn')?.addEventListener('click', verifyEmailCode);
  $('#resend-verify-btn')?.addEventListener('click', resendVerificationCode);

  // إعادة تعيين كلمة المرور
  $('#reset-save')?.addEventListener('click', handleResetPassword);
  $('#reset-cancel')?.addEventListener('click', () => $('#reset-password-modal').classList.add('hidden'));

  // Onboarding
  $('#upload-avatar-btn')?.addEventListener('click', () => {
    // سيتم استدعاء openCropper من dashboard.js
    if (typeof openCropper === 'function') openCropper('avatar');
  });
  $('#skip-onboarding')?.addEventListener('click', () => completeOnboarding(null));

  // القائمة الجانبية
  $('#sidebar-toggle')?.addEventListener('click', toggleSidebar);
  $('#header-avatar')?.addEventListener('click', () => {
    if (currentUser) navigateTo('settings');
  });
  document.querySelector('.sidebar-overlay')?.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (state.sidebarOpen) closeSidebar();
      if (state.calculatorOpen) toggleCalculator();
      $('#notifications-dropdown')?.classList.add('hidden');
    }
  });

  // تسجيل الخروج
  $('#logout-btn')?.addEventListener('click', handleLogout);

  // الإشعارات
  $('#notification-bell')?.addEventListener('click', () => {
    const dropdown = $('#notifications-dropdown');
    if (dropdown) dropdown.classList.toggle('hidden');
  });
  $('#notifications-close')?.addEventListener('click', () => $('#notifications-dropdown')?.classList.add('hidden'));

  // الشريط السفلي
  $('#bottom-btn-users')?.addEventListener('click', () => navigateTo('users'));
  $('#bottom-btn-back')?.addEventListener('click', () => navigateTo('dashboard'));

  // الآلة الحاسبة
  $('#calc-toggle')?.addEventListener('click', toggleCalculator);
  $('#calc-close')?.addEventListener('click', toggleCalculator);
  $$('.calc-btn').forEach(btn => btn.addEventListener('click', () => handleCalcClick(btn.dataset.key)));

  // مودالات عامة
  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) e.target.classList.add('hidden');
  });

  // الوضع الليلي
  $('#theme-toggle-btn')?.addEventListener('click', toggleTheme);

  // مستمع حدث التنقل المخصص
  document.addEventListener('navigate', (e) => {
    navigateTo(e.detail);
  });

  // زر الرجوع في المتصفح
  window.addEventListener('popstate', () => {
    if (state.historyStack.length > 0) {
      const prevPage = state.historyStack.pop();
      navigateTo(prevPage);
    }
  });

  // مؤقت الآلة الحاسبة
  setTimeout(setupCalculator, 1000);
}

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
  if (saved === 'light') {
    document.documentElement.classList.add('light-mode');
  }
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

// ========== بدء التشغيل ومراقبة المصادقة ==========
onAuthStateChanged(auth, async (user) => {
  hideLoading();
  if (user) {
    const exists = await loadUserData();
    if (exists) {
      // إعداد الـ presence
      const presenceRef = ref(rtdb, `presence/${user.uid}`);
      const connectedRef = ref(rtdb, '.info/connected');
      onValue(connectedRef, snap => {
        if (snap.val() === true) {
          onDisconnect(presenceRef).set({ status: 'offline', lastSeen: rtdbTimestamp() });
          set(presenceRef, { status: 'online', lastSeen: rtdbTimestamp() });
        }
      });

      // مراقبة المستخدمين المتصلين للأدمن
      if (isAdmin || isSuperMod || isMod) {
        onValue(ref(rtdb, 'presence'), snap => {
          state.onlineUsers = snap.val() || {};
        });
      }

      // تحميل الإشعارات
      loadNotifications();

      // فحص الحظر
      if (userData.blocked) {
        const reason = userData.blockReason || 'غير محدد';
        const expiry = userData.blockExpiry ? formatDateEn(userData.blockExpiry.toDate()) + ' ' + formatTimeEn(userData.blockExpiry.toDate()) : 'دائم';
        await signOut(auth);
        return showToast(`حسابك محظور. السبب: ${reason}. ينتهي: ${expiry}`, 'error');
      }

      // توجيه المستخدم حسب الحالة
      if (!userData.emailVerified) {
        showVerifyEmailScreen();
      } else if (!userData.onboardingCompleted) {
        showOnboarding();
      } else {
        $('#auth-screen').classList.add('hidden');
        $('#onboarding-screen').classList.add('hidden');
        $('#verify-email-screen').classList.add('hidden');
        $('#app').classList.remove('hidden');
        updateUI();
        applySavedTheme();
        navigateTo('dashboard');
        archiveDailyTransactions();
        checkVipNotifications();
      }
    } else {
      // مستخدم جديد بدون وثيقة بيانات
      showOnboarding();
    }
  } else {
    // لم يسجل دخول
    $('#app').classList.add('hidden');
    $('#onboarding-screen').classList.add('hidden');
    $('#verify-email-screen').classList.add('hidden');
    $('#auth-screen').classList.remove('hidden');
  }
});

// تحميل EmailJS عند بدء التطبيق
document.addEventListener('DOMContentLoaded', () => {
  const emailjsScript = document.createElement('script');
  emailjsScript.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js";
  emailjsScript.onload = () => {
    if (typeof emailjs !== 'undefined') {
      emailjs.init("ILfMM-EFqQXbiBmeZ");
      console.log('✅ EmailJS جاهز');
    }
  };
  document.head.appendChild(emailjsScript);

  setupEventListeners();
  showLoading();
});