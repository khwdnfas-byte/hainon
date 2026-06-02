/*
 | HAINON © 2026 جميع الحقوق محفوظة
 | لا يُسمح بنسخ أو توزيع أو استخدام هذا الملف أو أي جزء من الكود دون إذن كتابي صريح.
 | هذا الملف جزء من نظام HAINON المحاسبي.
*/

// dashboard.js — نظام VIP، المحادثات، خدمة العملاء، إدارة المستخدمين، الإعدادات
import { auth, db } from './firebase-config.js';
import {
  collection, addDoc, doc, getDoc, getDocs, query, where, orderBy,
  onSnapshot, serverTimestamp, updateDoc, deleteDoc, Timestamp, setDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  $, showToast, showConfirm, formatCurrency, getTypeLabel, escapeHtml,
  getVipAvatarClass, getVipNameClass, getVipFrameClass,
  formatDateEn, formatTimeEn, formatDateTimeEn,
  getVipBadgeText, WRITE_BAR_COLORS, validatePassword
} from './utils.js';
import { changePassword, updateCover } from './auth.js';
import {
  currentUser, userData, isAdmin, isSuperMod, isMod, isVip, vipLevel,
  sendNotification, sendMassNotification
} from './transactions.js';

// ========== إدارة الموقع ==========
export function loadSiteManagementPage() {
  const section = $('#page-site-management');
  if (!section) return;
  if (!isAdmin && !isMod && !isSuperMod) { section.innerHTML = '<h2><i class="fas fa-lock"></i> غير مصرح</h2>'; return; }

  section.innerHTML = `
    <h2><i class="fas fa-cogs"></i> إدارة الموقع</h2>
    <div class="stat-card" style="margin-bottom:16px;"><h3><i class="fas fa-bullhorn"></i> إرسال إشعار للمستخدمين</h3>
      <textarea id="site-notification-text" rows="3" placeholder="نص الإشعار..." style="width:100%;margin:8px 0;"></textarea>
      <button id="send-site-notification-btn" class="btn-primary"><i class="fas fa-paper-plane"></i> إرسال</button></div>
    <div class="stat-card" style="margin-bottom:16px;"><h3><i class="fas fa-trash-alt"></i> إزالة شريط</h3>
      <div class="form-row"><input type="text" id="bar-search-input" placeholder="ابحث بالاسم / البريد / ID / اسم الشركة..."></div>
      <div id="bar-search-results"></div></div>
    ${isAdmin ? `<div class="stat-card" style="margin-bottom:16px;"><h3><i class="fas fa-money-bill-wave"></i> تعديل طريقة الدفع</h3>
      <button id="edit-payment-method-btn" class="btn-primary"><i class="fas fa-credit-card"></i> الذهاب إلى أسعار VIP</button>
      <button id="edit-vip-settings-btn" class="btn-outline" style="margin-top:8px;"><i class="fas fa-cog"></i> إعدادات طلب VIP</button></div>` : ''}`;

  $('#send-site-notification-btn')?.addEventListener('click', async () => {
    const text = $('#site-notification-text')?.value.trim();
    if (!text) return showToast('اكتب نص الإشعار', 'error');
    await sendMassNotification(text);
    $('#site-notification-text').value = '';
  });

  $('#bar-search-input')?.addEventListener('input', debounce(async (e) => {
    const qt = e.target.value.trim();
    if (!qt) { $('#bar-search-results').innerHTML = ''; return; }
    await searchBars(qt);
  }, 500));

  $('#edit-payment-method-btn')?.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('navigate', { detail: 'vip-pricing' }));
  });

  $('#edit-vip-settings-btn')?.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('navigate', { detail: 'vip-request-settings' }));
  });
}

async function searchBars(qt) {
  const res = $('#bar-search-results'); if (!res) return;
  const us = await getDocs(collection(db, 'users'));
  const mu = [];
  us.forEach(d => {
    const u = d.data();
    if ((u.name||'').toLowerCase().includes(qt.toLowerCase()) || (u.email||'').toLowerCase().includes(qt.toLowerCase()) || (u.serialId||'').toLowerCase().includes(qt.toLowerCase()) || (u.company||'').toLowerCase().includes(qt.toLowerCase())) {
      mu.push({ uid: u.uid, name: u.name, avatar: u.avatar });
    }
  });
  if (mu.length === 0) { res.innerHTML = '<p style="color:var(--text-muted);text-align:center;">لا توجد نتائج</p>'; return; }
  res.innerHTML = '<h4 style="margin:12px 0 8px;">المستخدمين المطابقين:</h4>';
  for (const u of mu) {
    const bs = await getDocs(query(collection(db, 'vipBars'), where('uid', '==', u.uid), orderBy('createdAt', 'desc')));
    const ud = document.createElement('div'); ud.className = 'stat-card'; ud.style.cssText = 'margin-bottom:8px;';
    ud.innerHTML = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;"><img src="${u.avatar||'https://ui-avatars.com/api/?name='+encodeURIComponent(u.name||'?')}" style="width:36px;height:36px;border-radius:50%;border:2px solid var(--gold);"><strong>${u.name}</strong></div><div id="bars-${u.uid}"></div>`;
    res.appendChild(ud);
    const bc = document.getElementById(`bars-${u.uid}`);
    if (bs.empty) { bc.innerHTML = '<p style="color:var(--text-muted);font-size:12px;">لا توجد شرائط</p>'; }
    else { bs.forEach(bd => { const b = bd.data(); const bdv = document.createElement('div'); bdv.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 8px;background:var(--bg-tertiary);border-radius:6px;margin-bottom:4px;'; bdv.innerHTML = `<span style="color:${b.color||'#D4AF37'};font-size:12px;">${escapeHtml(b.text)}</span><button class="btn-outline btn-sm delete-bar-btn" data-bar-id="${bd.id}" style="color:var(--red);border-color:var(--red);"><i class="fas fa-trash"></i></button>`; bdv.querySelector('.delete-bar-btn')?.addEventListener('click', async () => { await deleteDoc(doc(db, 'vipBars', bd.id)); showToast('تم حذف الشريط', 'success'); searchBars(qt); }); bc.appendChild(bdv); }); }
  }
}

function debounce(f, w) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), w); }; }

// ========== محادثة الإدارة ==========
export function loadAdminChat() {
  const s = $('#page-admin-chat'); if (!s) return;
  s.innerHTML = `<h2><i class="fas fa-comments"></i> محادثة الإدارة</h2><div class="chat-container" style="height:calc(100vh - 280px);"><div class="chat-messages" id="acm"><p style="text-align:center;color:var(--text-muted);">⏳ جاري التحميل...</p></div><div class="chat-input-area"><input type="text" id="aci" placeholder="اكتب رسالتك..."><button id="acs"><i class="fas fa-paper-plane"></i></button></div></div>`;
  const md = $('#acm');
  onSnapshot(query(collection(db, 'adminChat'), orderBy('createdAt', 'asc')), (sn) => {
    if (!md) return; md.innerHTML = '';
    if (sn.empty) { md.innerHTML = '<p style="text-align:center;color:var(--text-muted);">لا توجد رسائل بعد</p>'; }
    sn.forEach(d => { const m = d.data(), dt = m.createdAt?.toDate() || new Date(), is = m.uid === auth.currentUser.uid;
      md.innerHTML += `<div class="chat-msg ${is?'sent':'received'}"><strong>${m.senderName||'مستخدم'}</strong><p>${escapeHtml(m.text)}</p><small>${formatDateEn(dt)} ${formatTimeEn(dt)}</small></div>`; });
    md.scrollTop = md.scrollHeight;
  });
  const sf = async () => { const t = $('#aci')?.value.trim(); if (!t) return; await addDoc(collection(db, 'adminChat'), { uid: auth.currentUser.uid, senderName: userData?.name || 'مدير', text: t, createdAt: serverTimestamp() }); const i = $('#aci'); if (i) i.value = ''; };
  $('#acs')?.addEventListener('click', sf); $('#aci')?.addEventListener('keypress', e => { if (e.key === 'Enter') sf(); });
}

// ========== خدمة عملاء VIP ==========
export function loadVipSupportChat() {
  const s = $('#page-vip-support'); if (!s) return;
  if (!isVip && !isAdmin && !isMod && !isSuperMod) {
    showConfirm('خدمة العملاء متاحة فقط لمستخدمي VIP. هل تريد الترقية؟').then(y => {
      if (y) document.dispatchEvent(new CustomEvent('navigate', { detail: 'vip-pricing' }));
      else document.dispatchEvent(new CustomEvent('navigate', { detail: 'dashboard' }));
    }); return;
  }
  if (isAdmin || isMod || isSuperMod) {
    s.innerHTML = `<h2><i class="fas fa-headset"></i> خدمة العملاء - طلبات الدعم</h2><div id="vcl">⏳ جاري تحميل جهات الاتصال...</div><div id="vca" class="hidden"></div>`;
    loadVipContacts(); return;
  }
  s.innerHTML = `<h2><i class="fas fa-headset"></i> خدمة العملاء</h2><div class="chat-container" style="height:calc(100vh - 280px);"><div class="chat-messages" id="vsm"><p style="text-align:center;color:var(--text-muted);">⏳ جاري التحميل...</p></div><div class="chat-input-area"><input type="text" id="vsi" placeholder="اكتب رسالتك..."><button id="vss"><i class="fas fa-paper-plane"></i></button></div></div>`;
    loadVipSupportChatMessages();
}

function loadVipContacts() {
  const l = $('#vcl'); if (!l) return;
  onSnapshot(query(collection(db, 'supportChat'), orderBy('createdAt', 'asc')), (sn) => {
    const um = new Map(); sn.forEach(d => { const m = d.data(); if (m.uid !== auth.currentUser.uid && !um.has(m.uid)) um.set(m.uid, { uid: m.uid, name: m.senderName || 'مستخدم', lm: m.text }); });
    l.innerHTML = ''; if (um.size === 0) { l.innerHTML = '<p style="text-align:center;color:var(--text-muted);">لا توجد طلبات دعم حالياً</p>'; return; }
    um.forEach(u => { const dv = document.createElement('div'); dv.className = 'stat-card'; dv.style.cssText = 'cursor:pointer;margin-bottom:8px;display:flex;align-items:center;gap:12px;';
      dv.innerHTML = `<img src="https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=D4AF37&color=111&size=40&bold=true" style="width:40px;height:40px;border-radius:50%;border:2px solid var(--gold);"><div><strong>${u.name}</strong><br><small style="color:var(--text-muted);">${u.lm?.substring(0,30)}...</small></div>`;
      dv.addEventListener('click', () => openVipChat(u.uid, u.name)); l.appendChild(dv); });
  });
}

function openVipChat(uid, name) {
  const a = $('#vca'), c = $('#vcl'); if (!a || !c) return;
  c.classList.add('hidden'); a.classList.remove('hidden');
  a.innerHTML = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;"><button class="btn-outline btn-sm" id="bvc"><i class="fas fa-arrow-right"></i> عودة</button><h3 style="margin:0;">${name}</h3></div><div class="chat-container" style="height:calc(100vh - 340px);"><div class="chat-messages" id="vam"><p style="text-align:center;color:var(--text-muted);">⏳ جاري التحميل...</p></div><div class="chat-input-area"><input type="text" id="vai" placeholder="اكتب ردك..."><button id="vas"><i class="fas fa-paper-plane"></i></button></div></div>`;
  $('#bvc')?.addEventListener('click', () => { a.classList.add('hidden'); c.classList.remove('hidden'); });
  loadVipAdminMessages(uid);
  const sf = async () => { const t = $('#vai')?.value.trim(); if (!t) return; await addDoc(collection(db, 'supportChat'), { uid: auth.currentUser.uid, targetUid: uid, senderName: userData?.name || 'مشرف', text: t, createdAt: serverTimestamp() }); const i = $('#vai'); if (i) i.value = ''; };
  $('#vas')?.addEventListener('click', sf); $('#vai')?.addEventListener('keypress', e => { if (e.key === 'Enter') sf(); });
}

function loadVipAdminMessages(tu) {
  const md = $('#vam'); if (!md) return;
  onSnapshot(query(collection(db, 'supportChat'), orderBy('createdAt', 'asc')), (sn) => {
    md.innerHTML = ''; sn.forEach(d => { const m = d.data(); if (m.uid === tu || m.targetUid === tu) { const is = m.uid === auth.currentUser.uid, dt = m.createdAt?.toDate() || new Date();
      md.innerHTML += `<div class="chat-msg ${is?'sent':'received'}"><strong>${m.senderName||'مستخدم'}</strong><p>${escapeHtml(m.text)}</p><small>${formatDateEn(dt)} ${formatTimeEn(dt)}</small></div>`; } });
    md.scrollTop = md.scrollHeight;
  });
}

function loadVipSupportChatMessages() {
  const md = $('#vsm'); if (!md) return;
  onSnapshot(query(collection(db, 'supportChat'), orderBy('createdAt', 'asc')), (sn) => {
    md.innerHTML = ''; sn.forEach(d => { const m = d.data(); if (m.uid === auth.currentUser.uid || m.targetUid === auth.currentUser.uid || !m.targetUid) { const is = m.uid === auth.currentUser.uid, dt = m.createdAt?.toDate() || new Date();
      md.innerHTML += `<div class="chat-msg ${is?'sent':'received'}"><strong>${m.senderName||'مستخدم'}</strong><p>${escapeHtml(m.text)}</p><small>${formatDateEn(dt)} ${formatTimeEn(dt)}</small></div>`; } });
    md.scrollTop = md.scrollHeight;
  });
  const sf = async () => { const t = $('#vsi')?.value.trim(); if (!t) return; await addDoc(collection(db, 'supportChat'), { uid: auth.currentUser.uid, senderName: userData?.name || 'مستخدم', text: t, createdAt: serverTimestamp() }); const i = $('#vsi'); if (i) i.value = ''; };
  $('#vss')?.addEventListener('click', sf); $('#vsi')?.addEventListener('keypress', e => { if (e.key === 'Enter') sf(); });
}// ... تابع dashboard.js

// ========== إدارة المستخدمين ==========
export async function loadUsersPage() {
  const section = $('#page-users');
  if (!section) return;
  if (!isAdmin && !isMod && !isSuperMod) { section.innerHTML = '<h2><i class="fas fa-lock"></i> غير مصرح</h2>'; return; }

  section.innerHTML = `
    <h2><i class="fas fa-users"></i> إدارة المستخدمين</h2>
    <div class="form-row" style="margin-bottom:16px;"><input type="text" id="user-search-input" placeholder="بحث بالاسم / ID / البريد..." style="grid-column:1/-1;"></div>
    <div id="vip-requests-panel" style="margin-bottom:30px;"></div>
    <div class="table-container"><table><thead><tr><th>صورة</th><th>الاسم</th><th>ID</th><th>البريد</th><th>الدور</th><th>الحالة</th><th>آخر ظهور</th><th>الموقع</th><th>الجهاز</th><th>IP</th><th>تاريخ التسجيل</th><th>إجراءات</th></tr></thead>
    <tbody id="users-tbody"><tr><td colspan="12">جاري التحميل...</td></tr></tbody></table></div>`;

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
      const isBlocked = u.blocked === true;

      tbody.innerHTML += `
        <tr>
          <td><img src="${avatarUrl}" style="width:30px;height:30px;border-radius:50%;border:2px solid var(--gold);cursor:pointer;" class="user-profile-img" data-uid="${u.uid}"></td>
          <td class="user-profile-link" data-uid="${u.uid}" style="cursor:pointer;color:var(--gold);">${u.name || '---'} ${u.company ? '('+u.company+')' : ''}</td>
          <td>${u.serialId || '---'}</td><td>${u.email || '---'}</td><td>${roleBadge}</td>
          <td>${isBlocked ? '<i class="fas fa-ban" style="color:var(--red);"></i>' : (isOnline ? '<i class="fas fa-circle" style="color:var(--green);"></i>' : '<i class="fas fa-circle" style="color:var(--red);"></i>')}</td>
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
            ${isBlocked ? `<button class="btn-outline btn-sm unblock-user-btn" data-uid="${u.uid}" style="color:var(--green);border-color:var(--green);"><i class="fas fa-unlock"></i></button>` : `<button class="btn-outline btn-sm block-user-btn" data-uid="${u.uid}" data-name="${u.name}"><i class="fas fa-ban"></i></button>`}
            ${isAdmin && u.uid !== auth.currentUser.uid ? `<button class="btn-outline btn-sm delete-user-btn" data-uid="${u.uid}" data-name="${u.name}" style="color:var(--red);border-color:var(--red);"><i class="fas fa-trash"></i></button>` : ''}
          </td>
        </tr>`;
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
        if (await showConfirm(`حذف ${btn.dataset.name}؟`)) { await deleteDoc(doc(db, 'users', btn.dataset.uid)); showToast('تم الحذف', 'success'); loadUsersPage(); }
      });
    });
    // زر الحظر الجديد
    tbody.querySelectorAll('.block-user-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $('#block-user-uid').value = btn.dataset.uid;
        $('#block-modal').classList.remove('hidden');
      });
    });
    // زر فك الحظر
    tbody.querySelectorAll('.unblock-user-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (await showConfirm('فك الحظر عن هذا المستخدم؟')) {
          await updateDoc(doc(db, 'users', btn.dataset.uid), { blocked: false, blockReason: '', blockExpiry: null });
          showToast('تم فك الحظر', 'success');
          loadUsersPage();
        }
      });
    });
    tbody.querySelectorAll('.edit-id-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const newId = prompt('ID الجديد:', btn.dataset.id);
        if (newId?.trim()) { await updateDoc(doc(db, 'users', btn.dataset.uid), { serialId: newId.trim() }); showToast('تم تعديل ID', 'success'); loadUsersPage(); }
      });
    });
    tbody.querySelectorAll('.remove-photo-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (await showConfirm('إزالة صورة المستخدم؟')) { await updateDoc(doc(db, 'users', btn.dataset.uid), { avatar: `https://ui-avatars.com/api/?name=مستخدم&background=D4AF37&color=111&size=200` }); showToast('تم إزالة الصورة', 'success'); loadUsersPage(); }
      });
    });
  }

  renderUsers();
  $('#user-search-input')?.addEventListener('input', (e) => renderUsers(e.target.value));
}

// ========== مودال الحظر الكامل ==========
async function blockUserByAdmin() {
  const uid = $('#block-user-uid')?.value;
  const reason = $('#block-reason')?.value.trim();
  const duration = $('#block-duration')?.value;

  if (!uid) return;
  if (!reason) return showToast('اكتب سبب الحظر', 'error');

  let expiry = null;
  if (duration === 'permanent') {
    expiry = null;
  } else if (duration === 'custom') {
    const customDate = $('#block-custom-date')?.value;
    if (!customDate) return showToast('حدد تاريخ الانتهاء', 'error');
    expiry = Timestamp.fromDate(new Date(customDate));
  } else {
    const days = parseInt(duration);
    const d = new Date();
    d.setDate(d.getDate() + days);
    expiry = Timestamp.fromDate(d);
  }

  try {
    await updateDoc(doc(db, 'users', uid), {
      blocked: true,
      blockReason: reason,
      blockExpiry: expiry
    });
    showToast('تم حظر المستخدم', 'success');
    $('#block-modal').classList.add('hidden');
    loadUsersPage();
  } catch (e) {
    showToast('فشل الحظر', 'error');
  }
}

async function appointMod(uid, name) {
  const level = prompt('تعيين كـ:\n1- مشرف (moderator)\n2- مشرف مميز (super_mod)', '1');
  if (!level || !['1','2'].includes(level)) return;
  const newRole = level === '2' ? 'super_mod' : 'moderator';
  const message = prompt('رسالة تهنئة:', `تهانينا ${name}! تم تعيينك ${newRole === 'super_mod' ? 'مشرفاً مميزاً' : 'مشرفاً'} في HAINON.`);
  
  await updateDoc(doc(db, 'users', uid), { role: newRole });
  await sendNotification(uid, message || 'تم تعيينك مشرفاً', 'id_upgrade');
  showToast('تم تعيين المشرف بنجاح', 'success');
  loadUsersPage();
}

function assignVipModal(uid, currentRole) {
  const level = prompt('أدخل مستوى VIP (1,2,3) أو اتركه فارغاً للإلغاء:');
  if (!level || !['1','2','3'].includes(level)) return showToast('تم الإلغاء', 'info');
  const days = prompt('عدد الأيام:', '30');
  const expiryDays = parseInt(days) || 30;
  const expiry = new Date(); expiry.setDate(expiry.getDate() + expiryDays);
  updateDoc(doc(db, 'users', uid), { role: `vip${level}`, vipExpiry: Timestamp.fromDate(expiry) }).then(async () => {
    await sendNotification(uid, `تهانينا! تمت ترقيتك إلى VIP ${level}`, 'vip_upgrade');
    showToast('تم تعيين VIP', 'success');
    loadUsersPage();
  });
}

// ========== طلبات VIP ==========
export async function createVipRequest(level, operationNumber) {
  const user = auth.currentUser; if (!user) return showToast('يجب تسجيل الدخول', 'error');
  const userSnap = await getDoc(doc(db, 'users', user.uid)); const u = userSnap.data();
  await addDoc(collection(db, 'vipRequests'), { uid: user.uid, name: u.name, email: u.email, serialId: u.serialId, level, operationNumber, status: 'pending', createdAt: serverTimestamp() });
  const adminsSnap = await getDocs(query(collection(db, 'users'), where('role', 'in', ['admin', 'super_mod', 'moderator'])));
  adminsSnap.forEach(async (ad) => { await sendNotification(ad.id, `طلب ترقية VIP ${level} من ${u.name}`, 'vip_request', 'users'); });
  showToast('تم إرسال طلبك. سنقوم بمراجعته قريباً.', 'success');
}

export function loadVipRequestsAdmin() {
  const panel = $('#vip-requests-panel'); if (!panel) return;
  panel.innerHTML = '<p>⏳ جاري تحميل الطلبات...</p>';
  onSnapshot(query(collection(db, 'vipRequests'), where('status', '==', 'pending'), orderBy('createdAt', 'asc')), (sn) => {
    if (sn.empty) { panel.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:16px;">لا توجد طلبات معلقة</p>'; return; }
    let html = '<h4 style="margin:16px 0 8px;color:var(--gold);"><i class="fas fa-star"></i> طلبات ترقية VIP المعلقة</h4><div class="table-container"><table><thead><tr><th>المستخدم</th><th>المستوى</th><th>رقم العملية</th><th>التاريخ</th><th>إجراءات</th></tr></thead><tbody>';
    sn.forEach(d => { const r = d.data(), cd = r.createdAt?.toDate() || new Date();
      html += `<tr><td>${r.name} (${r.serialId||''})</td><td><span style="color:var(--vip${r.level}-color);">VIP ${r.level}</span></td><td>${r.operationNumber}</td><td>${formatDateEn(cd)} ${formatTimeEn(cd)}</td>
        <td><button class="btn-outline btn-sm approve-vip-btn" data-id="${d.id}" data-uid="${r.uid}" data-level="${r.level}"><i class="fas fa-check"></i> قبول</button>
        <button class="btn-outline btn-sm reject-vip-btn" data-id="${d.id}" data-uid="${r.uid}" style="color:var(--red);border-color:var(--red);margin-left:4px;"><i class="fas fa-times"></i> رفض</button></td></tr>`; });
    html += '</tbody></table></div>'; panel.innerHTML = html;
    panel.querySelectorAll('.approve-vip-btn').forEach(b => b.addEventListener('click', () => approveVipRequest(b.dataset.id, b.dataset.uid, b.dataset.level)));
    panel.querySelectorAll('.reject-vip-btn').forEach(b => b.addEventListener('click', () => rejectVipRequest(b.dataset.id, b.dataset.uid)));
  });
}

async function approveVipRequest(rid, uid, level) {
  if (!(await showConfirm(`تأكيد الترقية إلى VIP ${level}؟`))) return;
  const expiry = new Date(); expiry.setDate(expiry.getDate() + 30);
  await updateDoc(doc(db, 'users', uid), { role: `vip${level}`, vipExpiry: Timestamp.fromDate(expiry) });
  await updateDoc(doc(db, 'vipRequests', rid), { status: 'approved' });
  await sendNotification(uid, `تهانينا! تمت ترقيتك إلى VIP ${level} لمدة 30 يوم`, 'vip_upgrade');
  const us = await getDoc(doc(db, 'users', uid)); const un = us.data()?.name || 'مستخدم';
  const pe = new Date(); pe.setHours(pe.getHours() + 24);
  await addDoc(collection(db, 'vipPromotions'), { text: `🎉 ترقية ${un} إلى VIP ${level}`, color: ({'1':'#8B4513','2':'#00C853','3':'#8A2BE2'})[level]||'#D4AF37', expiresAt: pe, createdAt: serverTimestamp() });
  showToast('تمت الترقية بنجاح', 'success');
  loadVipRequestsAdmin();
}

async function rejectVipRequest(rid, uid) {
  const reason = prompt('سبب الرفض (اختياري):');
  if (!(await showConfirm('رفض الطلب؟'))) return;
  await updateDoc(doc(db, 'vipRequests', rid), { status: 'rejected', reason: reason || '' });
  if (reason) await sendNotification(uid, `طلب ترقية VIP مرفوض. السبب: ${reason}`, 'vip_rejected');
  else await sendNotification(uid, 'طلب ترقية VIP مرفوض.', 'vip_rejected');
  showToast('تم رفض الطلب', 'info'); loadVipRequestsAdmin();
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
        <h3 style="color:var(--vip1-color);">VIP 1</h3><div class="stat-value" style="color:var(--vip1-color);" id="vip1-price">5$</div><p style="font-size:12px;">شهرياً</p>
        <button class="btn-primary select-vip-btn" data-level="1" style="margin-top:12px;width:100%;">اختيار</button>
        ${isAdmin ? '<button class="btn-outline btn-sm edit-price-btn" data-level="1" style="margin-top:6px;width:100%;"><i class="fas fa-edit"></i> تعديل السعر</button>' : ''}</div>
      <div class="stat-card" style="text-align:center;padding:24px;border-color:var(--vip2-color);">
        <div class="stat-icon"><i class="fas fa-star" style="color:var(--vip2-color);"></i></div>
        <h3 style="color:var(--vip2-color);">VIP 2</h3><div class="stat-value" style="color:var(--vip2-color);" id="vip2-price">15$</div><p style="font-size:12px;">شهرياً</p>
        <button class="btn-primary select-vip-btn" data-level="2" style="margin-top:12px;width:100%;">اختيار</button>
        ${isAdmin ? '<button class="btn-outline btn-sm edit-price-btn" data-level="2" style="margin-top:6px;width:100%;"><i class="fas fa-edit"></i> تعديل السعر</button>' : ''}</div>
      <div class="stat-card" style="text-align:center;padding:24px;border-color:var(--vip3-color);">
        <div class="stat-icon"><i class="fas fa-star" style="color:var(--vip3-color);"></i></div>
        <h3 style="color:var(--vip3-color);">VIP 3</h3><div class="stat-value" style="color:var(--vip3-color);" id="vip3-price">35$</div><p style="font-size:12px;">شهرياً</p>
        <button class="btn-primary select-vip-btn" data-level="3" style="margin-top:12px;width:100%;">اختيار</button>
        ${isAdmin ? '<button class="btn-outline btn-sm edit-price-btn" data-level="3" style="margin-top:6px;width:100%;"><i class="fas fa-edit"></i> تعديل السعر</button>' : ''}</div></div>`;

  getDoc(doc(db, 'settings', 'vipPrices')).then(snap => {
    if (snap.exists()) { const p = snap.data(); if (p.vip1) { const e = $('#vip1-price'); if (e) e.textContent = p.vip1 + '$'; } if (p.vip2) { const e = $('#vip2-price'); if (e) e.textContent = p.vip2 + '$'; } if (p.vip3) { const e = $('#vip3-price'); if (e) e.textContent = p.vip3 + '$'; } }
  });

  section.querySelectorAll('.select-vip-btn').forEach(btn => {
    btn.addEventListener('click', () => { sessionStorage.setItem('selectedVipLevel', btn.dataset.level); document.dispatchEvent(new CustomEvent('navigate', { detail: 'vip-payment' })); });
  });
  section.querySelectorAll('.edit-price-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const lv = btn.dataset.level, cp = document.getElementById(`vip${lv}-price`)?.textContent.replace('$', '') || '0';
      const np = prompt(`السعر الجديد لـ VIP ${lv}:`, cp);
      if (np && !isNaN(np) && parseFloat(np) > 0) { setDoc(doc(db, 'settings', 'vipPrices'), { [`vip${lv}`]: parseFloat(np) }, { merge: true }).then(() => { const e = document.getElementById(`vip${lv}-price`); if (e) e.textContent = np + '$'; showToast('تم تحديث السعر', 'success'); }); }
    });
  });
}

export function loadVipPaymentPage() {
  const section = $('#page-vip-payment'); if (!section) return;
  const level = sessionStorage.getItem('selectedVipLevel') || '1';
  const levelNames = { '1': 'VIP 1', '2': 'VIP 2', '3': 'VIP 3' };
  section.innerHTML = `
    <h2><i class="fas fa-credit-card"></i> الدفع - ${levelNames[level]}</h2>
    <div class="stat-card" style="margin-bottom:16px;border-color:var(--vip${level}-color);"><h4 style="color:var(--vip${level}-color);"><i class="fas fa-money-bill-wave"></i> شام كاش</h4></div>
    <div class="stat-card" style="margin-bottom:16px;"><h4><i class="fas fa-info-circle"></i> تعليمات الدفع</h4><div id="payment-instructions" style="font-size:13px;color:var(--text-secondary);">⏳ تحميل...</div></div>
    <div style="text-align:center;margin:16px 0;"><h4 style="color:var(--red);">الوقت المتبقي</h4><div id="payment-timer" style="font-size:28px;font-weight:900;color:var(--gold);">15:00</div></div>
    <div class="form-full"><label>رقم الحوالة (من المدير)</label><input type="text" id="admin-transfer-number" readonly placeholder="⏳ جاري التحميل..."></div>
    <div class="form-full"><label>رقم العملية الخاص بك</label><input type="text" id="user-operation-number" placeholder="أدخل رقم العملية" inputmode="numeric"></div>
    <div style="display:flex;gap:10px;margin-top:16px;"><button id="confirm-payment-btn" class="btn-primary" style="flex:1;"><i class="fas fa-check"></i> تأكيد العملية</button><button id="cancel-payment-btn" class="btn-outline" style="flex:1;"><i class="fas fa-times"></i> تراجع</button></div>`;

  getDoc(doc(db, 'settings', 'payment')).then(snap => {
    if (snap.exists()) { const d = snap.data(); const i = $('#payment-instructions'); const t = $('#admin-transfer-number'); if (i) i.innerHTML = d.instructions || 'لا توجد تعليمات حالياً'; if (t) t.value = d.transferNumber || ''; if (d.qrCodeUrl) { const q = document.createElement('img'); q.src = d.qrCodeUrl; q.style.cssText = 'max-width:200px;margin-top:10px;border:2px solid var(--gold);border-radius:8px;display:block;'; const pc = $('#payment-instructions')?.parentElement; if (pc) pc.appendChild(q); } }
  });

  let tl = 15 * 60;
  const ti = setInterval(() => { tl--; const m = Math.floor(tl/60), s = tl%60; const t = $('#payment-timer'); if (t) t.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; if (tl <= 0) { clearInterval(ti); const cb = $('#confirm-payment-btn'); if (cb) { cb.disabled = true; cb.textContent = 'انتهى الوقت'; } showToast('انتهى وقت الدفع المخصص', 'error'); } }, 1000);

  $('#confirm-payment-btn')?.addEventListener('click', async () => { const op = $('#user-operation-number')?.value.trim(); if (!op || !/^\d+$/.test(op)) return showToast('أدخل رقم عملية صحيح', 'error'); clearInterval(ti); await createVipRequest(level, op); document.dispatchEvent(new CustomEvent('navigate', { detail: 'dashboard' })); });
  $('#cancel-payment-btn')?.addEventListener('click', () => { clearInterval(ti); document.dispatchEvent(new CustomEvent('navigate', { detail: 'vip-pricing' })); });
}

// ========== إعدادات طلب VIP (للأدمن) ==========
export function loadVipRequestSettingsPage() {
  const section = $('#page-vip-request-settings');
  if (!section) return;
  if (!isAdmin) { section.innerHTML = '<h2><i class="fas fa-lock"></i> غير مصرح</h2>'; return; }

  section.innerHTML = `
    <h2><i class="fas fa-cogs"></i> إعدادات طلب VIP</h2>
    <div style="max-width:500px;margin:0 auto;">
      <div class="form-full"><label>تعليمات الدفع</label><textarea id="vip-instructions" rows="4" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-tertiary);color:var(--text-primary);resize:vertical;"></textarea></div>
      <div class="form-full"><label>رقم الحوالة (يظهر للمستخدمين)</label><input type="text" id="vip-transfer-number" placeholder="مثال: 0999999999"></div>
      <div class="form-full"><label>صورة باركود QR</label><input type="file" id="vip-qr-upload" accept="image/*"><img id="vip-qr-preview" src="" style="max-width:200px;margin-top:10px;border:2px solid var(--gold);border-radius:8px;" class="hidden"></div>
      <button id="save-vip-settings-btn" class="btn-primary" style="width:100%;"><i class="fas fa-save"></i> حفظ الإعدادات</button>
    </div>`;

  getDoc(doc(db, 'settings', 'payment')).then(snap => {
    if (snap.exists()) { const d = snap.data(); $('#vip-instructions').value = d.instructions || ''; $('#vip-transfer-number').value = d.transferNumber || ''; if (d.qrCodeUrl) { $('#vip-qr-preview').src = d.qrCodeUrl; $('#vip-qr-preview').classList.remove('hidden'); } }
  });

  $('#vip-qr-upload')?.addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { $('#vip-qr-preview').src = ev.target.result; $('#vip-qr-preview').classList.remove('hidden'); };
    reader.readAsDataURL(file);
  });

  $('#save-vip-settings-btn')?.addEventListener('click', async () => {
    const instructions = $('#vip-instructions').value.trim();
    const transferNumber = $('#vip-transfer-number').value.trim();
    const qrImage = $('#vip-qr-preview').src;
    await setDoc(doc(db, 'settings', 'payment'), { instructions, transferNumber, qrCodeUrl: qrImage }, { merge: true });
    showToast('تم حفظ الإعدادات', 'success');
  });
}

// ========== الملف الشخصي العام ==========
export async function viewPublicProfile(uid) {
  const section = $('#page-profile'); if (!section) return;
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) { showToast('المستخدم غير موجود', 'error'); return; }
  const u = snap.data();
  document.dispatchEvent(new CustomEvent('navigate', { detail: 'profile' }));

  const isOnline = u.lastLogin?.toDate() > new Date(Date.now() - 5 * 60 * 1000);
  const isOwnProfile = uid === auth.currentUser?.uid;
  const canEditCover = isOwnProfile && (isVip || isAdmin || isMod || isSuperMod);

  section.innerHTML = `
    <div class="profile-page" style="max-width:600px;margin:0 auto;">
      <div class="profile-cover" style="height:200px;background:var(--bg-tertiary);position:relative;border-radius:var(--radius-md) var(--radius-md) 0 0;overflow:hidden;">
        ${u.coverPhoto ? `<img src="${u.coverPhoto}" style="width:100%;height:100%;object-fit:cover;">` : ''}
        ${canEditCover ? `<div class="profile-actions-top" style="position:absolute;top:12px;left:12px;z-index:2;"><button class="btn-outline edit-cover-btn" style="background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.2);color:#fff;padding:6px 12px;font-size:11px;"><i class="fas fa-pen"></i></button></div>` : ''}
        <div class="profile-avatar-large ${getVipAvatarClass(u.role)}" style="position:absolute;bottom:-55px;right:50%;transform:translateX(50%);width:110px;height:110px;border-radius:50%;border:4px solid var(--gold);overflow:hidden;z-index:1;cursor:pointer;" id="profile-avatar-img">
          <img src="${u.avatar || 'https://ui-avatars.com/api/?name='+encodeURIComponent(u.name||'?')+'&background=D4AF37&color=111&size=200'}" style="width:100%;height:100%;object-fit:cover;"></div></div>
      <div class="profile-info" style="padding:65px 20px 20px;background:var(--bg-card);border:1px solid var(--border);border-top:none;border-radius:0 0 var(--radius-md) var(--radius-md);text-align:center;">
        <div class="profile-name ${getVipNameClass(u.role)}">${u.name || '---'} • LV ${u.accountLevel || 0}</div>
        ${u.company ? `<div style="font-size:12px;color:var(--text-muted);">${u.company}</div>` : ''}
        <div class="profile-id">ID: ${u.serialId || '---'}</div><div class="profile-bio">${u.bio || ''}</div>
        <div class="profile-status">${isOnline ? '<i class="fas fa-circle" style="color:var(--green);"></i> متصل الآن' : '<i class="fas fa-circle" style="color:var(--red);"></i> غير متصل'}</div>
        <div style="margin-top:12px;padding:8px;background:rgba(212,175,55,0.1);border-radius:8px;font-size:12px;color:var(--gold);">${getVipBadgeText(u.role) || 'مستخدم عادي'}</div></div></div>`;

  $('#profile-avatar-img')?.addEventListener('click', () => { const lb = $('#image-lightbox'); const li = $('#lightbox-image'); if (lb && li) { li.src = u.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name||'?')}&background=D4AF37&color=111&size=400`; lb.classList.remove('hidden'); } });

  if (canEditCover) {
    document.querySelector('.edit-cover-btn')?.addEventListener('click', () => {
      if (!isVip && !isAdmin && !isMod && !isSuperMod) { showConfirm('هذه الميزة متاحة فقط لمستخدمي VIP1 فما فوق. هل تريد الترقية؟').then(y => { if (y) document.dispatchEvent(new CustomEvent('navigate', { detail: 'vip-pricing' })); }); return; }
      openCoverCropper();
    });
  }
}

function openCoverCropper() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.click();
  inp.addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const modal = document.createElement('div'); modal.className = 'cropper-modal';
      modal.innerHTML = `<div class="cropper-container"><img id="cropper-image" src="${ev.target.result}"></div><div class="cropper-buttons"><button class="btn-primary" id="crop-save-cover"><i class="fas fa-save"></i> حفظ</button><button class="btn-outline" id="crop-cancel-cover"><i class="fas fa-times"></i> إلغاء</button></div>`;
      document.body.appendChild(modal);
      const img = document.getElementById('cropper-image'); let cropper = null;
      img.onload = () => { cropper = new Cropper(img, { aspectRatio: 16/9, viewMode: 1, dragMode: 'move', autoCropArea: 1, restore: false, guides: true, center: true, highlight: true, cropBoxMovable: true, cropBoxResizable: true, background: false }); };
      document.getElementById('crop-save-cover')?.addEventListener('click', async () => { if (!cropper) return; const c = cropper.getCroppedCanvas(); const du = c.toDataURL('image/jpeg', 0.8); await updateCover(du); userData.coverPhoto = du; showToast('تم تحديث الغلاف', 'success'); cropper.destroy(); modal.remove(); viewPublicProfile(auth.currentUser.uid); });
      document.getElementById('crop-cancel-cover')?.addEventListener('click', () => { cropper?.destroy(); modal.remove(); });
    }; reader.readAsDataURL(file);
  });
}

// ========== الإعدادات ==========
export function loadSettingsPage() {
  const section = $('#page-settings'); if (!section) return;
  const avatarUrl = userData?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData?.name||'?')}&background=D4AF37&color=111&size=200&bold=true&format=svg`;

  section.innerHTML = `
    <h2><i class="fas fa-cog"></i> الإعدادات</h2><div style="max-width:500px;margin:0 auto;">
      <div style="text-align:center;margin-bottom:20px;"><div class="sidebar-avatar" style="margin:0 auto 10px;width:90px;height:90px;"><img id="settings-avatar-img" src="${avatarUrl}" alt="الصورة"></div>
        <button id="change-avatar-btn" class="gold-btn-outline"><i class="fas fa-camera"></i> تغيير الصورة</button><input type="file" id="settings-avatar-upload" accept="image/*" hidden></div>
      <div class="input-group" style="margin-bottom:12px;"><label><i class="fas fa-user"></i> الاسم الكامل</label><input type="text" id="settings-name" value="${userData?.name||''}"></div>
      <div class="input-group" style="margin-bottom:12px;"><label><i class="fas fa-pen"></i> السيرة الذاتية</label><textarea id="settings-bio" maxlength="65" rows="2">${userData?.bio||''}</textarea></div>
      ${isVip?`<div class="input-group" style="margin-bottom:12px;"><label><i class="fas fa-image"></i> صورة الغلاف</label><button id="change-cover-btn" class="btn-outline btn-sm"><i class="fas fa-upload"></i> تغيير الغلاف</button><input type="file" id="settings-cover-upload" accept="image/*" hidden>${userData?.coverPhoto?`<img src="${userData.coverPhoto}" style="width:100%;height:80px;object-fit:cover;border-radius:8px;margin-top:6px;">`:'<div style="width:100%;height:80px;background:var(--bg-tertiary);border-radius:8px;margin-top:6px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);">لا يوجد غلاف</div>'}</div>`:''}
      ${(isVip&&vipLevel>=2)||isAdmin||isMod||isSuperMod?`<div class="input-group" style="margin-bottom:12px;"><label><i class="fas fa-eye"></i> إظهار الشريط العلوي</label><div class="toggle-switch ${userData?.showVipBar!==false?'active':''}" id="toggle-vip-bar"></div></div>`:''}
      <h3 style="margin:20px 0 12px;color:var(--gold);"><i class="fas fa-key"></i> تغيير كلمة المرور</h3>
      <div class="input-group" style="margin-bottom:10px;"><label>كلمة المرور الجديدة</label><input type="password" id="settings-new-pass" placeholder="حرف إنجليزي + أرقام (6 خانات)"></div>
      <div class="input-group" style="margin-bottom:10px;"><label>تأكيد كلمة المرور</label><input type="password" id="settings-confirm-pass" placeholder="أعد كتابة كلمة المرور الجديدة"></div>
      <button id="change-password-btn" class="btn-outline" style="width:100%;"><i class="fas fa-key"></i> تغيير كلمة المرور</button>
      <button id="save-profile-btn" class="btn-primary" style="width:100%;margin-top:16px;"><i class="fas fa-save"></i> حفظ جميع التعديلات</button></div>`;

  $('#change-avatar-btn')?.addEventListener('click', () => openCropper('avatar'));
  $('#change-cover-btn')?.addEventListener('click', () => openCropper('cover'));
  $('#save-profile-btn')?.addEventListener('click', async () => { const n = $('#settings-name')?.value.trim(), b = $('#settings-bio')?.value.trim(); if (!n) return showToast('الاسم مطلوب','error'); await updateDoc(doc(db,'users',auth.currentUser.uid),{name:n,bio:b}); userData.name=n; userData.bio=b; showToast('تم حفظ التعديلات','success'); document.dispatchEvent(new CustomEvent('ui-update')); });
  $('#change-password-btn')?.addEventListener('click', async () => { const np = $('#settings-new-pass')?.value, cp = $('#settings-confirm-pass')?.value; if (!np||!cp) return showToast('املأ الحقلين','error'); if (np!==cp) return showToast('كلمتا المرور غير متطابقتين','error'); if (!validatePassword(np)) return showToast('كلمة المرور ضعيفة','error'); try { await changePassword(np); showToast('تم تغيير كلمة المرور بنجاح','success'); $('#settings-new-pass').value=''; $('#settings-confirm-pass').value=''; } catch(e) { showToast('فشل تغيير كلمة المرور. قد تحتاج لإعادة تسجيل الدخول.', 'error'); } });
  $('#toggle-vip-bar')?.addEventListener('click', async function() { const ia = this.classList.contains('active'); if (ia) { this.classList.remove('active'); await updateDoc(doc(db,'users',auth.currentUser.uid),{showVipBar:false}); userData.showVipBar=false; } else { this.classList.add('active'); await updateDoc(doc(db,'users',auth.currentUser.uid),{showVipBar:true}); userData.showVipBar=true; } showToast(ia?'تم إيقاف الشريط':'تم إظهار الشريط','info'); });
}

function openCropper(type) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.click();
  inp.addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const modal = document.createElement('div'); modal.className = 'cropper-modal';
      modal.innerHTML = `<div class="cropper-container"><img id="cropper-image" src="${ev.target.result}"></div><div class="cropper-buttons"><button class="btn-primary" id="crop-save"><i class="fas fa-save"></i> حفظ</button><button class="btn-outline" id="crop-cancel"><i class="fas fa-times"></i> إلغاء</button></div>`;
      document.body.appendChild(modal);
      const img = document.getElementById('cropper-image'); let cropper = null;
      img.onload = () => { cropper = new Cropper(img, { aspectRatio: type==='cover'?16/9:1/1, viewMode:1, dragMode:'move', autoCropArea:1, restore:false, guides:true, center:true, highlight:true, cropBoxMovable:true, cropBoxResizable:true, background:false }); };
      document.getElementById('crop-save')?.addEventListener('click', async () => { if (!cropper) return; const c = cropper.getCroppedCanvas(); const du = c.toDataURL('image/jpeg',0.8); if (type==='avatar') { await updateDoc(doc(db,'users',auth.currentUser.uid),{avatar:du}); userData.avatar=du; } else { await updateDoc(doc(db,'users',auth.currentUser.uid),{coverPhoto:du}); userData.coverPhoto=du; } showToast('تم تحديث الصورة','success'); cropper.destroy(); modal.remove(); loadSettingsPage(); document.dispatchEvent(new CustomEvent('ui-update')); });
      document.getElementById('crop-cancel')?.addEventListener('click', () => { cropper?.destroy(); modal.remove(); });
    }; reader.readAsDataURL(file);
  });
}

// ========== عرض مستخدمين VIP ==========
export async function loadVipUsersList() {
  const section = $('#page-vip-users'); if (!section) return;
  const usersSnap = await getDocs(query(collection(db,'users'),where('role','in',['vip1','vip2','vip3','admin','super_mod','moderator'])));
  let html = '<h2><i class="fas fa-users"></i> المستخدمين المميزين</h2><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px;margin-top:16px;">';
  usersSnap.forEach(docSnap => { const u = docSnap.data(); const av = u.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name||'?')}&background=D4AF37&color=111&size=80`;
    html += `<div class="stat-card" style="cursor:pointer;display:flex;align-items:center;gap:12px;" data-uid="${u.uid}"><img src="${av}" style="width:45px;height:45px;border-radius:50%;border:2px solid var(--gold);"><div><strong>${u.name||'---'}</strong><div style="font-size:11px;color:var(--text-muted);">${getVipBadgeText(u.role)||'مستخدم'}</div></div></div>`; });
  html += '</div>'; section.innerHTML = html;
  section.querySelectorAll('.stat-card').forEach(card => { card.addEventListener('click', () => viewPublicProfile(card.dataset.uid)); });
}

// ========== تأثير كونفيتي ==========
export function showVipConfetti(message = 'مبروك!') {
  const overlay = document.createElement('div'); overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:10000;display:flex;align-items:center;justify-content:center;flex-direction:column;';
  const box = document.createElement('div'); box.style.cssText = 'background:var(--bg-secondary);border:2px solid var(--gold);border-radius:16px;padding:32px;text-align:center;max-width:400px;';
  box.innerHTML = `<div style="font-size:48px;"><i class="fas fa-gift"></i></div><h2 style="color:var(--gold);margin:16px 0;">تهانينا!</h2><p style="color:var(--text-primary);font-size:16px;">${message}</p><button id="vcf-close" class="btn-primary" style="margin-top:20px;">شكراً</button>`;
  overlay.appendChild(box);
  for (let i=0;i<50;i++) { const cf = document.createElement('div'); cf.style.cssText = `position:fixed;top:-10px;left:${Math.random()*100}%;width:10px;height:10px;background:var(--gold);opacity:0.8;z-index:10001;animation:cf ${Math.random()*3+2}s linear infinite;`; overlay.appendChild(cf); }
  if (!document.getElementById('cf-style')) { const st = document.createElement('style'); st.id = 'cf-style'; st.textContent = '@keyframes cf{0%{transform:translateY(-10px) rotate(0deg);opacity:1}100%{transform:translateY(100vh) rotate(720deg);opacity:0}}'; document.head.appendChild(st); }
  document.body.appendChild(overlay); document.getElementById('vcf-close')?.addEventListener('click', () => overlay.remove()); setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 5000);
}