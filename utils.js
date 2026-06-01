// utils.js — دوال مساعدة عامة ومشتركة لجميع أجزاء التطبيق
import { EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID } from './firebase-config.js';

// ---------- اختصارات DOM ----------
export const $  = (s) => document.querySelector(s);
export const $$ = (s) => document.querySelectorAll(s);

// ---------- الإشعارات والتحميل ----------
export function showToast(msg, type = 'info') {
  const c = $('#toast-container');
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3300);
}

export function showLoading() { $('#loading-screen').classList.remove('hidden'); }
export function hideLoading() { $('#loading-screen').classList.add('hidden'); }

export function showConfirm(msg) {
  return new Promise(resolve => {
    const m = $('#confirm-modal');
    $('#confirm-message').textContent = msg;
    m.classList.remove('hidden');
    const cleanup = () => {
      m.classList.add('hidden');
      $('#confirm-yes').removeEventListener('click', yes);
      $('#confirm-no').removeEventListener('click', no);
    };
    const yes = () => { cleanup(); resolve(true); };
    const no  = () => { cleanup(); resolve(false); };
    $('#confirm-yes').addEventListener('click', yes);
    $('#confirm-no').addEventListener('click', no);
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
  if (role === 'vip3')        return 'vip-avatar-vip3';
  if (role === 'vip2')        return 'vip-avatar-vip2';
  if (role === 'vip1')        return 'vip-avatar-vip1';
  return '';
}

export function getVipNameClass(role) {
  if (role === 'admin')       return 'vip-name-admin';
  if (role === 'super_mod')   return 'vip-name-supermod';
  if (role === 'moderator')   return 'vip-name-supermod';
  if (role === 'vip3')        return 'vip-name-vip3';
  if (role === 'vip2')        return 'vip-name-vip2';
  if (role === 'vip1')        return 'vip-name-vip1';
  return '';
}

export function getVipFrameClass(role) {
  if (role === 'admin')       return 'frame-admin';
  if (role === 'super_mod')   return 'frame-mod';
  if (role === 'moderator')   return 'frame-mod';
  if (role === 'vip3')        return 'frame-vip3';
  if (role === 'vip2')        return 'frame-vip2';
  if (role === 'vip1')        return 'frame-vip1';
  return 'frame-default';
}

// ---------- تنسيق التاريخ بالأرقام الأجنبية (MM/DD/YYYY) ----------
export function formatDateEn(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${m}/${d}/${y}`;
}

export function formatTimeEn(date) {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function formatDateTimeEn(date) {
  return `${formatDateEn(date)} ${formatTimeEn(date)}`;
}

// ---------- أسماء الأيام بالإنجليزية ----------
export function getDayNameEn(date) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
}