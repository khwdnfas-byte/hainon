/*
 | HAINON © 2026 جميع الحقوق محفوظة
 | لا يُسمح بنسخ أو توزيع أو استخدام هذا الملف أو أي جزء من الكود دون إذن كتابي صريح.
 | هذا الملف جزء من نظام HAINON المحاسبي.
*/

// utils.js — دوال مساعدة عامة ومشتركة لجميع أجزاء التطبيق
import { EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID } from './firebase-config.js';

// ---------- اختصارات DOM ----------
export const $  = (s) => document.querySelector(s);
export const $$ = (s) => document.querySelectorAll(s);

// ---------- الإشعارات والتحميل ----------
export function showToast(msg, type = 'info') {
  const c = $('#toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3300);
}

export function showLoading() { const el = $('#loading-screen'); if (el) el.classList.remove('hidden'); }
export function hideLoading() { const el = $('#loading-screen'); if (el) el.classList.add('hidden'); }

export function showConfirm(msg) {
  return new Promise(resolve => {
    const m = $('#confirm-modal');
    const msgEl = $('#confirm-message');
    if (!m || !msgEl) return resolve(false);
    msgEl.textContent = msg;
    m.classList.remove('hidden');
    const cleanup = () => {
      m.classList.add('hidden');
      $('#confirm-yes')?.removeEventListener('click', yes);
      $('#confirm-no')?.removeEventListener('click', no);
    };
    const yes = () => { cleanup(); resolve(true); };
    const no  = () => { cleanup(); resolve(false); };
    $('#confirm-yes')?.addEventListener('click', yes);
    $('#confirm-no')?.addEventListener('click', no);
  });
}

// ---------- تنسيق العملات ----------
export function formatCurrency(amount, cur = 'USD') {
  const n = parseFloat(amount) || 0;
  if (cur === 'SYP') {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n) + ' ل.س';
  }
  return '$' + n.toFixed(2);
}

// ---------- توليد الرموز ----------
export function generateCode() { return Math.floor(100000 + Math.random() * 900000).toString(); }
export function generateSerialId() { return Math.floor(100000 + Math.random() * 900000).toString(); }

// ---------- التحقق من كلمة المرور ----------
export function validatePassword(pw) {
  return /^(?=.*[a-zA-Z])[a-zA-Z0-9]{6,}$/.test(pw);
}

// ---------- التسميات ----------
export function getTypeLabel(type) {
  const labels = {
    incoming:      '<i class="fas fa-download"></i> وارد',
    outgoing:      '<i class="fas fa-upload"></i> صادر',
    sale:          '<i class="fas fa-tag"></i> بيع',
    purchase:      '<i class="fas fa-shopping-cart"></i> شراء',
    debt_in:       '<i class="fas fa-hand-holding-usd"></i> دين لنا',
    debt_out:      '<i class="fas fa-hand-holding-usd"></i> دين علينا',
    debt_received: '<i class="fas fa-check-circle"></i> دين مقبوض',
    debt_paid:     '<i class="fas fa-times-circle"></i> دين مدفوع',
    returned:      '<i class="fas fa-undo-alt"></i> مرتجع'
  };
  return labels[type] || type;
}

// ---------- حماية HTML ----------
export function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

// ---------- الموقع والجهاز ----------
export async function getUserLocation() {
  try {
    const r = await fetch('https://ipapi.co/json/');
    const d = await r.json();
    return { ip: d.ip, country: d.country_name, city: d.city };
  } catch { return { ip: '?', country: '?', city: '?' }; }
}

export function getDeviceInfo() {
  const ua = navigator.userAgent;
  let browser = '?', os = '?';
  if (ua.includes('Chrome'))  browser = 'Chrome';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari'))  browser = 'Safari';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac')) os = 'MacOS';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iOS')) os = 'iOS';
  return { browser, os, userAgent: ua };
}

// ---------- إرسال البريد (EmailJS) ----------
export async function sendEmailCode(email, code) {
  if (!email) return false;
  let attempts = 0;
  while (typeof emailjs === 'undefined' && attempts < 50) {
    await new Promise(r => setTimeout(r, 100));
    attempts++;
  }
  if (typeof emailjs === 'undefined') {
    showToast('خدمة البريد غير جاهزة', 'error');
    return false;
  }
  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email: email,
      passcode: code,
      time: new Date(Date.now() + 15 * 60 * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    });
    return true;
  } catch (e) {
    showToast('فشل إرسال البريد', 'error');
    return false;
  }
}

// ---------- تأثيرات VIP ----------
export function getVipAvatarClass(role) {
  if (role === 'admin')       return 'vip-avatar-admin';
  if (role === 'super_mod')   return 'vip-avatar-supermod';
  if (role === 'moderator')   return 'vip-avatar-supermod';
  if (role === 'vip5')        return 'vip-avatar-vip5';
  if (role === 'vip4')        return 'vip-avatar-vip4';
  if (role === 'vip3')        return 'vip-avatar-vip3';
  if (role === 'vip2')        return 'vip-avatar-vip2';
  if (role === 'vip1')        return 'vip-avatar-vip1';
  return '';
}

export function getVipNameClass(role) {
  if (role === 'admin')       return 'vip-name-admin';
  if (role === 'super_mod')   return 'vip-name-supermod';
  if (role === 'moderator')   return 'vip-name-supermod';
  if (role === 'vip5')        return 'vip-name-vip5';
  if (role === 'vip4')        return 'vip-name-vip4';
  if (role === 'vip3')        return 'vip-name-vip3';
  if (role === 'vip2')        return 'vip-name-vip2';
  if (role === 'vip1')        return 'vip-name-vip1';
  return '';
}

export function getVipFrameClass(role) {
  if (role === 'admin')       return 'frame-admin';
  if (role === 'super_mod')   return 'frame-mod';
  if (role === 'moderator')   return 'frame-mod';
  if (role === 'vip5')        return 'frame-vip5';
  if (role === 'vip4')        return 'frame-vip4';
  if (role === 'vip3')        return 'frame-vip3';
  if (role === 'vip2')        return 'frame-vip2';
  if (role === 'vip1')        return 'frame-vip1';
  return 'frame-default';
}

// ---------- تنسيق التاريخ بالأرقام الأجنبية (MM/DD/YYYY) ----------
export function formatDateEn(date) {
  if (!date) return '---';
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${m}/${day}/${y}`;
}

export function formatTimeEn(date) {
  if (!date) return '---';
  return new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function formatDateTimeEn(date) {
  return `${formatDateEn(date)} ${formatTimeEn(date)}`;
}

export function getDayNameEn(date) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[new Date(date).getDay()];
}

// ---------- نظام مستوى الحساب (LV) ----------
export function calculateLevel(transactionCount) {
  if (transactionCount >= 4000) return 2;
  if (transactionCount >= 2500) return 1;
  return 0;
}

export function getLevelInfo(level) {
  const levels = {
    0: { name: 'عادي', nextRequirement: 2500, color: 'var(--text-muted)' },
    1: { name: 'LV 1', nextRequirement: 4000, color: 'var(--gold)' },
    2: { name: 'LV 2', nextRequirement: Infinity, color: 'var(--vip2-color)' }
  };
  return levels[level] || levels[0];
}

// ---------- ألوان شريط الكتابة ----------
export const WRITE_BAR_COLORS = [
  '#FFFFFF', '#FFD700', '#FF4500', '#00C853', '#8A2BE2',
  '#4169E1', '#FF1744', '#FF9800', '#00BCD4', '#E91E63'
];

// ---------- حساب مستوى VIP تلقائي ----------
export function getAutoVipLevel(role) {
  if (role === 'admin') return 5;
  if (role === 'super_mod') return 4;
  if (role === 'moderator') return 4;
  return 0;
}

// ---------- تأثيرات VIP الإضافية ----------
export function getVipGlowStyle(role) {
  if (role === 'admin') return '0 0 25px rgba(255, 215, 0, 0.9), 0 0 50px rgba(255, 69, 0, 0.5)';
  if (role === 'super_mod') return '0 0 20px rgba(65, 105, 225, 0.8), 0 0 40px rgba(212, 175, 55, 0.4)';
  if (role === 'moderator') return '0 0 15px rgba(65, 105, 225, 0.6)';
  if (role === 'vip3') return '0 0 15px rgba(138, 43, 226, 0.7)';
  if (role === 'vip2') return '0 0 12px rgba(0, 200, 83, 0.6)';
  if (role === 'vip1') return '0 0 8px rgba(139, 69, 19, 0.5)';
  return 'none';
}

export function getVipBadgeText(role) {
  if (role === 'admin') return 'VIP5 • مدير';
  if (role === 'super_mod') return 'VIP4 • مشرف مميز';
  if (role === 'moderator') return 'VIP4 • مشرف';
  if (role === 'vip3') return 'VIP3';
  if (role === 'vip2') return 'VIP2';
  if (role === 'vip1') return 'VIP1';
  return '';
}
