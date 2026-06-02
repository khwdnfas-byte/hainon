/*
 | HAINON © 2026 جميع الحقوق محفوظة
 | لا يُسمح بنسخ أو توزيع أو استخدام هذا الملف أو أي جزء من الكود دون إذن كتابي صريح.
 | هذا الملف جزء من نظام HAINON المحاسبي.
*/

// transactions.js — العمليات المالية، البطاقات الديناميكية، الأرباح والخسائر
import { auth, db } from './firebase-config.js';
import {
  collection, addDoc, doc, getDoc, getDocs, query, where, orderBy,
  onSnapshot, serverTimestamp, updateDoc, deleteDoc, Timestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  $, $$, showToast, showConfirm, formatCurrency, getTypeLabel, escapeHtml,
  formatDateEn, formatTimeEn, getDayNameEn, calculateLevel, getLevelInfo
} from './utils.js';

// ========== المتغيرات العامة ==========
export let currentUser = null;
export let userData = null;
export let isAdmin = false, isSuperMod = false, isMod = false, isVip = false, vipLevel = 0;

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
      if (userData.showVipBar === undefined) userData.showVipBar = true;

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

// ---------- حساب الأرباح والخسائر ----------
export function calculateProfitLoss(txs, cur = 'USD') {
  let totalProfit = 0;
  let totalLoss = 0;
  const filtered = txs.filter(t => t.currency === cur && t.type === 'sale' && t.productName && t.unitCost);
  
  for (const t of filtered) {
    const saleAmount = parseFloat(t.amount) || 0;
    const unitCost = parseFloat(t.unitCost) || 0;
    const quantity = t.quantity || 1;
    const cost = unitCost * quantity;
    
    if (saleAmount > cost) {
      totalProfit += (saleAmount - cost);
    } else if (saleAmount < cost) {
      totalLoss += (cost - saleAmount);
    }
  }
  
  return { profit: totalProfit, loss: totalLoss };
}

// ---------- حساب قيمة المخزون ----------
export function calculateInventory(txs, cur = 'USD') {
  const inventory = new Map();
  const sorted = txs.filter(t => t.currency === cur && t.productName);
  sorted.sort((a, b) => {
    const da = a.createdAt?.toDate?.() || new Date(0);
    const db = b.createdAt?.toDate?.() || new Date(0);
    return da - db;
  });

  for (const t of sorted) {
    const name = t.productName;
    if (!inventory.has(name)) inventory.set(name, { qty: 0, totalCost: 0 });
    const prod = inventory.get(name);
    const amount = parseFloat(t.amount) || 0;
    const qty = t.quantity || 1;
    const unitCost = parseFloat(t.unitCost) || (prod.qty > 0 ? prod.totalCost / prod.qty : amount / qty);

    if (t.type === 'purchase') {
      prod.qty += qty;
      prod.totalCost += (unitCost * qty);
    } else if (t.type === 'sale') {
      const avgUnitCost = prod.qty > 0 ? prod.totalCost / prod.qty : 0;
      prod.qty -= qty;
      prod.totalCost -= (avgUnitCost * qty);
      if (prod.qty < 0) { prod.qty = 0; prod.totalCost = 0; }
    } else if (t.type === 'returned') {
      prod.qty += qty;
      prod.totalCost += (unitCost * qty);
    }
  }

  let totalInventory = 0;
  for (const prod of inventory.values()) {
    if (prod.qty > 0) totalInventory += prod.totalCost;
  }
  return totalInventory;
}

// ========== الصفحة الرئيسية (البطاقات الديناميكية) ==========
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

    let incoming = 0, outgoing = 0, sale = 0, purchase = 0;
    let debtIn = 0, debtOut = 0, debtReceived = 0, debtPaid = 0, returned = 0;
    let incomingSYP = 0, outgoingSYP = 0, saleSYP = 0, purchaseSYP = 0;
    let debtInSYP = 0, debtOutSYP = 0, debtReceivedSYP = 0, debtPaidSYP = 0, returnedSYP = 0;

    allTx.forEach(t => {
      const cur = t.currency;
      const a = parseFloat(t.amount) || 0;
      if (cur === 'USD') {
        if (t.type === 'incoming') incoming += a;
        else if (t.type === 'outgoing') outgoing += a;
        else if (t.type === 'sale') sale += a;
        else if (t.type === 'purchase') purchase += a;
        else if (t.type === 'debt_in') debtIn += a;
        else if (t.type === 'debt_out') debtOut += a;
        else if (t.type === 'debt_received') debtReceived += a;
        else if (t.type === 'debt_paid') debtPaid += a;
        else if (t.type === 'returned') returned += a;
      } else {
        if (t.type === 'incoming') incomingSYP += a;
        else if (t.type === 'outgoing') outgoingSYP += a;
        else if (t.type === 'sale') saleSYP += a;
        else if (t.type === 'purchase') purchaseSYP += a;
        else if (t.type === 'debt_in') debtInSYP += a;
        else if (t.type === 'debt_out') debtOutSYP += a;
        else if (t.type === 'debt_received') debtReceivedSYP += a;
        else if (t.type === 'debt_paid') debtPaidSYP += a;
        else if (t.type === 'returned') returnedSYP += a;
      }
    });

    const usdNet = calculateNet(allTx, 'USD');
    const sypNet = calculateNet(allTx, 'SYP');
    const { profit, loss } = calculateProfitLoss(allTx, 'USD');
    const inventory = calculateInventory(allTx, 'USD');
    const finalNet = usdNet - profit;
    const netProfit = profit - loss;
    const vipClass = vipLevel > 0 ? ' vip-card' : '';
    const brownColor = '#8B4513';
    const orangeColor = '#FF9800';

    const cards = [
      { id: 'card1', defaultLabel: 'بيع', altLabel: 'شراء', defaultIcon: 'fa-tag', altIcon: 'fa-shopping-cart', defaultColor: 'var(--green)', altColor: 'var(--red)', defaultValUSD: sale, defaultValSYP: saleSYP, altValUSD: purchase, altValSYP: purchaseSYP },
      { id: 'card2', defaultLabel: 'وارد', altLabel: 'صادر', defaultIcon: 'fa-download', altIcon: 'fa-upload', defaultColor: 'var(--green)', altColor: 'var(--red)', defaultValUSD: incoming, defaultValSYP: incomingSYP, altValUSD: outgoing, altValSYP: outgoingSYP },
      { id: 'card3', defaultLabel: 'دين علينا', altLabel: 'دين لنا', defaultIcon: 'fa-hand-holding-usd', altIcon: 'fa-hand-holding-usd', defaultColor: 'var(--red)', altColor: 'var(--green)', defaultValUSD: debtOut, defaultValSYP: debtOutSYP, altValUSD: debtIn, altValSYP: debtInSYP },
      { id: 'card4', defaultLabel: 'دين مدفوع', altLabel: 'دين مقبوض', defaultIcon: 'fa-times-circle', altIcon: 'fa-check-circle', defaultColor: 'var(--red)', altColor: 'var(--green)', defaultValUSD: debtPaid, defaultValSYP: debtPaidSYP, altValUSD: debtReceived, altValSYP: debtReceivedSYP },
      { id: 'card5', defaultLabel: 'أرباح', altLabel: 'أرباح نهائية', defaultIcon: 'fa-chart-line', altIcon: 'fa-gem', defaultColor: 'var(--green)', altColor: 'var(--gold)', defaultValUSD: profit, defaultValSYP: 0, altValUSD: netProfit, altValSYP: 0 },
      { id: 'card6', defaultLabel: 'خسائر', altLabel: 'مرتجع', defaultIcon: 'fa-chart-bar', altIcon: 'fa-undo-alt', defaultColor: 'var(--red)', altColor: orangeColor, defaultValUSD: loss, defaultValSYP: 0, altValUSD: returned, altValSYP: returnedSYP },
      { id: 'card7', defaultLabel: 'إجمالي الرصيد', altLabel: 'الرصيد النهائي', defaultIcon: 'fa-coins', altIcon: 'fa-wallet', defaultColor: 'var(--gold)', altColor: 'var(--gold-light)', defaultValUSD: usdNet, defaultValSYP: sypNet, altValUSD: finalNet, altValSYP: sypNet }
    ];

    section.innerHTML = `
      <div class="stats-grid" id="dynamic-stats-grid">
        ${cards.map(c => `
          <div class="stat-card stat-net dynamic-card ${vipClass}" id="${c.id}" data-state="default">
            <div class="stat-icon" style="color:${c.defaultColor};"><i class="fas ${c.defaultIcon}"></i></div>
            <div class="stat-value" style="color:${c.defaultColor};" id="${c.id}-value">
              <div>${formatCurrency(c.defaultValUSD)}</div>
              <div><small>${formatCurrency(c.defaultValSYP, 'SYP')}</small></div>
            </div>
            <div class="stat-label" style="color:${c.defaultColor};" id="${c.id}-label">${c.defaultLabel}</div>
            <div class="stat-icon-small" style="font-size:10px;margin-top:4px;color:var(--text-muted);">اضغط للتبديل</div>
          </div>
        `).join('')}
        <div class="stat-card stat-net no-click ${vipClass}" id="card-inventory">
          <div class="stat-icon" style="color:${brownColor};"><i class="fas fa-boxes"></i></div>
          <div class="stat-value" style="color:${brownColor};">
            <div>${formatCurrency(inventory)}</div>
            <div><small>المخزون</small></div>
          </div>
          <div class="stat-label" style="color:${brownColor};">قيمة البضائع</div>
        </div>
      </div>
      <div class="accordion open" id="accordion-add">
        <div class="accordion-header"><span><i class="fas fa-plus-circle"></i> إضافة عملية جديدة</span></div>
        <div class="accordion-body"><div class="accordion-inner">
          <form id="transaction-form">
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
            <div class="form-row" id="product-name-row">
              <input type="text" id="trans-product" placeholder="اسم المنتج" required>
            </div>
            <div class="form-row" id="product-select-row" style="display:none;">
              <select id="trans-product-select" required>
                <option value="">-- اختر المنتج --</option>
              </select>
            </div>
            <div class="form-row">
              <input type="number" id="trans-quantity" placeholder="الكمية" min="1" value="1" required>
            </div>
            <div class="form-row">
              <input type="number" id="trans-amount" placeholder="إدخال القيمة" step="0.01" required>
              <select id="trans-currency"><option value="USD">USD</option><option value="SYP">SYP</option></select>
            </div>
            <div class="form-row" id="unit-cost-row" style="display:none;">
              <input type="number" id="trans-unit-cost" placeholder="سعر القطعة الصافي" step="0.01">
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
          <td>${formatCurrency(t.amount, t.currency)}</td><td>${t.currency}</td>
          <td>${formatDateEn(createdDate)}</td><td>${formatTimeEn(createdDate)}</td>
          <td><button class="btn-outline btn-sm edit-trans-btn" data-id="${t.id}"><i class="fas fa-edit"></i></button></td>
          <td><button class="btn-outline btn-sm delete-trans-btn" data-id="${t.id}" style="color:var(--red);border-color:var(--red);"><i class="fas fa-trash"></i></button></td>
        `;
        tbody.appendChild(row);
      });
    }

    setupDynamicCards(cards);
    setupTransactionForm();
    section.querySelectorAll('.edit-trans-btn').forEach(btn => btn.addEventListener('click', () => editTransaction(btn.dataset.id)));
    section.querySelectorAll('.delete-trans-btn').forEach(btn => btn.addEventListener('click', () => deleteTransaction(btn.dataset.id)));
  });
}

// ---------- البطاقات الديناميكية ----------
function setupDynamicCards(cards) {
  cards.forEach(card => {
    const cardEl = document.getElementById(card.id);
    if (!cardEl) return;

    cardEl.addEventListener('click', () => {
      const state = cardEl.dataset.state;
      const valueEl = document.getElementById(`${card.id}-value`);
      const labelEl = document.getElementById(`${card.id}-label`);
      const iconEl = cardEl.querySelector('.stat-icon i');

      if (state === 'default') {
        valueEl.innerHTML = `<div>${formatCurrency(card.altValUSD)}</div><div><small>${formatCurrency(card.altValSYP, 'SYP')}</small></div>`;
        valueEl.style.color = card.altColor;
        labelEl.textContent = card.altLabel;
        labelEl.style.color = card.altColor;
        iconEl.className = `fas ${card.altIcon}`;
        cardEl.dataset.state = 'alt';
      } else {
        valueEl.innerHTML = `<div>${formatCurrency(card.defaultValUSD)}</div><div><small>${formatCurrency(card.defaultValSYP, 'SYP')}</small></div>`;
        valueEl.style.color = card.defaultColor;
        labelEl.textContent = card.defaultLabel;
        labelEl.style.color = card.defaultColor;
        iconEl.className = `fas ${card.defaultIcon}`;
        cardEl.dataset.state = 'default';
      }
    });
  });
}// ... تابع transactions.js

// ---------- إعداد نموذج العملية ----------
function setupTransactionForm() {
  const typeSelect = $('#trans-type');
  const amountInput = $('#trans-amount');
  const unitCostRow = $('#unit-cost-row');
  const productNameRow = $('#product-name-row');
  const productSelectRow = $('#product-select-row');

  if (!typeSelect) return;

  typeSelect.addEventListener('change', () => {
    const type = typeSelect.value;
    const isPurchase = type === 'purchase';
    const isSale = type === 'sale';

    if (unitCostRow) unitCostRow.style.display = isPurchase ? 'flex' : 'none';
    if (amountInput) amountInput.placeholder = isPurchase ? 'إجمالي القيمة' : isSale ? 'السعر النهائي' : 'إدخال القيمة';
    if (productSelectRow) productSelectRow.style.display = isSale ? 'flex' : 'none';
    if (productNameRow) productNameRow.style.display = isSale ? 'none' : 'flex';

    if (isSale) loadProductOptions();
  });

  $('#transaction-form')?.addEventListener('submit', handleAddTransaction);
}

// ---------- تحميل خيارات المنتجات للبيع ----------
async function loadProductOptions() {
  const select = $('#trans-product-select');
  if (!select) return;

  const q = query(
    collection(db, 'transactions'),
    where('uid', '==', currentUser.uid),
    where('type', '==', 'purchase')
  );
  const snapshot = await getDocs(q);
  const products = new Map();

  snapshot.forEach(doc => {
    const t = doc.data();
    if (!products.has(t.productName)) {
      products.set(t.productName, { unitCost: t.unitCost || 0, currency: t.currency || 'USD' });
    }
  });

  const allTxSnap = await getDocs(query(collection(db, 'transactions'), where('uid', '==', currentUser.uid)));
  const inventory = new Map();
  allTxSnap.forEach(doc => {
    const t = doc.data();
    if (!t.productName) return;
    if (!inventory.has(t.productName)) inventory.set(t.productName, 0);
    const qty = t.quantity || 1;
    if (t.type === 'purchase' || t.type === 'returned') inventory.set(t.productName, inventory.get(t.productName) + qty);
    else if (t.type === 'sale') inventory.set(t.productName, inventory.get(t.productName) - qty);
  });

  select.innerHTML = '<option value="">-- اختر المنتج --</option>';
  products.forEach((data, name) => {
    const available = inventory.get(name) || 0;
    if (available > 0) {
      select.innerHTML += `<option value="${escapeHtml(name)}" data-unit-cost="${data.unitCost}" data-available="${available}">${escapeHtml(name)} (متاح: ${available})</option>`;
    }
  });
}

// ---------- إضافة عملية جديدة ----------
async function handleAddTransaction(e) {
  e.preventDefault();
  const type = $('#trans-type')?.value;
  const currency = $('#trans-currency')?.value;
  const amount = parseFloat($('#trans-amount')?.value) || 0;
  let quantity = parseInt($('#trans-quantity')?.value) || 1;

  if (!type || !amount || amount <= 0) return showToast('جميع الحقول مطلوبة', 'error');

  let productName = '';
  let unitCost = 0;

  if (type === 'sale') {
    const select = $('#trans-product-select');
    productName = select?.value || '';
    if (!productName) return showToast('اختر المنتج', 'error');
    const selectedOption = select?.selectedOptions[0];
    unitCost = parseFloat(selectedOption?.dataset.unitCost) || 0;
    const available = parseInt(selectedOption?.dataset.available) || 0;
    if (quantity > available) return showToast(`الكمية غير متاحة. المتاح: ${available}`, 'error');
  } else {
    productName = $('#trans-product')?.value.trim() || '';
    if (!productName && ['purchase', 'sale', 'returned'].includes(type)) {
      return showToast('اسم المنتج مطلوب', 'error');
    }
  }

  if (type === 'purchase') {
    unitCost = parseFloat($('#trans-unit-cost')?.value) || 0;
    if (!unitCost || unitCost <= 0) return showToast('سعر القطعة الصافي مطلوب', 'error');
  }

  // التحقق من الرصيد قبل العمليات الخارجة
  if (['outgoing', 'purchase', 'debt_paid', 'returned'].includes(type)) {
    const allTxSnap = await getDocs(query(collection(db, 'transactions'), where('uid', '==', currentUser.uid)));
    const allTx = [];
    allTxSnap.forEach(doc => allTx.push(doc.data()));
    const currentBalance = calculateNet(allTx, currency);
    if (amount > currentBalance) {
      return showToast('إجمالي الرصيد غير كافي', 'error');
    }
  }

  const txData = {
    uid: currentUser.uid,
    productName: productName || '',
    type,
    amount,
    currency,
    quantity: ['sale', 'purchase', 'returned'].includes(type) ? quantity : 1,
    note: '',
    createdAt: serverTimestamp(),
    updatedAt: null,
    history: []
  };

  if (type === 'purchase' || type === 'sale') {
    txData.unitCost = unitCost;
  }

  try {
    await addDoc(collection(db, 'transactions'), txData);

    // تحديث نقاط الخبرة والمستوى
    const userRef = doc(db, 'users', currentUser.uid);
    const newPoints = (userData.transactionCount || 0) + 500;
    const newLevel = calculateLevel(newPoints);
    await updateDoc(userRef, { transactionCount: newPoints, accountLevel: newLevel });
    userData.transactionCount = newPoints;
    userData.accountLevel = newLevel;

    showToast('تمت العملية بنجاح', 'success');
    $('#transaction-form')?.reset();
    const unitCostRow = $('#unit-cost-row');
    const productSelectRow = $('#product-select-row');
    const productNameRow = $('#product-name-row');
    if (unitCostRow) unitCostRow.style.display = 'none';
    if (productSelectRow) productSelectRow.style.display = 'none';
    if (productNameRow) productNameRow.style.display = 'flex';
  } catch (error) {
    showToast('فشل في إضافة العملية', 'error');
  }
}

// ---------- تعديل عملية ----------
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

// ---------- حذف عملية ----------
export async function deleteTransaction(transId) {
  const confirmed = await showConfirm('حذف هذه العملية؟');
  if (!confirmed) return;
  await deleteDoc(doc(db, 'transactions', transId));
  showToast('تم الحذف', 'success');
}

// ---------- أرشفة تلقائية ----------
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

// ---------- صفحة العمليات المؤرشفة ----------
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
    snapshot.forEach(docSnap => {
      const archive = docSnap.data();
      const div = document.createElement('div');
      div.className = 'stat-card';
      div.style.cssText = 'cursor:pointer;margin-bottom:8px;';
      div.innerHTML = `<div style="display:flex;align-items:center;gap:12px;"><span style="font-size:24px;"><i class="fas fa-folder"></i></span><div><div style="font-weight:700;">${archive.name}</div><div style="font-size:11px;">${archive.transactions?.length||0} عملية</div></div></div>`;
      div.addEventListener('click', () => showArchiveDetail(archive, docSnap.id, filterType));
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

// ---------- صفحة الديون ----------
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
    snapshot.forEach(docSnap => {
      const archive = docSnap.data();
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
  detail.innerHTML = `<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;"><button class="btn-outline btn-sm" id="back-to-debts"><i class="fas fa-arrow-left"></i> عودة</button><h3>كل الديون</h3></div><div id="all-debts-content">جاري التحميل...</div>`;
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
}// ... تابع transactions.js

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
    const { profit, loss } = calculateProfitLoss(filtered, 'USD');

    output.innerHTML = `
      <div style="position:relative;padding:20px;background:var(--bg-card);border-radius:var(--radius-md);border:1px solid var(--border);">
        ${(!noWatermark && (vipLevel >= 1 || isAdmin)) ? '<div style="text-align:center;opacity:0.05;font-size:60px;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:0;">HAINON</div>' : ''}
        <h4>تقرير من ${formatDateEn(fromDate)} إلى ${formatDateEn(toDate)}</h4>
        <div style="display:flex;gap:16px;margin:8px 0;">
          <span style="color:var(--green);">أرباح: ${formatCurrency(profit)}</span>
          <span style="color:var(--red);">خسائر: ${formatCurrency(loss)}</span>
        </div>
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

// ========== إرسال الإشعارات ==========
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

// ========== نظام مستوى الحساب (LV) ==========
export function loadAccountLevelPage() {
  const section = $('#page-account-level');
  if (!section) return;
  const points = userData.transactionCount || 0;
  const currentLv = userData.accountLevel || 0;
  const info = getLevelInfo(currentLv);
  const progress = Math.min(100, (points / info.nextRequirement) * 100);

  section.innerHTML = `
    <h2><i class="fas fa-chart-line"></i> مستوى الحساب</h2>
    <div class="stat-card" style="max-width:400px;margin:20px auto;text-align:center;">
      <div style="font-size:48px;font-weight:900;color:${info.color};">LV ${currentLv}</div>
      <div style="font-size:14px;color:var(--text-muted);">${info.name}</div>
      <div class="progress-bar" style="width:100%;height:10px;background:var(--bg-tertiary);border-radius:5px;margin:16px 0;overflow:hidden;">
        <div style="width:${progress}%;height:100%;background:var(--gold);border-radius:5px;transition:width 0.5s;"></div>
      </div>
      <div style="font-size:12px;color:var(--text-muted);">${points} / ${info.nextRequirement === Infinity ? '∞' : info.nextRequirement} نقطة</div>
      <p style="margin-top:12px;font-size:11px;color:var(--text-muted);">كل عملية = 500 نقطة. قم بإجراء عمليات لزيادة مستواك</p>
    </div>
  `;
}