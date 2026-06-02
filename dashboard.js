/*
 | HAINON © 2026 جميع الحقوق محفوظة
 | لا يُسمح بنسخ أو توزيع أو استخدام هذا الملف أو أي جزء من الكود دون إذن كتابي صريح.
 | هذا الملف جزء من نظام HAINON المحاسبي.
*/

// dashboard.js (1/3) — العمليات المالية: Dashboard، إضافة/تعديل/حذف، أرشفة، ديون
import { auth, db } from './firebase-config.js';
import {
  collection, addDoc, doc, getDoc, getDocs, query, where, orderBy,
  onSnapshot, serverTimestamp, updateDoc, deleteDoc, limit, Timestamp, setDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  $, $$, showToast, showConfirm, formatCurrency, getTypeLabel, escapeHtml,
  getVipAvatarClass, getVipNameClass, getVipFrameClass, sendEmailCode,
  getUserLocation, getDeviceInfo, formatDateEn, formatTimeEn, formatDateTimeEn, getDayNameEn,
  calculateLevel, getLevelInfo, getAutoVipLevel, getVipGlowStyle, getVipBadgeText, WRITE_BAR_COLORS
} from './utils.js';
import { changePassword, updateAvatar, updateCover } from './auth.js';

// ========== المتغيرات العامة ==========
export let currentUser = null;
export let userData = null;
export let isAdmin = false, isSuperMod = false, isMod = false, isVip = false, vipLevel = 0;
export let state = {};

// ---------- تحميل بيانات المستخدم ----------
export async function loadUserData() {
  if (!auth.currentUser) return false;
  currentUser = auth.currentUser;
  try {
    const d = await getDoc(doc(db, 'users', currentUser.uid));
    if (d.exists()) {
      userData = d.data();
      isAdmin = userData.role === 'admin';
      isSuperMod = userData.role === 'super_mod';
      isMod = userData.role === 'moderator';
      isVip = userData.role?.startsWith('vip');
      vipLevel = isVip ? parseInt(userData.role.replace('vip','')) || 0 : 0;
      if (!userData.transactionCount) userData.transactionCount = 0;
      if (!userData.accountLevel && userData.accountLevel !== 0) userData.accountLevel = 0;

      if (isVip && userData.vipExpiry && userData.vipExpiry.toDate() < new Date()) {
        await updateDoc(doc(db, 'users', currentUser.uid), { role: 'user' });
        userData.role = 'user';
        isVip = false;
        vipLevel = 0;
      }
      return true;
    }
  } catch (e) { console.error(e); }
  return false;
}

// ---------- حساب الصافي النقدي ----------
export function calculateNet(txs, cur = 'USD') {
  let inc = 0, out = 0, sale = 0, pur = 0, debtRcv = 0, debtPaid = 0, ret = 0;
  txs.forEach(t => {
    if (t.currency !== cur) return;
    const a = parseFloat(t.amount) || 0;
    if (t.type === 'incoming') inc += a;
    else if (t.type === 'outgoing') out += a;
    else if (t.type === 'sale') sale += a;
    else if (t.type === 'purchase') pur += a;
    else if (t.type === 'debt_received') debtRcv += a;
    else if (t.type === 'debt_paid') debtPaid += a;
    else if (t.type === 'returned') ret += a;
  });
  return (inc + sale + debtRcv) - (out + pur + debtPaid + ret);
}

// ---------- حساب الأرباح والخسائر (متوسط التكلفة المرجح) ----------
export function calculateProfitLossAccurate(txs, cur = 'USD') {
  const inventory = new Map();
  let totalProfit = 0;
  const filtered = txs.filter(t => t.currency === cur && t.productName);
  filtered.sort((a, b) => {
    const da = a.createdAt?.toDate?.() || new Date(0);
    const db = b.createdAt?.toDate?.() || new Date(0);
    return da - db;
  });
  for (const t of filtered) {
    const name = t.productName;
    if (!inventory.has(name)) inventory.set(name, { qty: 0, totalCost: 0 });
    const prod = inventory.get(name);
    const amount = parseFloat(t.amount) || 0;
    const qty = t.quantity || 1;
    if (t.type === 'purchase') {
      prod.qty += qty;
      prod.totalCost += amount;
    } else if (t.type === 'sale') {
      if (prod.qty >= qty) {
        const avgCost = prod.totalCost / prod.qty;
        const cogs = avgCost * qty;
        totalProfit += (amount - cogs);
        prod.qty -= qty;
        prod.totalCost -= cogs;
      } else {
        totalProfit += amount;
      }
    } else if (t.type === 'returned') {
      const avgCost = prod.qty > 0 ? prod.totalCost / prod.qty : amount / qty;
      prod.qty += qty;
      prod.totalCost += avgCost * qty;
    }
  }
  return totalProfit;
}

// ========== الصفحة الرئيسية (Dashboard) ==========
export function loadDashboardPage() {
  const section = $('#page-dashboard');
  if (!section) return;
  const q = query(
    collection(db, 'transactions'),
    where('uid', '==', currentUser.uid),
    orderBy('createdAt', 'desc')
  );

  onSnapshot(q, (snapshot) => {
    const allTx = [];
    snapshot.forEach(doc => allTx.push({ id: doc.id, ...doc.data() }));
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayTx = allTx.filter(t => t.createdAt && t.createdAt.toDate() >= todayStart);

    const stats = [
      { icon: 'fa-download', label: 'وارد', type: 'incoming', usd: 0, syp: 0 },
      { icon: 'fa-upload', label: 'صادر', type: 'outgoing', usd: 0, syp: 0 },
      { icon: 'fa-tag', label: 'بيع', type: 'sale', usd: 0, syp: 0 },
      { icon: 'fa-shopping-cart', label: 'شراء', type: 'purchase', usd: 0, syp: 0 },
      { icon: 'fa-hand-holding-usd', label: 'دين لنا', type: 'debt_in', usd: 0, syp: 0 },
      { icon: 'fa-hand-holding-usd', label: 'دين علينا', type: 'debt_out', usd: 0, syp: 0 },
      { icon: 'fa-check-circle', label: 'دين مقبوض', type: 'debt_received', usd: 0, syp: 0 },
      { icon: 'fa-times-circle', label: 'دين مدفوع', type: 'debt_paid', usd: 0, syp: 0 }
    ];

    allTx.forEach(t => {
      const cur = t.currency;
      const a = parseFloat(t.amount) || 0;
      const st = stats.find(s => s.type === t.type);
      if (st) {
        if (cur === 'USD') st.usd += a;
        else st.syp += a;
      }
    });

    const returnedTx = allTx.filter(t => t.type === 'returned');
    let retUsd = 0, retSyp = 0;
    returnedTx.forEach(t => {
      const a = parseFloat(t.amount) || 0;
      if (t.currency === 'USD') retUsd += a;
      else retSyp += a;
    });

    const usdNet = calculateNet(allTx, 'USD');
    const sypNet = calculateNet(allTx, 'SYP');
    const profit = (vipLevel >= 2 || isAdmin || isMod || isSuperMod) ? calculateProfitLossAccurate(allTx, 'USD') : null;
    const vipClass = vipLevel > 0 ? ' vip-card' : '';

    section.innerHTML = `
      <div class="stats-grid">
        ${stats.map(s => `
          <div class="stat-card stat-net ${vipClass}" data-type="${s.type}">
            <div class="stat-icon"><i class="fas ${s.icon}"></i></div>
            <div class="stat-value"><div>${formatCurrency(s.usd)}</div><div><small>${formatCurrency(s.syp, 'SYP')}</small></div></div>
            <div class="stat-label">${s.label}</div>
          </div>
        `).join('')}
        <div class="stat-card stat-net no-click ${vipClass}" style="grid-column: span 2;">
          <div class="stat-icon"><i class="fas fa-undo-alt"></i></div>
          <div class="stat-value"><div>${formatCurrency(retUsd)}</div><div><small>${formatCurrency(retSyp, 'SYP')}</small></div></div>
          <div class="stat-label">مرتجع</div>
        </div>
        <div class="stat-card stat-net no-click ${vipClass}" style="grid-column: span 2;">
          <div class="stat-icon"><i class="fas fa-coins"></i></div>
          <div class="stat-value"><div>${formatCurrency(usdNet)}</div><div><small>${formatCurrency(sypNet, 'SYP')}</small></div></div>
          <div class="stat-label">إجمالي الرصيد</div>
        </div>
        ${profit !== null ? `
        <div class="stat-card stat-net no-click ${vipClass}" style="grid-column: span 2;">
          <div class="stat-icon"><i class="fas fa-chart-line"></i></div>
          <div class="stat-value" style="color:${profit >= 0 ? 'var(--green)' : 'var(--red)'};">${formatCurrency(profit)}</div>
          <div class="stat-label">الأرباح / الخسائر</div>
        </div>` : ''}
      </div>
      <div class="accordion open" id="accordion-add">
        <div class="accordion-header"><span><i class="fas fa-plus-circle"></i> إضافة عملية جديدة</span></div>
        <div class="accordion-body"><div class="accordion-inner">
          <form id="transaction-form">
            <div class="form-row">
              <input type="text" id="trans-product" placeholder="اسم العملية (المنتج)" required>
              <input type="number" id="trans-quantity" placeholder="الكمية" min="1" value="1" style="display:none;">
            </div>
            <div class="form-row">
              <input type="number" id="trans-amount" placeholder="إدخال القيمة" step="0.01" required>
              <select id="trans-currency"><option value="USD">USD</option><option value="SYP">SYP</option></select>
            </div>
            <div class="form-row">
              <select id="trans-type" required>
                <option value="">-- نوع العملية --</option>
                <option value="incoming">وارد</option><option value="outgoing">صادر</option>
                <option value="sale">بيع</option><option value="purchase">شراء</option>
                <option value="debt_in">دين لنا</option><option value="debt_out">دين علينا</option>
                <option value="debt_received">دين مقبوض</option><option value="debt_paid">دين مدفوع</option>
                <option value="returned">مرتجع</option>
              </select>
            </div>
            <button type="submit" class="btn-primary" style="width:100%;"><i class="fas fa-save"></i> تأكيد العملية</button>
          </form>
        </div></div>
      </div>
      <h3 style="margin:16px 0 8px;"><i class="fas fa-list"></i> عمليات اليوم</h3>
      <div class="table-container">
        <table><thead><tr><th>النوع</th><th>المنتج</th><th>الكمية</th><th>المبلغ</th><th>العملة</th><th>التاريخ</th><th>الوقت</th><th>تعديل</th><th>حذف</th></tr></thead>
        <tbody id="today-tbody">${todayTx.length === 0 ? '<tr><td colspan="9">لا توجد عمليات</td></tr>' : ''}</tbody></table>
      </div>
    `;

    if (todayTx.length > 0) {
      const tbody = $('#today-tbody');
      tbody.innerHTML = '';
      todayTx.forEach(t => {
        const row = document.createElement('tr');
        const hasHistory = t.history?.length > 0;
        const createdDate = t.createdAt?.toDate() || new Date();
        row.innerHTML = `
          <td>${getTypeLabel(t.type)}</td><td>${t.productName || '---'}</td><td>${t.quantity || 1}</td>
          <td><div class="history-arrows">
            ${hasHistory ? `<button class="arrow-btn" data-dir="prev" data-id="${t.id}"><i class="fas fa-chevron-left"></i></button>` : ''}
            <span>${formatCurrency(t.amount, t.currency)}</span>
            ${hasHistory ? `<button class="arrow-btn" data-dir="next" data-id="${t.id}"><i class="fas fa-chevron-right"></i></button>` : ''}
          </div></td>
          <td>${t.currency}</td><td>${formatDateEn(createdDate)}</td><td>${formatTimeEn(createdDate)}</td>
          <td><button class="btn-outline btn-sm edit-trans-btn" data-id="${t.id}"><i class="fas fa-edit"></i></button></td>
          <td><button class="btn-outline btn-sm delete-trans-btn" data-id="${t.id}" style="color:var(--red);border-color:var(--red);"><i class="fas fa-trash"></i></button></td>
        `;
        tbody.appendChild(row);
      });
    }

    section.querySelectorAll('.stat-card[data-type]').forEach(card => {
      card.addEventListener('click', () => {
        sessionStorage.setItem('filterType', card.dataset.type);
        document.dispatchEvent(new CustomEvent('navigate', { detail: 'transactions' }));
      });
    });
    section.querySelectorAll('.arrow-btn').forEach(btn => {
      btn.addEventListener('click', () => handleHistoryArrow(btn.dataset.id, btn.dataset.dir, btn));
    });
    section.querySelectorAll('.edit-trans-btn').forEach(btn => btn.addEventListener('click', () => editTransaction(btn.dataset.id)));
    section.querySelectorAll('.delete-trans-btn').forEach(btn => btn.addEventListener('click', () => deleteTransaction(btn.dataset.id)));
    setupTransactionForm();
  });
}

function setupTransactionForm() {
  const typeSelect = $('#trans-type');
  const qtyInput = $('#trans-quantity');
  const amountInput = $('#trans-amount');
  if (!typeSelect) return;
  typeSelect.addEventListener('change', () => {
    const needsQty = ['sale', 'purchase', 'returned'].includes(typeSelect.value);
    if (qtyInput) qtyInput.style.display = needsQty ? 'block' : 'none';
    if (amountInput) amountInput.placeholder = needsQty ? 'سعر القطعة الواحدة' : 'إدخال القيمة';
  });
  $('#transaction-form')?.addEventListener('submit', handleAddTransaction);
}

async function getAvailableQuantity(productName, currency) {
  const q = query(collection(db, 'transactions'),
    where('uid', '==', currentUser.uid),
    where('productName', '==', productName),
    where('currency', '==', currency)
  );
  const snapshot = await getDocs(q);
  let purchased = 0, sold = 0, returned = 0;
  snapshot.forEach(doc => {
    const t = doc.data();
    const qty = t.quantity || 1;
    if (t.type === 'purchase') purchased += qty;
    else if (t.type === 'sale') sold += qty;
    else if (t.type === 'returned') returned += qty;
  });
  return purchased + returned - sold;
}

async function handleAddTransaction(e) {
  e.preventDefault();
  const productName = $('#trans-product')?.value.trim();
  const type = $('#trans-type')?.value;
  const amount = parseFloat($('#trans-amount')?.value);
  const currency = $('#trans-currency')?.value;
  let quantity = parseInt($('#trans-quantity')?.value) || 1;

  if (!productName || !type || !amount || amount <= 0) return showToast('جميع الحقول مطلوبة', 'error');
  if (type === 'sale') {
    const available = await getAvailableQuantity(productName, currency);
    if (quantity > available) return showToast(`الكمية غير متاحة. المتاح: ${available}`, 'error');
  }

  await addDoc(collection(db, 'transactions'), {
    uid: currentUser.uid, productName, type, amount, currency,
    quantity: ['sale', 'purchase', 'returned'].includes(type) ? quantity : 1,
    note: '', createdAt: serverTimestamp(), updatedAt: null, history: []
  });

  // تحديث عدد العمليات
  const userRef = doc(db, 'users', currentUser.uid);
  const newCount = (userData.transactionCount || 0) + 1;
  const newLevel = calculateLevel(newCount);
  await updateDoc(userRef, { transactionCount: newCount, accountLevel: newLevel });
  userData.transactionCount = newCount;
  userData.accountLevel = newLevel;

  showToast('تمت العملية بنجاح', 'success');
  $('#transaction-form')?.reset();
  const qtyInput = $('#trans-quantity');
  const amountInput = $('#trans-amount');
  if (qtyInput) qtyInput.style.display = 'none';
  if (amountInput) amountInput.placeholder = 'إدخال القيمة';
}

export async function editTransaction(transId) {
  const docRef = doc(db, 'transactions', transId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return;
  const t = snap.data();
  const newAmount = prompt('المبلغ الجديد:', t.amount);
  if (!newAmount || parseFloat(newAmount) <= 0) return;
  const newType = prompt('نوع العملية (اتركه فارغاً للتخطي):', t.type);
  const finalType = newType || t.type;
  const historyEntry = { amount: t.amount, type: t.type, updatedAt: t.updatedAt || t.createdAt };
  const history = t.history || [];
  history.push(historyEntry);
  await updateDoc(docRef, { amount: parseFloat(newAmount), type: finalType, updatedAt: serverTimestamp(), history });
  showToast('تم تعديل العملية', 'success');
}

export async function deleteTransaction(transId) {
  const confirmed = await showConfirm('حذف هذه العملية؟');
  if (!confirmed) return;
  await deleteDoc(doc(db, 'transactions', transId));
  showToast('تم الحذف', 'success');
}

export async function archiveDailyTransactions() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const q = query(
    collection(db, 'transactions'),
    where('uid', '==', currentUser.uid),
    where('createdAt', '>=', yesterdayStart),
    where('createdAt', '<', todayStart)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return;
  const txData = [];
  snapshot.forEach(doc => txData.push({ id: doc.id, ...doc.data() }));
  const archiveName = `${getDayNameEn(yesterdayStart)} ${formatDateEn(yesterdayStart)}`;
  await addDoc(collection(db, 'archives'), {
    uid: currentUser.uid, name: archiveName, date: yesterdayStart,
    type: 'daily', transactions: txData, createdAt: serverTimestamp()
  });
  for (const tx of txData) await deleteDoc(doc(db, 'transactions', tx.id));
}

const historyIndexes = {};
function handleHistoryArrow(transId, dir, btn) {
  const span = btn.parentElement.querySelector('span');
  getDoc(doc(db, 'transactions', transId)).then(snap => {
    if (!snap.exists()) return;
    const t = snap.data();
    const fullHistory = [{ amount: t.amount, type: t.type, updatedAt: t.updatedAt || t.createdAt }, ...(t.history||[])];
    if (!historyIndexes[transId]) historyIndexes[transId] = 0;
    let idx = historyIndexes[transId];
    if (dir === 'prev' && idx > 0) idx--;
    else if (dir === 'next' && idx < fullHistory.length - 1) idx++;
    else return;
    historyIndexes[transId] = idx;
    span.textContent = formatCurrency(fullHistory[idx].amount, t.currency);
    const arrows = btn.parentElement.querySelectorAll('.arrow-btn');
    if (arrows[0]) arrows[0].disabled = idx === 0;
    if (arrows[1]) arrows[1].disabled = idx === fullHistory.length - 1;
  });
}

// ========== صفحة العمليات المؤرشفة ==========
export function loadTransactionsPage() {
  const section = $('#page-transactions');
  if (!section) return;
  const filterType = sessionStorage.getItem('filterType') || '';
  sessionStorage.removeItem('filterType');
  section.innerHTML = `<h2><i class="fas fa-exchange-alt"></i> العمليات المؤرشفة</h2><div id="archives-list"></div><div id="archive-detail" class="hidden"></div>`;
  const q = query(collection(db, 'archives'), where('uid', '==', currentUser.uid), orderBy('date', 'desc'));
  onSnapshot(q, (snapshot) => {
    const list = $('#archives-list');
    if (!list) return;
    if (snapshot.empty) { list.innerHTML = '<p style="text-align:center;color:var(--text-muted);">لا توجد عمليات مؤرشفة</p>'; return; }
    list.innerHTML = '';
    snapshot.forEach(doc => {
      const archive = doc.data();
      const div = document.createElement('div');
      div.className = 'stat-card';
      div.style.cssText = 'cursor:pointer;margin-bottom:8px;';
      div.innerHTML = `<div style="display:flex;align-items:center;gap:12px;"><span style="font-size:24px;"><i class="fas fa-folder"></i></span><div><div style="font-weight:700;">${archive.name}</div><div style="font-size:11px;">${archive.transactions?.length||0} عملية</div></div></div>`;
      div.addEventListener('click', () => showArchiveDetail(archive, doc.id, filterType));
      list.appendChild(div);
    });
  });
}

function showArchiveDetail(archive, archiveId, filterType) {
  const detail = $('#archive-detail');
  const list = $('#archives-list');
  if (!detail || !list) return;
  list.classList.add('hidden');
  detail.classList.remove('hidden');
  let txs = archive.transactions || [];
  if (filterType) txs = txs.filter(t => t.type === filterType);
  detail.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
      <button class="btn-outline btn-sm" id="back-to-archives"><i class="fas fa-arrow-left"></i> عودة</button>
      <h3 style="margin:0;">${archive.name}</h3>
    </div>
    <div class="table-container"><table><thead><tr><th>النوع</th><th>المنتج</th><th>الكمية</th><th>المبلغ</th><th>العملة</th><th>تعديل</th><th>حذف</th></tr></thead>
    <tbody>${txs.length === 0 ? '<tr><td colspan="7">لا توجد عمليات</td></tr>' : txs.map(t => `
      <tr><td>${getTypeLabel(t.type)}</td><td>${t.productName||'---'}</td><td>${t.quantity||1}</td>
      <td>${formatCurrency(t.amount, t.currency)}</td><td>${t.currency}</td>
      <td><button class="btn-outline btn-sm edit-archive-btn" data-archive="${archiveId}" data-txid="${t.id}"><i class="fas fa-edit"></i></button></td>
      <td><button class="btn-outline btn-sm delete-archive-btn" data-archive="${archiveId}" data-txid="${t.id}" style="color:var(--red);border-color:var(--red);"><i class="fas fa-trash"></i></button></td>
    </tr>`).join('')}</tbody></table></div>
  `;
  $('#back-to-archives')?.addEventListener('click', () => { detail.classList.add('hidden'); list.classList.remove('hidden'); });
}

// ========== صفحة الديون ==========
export function loadDebtsPage() {
  const section = $('#page-debts');
  if (!section) return;
  section.innerHTML = `<h2><i class="fas fa-hand-holding-usd"></i> الديون</h2><div id="debts-archives-list"></div><div id="debts-detail" class="hidden"></div>`;
  const list = $('#debts-archives-list');
  if (!list) return;
  const allBtn = document.createElement('div');
  allBtn.className = 'stat-card';
  allBtn.style.cssText = 'cursor:pointer;margin-bottom:8px;';
  allBtn.innerHTML = `<div style="display:flex;align-items:center;gap:12px;"><span style="font-size:24px;"><i class="fas fa-folder-open"></i></span><div><div style="font-weight:700;">كل الديون</div><div style="font-size:11px;">جميع سجلات الديون</div></div></div>`;
  allBtn.addEventListener('click', () => showAllDebts());
  list.appendChild(allBtn);

  const q = query(collection(db, 'archives'), where('uid', '==', currentUser.uid), orderBy('date', 'desc'));
  onSnapshot(q, (snapshot) => {
    while (list.children.length > 1) list.removeChild(list.lastChild);
    snapshot.forEach(doc => {
      const archive = doc.data();
      const hasDebts = archive.transactions?.some(t => ['debt_in','debt_out','debt_received','debt_paid'].includes(t.type));
      if (!hasDebts) return;
      const div = document.createElement('div');
      div.className = 'stat-card';
      div.style.cssText = 'cursor:pointer;margin-bottom:8px;';
      div.innerHTML = `<div style="display:flex;align-items:center;gap:12px;"><span style="font-size:24px;"><i class="fas fa-folder"></i></span><div><div style="font-weight:700;">${archive.name}</div><div style="font-size:11px;">ديون</div></div></div>`;
      div.addEventListener('click', () => showArchiveDebts(archive));
      list.appendChild(div);
    });
  });
}

function showAllDebts() {
  const detail = $('#debts-detail'), list = $('#debts-archives-list');
  if (!detail || !list) return;
  list.classList.add('hidden'); detail.classList.remove('hidden');
  detail.innerHTML = `<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;"><button class="btn-outline btn-sm" id="back-to-debts"><i class="fas fa-arrow-left"></i> عودة</button><h3>كل الديون</h3></div><div id="all-debts-content">⏳ جاري التحميل...</div>`;
  $('#back-to-debts')?.addEventListener('click', () => { detail.classList.add('hidden'); list.classList.remove('hidden'); });
  const q = query(collection(db, 'transactions'), where('uid', '==', currentUser.uid), orderBy('createdAt', 'desc'));
  onSnapshot(q, (snapshot) => {
    const txs = [];
    snapshot.forEach(doc => txs.push(doc.data()));
    const debts = txs.filter(t => ['debt_in','debt_out','debt_received','debt_paid'].includes(t.type));
    const tables = [
      { title:'<i class="fas fa-hand-holding-usd"></i> دين لنا', type:'debt_in' },
      { title:'<i class="fas fa-hand-holding-usd"></i> دين علينا', type:'debt_out' },
      { title:'<i class="fas fa-check-circle"></i> دين مقبوض', type:'debt_received' },
      { title:'<i class="fas fa-times-circle"></i> دين مدفوع', type:'debt_paid' }
    ];
    let html = '';
    tables.forEach(tb => {
      const filtered = debts.filter(t => t.type === tb.type);
      html += `<h4 style="margin:12px 0 8px;color:var(--gold);">${tb.title} (${filtered.length})</h4>
      <div class="table-container"><table><thead><tr><th>المنتج</th><th>المبلغ</th><th>العملة</th><th>التاريخ</th></tr></thead><tbody>
      ${filtered.length === 0 ? '<tr><td colspan="4">لا توجد</td></tr>' : filtered.map(t => `<tr><td>${t.productName||'---'}</td><td>${formatCurrency(t.amount, t.currency)}</td><td>${t.currency}</td><td>${t.createdAt ? formatDateEn(t.createdAt.toDate()) : ''}</td></tr>`).join('')}
      </tbody></table></div>`;
    });
    const content = $('#all-debts-content');
    if (content) content.innerHTML = html;
  });
}

function showArchiveDebts(archive) {
  const detail = $('#debts-detail'), list = $('#debts-archives-list');
  if (!detail || !list) return;
  list.classList.add('hidden'); detail.classList.remove('hidden');
  const debts = archive.transactions?.filter(t => ['debt_in','debt_out','debt_received','debt_paid'].includes(t.type)) || [];
  detail.innerHTML = `<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;"><button class="btn-outline btn-sm" id="back-to-debts-list"><i class="fas fa-arrow-left"></i> عودة</button><h3>${archive.name}</h3></div>
  <div class="table-container"><table><thead><tr><th>النوع</th><th>المنتج</th><th>المبلغ</th><th>العملة</th></tr></thead><tbody>
  ${debts.length === 0 ? '<tr><td colspan="4">لا توجد ديون</td></tr>' : debts.map(t => `<tr><td>${getTypeLabel(t.type)}</td><td>${t.productName||'---'}</td><td>${formatCurrency(t.amount, t.currency)}</td><td>${t.currency}</td></tr>`).join('')}
  </tbody></table></div>`;
  $('#back-to-debts-list')?.addEventListener('click', () => { detail.classList.add('hidden'); list.classList.remove('hidden'); });
}// ... تابع dashboard.js (الجزء 2/3) — التقارير، نظام VIP، الأسعار، الدفع

// ========== صفحة التقارير ==========
export function loadReportsPage() {
  const section = $('#page-reports');
  if (!section) return;
  const now = new Date();
  section.innerHTML = `
    <h2><i class="fas fa-file-invoice"></i> التقارير المالية</h2>
    <div class="form-row">
      <div class="input-group"><label><i class="fas fa-calendar-alt"></i> من تاريخ</label><input type="date" id="report-from-date"></div>
      <div class="input-group"><label><i class="fas fa-calendar-alt"></i> إلى تاريخ</label><input type="date" id="report-to-date" value="${now.toISOString().split('T')[0]}"></div>
    </div>
    <div class="form-row">
      <div class="input-group"><label><i class="fas fa-filter"></i> نوع العملية</label>
        <select id="report-type-select">
          <option value="all">كل العمليات</option>
          <option value="incoming">وارد</option><option value="outgoing">صادر</option><option value="sale">بيع</option><option value="purchase">شراء</option>
          <option value="debt_in">دين لنا</option><option value="debt_out">دين علينا</option><option value="debt_received">دين مقبوض</option><option value="debt_paid">دين مدفوع</option><option value="returned">مرتجع</option>
        </select>
      </div>
    </div>
    <div style="display:flex;gap:10px;margin:16px 0;">
      <button id="generate-report-btn" class="btn-primary"><i class="fas fa-file-alt"></i> إنشاء التقرير</button>
      ${(vipLevel >= 3 || isAdmin || isSuperMod) ? `<button id="watermark-toggle-btn" class="btn-outline"><i class="fas fa-stamp"></i> إعدادات العلامة المائية</button>` : ''}
    </div>
    <div id="report-output" class="hidden" style="margin-top:20px;"></div>
  `;

  const qFirst = query(collection(db, 'transactions'), where('uid', '==', currentUser.uid), orderBy('createdAt', 'asc'));
  getDocs(qFirst).then(snap => {
    if (!snap.empty) {
      const firstDate = snap.docs[0].data().createdAt?.toDate();
      const fromInput = $('#report-from-date');
      if (firstDate && fromInput) fromInput.min = firstDate.toISOString().split('T')[0];
    }
  });

  $('#generate-report-btn')?.addEventListener('click', () => generateReport());
  if (vipLevel >= 3 || isAdmin || isSuperMod) {
    $('#watermark-toggle-btn')?.addEventListener('click', () => {
      const showWM = confirm('هل تريد إزالة العلامة المائية من التقرير؟');
      sessionStorage.setItem('reportNoWatermark', showWM ? 'true' : 'false');
      showToast(showWM ? 'تم إخفاء العلامة المائية' : 'ستظهر العلامة المائية', 'info');
    });
  }
}

function generateReport() {
  const fromDate = $('#report-from-date')?.value ? new Date($('#report-from-date').value) : null;
  const toDate = $('#report-to-date')?.value ? new Date($('#report-to-date').value + 'T23:59:59') : null;
  const typeSelect = $('#report-type-select')?.value;
  if (!fromDate || !toDate) return showToast('حدد التاريخين', 'error');

  const q = query(
    collection(db, 'transactions'),
    where('uid', '==', currentUser.uid),
    where('createdAt', '>=', fromDate),
    where('createdAt', '<=', toDate),
    orderBy('createdAt', 'desc')
  );

  onSnapshot(q, (snapshot) => {
    const txs = [];
    snapshot.forEach(doc => txs.push(doc.data()));
    let filtered = txs;
    if (typeSelect !== 'all') filtered = txs.filter(t => t.type === typeSelect);

    const output = $('#report-output');
    if (!output) return;
    output.classList.remove('hidden');
    const noWatermark = sessionStorage.getItem('reportNoWatermark') === 'true';
    const profit = (vipLevel >= 2 || isAdmin || isMod || isSuperMod) ? calculateProfitLossAccurate(filtered, 'USD') : null;

    output.innerHTML = `
      <div style="position:relative;padding:20px;background:var(--bg-card);border-radius:var(--radius-md);border:1px solid var(--border);">
        ${(!noWatermark && (vipLevel >= 1 || isAdmin)) ? '<div style="text-align:center;opacity:0.05;font-size:60px;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:0;">HAINON</div>' : ''}
        <h4>تقرير من ${formatDateEn(fromDate)} إلى ${formatDateEn(toDate)}</h4>
        ${profit !== null ? `<p style="color:var(--gold);">الربح/الخسارة: ${formatCurrency(profit)}</p>` : ''}
        <div class="table-container" style="margin-top:12px;">
          <table><thead><tr><th>النوع</th><th>المنتج</th><th>المبلغ</th><th>العملة</th><th>التاريخ</th></tr></thead>
          <tbody>${filtered.length === 0 ? '<tr><td colspan="5">لا توجد عمليات</td></tr>' : filtered.map(t => `
            <tr><td>${getTypeLabel(t.type)}</td><td>${t.productName||'---'}</td><td>${formatCurrency(t.amount, t.currency)}</td><td>${t.currency}</td><td>${t.createdAt ? formatDateEn(t.createdAt.toDate()) : ''}</td></tr>
          `).join('')}</tbody></table>
        </div>
      </div>
    `;
  });
}

// ========== نظام إرسال الإشعارات ==========
export async function sendNotification(targetUid, message, type, link = '') {
  try {
    await addDoc(collection(db, 'notifications'), {
      uid: targetUid, message, type, link,
      read: false, createdAt: serverTimestamp()
    });
  } catch (e) { console.error('فشل إرسال الإشعار:', e); }
}

export async function sendMassNotification(text) {
  if (!isAdmin && !isMod && !isSuperMod) return showToast('غير مصرح', 'error');
  const usersSnap = await getDocs(collection(db, 'users'));
  for (const userDoc of usersSnap.docs) {
    await sendNotification(userDoc.id, text, 'admin_message', '');
  }
  showToast('تم إرسال الإشعار لجميع المستخدمين', 'success');
}

// ========== قسم طلبات VIP ==========
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
}

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
        <div class="stat-value" style="color:var(--vip1-color);">5$</div>
        <p style="font-size:12px;">شهرياً</p>
        <button class="btn-primary select-vip-btn" data-level="1" style="margin-top:12px;width:100%;">اختيار</button>
      </div>
      <div class="stat-card" style="text-align:center;padding:24px;border-color:var(--vip2-color);">
        <div class="stat-icon"><i class="fas fa-star" style="color:var(--vip2-color);"></i></div>
        <h3 style="color:var(--vip2-color);">VIP 2</h3>
        <div class="stat-value" style="color:var(--vip2-color);">15$</div>
        <p style="font-size:12px;">شهرياً</p>
        <button class="btn-primary select-vip-btn" data-level="2" style="margin-top:12px;width:100%;">اختيار</button>
      </div>
      <div class="stat-card" style="text-align:center;padding:24px;border-color:var(--vip3-color);">
        <div class="stat-icon"><i class="fas fa-star" style="color:var(--vip3-color);"></i></div>
        <h3 style="color:var(--vip3-color);">VIP 3</h3>
        <div class="stat-value" style="color:var(--vip3-color);">35$</div>
        <p style="font-size:12px;">شهرياً</p>
        <button class="btn-primary select-vip-btn" data-level="3" style="margin-top:12px;width:100%;">اختيار</button>
      </div>
    </div>
  `;
  section.querySelectorAll('.select-vip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      sessionStorage.setItem('selectedVipLevel', btn.dataset.level);
      document.dispatchEvent(new CustomEvent('navigate', { detail: 'vip-payment' }));
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

// ========== صفحة إعدادات طلب VIP (للأدمن) ==========
export function loadVipRequestSettingsPage() {
  const section = $('#page-vip-request-settings');
  if (!section) return;
  section.innerHTML = `
    <h2><i class="fas fa-cogs"></i> إعدادات طلب VIP</h2>
    <div class="form-full">
      <label>تعليمات الدفع</label>
      <textarea id="vip-instructions" rows="4" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-tertiary);color:var(--text-primary);resize:vertical;"></textarea>
    </div>
    <div class="form-full">
      <label>رقم الحوالة (للمستخدمين)</label>
      <input type="text" id="vip-transfer-number" placeholder="مثال: 0999999999">
    </div>
    <div class="form-full">
      <label>صورة باركود QR</label>
      <input type="file" id="vip-qr-upload" accept="image/*">
      <img id="vip-qr-preview" src="" style="max-width:200px;margin-top:10px;border:2px solid var(--gold);border-radius:8px;" class="hidden">
    </div>
    <button id="save-vip-settings-btn" class="btn-primary"><i class="fas fa-save"></i> حفظ الإعدادات</button>
  `;

  getDoc(doc(db, 'settings', 'payment')).then(snap => {
    if (snap.exists()) {
      const data = snap.data();
      const inst = $('#vip-instructions');
      const trans = $('#vip-transfer-number');
      if (inst) inst.value = data.instructions || '';
      if (trans) trans.value = data.transferNumber || '';
      if (data.qrCodeUrl) {
        const preview = $('#vip-qr-preview');
        if (preview) { preview.src = data.qrCodeUrl; preview.classList.remove('hidden'); }
      }
    }
  });

  $('#vip-qr-upload')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const preview = $('#vip-qr-preview');
      if (preview) { preview.src = ev.target.result; preview.classList.remove('hidden'); }
    };
    reader.readAsDataURL(file);
  });

  $('#save-vip-settings-btn')?.addEventListener('click', async () => {
    const instructions = $('#vip-instructions')?.value.trim() || '';
    const transferNumber = $('#vip-transfer-number')?.value.trim() || '';
    const qrImage = $('#vip-qr-preview')?.src || '';
    await setDoc(doc(db, 'settings', 'payment'), { instructions, transferNumber, qrCodeUrl: qrImage }, { merge: true });
    showToast('تم حفظ الإعدادات', 'success');
  });
}// ... تابع dashboard.js (الجزء 3/3) — خدمة العملاء، إدارة المستخدمين، الإعدادات، الملف الشخصي

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
}

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
  usersSnapshot.forEach(docSnap => allUsers.push(docSnap.data()));

  function renderUsers(filter = '') {
    const tbody = $('#users-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const filtered = filter ? allUsers.filter(u =>
      (u.name || '').toLowerCase().includes(filter.toLowerCase()) ||
      (u.serialId || '').toLowerCase().includes(filter.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(filter.toLowerCase())
    ) : allUsers;

    if (filtered.length === 0) { tbody.innerHTML = '<tr><td colspan="12">لا توجد نتائج</td></tr>'; return; }

    filtered.forEach(u => {
      const avatarUrl = u.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name||'?')}&background=D4AF37&color=111&size=60`;
      let roleBadge = getVipBadgeText(u.role) || '<i class="fas fa-user"></i> مستخدم';
      const isOnline = u.lastLogin?.toDate() > new Date(Date.now() - 5 * 60 * 1000);

      tbody.innerHTML += `
        <tr>
          <td><img src="${avatarUrl}" style="width:30px;height:30px;border-radius:50%;border:2px solid var(--gold);cursor:pointer;" class="user-profile-img" data-uid="${u.uid}"></td>
          <td class="user-profile-link" data-uid="${u.uid}" style="cursor:pointer;color:var(--gold);">${u.name || '---'}</td>
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
  showVipConfetti(message || 'تم تعيين مشرف جديد');
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

// ========== الملف الشخصي العام ==========
export async function viewPublicProfile(uid) {
  const section = $('#page-profile');
  if (!section) return;
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) { showToast('المستخدم غير موجود', 'error'); return; }
  const u = snap.data();
  document.dispatchEvent(new CustomEvent('navigate', { detail: 'profile' }));

  const isOnline = u.lastLogin?.toDate() > new Date(Date.now() - 5 * 60 * 1000);
  const userVipLevel = u.role?.startsWith('vip') ? parseInt(u.role.replace('vip','')) || 0 : 0;
  const vipClass = getVipFrameClass(u.role);

  section.innerHTML = `
    <div class="profile-page" style="max-width:600px;margin:0 auto;">
      <div class="profile-cover" style="height:200px;background:var(--bg-tertiary);position:relative;border-radius:var(--radius-md) var(--radius-md) 0 0;overflow:hidden;">
        ${u.coverPhoto ? `<img src="${u.coverPhoto}" style="width:100%;height:100%;object-fit:cover;">` : ''}
        <div class="profile-avatar-large ${getVipAvatarClass(u.role)}" style="position:absolute;bottom:-50px;right:50%;transform:translateX(50%);width:100px;height:100px;border-radius:50%;border:3px solid var(--gold);overflow:hidden;z-index:1;">
          <img src="${u.avatar || 'https://ui-avatars.com/api/?name='+encodeURIComponent(u.name||'?')+'&background=D4AF37&color=111&size=200'}" style="width:100%;height:100%;object-fit:cover;">
        </div>
      </div>
      <div class="profile-info" style="padding:55px 20px 20px;background:var(--bg-card);border:1px solid var(--border);border-top:none;border-radius:0 0 var(--radius-md) var(--radius-md);text-align:center;">
        <div class="profile-name ${getVipNameClass(u.role)}">${u.name || '---'}</div>
        <div class="profile-id">ID: ${u.serialId || '---'} • LV ${u.accountLevel || 0}</div>
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
}

// ========== صفحة مستوى الحساب ==========
export function loadAccountLevelPage() {
  const section = $('#page-account-level');
  if (!section) return;
  const count = userData.transactionCount || 0;
  const currentLv = userData.accountLevel || 0;
  const info = getLevelInfo(currentLv);
  const progress = Math.min(100, (count / info.nextRequirement) * 100);

  section.innerHTML = `
    <h2><i class="fas fa-chart-line"></i> مستوى الحساب</h2>
    <div class="stat-card" style="max-width:400px;margin:20px auto;text-align:center;">
      <div style="font-size:48px;font-weight:900;color:${info.color};">LV ${currentLv}</div>
      <div style="font-size:14px;color:var(--text-muted);">${info.name}</div>
      <div class="progress-bar" style="width:100%;height:10px;background:var(--bg-tertiary);border-radius:5px;margin:16px 0;overflow:hidden;">
        <div style="width:${progress}%;height:100%;background:var(--gold);border-radius:5px;transition:width 0.5s;"></div>
      </div>
      <div style="font-size:12px;color:var(--text-muted);">${count} / ${info.nextRequirement === Infinity ? '∞' : info.nextRequirement} عملية</div>
      <p style="margin-top:12px;font-size:11px;color:var(--text-muted);">قم بإجراء عمليات مالية لزيادة مستواك</p>
    </div>
  `;
}

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
      const image = $('#cropper-image');
      let cropper = null;
      image.onload = () => {
        cropper = new Cropper(image, {
          aspectRatio: type === 'cover' ? 16 / 9 : 1 / 1,
          viewMode: 1, dragMode: 'move', autoCropArea: 1, restore: false,
          guides: true, center: true, highlight: true, cropBoxMovable: true, cropBoxResizable: true,
          background: false
        });
      };
      $('#crop-save')?.addEventListener('click', async () => {
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
      $('#crop-cancel')?.addEventListener('click', () => { cropper?.destroy(); modal.remove(); });
    };
    reader.readAsDataURL(file);
  });
}

// ========== تأثير VIP Confetti ==========
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
  overlay.querySelector('#vip-confetti-close')?.addEventListener('click', () => overlay.remove());
  setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 5000);
}