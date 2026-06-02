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
  sendNotification, sendMassNotification, loadUserData
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
      <button id="edit-payment-method-btn" class="btn-primary"><i class="fas fa-credit-card"></i> الذهاب إلى أسعار VIP</button></div>` : ''}`;

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
    tbody.querySelectorAll('.block-user-admin-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const reason = prompt('سبب الحظر:');
        if (await showConfirm('حظر هذا المستخدم؟')) { await updateDoc(doc(db, 'users', btn.dataset.uid), { blocked: true, blockReason: reason || '' }); showToast('تم الحظر', 'success'); loadUsersPage(); }
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
  const expiry = new Date(); expiry.setDate(expiry.getDate() + expiryDays);
  updateDoc(doc(db, 'users', uid), { role: `vip${level}`, vipExpiry: Timestamp.fromDate(expiry) }).then(() => { showToast('تم تعيين VIP', 'success'); loadUsersPage(); });
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
  document.dispatchEvent(new CustomEvent('show-confetti', { detail: `تهانينا ${un}! VIP ${level}` }));
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
    tbody.querySelectorAll('.block-user-admin-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const reason = prompt('سبب الحظر:');
        if (await showConfirm('حظر هذا المستخدم؟')) { await updateDoc(doc(db, 'users', btn.dataset.uid), { blocked: true, blockReason: reason || '' }); showToast('تم الحظر', 'success'); loadUsersPage(); }
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
  const expiry = new Date(); expiry.setDate(expiry.getDate() + expiryDays);
  updateDoc(doc(db, 'users', uid), { role: `vip${level}`, vipExpiry: Timestamp.fromDate(expiry) }).then(() => { showToast('تم تعيين VIP', 'success'); loadUsersPage(); });
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
  document.dispatchEvent(new CustomEvent('show-confetti', { detail: `تهانينا ${un}! VIP ${level}` }));
  loadVipRequestsAdmin();
}

async function rejectVipRequest(rid, uid) {
  const reason = prompt('سبب الرفض (اختياري):');
  if (!(await showConfirm('رفض الطلب؟'))) return;
  await updateDoc(doc(db, 'vipRequests', rid), { status: 'rejected', reason: reason || '' });
  if (reason) await sendNotification(uid, `طلب ترقية VIP مرفوض. السبب: ${reason}`, 'vip_rejected');
  else await sendNotification(uid, 'طلب ترقية VIP مرفوض.', 'vip_rejected');
  showToast('تم رفض الطلب', 'info'); loadVipRequestsAdmin();
}