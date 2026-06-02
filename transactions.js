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
  $, showToast, showConfirm, formatCurrency, getTypeLabel, escapeHtml,
  formatDateEn, formatTimeEn, getDayNameEn, calculateLevel, getLevelInfo
} from './utils.js';

// ========== المتغيرات العامة ==========
export let currentUser = null;
export let userData = null;
export let isAdmin = false, isSuperMod = false, isMod = false, isVip = false, vipLevel = 0;

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
        userData.role = 'user'; isVip = false; vipLevel = 0;
      }
      return true;
    }
  } catch (e) { console.error(e); }
  return false;
}

export function calculateNet(txs, cur = 'USD') {
  let inc = 0, out = 0, sale = 0, pur = 0, debtRcv = 0, debtPaid = 0, ret = 0;
  txs.forEach(t => {
    if (t.currency !== cur) return;
    const a = parseFloat(t.amount) || 0;
    if (t.type === 'incoming') inc += a; else if (t.type === 'outgoing') out += a;
    else if (t.type === 'sale') sale += a; else if (t.type === 'purchase') pur += a;
    else if (t.type === 'debt_received') debtRcv += a; else if (t.type === 'debt_paid') debtPaid += a;
    else if (t.type === 'returned') ret += a;
  });
  return (inc + sale + debtRcv) - (out + pur + debtPaid + ret);
}

export function calculateProfitLoss(txs, cur = 'USD') {
  let totalProfit = 0, totalLoss = 0;
  txs.filter(t => t.currency === cur && t.type === 'sale' && t.unitCost).forEach(t => {
    const saleAmount = parseFloat(t.amount) || 0;
    const cost = (parseFloat(t.unitCost) || 0) * (t.quantity || 1);
    if (saleAmount > cost) totalProfit += (saleAmount - cost);
    else if (saleAmount < cost) totalLoss += (cost - saleAmount);
  });
  return { profit: totalProfit, loss: totalLoss };
}

export function calculateInventory(txs, cur = 'USD') {
  const inv = new Map();
  txs.filter(t => t.currency === cur && t.productName).sort((a,b)=>(a.createdAt?.toDate?.()||0)-(b.createdAt?.toDate?.()||0)).forEach(t => {
    const n = t.productName;
    if (!inv.has(n)) inv.set(n, { qty: 0, totalCost: 0 });
    const p = inv.get(n);
    const a = parseFloat(t.amount) || 0, q = t.quantity || 1;
    const uc = parseFloat(t.unitCost) || (p.qty > 0 ? p.totalCost / p.qty : a / q);
    if (t.type === 'purchase') { p.qty += q; p.totalCost += uc * q; }
    else if (t.type === 'sale') { const ac = p.qty > 0 ? p.totalCost / p.qty : 0; p.qty -= q; p.totalCost -= ac * q; if (p.qty < 0) { p.qty = 0; p.totalCost = 0; } }
    else if (t.type === 'returned') { p.qty += q; p.totalCost += uc * q; }
  });
  let total = 0;
  for (const p of inv.values()) { if (p.qty > 0) total += p.totalCost; }
  return total;
}

// ========== Dashboard ==========
export function loadDashboardPage() {
  const s = $('#page-dashboard');
  if (!s) return;
  onSnapshot(query(collection(db,'transactions'),where('uid','==',currentUser.uid),orderBy('createdAt','desc')), (snap) => {
    const allTx = []; snap.forEach(d => allTx.push({ id: d.id, ...d.data() }));
    const today = allTx.filter(t => t.createdAt?.toDate() >= new Date(new Date().setHours(0,0,0,0)));
    let inc=0,out=0,sale=0,pur=0,dIn=0,dOut=0,dRcv=0,dPai=0,ret=0,iS=0,oS=0,sS=0,pS=0,dIS=0,dOS=0,dRS=0,dPS=0,rS=0;
    allTx.forEach(t => {
      const a = parseFloat(t.amount)||0;
      if (t.currency==='USD') {
        if (t.type==='incoming') inc+=a; else if (t.type==='outgoing') out+=a; else if (t.type==='sale') sale+=a; else if (t.type==='purchase') pur+=a;
        else if (t.type==='debt_in') dIn+=a; else if (t.type==='debt_out') dOut+=a; else if (t.type==='debt_received') dRcv+=a; else if (t.type==='debt_paid') dPai+=a; else if (t.type==='returned') ret+=a;
      } else {
        if (t.type==='incoming') iS+=a; else if (t.type==='outgoing') oS+=a; else if (t.type==='sale') sS+=a; else if (t.type==='purchase') pS+=a;
        else if (t.type==='debt_in') dIS+=a; else if (t.type==='debt_out') dOS+=a; else if (t.type==='debt_received') dRS+=a; else if (t.type==='debt_paid') dPS+=a; else if (t.type==='returned') rS+=a;
      }
    });
    const usdNet=calculateNet(allTx,'USD'), sypNet=calculateNet(allTx,'SYP');
    const {profit,loss}=calculateProfitLoss(allTx,'USD');
    const inventory=calculateInventory(allTx,'USD');
    const finalNet=usdNet-profit, netProfit=profit-loss;
    const cards = [
      { id:'c1', dl:'بيع', al:'شراء', di:'fa-tag', ai:'fa-shopping-cart', dc:'var(--green)', ac:'var(--red)', du: sale, ds: sS, au: pur, as: pS },
      { id:'c2', dl:'وارد', al:'صادر', di:'fa-download', ai:'fa-upload', dc:'var(--green)', ac:'var(--red)', du: inc, ds: iS, au: out, as: oS },
      { id:'c3', dl:'دين علينا', al:'دين لنا', di:'fa-hand-holding-usd', ai:'fa-hand-holding-usd', dc:'var(--red)', ac:'var(--green)', du: dOut, ds: dOS, au: dIn, as: dIS },
      { id:'c4', dl:'دين مدفوع', al:'دين مقبوض', di:'fa-times-circle', ai:'fa-check-circle', dc:'var(--red)', ac:'var(--green)', du: dPai, ds: dPS, au: dRcv, as: dRS },
      { id:'c5', dl:'أرباح', al:'أرباح نهائية', di:'fa-chart-line', ai:'fa-gem', dc:'var(--green)', ac:'var(--gold)', du: profit, ds: 0, au: netProfit, as: 0 },
      { id:'c6', dl:'خسائر', al:'مرتجع', di:'fa-chart-bar', ai:'fa-undo-alt', dc:'var(--red)', ac:'#FF9800', du: loss, ds: 0, au: ret, as: rS },
      { id:'c7', dl:'إجمالي الرصيد', al:'الرصيد النهائي', di:'fa-coins', ai:'fa-wallet', dc:'var(--gold)', ac:'var(--gold-light)', du: usdNet, ds: sypNet, au: finalNet, as: sypNet }
    ];
    s.innerHTML = `
      <div class="stats-grid" id="dsg">
        ${cards.map(c=>`<div class="stat-card stat-net dynamic-card ${vipLevel>0?'vip-card':''}" id="${c.id}" data-state="default">
          <div class="stat-icon" style="color:${c.dc};"><i class="fas ${c.di}"></i></div>
          <div class="stat-value" style="color:${c.dc};" id="${c.id}-v"><div>${formatCurrency(c.du)}</div><div><small>${formatCurrency(c.ds,'SYP')}</small></div></div>
          <div class="stat-label" style="color:${c.dc};" id="${c.id}-l">${c.dl}</div><div class="stat-icon-small">اضغط للتبديل</div></div>`).join('')}
        <div class="stat-card stat-net no-click ${vipLevel>0?'vip-card':''}"><div class="stat-icon" style="color:#8B4513;"><i class="fas fa-boxes"></i></div>
          <div class="stat-value" style="color:#8B4513;"><div>${formatCurrency(inventory)}</div><div><small>المخزون</small></div></div><div class="stat-label" style="color:#8B4513;">قيمة البضائع</div></div></div>
      <div class="accordion open"><div class="accordion-header"><span><i class="fas fa-plus-circle"></i> إضافة عملية جديدة</span></div><div class="accordion-body"><div class="accordion-inner">
        <form id="tf"><div class="form-row"><select id="tt" required><option value="">-- نوع العملية --</option><option value="incoming">وارد</option><option value="outgoing">صادر</option><option value="sale">بيع</option><option value="purchase">شراء</option><option value="debt_in">دين لنا</option><option value="debt_out">دين علينا</option><option value="debt_received">دين مقبوض</option><option value="debt_paid">دين مدفوع</option><option value="returned">مرتجع</option></select></div>
        <div class="form-row" id="pnr"><input type="text" id="tp" placeholder="اسم المنتج" required></div>
        <div class="form-row" id="psr" style="display:none;"><select id="tps" required><option value="">-- اختر المنتج --</option></select></div>
        <div class="form-row"><input type="number" id="tq" placeholder="الكمية" min="1" value="1" required></div>
        <div class="form-row"><input type="number" id="ta" placeholder="إدخال القيمة" step="0.01" required><select id="tc"><option value="USD">USD</option><option value="SYP">SYP</option></select></div>
        <div class="form-row" id="ucr" style="display:none;"><input type="number" id="tuc" placeholder="سعر القطعة الصافي" step="0.01"></div>
        <button type="submit" class="btn-primary" style="width:100%;"><i class="fas fa-save"></i> تأكيد العملية</button></form></div></div></div>
      <h3 style="margin:16px 0 8px;"><i class="fas fa-list"></i> عمليات اليوم</h3>
      <div class="table-container"><table><thead><tr><th>النوع</th><th>المنتج</th><th>الكمية</th><th>المبلغ</th><th>العملة</th><th>التاريخ</th><th>الوقت</th><th>تعديل</th><th>حذف</th></tr></thead>
      <tbody id="ttb">${today.length===0?'<tr><td colspan="9">لا توجد عمليات</td></tr>':''}</tbody></table></div>`;
    if (today.length>0) {
      const tb=$('#ttb'); tb.innerHTML='';
      today.forEach(t=>{const r=document.createElement('tr'); const cd=t.createdAt?.toDate()||new Date();
        r.innerHTML=`<td>${getTypeLabel(t.type)}</td><td>${t.productName||'---'}</td><td>${t.quantity||1}</td><td>${formatCurrency(t.amount,t.currency)}</td><td>${t.currency}</td><td>${formatDateEn(cd)}</td><td>${formatTimeEn(cd)}</td><td><button class="btn-outline btn-sm edit-trans-btn" data-id="${t.id}"><i class="fas fa-edit"></i></button></td><td><button class="btn-outline btn-sm delete-trans-btn" data-id="${t.id}" style="color:var(--red);border-color:var(--red);"><i class="fas fa-trash"></i></button></td>`; tb.appendChild(r);});
    }
    cards.forEach(c=>{const el=document.getElementById(c.id); if(!el) return; el.addEventListener('click',()=>{const st=el.dataset.state; const ve=document.getElementById(c.id+'-v'); const le=document.getElementById(c.id+'-l'); const ie=el.querySelector('.stat-icon i'); if(st==='default'){ve.innerHTML=`<div>${formatCurrency(c.au)}</div><div><small>${formatCurrency(c.as,'SYP')}</small></div>`; ve.style.color=c.ac; le.textContent=c.al; le.style.color=c.ac; ie.className=`fas ${c.ai}`; el.dataset.state='alt';} else {ve.innerHTML=`<div>${formatCurrency(c.du)}</div><div><small>${formatCurrency(c.ds,'SYP')}</small></div>`; ve.style.color=c.dc; le.textContent=c.dl; le.style.color=c.dc; ie.className=`fas ${c.di}`; el.dataset.state='default';}});});
    setupTF();
    s.querySelectorAll('.edit-trans-btn').forEach(b=>b.addEventListener('click',()=>editTransaction(b.dataset.id)));
    s.querySelectorAll('.delete-trans-btn').forEach(b=>b.addEventListener('click',()=>deleteTransaction(b.dataset.id)));
  });
}

function setupTF(){
  const ts=$('#tt'); if(!ts) return;
  ts.addEventListener('change',()=>{
    const ip=ts.value==='purchase', is=ts.value==='sale';
    $('#ucr').style.display=ip?'flex':'none';
    $('#ta').placeholder=ip?'إجمالي القيمة':is?'السعر النهائي':'إدخال القيمة';
    $('#psr').style.display=is?'flex':'none'; $('#pnr').style.display=is?'none':'flex';
    if(is) loadPO();
  });
  $('#tf')?.addEventListener('submit', handleAT);
}

async function loadPO(){
  const sel=$('#tps'); if(!sel) return;
  const ps=new Map();
  (await getDocs(query(collection(db,'transactions'),where('uid','==',currentUser.uid),where('type','==','purchase')))).forEach(d=>{const t=d.data(); if(!ps.has(t.productName)) ps.set(t.productName,{uc:t.unitCost||0});});
  const inv=new Map();
  (await getDocs(query(collection(db,'transactions'),where('uid','==',currentUser.uid)))).forEach(d=>{const t=d.data(); if(!t.productName) return; if(!inv.has(t.productName)) inv.set(t.productName,0); const q=t.quantity||1; if(t.type==='purchase'||t.type==='returned') inv.set(t.productName,inv.get(t.productName)+q); else if(t.type==='sale') inv.set(t.productName,inv.get(t.productName)-q);});
  sel.innerHTML='<option value="">-- اختر المنتج --</option>';
  ps.forEach((d,n)=>{const av=inv.get(n)||0; if(av>0) sel.innerHTML+=`<option value="${escapeHtml(n)}" data-unit-cost="${d.uc}" data-available="${av}">${escapeHtml(n)} (متاح: ${av})</option>`;});
}

async function handleAT(e){
  e.preventDefault();
  const type=$('#tt')?.value, cur=$('#tc')?.value, amt=parseFloat($('#ta')?.value)||0;
  let qty=parseInt($('#tq')?.value)||1;
  if(!type||!amt||amt<=0) return showToast('جميع الحقول مطلوبة','error');
  let pn='', uc=0;
  if(type==='sale'){const sel=$('#tps'); pn=sel?.value||''; if(!pn) return showToast('اختر المنتج','error'); uc=parseFloat(sel?.selectedOptions[0]?.dataset.unitCost)||0; const av=parseInt(sel?.selectedOptions[0]?.dataset.available)||0; if(qty>av) return showToast(`الكمية غير متاحة. المتاح: ${av}`,'error');}
  else {pn=$('#tp')?.value.trim()||'';}
  if(type==='purchase'){uc=parseFloat($('#tuc')?.value)||0; if(!uc||uc<=0) return showToast('سعر القطعة الصافي مطلوب','error');}
  if(['outgoing','purchase','debt_paid','returned'].includes(type)){const as=await getDocs(query(collection(db,'transactions'),where('uid','==',currentUser.uid))); const at=[]; as.forEach(d=>at.push(d.data())); if(amt>calculateNet(at,cur)) return showToast('إجمالي الرصيد غير كافي','error');}
  const td={uid:currentUser.uid,productName:pn||'',type,amount:amt,currency:cur,quantity:['sale','purchase','returned'].includes(type)?qty:1,note:'',createdAt:serverTimestamp(),updatedAt:null,history:[]};
  if(type==='purchase'||type==='sale') td.unitCost=uc;
  try{
    await addDoc(collection(db,'transactions'),td);
    const ur=doc(db,'users',currentUser.uid), np=(userData.transactionCount||0)+500, nl=calculateLevel(np);
    await updateDoc(ur,{transactionCount:np,accountLevel:nl}); userData.transactionCount=np; userData.accountLevel=nl;
    showToast('تمت العملية بنجاح','success'); $('#tf')?.reset(); $('#ucr').style.display='none'; $('#psr').style.display='none'; $('#pnr').style.display='flex';
  }catch(er){showToast('فشل في إضافة العملية','error');}
}

export async function editTransaction(tid){
  const sn=await getDoc(doc(db,'transactions',tid)); if(!sn.exists()) return;
  const t=sn.data(), na=prompt('المبلغ الجديد:',t.amount);
  if(!na||parseFloat(na)<=0) return;
  const nt=prompt('نوع العملية (اتركه فارغاً للتخطي):',t.type), ft=nt||t.type;
  const h=t.history||[]; h.push({amount:t.amount,type:t.type,updatedAt:t.updatedAt||t.createdAt});
  await updateDoc(doc(db,'transactions',tid),{amount:parseFloat(na),type:ft,updatedAt:serverTimestamp(),history:h});
  showToast('تم تعديل العملية','success');
}

export async function deleteTransaction(tid){
  if(!(await showConfirm('حذف هذه العملية؟'))) return;
  await deleteDoc(doc(db,'transactions',tid)); showToast('تم الحذف','success');
}

export async function archiveDailyTransactions(){
  const n=new Date(), ts=new Date(n.getFullYear(),n.getMonth(),n.getDate()), ys=new Date(ts.getTime()-86400000);
  const sn=await getDocs(query(collection(db,'transactions'),where('uid','==',currentUser.uid),where('createdAt','>=',ys),where('createdAt','<',ts)));
  if(sn.empty) return;
  const td=[]; sn.forEach(d=>td.push({id:d.id,...d.data()}));
  await addDoc(collection(db,'archives'),{uid:currentUser.uid,name:`${getDayNameEn(ys)} ${formatDateEn(ys)}`,date:ys,type:'daily',transactions:td,createdAt:serverTimestamp()});
  for(const tx of td) await deleteDoc(doc(db,'transactions',tx.id));
}

export function loadTransactionsPage(){
  const s=$('#page-transactions'); if(!s) return;
  const ft=sessionStorage.getItem('filterType')||''; sessionStorage.removeItem('filterType');
  s.innerHTML=`<h2><i class="fas fa-exchange-alt"></i> العمليات المؤرشفة</h2><div id="al"></div><div id="ad" class="hidden"></div>`;
  onSnapshot(query(collection(db,'archives'),where('uid','==',currentUser.uid),orderBy('date','desc')),(sn)=>{
    const l=$('#al'); if(!l) return;
    if(sn.empty){l.innerHTML='<p style="text-align:center;color:var(--text-muted);">لا توجد عمليات مؤرشفة</p>';return;}
    l.innerHTML=''; sn.forEach(d=>{const a=d.data(); const dv=document.createElement('div'); dv.className='stat-card'; dv.style.cssText='cursor:pointer;margin-bottom:8px;';
      dv.innerHTML=`<div style="display:flex;align-items:center;gap:12px;"><span style="font-size:24px;"><i class="fas fa-folder"></i></span><div><div style="font-weight:700;">${a.name}</div><div style="font-size:11px;">${a.transactions?.length||0} عملية</div></div></div>`;
      dv.addEventListener('click',()=>{const dt=$('#ad'),ll=$('#al'); if(!dt||!ll) return; ll.classList.add('hidden'); dt.classList.remove('hidden'); let ts=a.transactions||[]; if(ft) ts=ts.filter(t=>t.type===ft);
        dt.innerHTML=`<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;"><button class="btn-outline btn-sm" id="ba"><i class="fas fa-arrow-left"></i> عودة</button><h3>${a.name}</h3></div><div class="table-container"><table><thead><tr><th>النوع</th><th>المنتج</th><th>الكمية</th><th>المبلغ</th><th>العملة</th></tr></thead><tbody>${ts.length===0?'<tr><td colspan="5">لا توجد</td></tr>':ts.map(t=>`<tr><td>${getTypeLabel(t.type)}</td><td>${t.productName||'---'}</td><td>${t.quantity||1}</td><td>${formatCurrency(t.amount,t.currency)}</td><td>${t.currency}</td></tr>`).join('')}</tbody></table></div>`;
        $('#ba')?.addEventListener('click',()=>{dt.classList.add('hidden');ll.classList.remove('hidden');});}); l.appendChild(dv);});
  });
}

export function loadDebtsPage(){
  const s=$('#page-debts'); if(!s) return;
  s.innerHTML=`<h2><i class="fas fa-hand-holding-usd"></i> الديون</h2><div id="dl"></div><div id="dd" class="hidden"></div>`;
  const l=$('#dl'); if(!l) return;
  const ab=document.createElement('div'); ab.className='stat-card'; ab.style.cssText='cursor:pointer;margin-bottom:8px;';
  ab.innerHTML=`<div style="display:flex;align-items:center;gap:12px;"><span style="font-size:24px;"><i class="fas fa-folder-open"></i></span><div><div style="font-weight:700;">كل الديون</div></div></div>`;
  ab.addEventListener('click',()=>{const dt=$('#dd'); if(!dt||!l) return; l.classList.add('hidden');dt.classList.remove('hidden');
    dt.innerHTML=`<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;"><button class="btn-outline btn-sm" id="bd"><i class="fas fa-arrow-left"></i> عودة</button><h3>كل الديون</h3></div><div id="adc">جاري التحميل...</div>`;
    $('#bd')?.addEventListener('click',()=>{dt.classList.add('hidden');l.classList.remove('hidden');});
    onSnapshot(query(collection(db,'transactions'),where('uid','==',currentUser.uid),orderBy('createdAt','desc')),(sn)=>{const ts=[]; sn.forEach(d=>ts.push(d.data())); const ds=ts.filter(t=>['debt_in','debt_out','debt_received','debt_paid'].includes(t.type));
      const tb=[{ti:'<i class="fas fa-hand-holding-usd"></i> دين لنا',ty:'debt_in'},{ti:'<i class="fas fa-hand-holding-usd"></i> دين علينا',ty:'debt_out'},{ti:'<i class="fas fa-check-circle"></i> دين مقبوض',ty:'debt_received'},{ti:'<i class="fas fa-times-circle"></i> دين مدفوع',ty:'debt_paid'}];
      let h=''; tb.forEach(b=>{const f=ds.filter(t=>t.type===b.ty); h+=`<h4 style="margin:12px 0 8px;color:var(--gold);">${b.ti} (${f.length})</h4><div class="table-container"><table><thead><tr><th>المنتج</th><th>المبلغ</th><th>العملة</th><th>التاريخ</th></tr></thead><tbody>${f.length===0?'<tr><td colspan="4">لا توجد</td></tr>':f.map(t=>`<tr><td>${t.productName||'---'}</td><td>${formatCurrency(t.amount,t.currency)}</td><td>${t.currency}</td><td>${t.createdAt?formatDateEn(t.createdAt.toDate()):''}</td></tr>`).join('')}</tbody></table></div>`;});
      const c=$('#adc'); if(c) c.innerHTML=h;});}); l.appendChild(ab);
}

export function loadReportsPage(){
  const s=$('#page-reports'); if(!s) return;
  const n=new Date();
  s.innerHTML=`<h2><i class="fas fa-file-invoice"></i> التقارير المالية</h2>
    <div class="form-row"><div class="input-group"><label><i class="fas fa-calendar-alt"></i> من تاريخ</label><input type="date" id="rfd"></div><div class="input-group"><label><i class="fas fa-calendar-alt"></i> إلى تاريخ</label><input type="date" id="rtd" value="${n.toISOString().split('T')[0]}"></div></div>
    <div class="form-row"><div class="input-group"><label><i class="fas fa-filter"></i> نوع العملية</label><select id="rts"><option value="all">كل العمليات</option><option value="incoming">وارد</option><option value="outgoing">صادر</option><option value="sale">بيع</option><option value="purchase">شراء</option><option value="debt_in">دين لنا</option><option value="debt_out">دين علينا</option><option value="debt_received">دين مقبوض</option><option value="debt_paid">دين مدفوع</option><option value="returned">مرتجع</option></select></div></div>
    <button id="grb" class="btn-primary"><i class="fas fa-file-alt"></i> إنشاء التقرير</button><div id="ro" class="hidden" style="margin-top:20px;"></div>`;
  $('#grb')?.addEventListener('click',()=>{
    const fd=$('#rfd')?.value?new Date($('#rfd').value):null, td=$('#rtd')?.value?new Date($('#rtd').value+'T23:59:59'):null, ts=$('#rts')?.value;
    if(!fd||!td) return showToast('حدد التاريخين','error');
    onSnapshot(query(collection(db,'transactions'),where('uid','==',currentUser.uid),where('createdAt','>=',fd),where('createdAt','<=',td),orderBy('createdAt','desc')),(sn)=>{
      const tx=[]; sn.forEach(d=>tx.push(d.data())); let ft=tx; if(ts!=='all') ft=tx.filter(t=>t.type===ts);
      const {profit,loss}=calculateProfitLoss(ft,'USD'), o=$('#ro'); if(!o) return; o.classList.remove('hidden');
      o.innerHTML=`<div style="position:relative;padding:20px;background:var(--bg-card);border-radius:var(--radius-md);border:1px solid var(--border);"><h4>تقرير من ${formatDateEn(fd)} إلى ${formatDateEn(td)}</h4><div style="display:flex;gap:16px;margin:8px 0;"><span style="color:var(--green);">أرباح: ${formatCurrency(profit)}</span><span style="color:var(--red);">خسائر: ${formatCurrency(loss)}</span></div><div class="table-container"><table><thead><tr><th>النوع</th><th>المنتج</th><th>المبلغ</th><th>العملة</th><th>التاريخ</th></tr></thead><tbody>${ft.length===0?'<tr><td colspan="5">لا توجد عمليات</td></tr>':ft.map(t=>`<tr><td>${getTypeLabel(t.type)}</td><td>${t.productName||'---'}</td><td>${formatCurrency(t.amount,t.currency)}</td><td>${t.currency}</td><td>${t.createdAt?formatDateEn(t.createdAt.toDate()):''}</td></tr>`).join('')}</tbody></table></div></div>`;
    });
  });
}

export async function sendNotification(targetUid, message, type, link = '') {
  try { await addDoc(collection(db,'notifications'),{uid:targetUid,message,type,link,read:false,createdAt:serverTimestamp()}); } catch(e){}
}

export async function sendMassNotification(text) {
  if(!isAdmin&&!isMod&&!isSuperMod) return showToast('غير مصرح','error');
  const sn=await getDocs(collection(db,'users'));
  for(const d of sn.docs) await sendNotification(d.id,text,'admin_message','');
  showToast('تم إرسال الإشعار لجميع المستخدمين','success');
}

export function loadAccountLevelPage(){
  const s=$('#page-account-level'); if(!s) return;
  const pts=userData.transactionCount||0, cl=userData.accountLevel||0, info=getLevelInfo(cl), prog=Math.min(100,(pts/info.nextRequirement)*100);
  s.innerHTML=`<h2><i class="fas fa-chart-line"></i> مستوى الحساب</h2><div class="stat-card" style="max-width:400px;margin:20px auto;text-align:center;"><div style="font-size:48px;font-weight:900;color:${info.color};">LV ${cl}</div><div style="font-size:14px;color:var(--text-muted);">${info.name}</div><div class="progress-bar"><div class="progress-bar-fill" style="width:${prog}%;"></div></div><div style="font-size:12px;color:var(--text-muted);">${pts} / ${info.nextRequirement===Infinity?'∞':info.nextRequirement} نقطة</div><p style="margin-top:12px;font-size:11px;color:var(--text-muted);">كل عملية = 500 نقطة</p></div>`;
}
