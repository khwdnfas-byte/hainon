/*
 | HAINON © 2026 جميع الحقوق محفوظة
 | لا يُسمح بنسخ أو توزيع أو استخدام هذا الملف أو أي جزء من الكود دون إذن كتابي صريح.
 | هذا الملف جزء من نظام HAINON المحاسبي.
*/

// dashboard.js — نظام VIP، المحادثات، خدمة العملاء، إدارة المستخدمين، الإعدادات، الملف الشخصي
import { auth, db } from './firebase-config.js';
import {
  collection, addDoc, doc, getDoc, getDocs, query, where, orderBy,
  onSnapshot, serverTimestamp, updateDoc, deleteDoc, limit, Timestamp, setDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  $, $$, showToast, showConfirm, formatCurrency, getTypeLabel, escapeHtml,
  getVipAvatarClass, getVipNameClass, getVipFrameClass, sendEmailCode,
  getUserLocation, getDeviceInfo, formatDateEn, formatTimeEn, formatDateTimeEn,
  getAutoVipLevel, getVipGlowStyle, getVipBadgeText, WRITE_BAR_COLORS, validatePassword
} from './utils.js';
import { changePassword, updateAvatar, updateCover, updateShowVipBar } from './auth.js';
import {
  currentUser, userData, isAdmin, isSuperMod, isMod, isVip, vipLevel,
  sendNotification, sendMassNotification
} from './transactions.js';

// ========== صفحة إدارة الموقع ==========
export function loadSiteManagementPage() {
  const section = $('#page-site-management');
  if (!section) return;
  if (!isAdmin && !isMod && !isSuperMod) {
    section.innerHTML = '<h2><i class="fas fa-lock"></i> غير مصرح</h2>';
    return;
  }

  section.innerHTML = `
    <h2><i class="fas fa-cogs"></i> إدارة الموقع</h2>
    <div class="stat-card" style="margin-bottom:16px;">
      <h3><i class="fas fa-bullhorn"></i> إرسال إشعار للمستخدمين</h3>
      <textarea id="site-notification-text" rows="3" placeholder="نص الإشعار..." style="width:100%;margin:8px 0;"></textarea>
      <button id="send-site-notification-btn" class="btn-primary"><i class="fas fa-paper-plane"></i> إرسال</button>
    </div>
    <div class="stat-card" style="margin-bottom:16px;">
      <h3><i class="fas fa-trash-alt"></i> إزالة شريط</h3>
      <div class="form-row">
        <input type="text" id="bar-search-input" placeholder="ابحث بالاسم / البريد / ID / اسم الشركة...">
      </div>
      <div id="bar-search-results"></div>
    </div>
    ${isAdmin ? `
    <div class="stat-card" style="margin-bottom:16px;">
      <h3><i class="fas fa-money-bill-wave"></i> تعديل طريقة الدفع</h3>
      <button id="edit-payment-method-btn" class="btn-primary"><i class="fas fa-credit-card"></i> الذهاب إلى أسعار VIP</button>
    </div>` : ''}
  `;

  $('#send-site-notification-btn')?.addEventListener('click', async () => {
    const text = $('#site-notification-text')?.value.trim();
    if (!text) return showToast('اكتب نص الإشعار', 'error');
    await sendMassNotification(text);
    $('#site-notification-text').value = '';
  });

  $('#bar-search-input')?.addEventListener('input', debounce(async (e) => {
    const query_text = e.target.value.trim();
    if (!query_text) { $('#bar-search-results').innerHTML = ''; return; }
    await searchBars(query_text);
  }, 500));

  $('#edit-payment-method-btn')?.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('navigate', { detail: 'vip-pricing' }));
  });
}

async function searchBars(query_text) {
  const results = $('#bar-search-results');
  if (!results) return;

  // البحث عن المستخدمين المطابقين
  const usersSnap = await getDocs(collection(db, 'users'));
  const matchedUsers = [];
  usersSnap.forEach(doc => {
    const u = doc.data();
    if (
      (u.name && u.name.toLowerCase().includes(query_text.toLowerCase())) ||
      (u.email && u.email.toLowerCase().includes(query_text.toLowerCase())) ||
      (u.serialId && u.serialId.toLowerCase().includes(query_text.toLowerCase())) ||
      (u.company && u.company.toLowerCase().includes(query_text.toLowerCase()))
    ) {
      matchedUsers.push({ uid: u.uid, name: u.name, avatar: u.avatar });
    }
  });

  if (matchedUsers.length === 0) {
    results.innerHTML = '<p style="color:var(--text-muted);text-align:center;">لا توجد نتائج</p>';
    return;
  }

  results.innerHTML = '<h4 style="margin:12px 0 8px;">المستخدمين المطابقين:</h4>';
  for (const user of matchedUsers) {
    const barsSnap = await getDocs(query(collection(db, 'vipBars'), where('uid', '==', user.uid), orderBy('createdAt', 'desc')));
    const userDiv = document.createElement('div');
    userDiv.className = 'stat-card';
    userDiv.style.cssText = 'margin-bottom:8px;';
    userDiv.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <img src="${user.avatar || 'https://ui-avatars.com/api/?name='+encodeURIComponent(user.name||'?')}" style="width:36px;height:36px;border-radius:50%;border:2px solid var(--gold);">
        <strong>${user.name}</strong>
      </div>
      <div id="bars-for-${user.uid}"></div>
    `;
    results.appendChild(userDiv);

    const barsContainer = document.getElementById(`bars-for-${user.uid}`);
    if (barsSnap.empty) {
      barsContainer.innerHTML = '<p style="color:var(--text-muted);font-size:12px;">لا توجد شرائط</p>';
    } else {
      barsSnap.forEach(barDoc => {
        const bar = barDoc.data();
        const barDiv = document.createElement('div');
        barDiv.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 8px;background:var(--bg-tertiary);border-radius:6px;margin-bottom:4px;';
        barDiv.innerHTML = `
          <span style="color:${bar.color || '#D4AF37'};font-size:12px;">${escapeHtml(bar.text)}</span>
          <button class="btn-outline btn-sm delete-bar-btn" data-bar-id="${barDoc.id}" style="color:var(--red);border-color:var(--red);"><i class="fas fa-trash"></i></button>
        `;
        barDiv.querySelector('.delete-bar-btn')?.addEventListener('click', async () => {
          await deleteDoc(doc(db, 'vipBars', barDoc.id));
          showToast('تم حذف الشريط', 'success');
          searchBars(query_text);
        });
        barsContainer.appendChild(barDiv);
      });
    }
  }
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => { clearTimeout(timeout); func(...args); };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ========== محادثة الإدارة الداخلية ==========
export function loadAdminChat() {
  const section = $('#page-admin-chat');
  if (!section) return;
  section.innerHTML = `
    <h2><i class="fas fa-comments"></i> محادثة الإدارة</h2>
    <div class="chat-container" style="height:calc(100vh - 280px);">
      <div class="chat-messages" id="admin-chat-messages"><p style="text-align:center;color:var(--text-muted);">⏳ جاري تحميل المحادثة...</p></div>
      <div class="chat-input-area">
        <input type="text" id="admin-chat-input" placeholder="اكتب رسالتك...">
        <button id="admin-chat-send"><i class="fas fa-paper-plane"></i></button>
      </div>
    </div>
  `;

  const messagesDiv = $('#admin-chat-messages');
  const q = query(collection(db, 'adminChat'), orderBy('createdAt', 'asc'));

  onSnapshot(q, (snapshot) => {
    if (!messagesDiv) return;
    messagesDiv.innerHTML = '';
    if (snapshot.empty) {
      messagesDiv.innerHTML = '<p style="text-align:center;color:var(--text-muted);">لا توجد رسائل بعد</p>';
    }
    snapshot.forEach(docSnap => {
      const msg = docSnap.data();
      const msgDate = msg.createdAt?.toDate() || new Date();
      const isSent = msg.uid === auth.currentUser.uid;
      messagesDiv.innerHTML += `
        <div class="chat-msg ${isSent ? 'sent' : 'received'}">
          <strong>${msg.senderName || 'مستخدم'}</strong>
          <p>${escapeHtml(msg.text)}</p>
          <small>${formatDateEn(msgDate)} ${formatTimeEn(msgDate)}</small>
        </div>
      `;
    });
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });

  const sendFunc = async () => {
    const text = $('#admin-chat-input')?.value.trim();
    if (!text) return;
    try {
      await addDoc(collection(db, 'adminChat'), {
        uid: auth.currentUser.uid,
        senderName: userData?.name || 'مدير',
        text: text,
        createdAt: serverTimestamp()
      });
      const input = $('#admin-chat-input');
      if (input) input.value = '';
    } catch (e) { showToast('فشل في الإرسال', 'error'); }
  };

  $('#admin-chat-send')?.addEventListener('click', sendFunc);
  $('#admin-chat-input')?.addEventListener('keypress', e => { if (e.key === 'Enter') sendFunc(); });
}

// ========== خدمة عملاء VIP ==========
export function loadVipSupportChat() {
  const section = $('#page-vip-support');
  if (!section) return;

  if (!isVip && !isAdmin && !isMod && !isSuperMod) {
    showConfirm('خدمة العملاء متاحة فقط لمستخدمي VIP. هل تريد الترقية؟')
      .then(yes => {
        if (yes) document.dispatchEvent(new CustomEvent('navigate', { detail: 'vip-pricing' }));
        else document.dispatchEvent(new CustomEvent('navigate', { detail: 'dashboard' }));
      });
    return;
  }

  if (isAdmin || isMod || isSuperMod) {
    section.innerHTML = `
      <h2><i class="fas fa-headset"></i> خدمة العملاء - طلبات الدعم</h2>
      <div id="vip-contacts-list">⏳ جاري تحميل جهات الاتصال...</div>
      <div id="vip-chat-area" class="hidden"></div>
    `;
    loadVipContacts();
    return;
  }

  section.innerHTML = `
    <h2><i class="fas fa-headset"></i> خدمة العملاء</h2>
    <div class="chat-container" style="height:calc(100vh - 280px);">
      <div class="chat-messages" id="vip-support-messages"><p style="text-align:center;color:var(--text-muted);">⏳ جاري التحميل...</p></div>
      <div class="chat-input-area">
        <input type="text" id="vip-support-input" placeholder="اكتب رسالتك...">
        <button id="vip-support-send"><i class="fas fa-paper-plane"></i></button>
      </div>
    </div>
  `;
  loadVipSupportChatMessages();
}

function loadVipContacts() {
  const list = $('#vip-contacts-list');
  if (!list) return;
  const q = query(collection(db, 'supportChat'), orderBy('createdAt', 'asc'));
  onSnapshot(q, (snapshot) => {
    const usersMap = new Map();
    snapshot.forEach(doc => {
      const msg = doc.data();
      if (msg.uid !== auth.currentUser.uid && !usersMap.has(msg.uid)) {
        usersMap.set(msg.uid, { uid: msg.uid, name: msg.senderName || 'مستخدم', lastMessage: msg.text });
      }
    });
    list.innerHTML = '';
    if (usersMap.size === 0) {
      list.innerHTML = '<p style="text-align:center;color:var(--text-muted);">لا توجد طلبات دعم حالياً</p>';
      return;
    }
    usersMap.forEach(user => {
      const div = document.createElement('div');
      div.className = 'stat-card';
      div.style.cssText = 'cursor:pointer;margin-bottom:8px;display:flex;align-items:center;gap:12px;';
      div.innerHTML = `
        <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=D4AF37&color=111&size=40&bold=true" style="width:40px;height:40px;border-radius:50%;border:2px solid var(--gold);">
        <div><strong>${user.name}</strong><br><small style="color:var(--text-muted);">${user.lastMessage?.substring(0, 30)}...</small></div>
      `;
      div.addEventListener('click', () => openVipChat(user.uid, user.name));
      list.appendChild(div);
    });
  });
}

function openVipChat(uid, name) {
  const area = $('#vip-chat-area');
  const contacts = $('#vip-contacts-list');
  if (!area || !contacts) return;
  contacts.classList.add('hidden');
  area.classList.remove('hidden');
  area.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
      <button class="btn-outline btn-sm" id="back-to-vip-contacts"><i class="fas fa-arrow-right"></i> عودة</button>
      <h3 style="margin:0;">${name}</h3>
    </div>
    <div class="chat-container" style="height:calc(100vh - 340px);">
      <div class="chat-messages" id="vip-admin-messages"><p style="text-align:center;color:var(--text-muted);">⏳ جاري التحميل...</p></div>
      <div class="chat-input-area">
        <input type="text" id="vip-admin-input" placeholder="اكتب ردك...">
        <button id="vip-admin-send"><i class="fas fa-paper-plane"></i></button>
      </div>
    </div>
  `;
  $('#back-to-vip-contacts')?.addEventListener('click', () => {
    area.classList.add('hidden');
    contacts.classList.remove('hidden');
  });
  loadVipAdminMessages(uid);
  const send = async () => {
    const text = $('#vip-admin-input')?.value.trim();
    if (!text) return;
    await addDoc(collection(db, 'supportChat'), { uid: auth.currentUser.uid, targetUid: uid, senderName: userData?.name || 'مشرف', text, createdAt: serverTimestamp() });
    const input = $('#vip-admin-input');
    if (input) input.value = '';
  };
  $('#vip-admin-send')?.addEventListener('click', send);
  $('#vip-admin-input')?.addEventListener('keypress', e => { if (e.key === 'Enter') send(); });
}

function loadVipAdminMessages(targetUid) {
  const messagesDiv = $('#vip-admin-messages');
  if (!messagesDiv) return;
  const q = query(collection(db, 'supportChat'), orderBy('createdAt', 'asc'));
  onSnapshot(q, (snapshot) => {
    messagesDiv.innerHTML = '';
    snapshot.forEach(doc => {
      const msg = doc.data();
      if (msg.uid === targetUid || msg.targetUid === targetUid) {
        const isSent = msg.uid === auth.currentUser.uid;
        const msgDate = msg.createdAt?.toDate() || new Date();
        messagesDiv.innerHTML += `
          <div class="chat-msg ${isSent ? 'sent' : 'received'}">
            <strong>${msg.senderName || 'مستخدم'}</strong>
            <p>${escapeHtml(msg.text)}</p>
            <small>${formatDateEn(msgDate)} ${formatTimeEn(msgDate)}</small>
          </div>
        `;
      }
    });
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });
}

function loadVipSupportChatMessages() {
  const messagesDiv = $('#vip-support-messages');
  if (!messagesDiv) return;
  const q = query(collection(db, 'supportChat'), orderBy('createdAt', 'asc'));
  onSnapshot(q, (snapshot) => {
    messagesDiv.innerHTML = '';
    snapshot.forEach(doc => {
      const msg = doc.data();
      if (msg.uid === auth.currentUser.uid || msg.targetUid === auth.currentUser.uid || !msg.targetUid) {
        const isSent = msg.uid === auth.currentUser.uid;
        const msgDate = msg.createdAt?.toDate() || new Date();
        messagesDiv.innerHTML += `
          <div class="chat-msg ${isSent ? 'sent' : 'received'}">
            <strong>${msg.senderName || 'مستخدم'}</strong>
            <p>${escapeHtml(msg.text)}</p>
            <small>${formatDateEn(msgDate)} ${formatTimeEn(msgDate)}</small>
          </div>
        `;
      }
    });
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });
  const send = async () => {
    const text = $('#vip-support-input')?.value.trim();
    if (!text) return;
    await addDoc(collection(db, 'supportChat'), { uid: auth.currentUser.uid, senderName: userData?.name || 'مستخدم', text, createdAt: serverTimestamp() });
    const input = $('#vip-support-input');
    if (input) input.value = '';
  };
  $('#vip-support-send')?.addEventListener('click', send);
  $('#vip-support-input')?.addEventListener('keypress', e => { if (e.key === 'Enter') send(); });
}// ... تابع dashboard.js

// ========== إدارة المستخدمين ==========
export async function loadUsersPage() {
  const section = $('#page-users');
  if (!section) return;
  if (!isAdmin && !isMod && !isSuperMod) { section.innerHTML = '<h2><i class="fas fa-lock"></i> غير مصرح</h2>'; return; }

  section.innerHTML = `
    <h2><i class="fas fa-users"></i> إدارة المستخدمين</h2>
    <div class="form-row" style="margin-bottom:16px;">
      <input type="text" id="user-search-input" placeholder="بحث بالاسم / ID / البريد..." style="grid-column:1/-1;">
    </div>
    <div id="vip-requests-panel" style="margin-bottom:30px;"></div>
    <div class="table-container">
      <table>
        <thead><tr><th>صورة</th><th>الاسم</th><th>ID</th><th>البريد</th><th>الدور</th><th>الحالة</th><th>آخر ظهور</th><th>الموقع</th><th>الجهاز</th><th>IP</th><th>تاريخ التسجيل</th><th>إجراءات</th></tr></thead>
        <tbody id="users-tbody"><tr><td colspan="12">جاري التحميل...</td></tr></tbody>
      </table>
    </div>
  `;

  loadVipRequestsAdmin();

  const usersSnapshot = await getDocs(collection(db, 'users'));
  const allUsers = [];
  usersSnapshot.forEach(docSnap => allUsers.push({ uid: docSnap.id, ...docSnap.data() }));

  function renderUsers(filter = '') {
    const tbody = $('#users-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const filtered = filter ? allUsers.filter(u =>
      (u.name || '').toLowerCase().includes(filter.toLowerCase()) ||
      (u.serialId || '').toLowerCase().includes(filter.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(filter.toLowerCase()) ||
      (u.company || '').toLowerCase().includes(filter.toLowerCase())
    ) : allUsers;

    if (filtered.length === 0) { tbody.innerHTML = '<tr><td colspan="12">لا توجد نتائج</td></tr>'; return; }

    filtered.forEach(u => {
      const avatarUrl = u.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name||'?')}&background=D4AF37&color=111&size=60`;
      let roleBadge = getVipBadgeText(u.role) || '<i class="fas fa-user"></i> مستخدم';
      const isOnline = u.lastLogin?.toDate() > new Date(Date.now() - 5 * 60 * 1000);

      tbody.innerHTML += `
        <tr>
          <td><img src="${avatarUrl}" style="width:30px;height:30px;border-radius:50%;border:2px solid var(--gold);cursor:pointer;" class="user-profile-img" data-uid="${u.uid}"></td>
          <td class="user-profile-link" data-uid="${u.uid}" style="cursor:pointer;color:var(--gold);">${u.name || '---'} ${u.company ? '('+u.company+')' : ''}</td>
          <td>${u.serialId || '---'}</td><td>${u.email || '---'}</td><td>${roleBadge}</td>
          <td>${isOnline ? '<i class="fas fa-circle" style="color:var(--green);"></i>' : '<i class="fas fa-circle" style="color:var(--red);"></i>'}</td>
          <td>${u.lastLogin ? formatDateTimeEn(u.lastLogin.toDate()) : '---'}</td>
          <td>${u.location?.city || '---'}</td>
          <td>${u.device?.browser || '---'} / ${u.device?.os || '---'}</td>
          <td style="font-size:10px;">${u.location?.ip || '---'}</td>
          <td>${u.createdAt ? formatDateEn(u.createdAt.toDate()) : '---'}</td>
          <td>
            ${isAdmin && u.role !== 'admin' ? `<button class="btn-outline btn-sm appoint-mod-btn" data-uid="${u.uid}" data-name="${u.name}"><i class="fas fa-shield-alt"></i></button>` : ''}
            ${isAdmin ? `<button class="btn-outline btn-sm assign-vip-btn" data-uid="${u.uid}" data-role="${u.role}"><i class="fas fa-star"></i></button>` : ''}
            ${isAdmin || isSuperMod ? `<button class="btn-outline btn-sm edit-id-btn" data-uid="${u.uid}" data-id="${u.serialId}"><i class="fas fa-id-card"></i></button>` : ''}
            ${isAdmin || isSuperMod ? `<button class="btn-outline btn-sm remove-photo-btn" data-uid="${u.uid}"><i class="fas fa-image"></i></button>` : ''}
            <button class="btn-outline btn-sm block-user-admin-btn" data-uid="${u.uid}"><i class="fas fa-ban"></i></button>
            ${isAdmin && u.uid !== auth.currentUser.uid ? `<button class="btn-outline btn-sm delete-user-btn" data-uid="${u.uid}" data-name="${u.name}" style="color:var(--red);border-color:var(--red);"><i class="fas fa-trash"></i></button>` : ''}
          </td>
        </tr>
      `;
    });

    tbody.querySelectorAll('.user-profile-img, .user-profile-link').forEach(el => {
      el.addEventListener('click', () => viewPublicProfile(el.dataset.uid));
    });
    tbody.querySelectorAll('.appoint-mod-btn').forEach(btn => {
      btn.addEventListener('click', () => appointMod(btn.dataset.uid, btn.dataset.name));
    });
    tbody.querySelectorAll('.assign-vip-btn').forEach(btn => {
      btn.addEventListener('click', () => assignVipModal(btn.dataset.uid, btn.dataset.role));
    });
    tbody.querySelectorAll('.delete-user-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const confirmed = await showConfirm(`حذف ${btn.dataset.name}؟`);
        if (confirmed) { await deleteDoc(doc(db, 'users', btn.dataset.uid)); showToast('تم الحذف', 'success'); loadUsersPage(); }
      });
    });
    tbody.querySelectorAll('.block-user-admin-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const reason = prompt('سبب الحظر:');
        const confirmed = await showConfirm('حظر هذا المستخدم؟');
        if (confirmed) {
          await updateDoc(doc(db, 'users', btn.dataset.uid), { blocked: true, blockReason: reason || '' });
          showToast('تم الحظر', 'success');
          loadUsersPage();
        }
      });
    });
    tbody.querySelectorAll('.edit-id-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const newId = prompt('ID الجديد:', btn.dataset.id);
        if (newId && newId.trim()) {
          await updateDoc(doc(db, 'users', btn.dataset.uid), { serialId: newId.trim() });
          showToast('تم تعديل ID', 'success');
          loadUsersPage();
        }
      });
    });
    tbody.querySelectorAll('.remove-photo-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const confirmed = await showConfirm('إزالة صورة المستخدم؟');
        if (confirmed) {
          await updateDoc(doc(db, 'users', btn.dataset.uid), {
            avatar: `https://ui-avatars.com/api/?name=مستخدم&background=D4AF37&color=111&size=200`
          });
          showToast('تم إزالة الصورة', 'success');
          loadUsersPage();
        }
      });
    });
  }

  renderUsers();
  $('#user-search-input')?.addEventListener('input', (e) => renderUsers(e.target.value));
}

async function appointMod(uid, name) {
  const level = prompt('تعيين كـ:\n1- مشرف (moderator)\n2- مشرف مميز (super_mod)', '1');
  if (!level || !['1','2'].includes(level)) return;
  const newRole = level === '2' ? 'super_mod' : 'moderator';
  const message = prompt('رسالة تهنئة:', `تهانينا ${name}! تم تعيينك ${newRole === 'super_mod' ? 'مشرفاً مميزاً' : 'مشرفاً'} في HAINON.`);
  
  await updateDoc(doc(db, 'users', uid), { role: newRole });
  await sendNotification(uid, message || 'تم تعيينك مشرفاً', 'id_upgrade');
  showToast('تم تعيين المشرف بنجاح', 'success');
  document.dispatchEvent(new CustomEvent('show-confetti', { detail: message }));
  loadUsersPage();
}

function assignVipModal(uid, currentRole) {
  const level = prompt('أدخل مستوى VIP (1,2,3) أو اتركه فارغاً للإلغاء:');
  if (!level || !['1','2','3'].includes(level)) return showToast('تم الإلغاء', 'info');
  const days = prompt('عدد الأيام:', '30');
  const expiryDays = parseInt(days) || 30;
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + expiryDays);
  updateDoc(doc(db, 'users', uid), { role: `vip${level}`, vipExpiry: Timestamp.fromDate(expiry) }).then(() => {
    showToast('تم تعيين VIP', 'success');
    loadUsersPage();
  });
}

// ========== طلبات VIP ==========
export async function createVipRequest(level, operationNumber) {
  const user = auth.currentUser;
  if (!user) return showToast('يجب تسجيل الدخول', 'error');
  const userSnap = await getDoc(doc(db, 'users', user.uid));
  const userDataSnap = userSnap.data();

  await addDoc(collection(db, 'vipRequests'), {
    uid: user.uid, name: userDataSnap.name, email: userDataSnap.email,
    serialId: userDataSnap.serialId, level: level,
    operationNumber: operationNumber, status: 'pending', createdAt: serverTimestamp()
  });

  const adminsSnap = await getDocs(
    query(collection(db, 'users'), where('role', 'in', ['admin', 'super_mod', 'moderator']))
  );
  adminsSnap.forEach(async (adminDoc) => {
    await sendNotification(adminDoc.id,
      `طلب ترقية VIP ${level} من ${userDataSnap.name}`,
      'vip_request', 'users'
    );
  });

  showToast('تم إرسال طلبك. سنقوم بمراجعته قريباً.', 'success');
}

export function loadVipRequestsAdmin() {
  const panel = $('#vip-requests-panel');
  if (!panel) return;
  panel.innerHTML = '<p>⏳ جاري تحميل الطلبات...</p>';

  const q = query(collection(db, 'vipRequests'), where('status', '==', 'pending'), orderBy('createdAt', 'asc'));
  onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      panel.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:16px;">لا توجد طلبات معلقة</p>';
      return;
    }
    let html = '<h4 style="margin:16px 0 8px;color:var(--gold);"><i class="fas fa-star"></i> طلبات ترقية VIP المعلقة</h4>';
    html += '<div class="table-container"><table><thead><tr><th>المستخدم</th><th>المستوى</th><th>رقم العملية</th><th>التاريخ</th><th>إجراءات</th></tr></thead><tbody>';

    snapshot.forEach(docSnap => {
      const req = docSnap.data();
      const createdDate = req.createdAt?.toDate() || new Date();
      html += `<tr>
        <td>${req.name} (${req.serialId || ''})</td>
        <td><span style="color:var(--vip${req.level}-color);">VIP ${req.level}</span></td>
        <td>${req.operationNumber}</td>
        <td>${formatDateEn(createdDate)} ${formatTimeEn(createdDate)}</td>
        <td>
          <button class="btn-outline btn-sm approve-vip-btn" data-id="${docSnap.id}" data-uid="${req.uid}" data-level="${req.level}"><i class="fas fa-check"></i> قبول</button>
          <button class="btn-outline btn-sm reject-vip-btn" data-id="${docSnap.id}" data-uid="${req.uid}" style="color:var(--red);border-color:var(--red);margin-left:4px;"><i class="fas fa-times"></i> رفض</button>
        </td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    panel.innerHTML = html;

    panel.querySelectorAll('.approve-vip-btn').forEach(btn => {
      btn.addEventListener('click', () => approveVipRequest(btn.dataset.id, btn.dataset.uid, btn.dataset.level));
    });
    panel.querySelectorAll('.reject-vip-btn').forEach(btn => {
      btn.addEventListener('click', () => rejectVipRequest(btn.dataset.id, btn.dataset.uid));
    });
  });
}

async function approveVipRequest(requestId, uid, level) {
  const confirmed = await showConfirm(`تأكيد الترقية إلى VIP ${level}؟`);
  if (!confirmed) return;

  const expiryDays = 30;
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + expiryDays);

  await updateDoc(doc(db, 'users', uid), {
    role: `vip${level}`,
    vipExpiry: Timestamp.fromDate(expiry)
  });
  await updateDoc(doc(db, 'vipRequests', requestId), { status: 'approved' });

  await sendNotification(uid,
    `تهانينا! تمت ترقيتك إلى VIP ${level} لمدة ${expiryDays} يوم`,
    'vip_upgrade'
  );

  const userSnap = await getDoc(doc(db, 'users', uid));
  const userName = userSnap.data()?.name || 'مستخدم';
  const promoColors = { '1': '#8B4513', '2': '#00C853', '3': '#8A2BE2' };
  const promoExpiry = new Date();
  promoExpiry.setHours(promoExpiry.getHours() + 24);
  await addDoc(collection(db, 'vipPromotions'), {
    text: `🎉 ترقية ${userName} إلى VIP ${level}`,
    color: promoColors[level] || '#D4AF37',
    expiresAt: promoExpiry,
    createdAt: serverTimestamp()
  });

  showToast('تمت الترقية بنجاح', 'success');
  document.dispatchEvent(new CustomEvent('show-confetti', { detail: `تهانينا ${userName}! VIP ${level}` }));
  loadVipRequestsAdmin();
}

async function rejectVipRequest(requestId, uid) {
  const reason = prompt('سبب الرفض (اختياري):');
  const confirmed = await showConfirm('رفض الطلب؟');
  if (!confirmed) return;

  await updateDoc(doc(db, 'vipRequests', requestId), { status: 'rejected', reason: reason || '' });

  if (reason) {
    await sendNotification(uid, `طلب ترقية VIP مرفوض. السبب: ${reason}`, 'vip_rejected');
  } else {
    await sendNotification(uid, 'طلب ترقية VIP مرفوض.', 'vip_rejected');
  }

  showToast('تم رفض الطلب', 'info');
  loadVipRequestsAdmin();
}// ... تابع dashboard.js

// ========== صفحات VIP ==========
export function loadVipPricingPage() {
  const section = $('#page-vip-pricing');
  if (!section) return;
  section.innerHTML = `
    <h2><i class="fas fa-star"></i> أسعار VIP</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-top:20px;">
      <div class="stat-card" style="text-align:center;padding:24px;border-color:var(--vip1-color);">
        <div class="stat-icon"><i class="fas fa-star" style="color:var(--vip1-color);"></i></div>
        <h3 style="color:var(--vip1-color);">VIP 1</h3>
        <div class="stat-value" style="color:var(--vip1-color);" id="vip1-price">5$</div>
        <p style="font-size:12px;">شهرياً</p>
        <button class="btn-primary select-vip-btn" data-level="1" style="margin-top:12px;width:100%;">اختيار</button>
        ${isAdmin ? '<button class="btn-outline btn-sm edit-price-btn" data-level="1" style="margin-top:6px;width:100%;"><i class="fas fa-edit"></i> تعديل السعر</button>' : ''}
      </div>
      <div class="stat-card" style="text-align:center;padding:24px;border-color:var(--vip2-color);">
        <div class="stat-icon"><i class="fas fa-star" style="color:var(--vip2-color);"></i></div>
        <h3 style="color:var(--vip2-color);">VIP 2</h3>
        <div class="stat-value" style="color:var(--vip2-color);" id="vip2-price">15$</div>
        <p style="font-size:12px;">شهرياً</p>
        <button class="btn-primary select-vip-btn" data-level="2" style="margin-top:12px;width:100%;">اختيار</button>
        ${isAdmin ? '<button class="btn-outline btn-sm edit-price-btn" data-level="2" style="margin-top:6px;width:100%;"><i class="fas fa-edit"></i> تعديل السعر</button>' : ''}
      </div>
      <div class="stat-card" style="text-align:center;padding:24px;border-color:var(--vip3-color);">
        <div class="stat-icon"><i class="fas fa-star" style="color:var(--vip3-color);"></i></div>
        <h3 style="color:var(--vip3-color);">VIP 3</h3>
        <div class="stat-value" style="color:var(--vip3-color);" id="vip3-price">35$</div>
        <p style="font-size:12px;">شهرياً</p>
        <button class="btn-primary select-vip-btn" data-level="3" style="margin-top:12px;width:100%;">اختيار</button>
        ${isAdmin ? '<button class="btn-outline btn-sm edit-price-btn" data-level="3" style="margin-top:6px;width:100%;"><i class="fas fa-edit"></i> تعديل السعر</button>' : ''}
      </div>
    </div>
  `;

  // تحميل الأسعار من الإعدادات
  getDoc(doc(db, 'settings', 'vipPrices')).then(snap => {
    if (snap.exists()) {
      const prices = snap.data();
      if (prices.vip1) { const el = $('#vip1-price'); if (el) el.textContent = prices.vip1 + '$'; }
      if (prices.vip2) { const el = $('#vip2-price'); if (el) el.textContent = prices.vip2 + '$'; }
      if (prices.vip3) { const el = $('#vip3-price'); if (el) el.textContent = prices.vip3 + '$'; }
    }
  });

  section.querySelectorAll('.select-vip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      sessionStorage.setItem('selectedVipLevel', btn.dataset.level);
      document.dispatchEvent(new CustomEvent('navigate', { detail: 'vip-payment' }));
    });
  });

  section.querySelectorAll('.edit-price-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const level = btn.dataset.level;
      const currentPrice = document.getElementById(`vip${level}-price`)?.textContent.replace('$', '') || '0';
      const newPrice = prompt(`السعر الجديد لـ VIP ${level}:`, currentPrice);
      if (newPrice && !isNaN(newPrice) && parseFloat(newPrice) > 0) {
        const priceKey = `vip${level}`;
        setDoc(doc(db, 'settings', 'vipPrices'), { [priceKey]: parseFloat(newPrice) }, { merge: true }).then(() => {
          const el = document.getElementById(`vip${level}-price`);
          if (el) el.textContent = newPrice + '$';
          showToast('تم تحديث السعر', 'success');
        });
      }
    });
  });
}

export function loadVipPaymentPage() {
  const section = $('#page-vip-payment');
  if (!section) return;
  const level = sessionStorage.getItem('selectedVipLevel') || '1';
  const levelNames = { '1': 'VIP 1', '2': 'VIP 2', '3': 'VIP 3' };

  section.innerHTML = `
    <h2><i class="fas fa-credit-card"></i> الدفع - ${levelNames[level]}</h2>
    <div class="stat-card" style="margin-bottom:16px; border-color:var(--vip${level}-color);">
      <h4 style="color:var(--vip${level}-color);"><i class="fas fa-money-bill-wave"></i> شام كاش</h4>
    </div>
    <div class="stat-card" style="margin-bottom:16px;">
      <h4><i class="fas fa-info-circle"></i> تعليمات الدفع</h4>
      <div id="payment-instructions" style="font-size:13px;color:var(--text-secondary);">⏳ تحميل...</div>
    </div>
    <div style="text-align:center;margin:16px 0;">
      <h4 style="color:var(--red);">الوقت المتبقي</h4>
      <div id="payment-timer" style="font-size:28px;font-weight:900;color:var(--gold);">15:00</div>
    </div>
    <div class="form-full">
      <label>رقم الحوالة (من المدير)</label>
      <input type="text" id="admin-transfer-number" readonly placeholder="⏳ جاري التحميل...">
    </div>
    <div class="form-full">
      <label>رقم العملية الخاص بك</label>
      <input type="text" id="user-operation-number" placeholder="أدخل رقم العملية" inputmode="numeric">
    </div>
    <div style="display:flex;gap:10px;margin-top:16px;">
      <button id="confirm-payment-btn" class="btn-primary" style="flex:1;"><i class="fas fa-check"></i> تأكيد العملية</button>
      <button id="cancel-payment-btn" class="btn-outline" style="flex:1;"><i class="fas fa-times"></i> تراجع</button>
    </div>
  `;

  getDoc(doc(db, 'settings', 'payment')).then(snap => {
    if (snap.exists()) {
      const data = snap.data();
      const inst = $('#payment-instructions');
      const trans = $('#admin-transfer-number');
      if (inst) inst.innerHTML = data.instructions || 'لا توجد تعليمات حالياً';
      if (trans) trans.value = data.transferNumber || '';
      if (data.qrCodeUrl) {
        const qrImg = document.createElement('img');
        qrImg.src = data.qrCodeUrl;
        qrImg.style.cssText = 'max-width:200px;margin-top:10px;border:2px solid var(--gold);border-radius:8px;display:block;';
        const qrContainer = $('#payment-instructions')?.parentElement;
        if (qrContainer) qrContainer.appendChild(qrImg);
      }
    }
  });

  let timeLeft = 15 * 60;
  const timerInterval = setInterval(() => {
    timeLeft--;
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    const timer = $('#payment-timer');
    if (timer) timer.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      const confirmBtn = $('#confirm-payment-btn');
      if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'انتهى الوقت'; }
      showToast('انتهى وقت الدفع المخصص', 'error');
    }
  }, 1000);

  $('#confirm-payment-btn')?.addEventListener('click', async () => {
    const opNumber = $('#user-operation-number')?.value.trim();
    if (!opNumber || !/^\d+$/.test(opNumber)) return showToast('أدخل رقم عملية صحيح (أرقام فقط)', 'error');
    clearInterval(timerInterval);
    await createVipRequest(level, opNumber);
    document.dispatchEvent(new CustomEvent('navigate', { detail: 'dashboard' }));
  });

  $('#cancel-payment-btn')?.addEventListener('click', () => {
    clearInterval(timerInterval);
    document.dispatchEvent(new CustomEvent('navigate', { detail: 'vip-pricing' }));
  });
}

// ========== الملف الشخصي العام ==========
export async function viewPublicProfile(uid) {
  const section = $('#page-profile');
  if (!section) return;
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) { showToast('المستخدم غير موجود', 'error'); return; }
  const u = snap.data();
  document.dispatchEvent(new CustomEvent('navigate', { detail: 'profile' }));

  const isOnline = u.lastLogin?.toDate() > new Date(Date.now() - 5 * 60 * 1000);
  const isOwnProfile = uid === auth.currentUser?.uid;
  const userVipLevel = u.role?.startsWith('vip') ? parseInt(u.role.replace('vip','')) || 0 : 0;
  const canEditCover = isOwnProfile && (isVip || isAdmin || isMod || isSuperMod);

  section.innerHTML = `
    <div class="profile-page" style="max-width:600px;margin:0 auto;">
      <div class="profile-cover" style="height:200px;background:var(--bg-tertiary);position:relative;border-radius:var(--radius-md) var(--radius-md) 0 0;overflow:hidden;">
        ${u.coverPhoto ? `<img src="${u.coverPhoto}" style="width:100%;height:100%;object-fit:cover;">` : ''}
        ${canEditCover ? `
        <div class="profile-actions-top" style="position:absolute;top:12px;left:12px;z-index:2;">
          <button class="btn-outline edit-cover-btn" style="background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.2);color:#fff;padding:6px 12px;font-size:11px;">
            <i class="fas fa-pen"></i>
          </button>
        </div>` : ''}
        <div class="profile-avatar-large ${getVipAvatarClass(u.role)}" style="position:absolute;bottom:-50px;right:50%;transform:translateX(50%);width:100px;height:100px;border-radius:50%;border:3px solid var(--gold);overflow:hidden;z-index:1;cursor:pointer;" id="profile-avatar-img">
          <img src="${u.avatar || 'https://ui-avatars.com/api/?name='+encodeURIComponent(u.name||'?')+'&background=D4AF37&color=111&size=200'}" style="width:100%;height:100%;object-fit:cover;">
        </div>
      </div>
      <div class="profile-info" style="padding:55px 20px 20px;background:var(--bg-card);border:1px solid var(--border);border-top:none;border-radius:0 0 var(--radius-md) var(--radius-md);text-align:center;">
        <div class="profile-name ${getVipNameClass(u.role)}">${u.name || '---'} • LV ${u.accountLevel || 0}</div>
        ${u.company ? `<div style="font-size:12px;color:var(--text-muted);">${u.company}</div>` : ''}
        <div class="profile-id">ID: ${u.serialId || '---'}</div>
        <div class="profile-bio">${u.bio || ''}</div>
        <div class="profile-status">
          ${isOnline ? '<i class="fas fa-circle" style="color:var(--green);"></i> متصل الآن' : '<i class="fas fa-circle" style="color:var(--red);"></i> غير متصل'}
        </div>
        <div style="margin-top:12px;padding:8px;background:rgba(212,175,55,0.1);border-radius:8px;font-size:12px;color:var(--gold);">
          ${getVipBadgeText(u.role) || 'مستخدم عادي'}
        </div>
      </div>
    </div>
  `;

  // الضغط على الصورة لتكبيرها
  $('#profile-avatar-img')?.addEventListener('click', () => {
    const lightbox = $('#image-lightbox');
    const lightboxImg = $('#lightbox-image');
    if (lightbox && lightboxImg) {
      lightboxImg.src = u.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name||'?')}&background=D4AF37&color=111&size=400`;
      lightbox.classList.remove('hidden');
    }
  });

  // زر القلم لتغيير الغلاف
  if (canEditCover) {
    document.querySelector('.edit-cover-btn')?.addEventListener('click', () => {
      if (!isVip && !isAdmin && !isMod && !isSuperMod) {
        showConfirm('هذه الميزة متاحة فقط لمستخدمي VIP1 فما فوق. هل تريد الترقية؟')
          .then(yes => {
            if (yes) document.dispatchEvent(new CustomEvent('navigate', { detail: 'vip-pricing' }));
          });
        return;
      }
      openCoverCropper();
    });
  }
}

function openCoverCropper() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.click();
  input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const modal = document.createElement('div');
      modal.className = 'cropper-modal';
      modal.innerHTML = `
        <div class="cropper-container"><img id="cropper-image" src="${ev.target.result}"></div>
        <div class="cropper-buttons">
          <button class="btn-primary" id="crop-save-cover"><i class="fas fa-save"></i> حفظ</button>
          <button class="btn-outline" id="crop-cancel-cover"><i class="fas fa-times"></i> إلغاء</button>
        </div>`;
      document.body.appendChild(modal);
      const image = document.getElementById('cropper-image');
      let cropper = null;
      image.onload = () => {
        cropper = new Cropper(image, {
          aspectRatio: 16 / 9,
          viewMode: 1, dragMode: 'move', autoCropArea: 1, restore: false,
          guides: true, center: true, highlight: true, cropBoxMovable: true, cropBoxResizable: true,
          background: false
        });
      };
      document.getElementById('crop-save-cover')?.addEventListener('click', async () => {
        if (!cropper) return;
        const canvas = cropper.getCroppedCanvas();
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        await updateCover(dataUrl);
        userData.coverPhoto = dataUrl;
        showToast('تم تحديث الغلاف', 'success');
        cropper.destroy();
        modal.remove();
        viewPublicProfile(auth.currentUser.uid);
      });
      document.getElementById('crop-cancel-cover')?.addEventListener('click', () => {
        cropper?.destroy();
        modal.remove();
      });
    };
    reader.readAsDataURL(file);
  });
}// ... تابع dashboard.js

// ========== الإعدادات ==========
export function loadSettingsPage() {
  const section = $('#page-settings');
  if (!section) return;
  const avatarUrl = userData?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData?.name || '?')}&background=D4AF37&color=111&size=200&bold=true&format=svg`;

  section.innerHTML = `
    <h2><i class="fas fa-cog"></i> الإعدادات</h2>
    <div style="max-width:500px;margin:0 auto;">
      <div style="text-align:center;margin-bottom:20px;">
        <div class="sidebar-avatar" style="margin:0 auto 10px;width:90px;height:90px;">
          <img id="settings-avatar-img" src="${avatarUrl}" alt="الصورة">
        </div>
        <button id="change-avatar-btn" class="gold-btn-outline"><i class="fas fa-camera"></i> تغيير الصورة</button>
        <input type="file" id="settings-avatar-upload" accept="image/*" hidden>
      </div>
      <div class="input-group" style="margin-bottom:12px;">
        <label><i class="fas fa-user"></i> الاسم الكامل</label>
        <input type="text" id="settings-name" value="${userData?.name || ''}">
      </div>
      <div class="input-group" style="margin-bottom:12px;">
        <label><i class="fas fa-pen"></i> السيرة الذاتية</label>
        <textarea id="settings-bio" maxlength="65" rows="2">${userData?.bio || ''}</textarea>
      </div>
      ${isVip ? `
      <div class="input-group" style="margin-bottom:12px;">
        <label><i class="fas fa-image"></i> صورة الغلاف</label>
        <button id="change-cover-btn" class="btn-outline btn-sm"><i class="fas fa-upload"></i> تغيير الغلاف</button>
        <input type="file" id="settings-cover-upload" accept="image/*" hidden>
        ${userData?.coverPhoto ? `<img src="${userData.coverPhoto}" style="width:100%;height:80px;object-fit:cover;border-radius:8px;margin-top:6px;">` : '<div style="width:100%;height:80px;background:var(--bg-tertiary);border-radius:8px;margin-top:6px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);">لا يوجد غلاف</div>'}
      </div>` : ''}
      
      ${(isVip && vipLevel >= 2) || isAdmin || isMod || isSuperMod ? `
      <div class="input-group" style="margin-bottom:12px;">
        <label><i class="fas fa-eye"></i> إظهار الشريط العلوي</label>
        <div class="toggle-switch ${userData?.showVipBar !== false ? 'active' : ''}" id="toggle-vip-bar"></div>
      </div>` : ''}
      
      <h3 style="margin:20px 0 12px;color:var(--gold);"><i class="fas fa-key"></i> تغيير كلمة المرور</h3>
      <div class="input-group" style="margin-bottom:10px;">
        <label>كلمة المرور الجديدة</label>
        <input type="password" id="settings-new-pass" placeholder="حرف إنجليزي + أرقام (6 خانات)">
      </div>
      <div class="input-group" style="margin-bottom:10px;">
        <label>تأكيد كلمة المرور</label>
        <input type="password" id="settings-confirm-pass" placeholder="أعد كتابة كلمة المرور الجديدة">
      </div>
      <button id="change-password-btn" class="btn-outline" style="width:100%;"><i class="fas fa-key"></i> تغيير كلمة المرور</button>
      <button id="save-profile-btn" class="btn-primary" style="width:100%;margin-top:16px;"><i class="fas fa-save"></i> حفظ جميع التعديلات</button>
    </div>
  `;

  $('#change-avatar-btn')?.addEventListener('click', () => openCropper('avatar'));
  $('#change-cover-btn')?.addEventListener('click', () => openCropper('cover'));
  
  $('#save-profile-btn')?.addEventListener('click', async () => {
    const name = $('#settings-name')?.value.trim();
    const bio = $('#settings-bio')?.value.trim();
    if (!name) return showToast('الاسم مطلوب', 'error');
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), { name, bio });
      userData.name = name;
      userData.bio = bio;
      showToast('تم حفظ التعديلات', 'success');
      document.dispatchEvent(new CustomEvent('ui-update'));
    } catch (e) { showToast('خطأ في الحفظ', 'error'); }
  });

  $('#change-password-btn')?.addEventListener('click', async () => {
    const newPass = $('#settings-new-pass')?.value;
    const confirmPass = $('#settings-confirm-pass')?.value;
    if (!newPass || !confirmPass) return showToast('املأ الحقلين', 'error');
    if (newPass !== confirmPass) return showToast('كلمتا المرور غير متطابقتين', 'error');
    if (!validatePassword(newPass)) return showToast('كلمة المرور ضعيفة', 'error');
    try {
      await changePassword(newPass);
      showToast('تم تغيير كلمة المرور بنجاح', 'success');
      const input1 = $('#settings-new-pass');
      const input2 = $('#settings-confirm-pass');
      if (input1) input1.value = '';
      if (input2) input2.value = '';
    } catch (e) { showToast('فشل تغيير كلمة المرور. ربما تحتاج لإعادة تسجيل الدخول.', 'error'); }
  });

  // Toggle إظهار الشريط
  $('#toggle-vip-bar')?.addEventListener('click', async function() {
    const isActive = this.classList.contains('active');
    if (isActive) {
      this.classList.remove('active');
      await updateShowVipBar(false);
      userData.showVipBar = false;
    } else {
      this.classList.add('active');
      await updateShowVipBar(true);
      userData.showVipBar = true;
    }
    showToast(isActive ? 'تم إيقاف الشريط' : 'تم إظهار الشريط', 'info');
  });
}

// ========== أداة قص الصورة ==========
function openCropper(type) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.click();
  input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const modal = document.createElement('div');
      modal.className = 'cropper-modal';
      modal.innerHTML = `
        <div class="cropper-container"><img id="cropper-image" src="${ev.target.result}"></div>
        <div class="cropper-buttons">
          <button class="btn-primary" id="crop-save"><i class="fas fa-save"></i> حفظ</button>
          <button class="btn-outline" id="crop-cancel"><i class="fas fa-times"></i> إلغاء</button>
        </div>`;
      document.body.appendChild(modal);
      const image = document.getElementById('cropper-image');
      let cropper = null;
      image.onload = () => {
        cropper = new Cropper(image, {
          aspectRatio: type === 'cover' ? 16 / 9 : 1 / 1,
          viewMode: 1, dragMode: 'move', autoCropArea: 1, restore: false,
          guides: true, center: true, highlight: true, cropBoxMovable: true, cropBoxResizable: true,
          background: false
        });
      };
      document.getElementById('crop-save')?.addEventListener('click', async () => {
        if (!cropper) return;
        const canvas = cropper.getCroppedCanvas();
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        if (type === 'avatar') {
          await updateDoc(doc(db, 'users', auth.currentUser.uid), { avatar: dataUrl });
          userData.avatar = dataUrl;
        } else if (type === 'cover') {
          await updateDoc(doc(db, 'users', auth.currentUser.uid), { coverPhoto: dataUrl });
          userData.coverPhoto = dataUrl;
        }
        showToast('تم تحديث الصورة', 'success');
        cropper.destroy();
        modal.remove();
        loadSettingsPage();
        document.dispatchEvent(new CustomEvent('ui-update'));
      });
      document.getElementById('crop-cancel')?.addEventListener('click', () => {
        cropper?.destroy();
        modal.remove();
      });
    };
    reader.readAsDataURL(file);
  });
}

// ========== عرض مستخدمين VIP في الشريط السفلي ==========
export async function loadVipUsersList() {
  const section = $('#page-profile');
  if (!section) return;
  
  const usersSnap = await getDocs(query(
    collection(db, 'users'),
    where('role', 'in', ['vip1', 'vip2', 'vip3', 'admin', 'super_mod', 'moderator'])
  ));
  
  let html = '<h2><i class="fas fa-users"></i> المستخدمين المميزين</h2>';
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px;margin-top:16px;">';
  
  usersSnap.forEach(docSnap => {
    const u = docSnap.data();
    const avatarUrl = u.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name||'?')}&background=D4AF37&color=111&size=80`;
    html += `
      <div class="stat-card" style="cursor:pointer;display:flex;align-items:center;gap:12px;" data-uid="${u.uid}">
        <img src="${avatarUrl}" style="width:45px;height:45px;border-radius:50%;border:2px solid var(--gold);">
        <div>
          <strong>${u.name || '---'}</strong>
          <div style="font-size:11px;color:var(--text-muted);">${getVipBadgeText(u.role) || 'مستخدم'}</div>
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  section.innerHTML = html;
  
  section.querySelectorAll('.stat-card').forEach(card => {
    card.addEventListener('click', () => viewPublicProfile(card.dataset.uid));
  });
}

// ========== تأثير كونفيتي ==========
export function showVipConfetti(message = 'مبروك!') {
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
  document.getElementById('vip-confetti-close')?.addEventListener('click', () => overlay.remove());
  setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 5000);
}