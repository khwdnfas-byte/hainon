// =============================================
// HAINON - التطبيق الرئيسي
// نظام المحاسبة والإدارة المالية
// =============================================

// ---------- إعدادات EmailJS ----------
const EMAILJS_PUBLIC_KEY = "ILfMM-EFqQXbiBmeZ";
const EMAILJS_SERVICE_ID = "service_91tlpl2";
const EMAILJS_TEMPLATE_ID = "template_f7rs16k";

// ---------- استيراد Firebase ----------
import { auth, db, rtdb } from './firebase.js';

import {
    createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
    onAuthStateChanged, updateProfile, sendPasswordResetEmail,
    updateEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import {
    doc, setDoc, getDoc, collection, addDoc, query,
    where, orderBy, onSnapshot, serverTimestamp, getDocs,
    updateDoc, deleteDoc, Timestamp, limit
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import {
    ref, set, onValue, onDisconnect,
    serverTimestamp as rtdbTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// ---------- تحميل EmailJS ----------
(function() {
    const script = document.createElement('script');
    script.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js";
    script.onload = function() {
        if (typeof emailjs !== 'undefined') {
            emailjs.init(EMAILJS_PUBLIC_KEY);
            console.log('✅ EmailJS تم تحميله وتهيئته بنجاح');
        }
    };
    document.head.appendChild(script);
})();

// ---------- تحميل Cropper.js ----------
(function() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.css';
    document.head.appendChild(link);
    
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.js';
    script.onload = () => console.log('✅ Cropper.js تم تحميله');
    document.head.appendChild(script);
})();

// =============================================
// متغيرات عامة
// =============================================
let currentUser = null;
let userData = null;
let isAdmin = false;
let isSuperMod = false;
let isMod = false;
let isVip = false;
let vipLevel = 0;
let sidebarOpen = false;
let calculatorOpen = false;
let calcExpression = '';
let selectedChatUser = null;
let onlineUsers = {};
let currentPage = 'dashboard';
let historyStack = [];

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// =============================================
// دوال مساعدة
// =============================================
function showToast(msg, type = 'info') {
    const c = $('#toast-container');
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3300);
}

function showLoading() { $('#loading-screen').classList.remove('hidden'); }
function hideLoading() { $('#loading-screen').classList.add('hidden'); }

function showConfirm(msg) {
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
        const no = () => { cleanup(); resolve(false); };
        $('#confirm-yes').addEventListener('click', yes);
        $('#confirm-no').addEventListener('click', no);
    });
}

function formatCurrency(amount, cur = 'USD') {
    const n = parseFloat(amount) || 0;
    return cur === 'SYP' ? `${n.toLocaleString('ar-SY')} ل.س` : `$${n.toFixed(2)}`;
}

function generateCode() { return Math.floor(100000 + Math.random() * 900000).toString(); }
function generateSerialId() { return Math.floor(100000 + Math.random() * 900000).toString(); }
function validatePassword(pw) { return /^(?=.*[a-zA-Z])[a-zA-Z0-9]{6,}$/.test(pw); }

function getTypeLabel(type) {
    const labels = {
        incoming: '<i class="fas fa-download"></i> وارد',
        outgoing: '<i class="fas fa-upload"></i> صادر',
        sale: '<i class="fas fa-tag"></i> بيع',
        purchase: '<i class="fas fa-shopping-cart"></i> شراء',
        debt_in: '<i class="fas fa-hand-holding-usd"></i> دين لنا',
        debt_out: '<i class="fas fa-hand-holding-usd"></i> دين علينا',
        debt_received: '<i class="fas fa-check-circle"></i> دين مقبوض',
        debt_paid: '<i class="fas fa-times-circle"></i> دين مدفوع',
        returned: '<i class="fas fa-undo-alt"></i> مرتجع'
    };
    return labels[type] || type;
}

function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}

async function getUserLocation() {
    try {
        const r = await fetch('https://ipapi.co/json/');
        const d = await r.json();
        return { ip: d.ip, country: d.country_name, city: d.city };
    } catch { return { ip: '?', country: '?', city: '?' }; }
}

function getDeviceInfo() {
    const ua = navigator.userAgent;
    let browser = '?', os = '?';
    if (ua.includes('Chrome')) browser = 'Chrome';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Safari')) browser = 'Safari';
    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac')) os = 'MacOS';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iOS')) os = 'iOS';
    return { browser, os, userAgent: ua };
}

// ---------- إرسال رمز التحقق عبر EmailJS (مع فحص البريد الفارغ) ----------
async function sendEmailCode(email, code) {
    if (!email || email.trim() === '') {
        showToast('الرجاء إدخال بريد إلكتروني صحيح', 'error');
        return false;
    }
    
    let attempts = 0;
    while (typeof emailjs === 'undefined' && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }
    
    if (typeof emailjs === 'undefined') {
        showToast('خدمة البريد غير جاهزة. حاول لاحقاً.', 'error');
        return false;
    }
    
    try {
        await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
            to_email: email,
            passcode: code,
            time: new Date(Date.now() + 15 * 60 * 1000).toLocaleTimeString('ar-SY')
        });
        return true;
    } catch (error) {
        showToast('فشل إرسال البريد. حاول مرة أخرى.', 'error');
        return false;
    }
}

// ---------- تخزين مؤقت للرموز ----------
const pendingCodes = {};

function storeEmailForResend(email) {
    if (email) localStorage.setItem('lastVerificationEmail', email);
}

function getStoredEmailForResend() {
    return localStorage.getItem('lastVerificationEmail') || '';
}

// ---------- المعادلات المالية ----------
function calculateNet(txs, cur = 'USD') {
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

function calculateProfitLoss(txs, cur = 'USD') {
    let profit = 0, loss = 0;
    const products = {};
    txs.forEach(t => {
        if (t.currency !== cur || !t.productName) return;
        if (!products[t.productName]) {
            products[t.productName] = { purchase: 0, sale: 0, returned: 0, returnProfit: 0 };
        }
        const p = products[t.productName];
        const a = parseFloat(t.amount) || 0;
        if (t.type === 'purchase') p.purchase += a;
        else if (t.type === 'sale') p.sale += a;
        else if (t.type === 'returned') {
            p.returned += a;
            const avgCost = p.purchase > 0 ? p.purchase / (p.sale / a || 1) : 0;
            p.returnProfit += a - avgCost;
        }
    });
    for (const prod in products) {
        const p = products[prod];
        const diff = (p.sale - p.purchase) - p.returnProfit;
        if (diff > 0) profit += diff;
        else loss += Math.abs(diff);
    }
    return { profit, loss };
}// ---------- حالة الاتصال (Presence) ----------
function setupPresence(uid) {
    const presenceRef = ref(rtdb, `presence/${uid}`);
    const connectedRef = ref(rtdb, '.info/connected');
    onValue(connectedRef, snap => {
        if (snap.val() === true) {
            onDisconnect(presenceRef).set({ status: 'offline', lastSeen: rtdbTimestamp() });
            set(presenceRef, { status: 'online', lastSeen: rtdbTimestamp() });
        }
    });
}

function monitorPresence() {
    onValue(ref(rtdb, 'presence'), snap => { onlineUsers = snap.val() || {}; });
}

// ---------- دوال مساعدة لتأثيرات VIP ----------
function getVipAvatarClass(role) {
    if (role === 'admin') return 'vip-avatar-admin';
    if (role === 'super_mod') return 'vip-avatar-supermod';
    if (role === 'moderator') return 'vip-avatar-supermod';
    if (role === 'vip3') return 'vip-avatar-vip3';
    if (role === 'vip2') return 'vip-avatar-vip2';
    if (role === 'vip1') return 'vip-avatar-vip1';
    return '';
}

function getVipNameClass(role) {
    if (role === 'admin') return 'vip-name-admin';
    if (role === 'super_mod') return 'vip-name-supermod';
    if (role === 'moderator') return 'vip-name-supermod';
    if (role === 'vip3') return 'vip-name-vip3';
    if (role === 'vip2') return 'vip-name-vip2';
    if (role === 'vip1') return 'vip-name-vip1';
    return '';
}

function getVipFrameClass(role) {
    if (role === 'admin') return 'frame-admin';
    if (role === 'super_mod') return 'frame-mod';
    if (role === 'moderator') return 'frame-mod';
    if (role === 'vip3') return 'frame-vip3';
    if (role === 'vip2') return 'frame-vip2';
    if (role === 'vip1') return 'frame-vip1';
    return 'frame-default';
}

// ---------- بناء القائمة الجانبية ----------
function buildSidebar() {
    const nav = $('#sidebar-nav');
    nav.innerHTML = '';
    
    const addBtn = (page, icon, label, cls = '') => {
        const b = document.createElement('button');
        b.className = `nav-btn ${cls}`;
        b.dataset.page = page;
        b.innerHTML = `<i class="fas ${icon}"></i> ${label}`;
        b.addEventListener('click', () => navigateTo(page));
        nav.appendChild(b);
    };
    
    if (!isVip && !isAdmin && !isMod && !isSuperMod) {
        addBtn('activate-vip', 'fa-star', 'تفعيل VIP');
    }
    
    addBtn('dashboard', 'fa-chart-pie', 'الرئيسية');
    addBtn('reports', 'fa-file-invoice', 'التقارير');
    addBtn('debts', 'fa-hand-holding-usd', 'الديون');
    addBtn('transactions', 'fa-exchange-alt', 'العمليات');
    
    if (isAdmin || isMod || isSuperMod) {
        addBtn('users', 'fa-users', 'إدارة المستخدمين');
    }
    
    if (isAdmin || isMod || isSuperMod) {
        addBtn('chat', 'fa-comments', 'مشاكل المستخدمين');
    } else {
        addBtn('chat', 'fa-headset', 'خدمة العملاء');
    }
    
    addBtn('settings', 'fa-cog', 'الإعدادات');
    addBtn('privacy', 'fa-shield-alt', 'سياسة الخصوصية');
    
    if (isVip || isAdmin || isMod || isSuperMod) {
        $('#sidebar-write-bar').classList.remove('hidden');
    } else {
        $('#sidebar-write-bar').classList.add('hidden');
    }
}

// ---------- تحديث واجهة المستخدم ----------
function updateUI() {
    if (!userData) return;
    const av = userData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name||'?')}&background=D4AF37&color=111&size=200&bold=true&format=svg`;
    $('#header-avatar-img').src = av;
    $('#sidebar-avatar-img').src = av;
    $('#sidebar-username').textContent = userData.name || 'مستخدم';
    $('#sidebar-id').textContent = `ID: ${userData.serialId || '----'}`;
    $('#sidebar-id').className = `sidebar-id ${vipLevel > 0 ? 'vip-id-vip'+vipLevel : ''}`;
    $('#sidebar-bio').textContent = userData.bio || '';
    
    let roleText = '<i class="fas fa-user"></i> مستخدم';
    if (isAdmin) roleText = '<i class="fas fa-crown"></i> مدير';
    else if (isSuperMod) roleText = '<i class="fas fa-shield-alt"></i> مشرف مميز';
    else if (isMod) roleText = '<i class="fas fa-shield-alt"></i> مشرف';
    else if (vipLevel > 0) roleText = `<i class="fas fa-star"></i> VIP ${vipLevel}`;
    $('#sidebar-role').innerHTML = roleText;
    
    // تأثيرات VIP على الصورة والاسم
    const avatarContainer = $('#sidebar-avatar-container');
    const usernameEl = $('#sidebar-username');
    
    // إزالة الكلاسات القديمة
    avatarContainer.className = 'sidebar-avatar';
    usernameEl.className = 'sidebar-username';
    
    // إضافة كلاسات VIP
    const vipAvatarClass = getVipAvatarClass(userData.role);
    const vipNameClass = getVipNameClass(userData.role);
    
    if (vipAvatarClass) avatarContainer.classList.add(vipAvatarClass);
    if (vipNameClass) usernameEl.classList.add(vipNameClass);
    
    // تأثيرات التوهج حسب المستوى
    avatarContainer.style.border = '3px solid var(--gold)';
    if (vipLevel === 3) avatarContainer.style.boxShadow = '0 0 20px rgba(138,43,226,0.8)';
    else if (vipLevel === 2) avatarContainer.style.boxShadow = '0 0 15px rgba(0,200,83,0.5)';
    else if (vipLevel === 1) avatarContainer.style.boxShadow = '0 0 8px rgba(139,69,19,0.3)';
    
    buildSidebar();
}

// ---------- تحميل بيانات المستخدم ----------
async function loadUserData() {
    if (!currentUser) return false;
    try {
        const d = await getDoc(doc(db, 'users', currentUser.uid));
        if (d.exists()) {
            userData = d.data();
            isAdmin = userData.role === 'admin';
            isSuperMod = userData.role === 'super_mod';
            isMod = userData.role === 'moderator';
            isVip = userData.role && userData.role.startsWith('vip');
            vipLevel = isVip ? parseInt(userData.role.replace('vip','')) || 0 : 0;
            
            if (isVip && userData.vipExpiry && userData.vipExpiry.toDate() < new Date()) {
                await updateDoc(doc(db, 'users', currentUser.uid), { role: 'user' });
                userData.role = 'user';
                isVip = false;
                vipLevel = 0;
            }
            
            updateUI();
            return true;
        }
        return false;
    } catch { return false; }
}// =============================================
// نظام المصادقة
// =============================================

// ---------- تسجيل مستخدم جديد ----------
async function handleRegister(e) {
    e.preventDefault();
    
    const name = $('#register-name').value.trim();
    const email = $('#register-email').value.trim();
    const password = $('#register-password').value;

    if (!name || !email || !password) return showToast('جميع الحقول مطلوبة', 'error');
    if (name.length < 2) return showToast('الاسم يجب أن يكون حرفين على الأقل', 'error');
    if (!validatePassword(password)) return showToast('كلمة المرور يجب أن تحتوي على حرف إنجليزي + أرقام (6 خانات)', 'error');

    try {
        showLoading();
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // جميع المستخدمين الجدد دورهم "user" (يتم تعيين الأدمن يدوياً من Firebase)
        const serialId = generateSerialId();
        const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=D4AF37&color=111&size=200&bold=true&format=svg`;

        await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid,
            name, email, serialId,
            role: 'user',
            avatar: avatarUrl,
            onboardingCompleted: false,
            emailVerified: false,
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp(),
            bio: '',
            privacy: {
                whoCanSeeProfile: 'everyone',
                whoCanSendFriend: 'everyone',
                showStatus: false,
                showLastSeen: false
            }
        });

        await updateProfile(user, { displayName: name });
        
        const code = generateCode();
        pendingCodes[email] = { code, expires: Date.now() + 10 * 60 * 1000 };
        storeEmailForResend(email);
        const sent = await sendEmailCode(email, code);
        
        hideLoading();
        if (sent) {
            showToast('تم إنشاء الحساب. تم إرسال رمز تأكيد إلى بريدك', 'success');
        } else {
            showToast('تم إنشاء الحساب لكن فشل إرسال رمز التأكيد. حاول إعادة الإرسال لاحقاً.', 'error');
        }
        showVerifyEmailScreen();
        
    } catch (error) {
        hideLoading();
        let msg = (error.message || error.code || 'خطأ غير معروف');
        if (error.code === 'auth/email-already-in-use') msg = 'البريد الإلكتروني مستخدم مسبقاً';
        else if (error.code === 'auth/invalid-email') msg = 'صيغة البريد غير صحيحة';
        else if (error.code === 'auth/weak-password') msg = 'كلمة المرور ضعيفة جداً';
        else if (error.code === 'auth/network-request-failed') msg = 'فشل الاتصال بالإنترنت';
        showToast(msg, 'error');
    }
}

// ---------- تأكيد البريد الإلكتروني ----------
async function verifyEmailCode() {
    const code = $('#verify-code-input').value.trim();
    if (code.length !== 6) return showToast('أدخل رمزاً مكوناً من 6 أرقام', 'error');
    
    const email = currentUser?.email;
    if (!email) return showToast('حدث خطأ، حاول مرة أخرى', 'error');
    
    const pending = pendingCodes[email];
    if (!pending || Date.now() > pending.expires) {
        return showToast('انتهت صلاحية الرمز، أعد الإرسال', 'error');
    }
    
    if (pending.code !== code) {
        return showToast('الرمز غير صحيح', 'error');
    }
    
    delete pendingCodes[email];
    
    try {
        await updateDoc(doc(db, 'users', currentUser.uid), { emailVerified: true });
        userData.emailVerified = true;
        showToast('تم تأكيد البريد بنجاح', 'success');
        $('#verify-email-screen').classList.add('hidden');
        showOnboarding();
    } catch (error) {
        showToast('فشل في تحديث الحالة', 'error');
    }
}

// ---------- إعادة إرسال رمز التأكيد ----------
async function resendVerificationCode() {
    const email = getStoredEmailForResend() || (currentUser?.email) || '';
    
    if (!email || email.trim() === '') {
        showToast('البريد الإلكتروني غير متوفر. حاول مرة أخرى.', 'error');
        return;
    }
    
    const code = generateCode();
    pendingCodes[email] = { code, expires: Date.now() + 10 * 60 * 1000 };
    const sent = await sendEmailCode(email, code);
    if (sent) {
        showToast('تم إعادة إرسال الرمز', 'success');
    }
}

// ---------- تسجيل الدخول ----------
async function handleLogin(e) {
    e.preventDefault();
    
    const email = $('#login-email').value.trim();
    const password = $('#login-password').value;

    if (!email || !password) return showToast('جميع الحقول مطلوبة', 'error');

    try {
        showLoading();
        await signInWithEmailAndPassword(auth, email, password);
        showToast('تم تسجيل الدخول بنجاح', 'success');
        hideLoading();
    } catch (error) {
        hideLoading();
        let msg = 'بيانات الدخول غير صحيحة';
        if (error.code === 'auth/user-not-found') msg = 'المستخدم غير موجود';
        if (error.code === 'auth/wrong-password') msg = 'كلمة المرور خاطئة';
        if (error.code === 'auth/too-many-requests') msg = 'محاولات كثيرة، حاول لاحقاً';
        showToast(msg, 'error');
    }
}

// ---------- تسجيل الخروج ----------
async function handleLogout() {
    const confirmed = await showConfirm('هل أنت متأكد من تسجيل الخروج؟');
    if (confirmed) {
        await signOut(auth);
        showToast('تم تسجيل الخروج', 'info');
    }
}

// ---------- نسيت كلمة المرور ----------
async function handleForgotPassword() {
    const email = $('#forgot-email').value.trim();
    if (!email) return showToast('أدخل بريدك الإلكتروني', 'error');
    
    try {
        const usersSnapshot = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
        if (usersSnapshot.empty) return showToast('البريد غير مسجل', 'error');
        
        const code = generateCode();
        pendingCodes[email] = { code, expires: Date.now() + 10 * 60 * 1000, type: 'reset' };
        storeEmailForResend(email);
        const sent = await sendEmailCode(email, code);
        
        if (sent) {
            showToast('تم إرسال رمز التحقق إلى بريدك', 'success');
            $('#forgot-password-modal').classList.add('hidden');
            $('#reset-password-modal').classList.remove('hidden');
            $('#reset-password-modal').dataset.email = email;
        }
    } catch (error) {
        showToast('فشل في إرسال الرمز', 'error');
    }
}

// ---------- إعادة تعيين كلمة المرور ----------
async function handleResetPassword() {
    const email = $('#reset-password-modal').dataset.email;
    const enteredCode = $('#reset-code-input').value.trim();
    const newPass = $('#reset-new-password').value;
    const confirmPass = $('#reset-confirm-password').value;
    
    if (!email || email.trim() === '') return showToast('البريد الإلكتروني غير متوفر', 'error');
    if (!enteredCode) return showToast('أدخل رمز التحقق', 'error');
    if (!newPass || !confirmPass) return showToast('أدخل كلمة المرور الجديدة', 'error');
    if (newPass !== confirmPass) return showToast('كلمتا المرور غير متطابقتين', 'error');
    if (!validatePassword(newPass)) return showToast('كلمة المرور ضعيفة', 'error');
    
    const pending = pendingCodes[email];
    if (!pending || pending.type !== 'reset' || Date.now() > pending.expires) {
        return showToast('انتهت صلاحية الرمز أو غير صحيح', 'error');
    }
    if (pending.code !== enteredCode) return showToast('الرمز غير صحيح', 'error');
    
    delete pendingCodes[email];
    const tempPass = 'Hainon' + Math.random().toString(36).slice(-6) + '!';
    
    try {
        const sent = await sendEmailCode(email, `كلمة المرور المؤقتة: ${tempPass}\nاستخدمها لتسجيل الدخول ثم قم بتغيير كلمة مرورك فوراً.`);
        if (sent) {
            showToast('تم التحقق. تم إرسال كلمة مرور مؤقتة إلى بريدك.', 'success');
        } else {
            showToast('تم التحقق لكن فشل إرسال كلمة المرور المؤقتة.', 'error');
        }
        $('#reset-password-modal').classList.add('hidden');
    } catch (error) {
        showToast('فشل في إرسال كلمة المرور المؤقتة', 'error');
    }
}

// ---------- شاشات التنقل ----------
function showVerifyEmailScreen() {
    $('#auth-screen').classList.add('hidden');
    $('#app').classList.add('hidden');
    $('#onboarding-screen').classList.add('hidden');
    $('#verify-email-screen').classList.remove('hidden');
}

function showOnboarding() {
    $('#auth-screen').classList.add('hidden');
    $('#app').classList.add('hidden');
    $('#verify-email-screen').classList.add('hidden');
    $('#onboarding-screen').classList.remove('hidden');
    
    if (currentUser && userData) {
        const avatarUrl = userData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name || 'مستخدم')}&background=D4AF37&color=111&size=200&bold=true&format=svg`;
        $('#onboarding-avatar-img').src = avatarUrl;
    }
}

async function completeOnboarding(avatarUrl = null) {
    if (!currentUser) return;
    
    try {
        const userRef = doc(db, 'users', currentUser.uid);
        const updateData = { onboardingCompleted: true };
        if (avatarUrl) updateData.avatar = avatarUrl;
        
        await updateDoc(userRef, updateData);
        if (avatarUrl) userData.avatar = avatarUrl;
        userData.onboardingCompleted = true;
        
        $('#onboarding-screen').classList.add('hidden');
        $('#app').classList.remove('hidden');
        updateUI();
        navigateTo('dashboard');
        showToast('تم إكمال الإعداد بنجاح', 'success');
    } catch (error) {
        showToast('حدث خطأ في حفظ البيانات', 'error');
    }
}// =============================================
// الصفحة الرئيسية - Dashboard
// =============================================

async function loadDashboardPage() {
    await archiveDailyTransactions();
    
    const section = $('#page-dashboard');
    
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
        
        const usdNet = calculateNet(allTx, 'USD');
        const sypNet = calculateNet(allTx, 'SYP');
        
        const stats = [
            { icon: 'fa-download', label: 'وارد', valueUSD: 0, valueSYP: 0, type: 'incoming' },
            { icon: 'fa-upload', label: 'صادر', valueUSD: 0, valueSYP: 0, type: 'outgoing' },
            { icon: 'fa-tag', label: 'بيع', valueUSD: 0, valueSYP: 0, type: 'sale' },
            { icon: 'fa-shopping-cart', label: 'شراء', valueUSD: 0, valueSYP: 0, type: 'purchase' },
            { icon: 'fa-hand-holding-usd', label: 'دين لنا', valueUSD: 0, valueSYP: 0, type: 'debt_in' },
            { icon: 'fa-hand-holding-usd', label: 'دين علينا', valueUSD: 0, valueSYP: 0, type: 'debt_out' },
            { icon: 'fa-check-circle', label: 'دين مقبوض', valueUSD: 0, valueSYP: 0, type: 'debt_received' },
            { icon: 'fa-times-circle', label: 'دين مدفوع', valueUSD: 0, valueSYP: 0, type: 'debt_paid' },
            { icon: 'fa-undo-alt', label: 'مرتجع', valueUSD: 0, valueSYP: 0, type: 'returned' }
        ];
        
        allTx.forEach(t => {
            const cur = t.currency;
            const a = parseFloat(t.amount) || 0;
            const st = stats.find(s => s.type === t.type);
            if (st) {
                if (cur === 'USD') st.valueUSD += a;
                else st.valueSYP += a;
            }
        });
        
        const vipClass = vipLevel > 0 ? ' vip-card' : '';
        
        section.innerHTML = `
            <div class="stats-grid">
                ${stats.map(s => `
                    <div class="stat-card stat-net ${vipClass}" data-type="${s.type}">
                        <div class="stat-icon"><i class="fas ${s.icon}"></i></div>
                        <div class="stat-value">
                            <div>${formatCurrency(s.valueUSD)}</div>
                            <div><small>${formatCurrency(s.valueSYP, 'SYP')}</small></div>
                        </div>
                        <div class="stat-label">${s.label}</div>
                    </div>
                `).join('')}
                <div class="stat-card stat-net no-click${vipClass}">
                    <div class="stat-icon"><i class="fas fa-coins"></i></div>
                    <div class="stat-value">
                        <div>${formatCurrency(usdNet)}</div>
                        <div><small>${formatCurrency(sypNet, 'SYP')}</small></div>
                    </div>
                    <div class="stat-label">إجمالي الرصيد</div>
                </div>
            </div>
            
            <!-- نموذج إدخال العملية -->
            <div class="accordion open" id="accordion-add">
                <div class="accordion-header">
                    <span><i class="fas fa-plus-circle"></i> إضافة عملية جديدة</span>
                </div>
                <div class="accordion-body">
                    <div class="accordion-inner">
                        <form id="transaction-form">
                            <div class="form-row">
                                <input type="text" id="trans-product" placeholder="اسم العملية (المنتج)" required>
                                <input type="number" id="trans-quantity" placeholder="الكمية" min="1" value="1" style="display:none;">
                            </div>
                            <div class="form-row">
                                <input type="number" id="trans-amount" placeholder="إدخال القيمة" step="0.01" required>
                                <select id="trans-currency">
                                    <option value="USD">USD</option>
                                    <option value="SYP">SYP</option>
                                </select>
                            </div>
                            <div class="form-row">
                                <select id="trans-type" required>
                                    <option value="">-- نوع العملية --</option>
                                    <option value="incoming">وارد</option>
                                    <option value="outgoing">صادر</option>
                                    <option value="sale">بيع</option>
                                    <option value="purchase">شراء</option>
                                    <option value="debt_in">دين لنا</option>
                                    <option value="debt_out">دين علينا</option>
                                    <option value="debt_received">دين مقبوض</option>
                                    <option value="debt_paid">دين مدفوع</option>
                                    <option value="returned">مرتجع</option>
                                </select>
                            </div>
                            <button type="submit" class="btn-primary" style="width:100%;">
                                <i class="fas fa-save"></i> تأكيد العملية
                            </button>
                        </form>
                    </div>
                </div>
            </div>
            
            <!-- جدول عمليات اليوم -->
            <h3 style="margin:16px 0 8px;"><i class="fas fa-list"></i> عمليات اليوم</h3>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>النوع</th>
                            <th>المنتج</th>
                            <th>الكمية</th>
                            <th>المبلغ</th>
                            <th>العملة</th>
                            <th>التاريخ</th>
                            <th>الوقت</th>
                            <th>تعديل</th>
                            <th>حذف</th>
                        </tr>
                    </thead>
                    <tbody id="today-tbody">
                        ${todayTx.length === 0 ? '<tr><td colspan="9" style="color:var(--text-muted);padding:16px;">لا توجد عمليات اليوم</td></tr>' : ''}
                    </tbody>
                </table>
            </div>
        `;
        
        // ملء جدول اليوم
        if (todayTx.length > 0) {
            const tbody = $('#today-tbody');
            tbody.innerHTML = '';
            todayTx.forEach(t => {
                const row = document.createElement('tr');
                const hasHistory = t.history && t.history.length > 0;
                row.innerHTML = `
                    <td>${getTypeLabel(t.type)}</td>
                    <td>${t.productName || '---'}</td>
                    <td>${t.quantity || 1}</td>
                    <td>
                        <div class="history-arrows">
                            ${hasHistory ? `<button class="arrow-btn" data-dir="prev" data-id="${t.id}"><i class="fas fa-chevron-right"></i></button>` : ''}
                            <span>${formatCurrency(t.amount, t.currency)}</span>
                            ${hasHistory ? `<button class="arrow-btn" data-dir="next" data-id="${t.id}"><i class="fas fa-chevron-left"></i></button>` : ''}
                        </div>
                    </td>
                    <td>${t.currency}</td>
                    <td>${t.createdAt ? new Date(t.createdAt.toDate()).toLocaleDateString('ar-SY') : '---'}</td>
                    <td>${t.createdAt ? new Date(t.createdAt.toDate()).toLocaleTimeString('ar-SY', {hour:'2-digit', minute:'2-digit'}) : '---'}</td>
                    <td><button class="btn-outline btn-sm edit-trans-btn" data-id="${t.id}"><i class="fas fa-edit"></i></button></td>
                    <td><button class="btn-outline btn-sm delete-trans-btn" data-id="${t.id}" style="color:var(--red);border-color:var(--red);"><i class="fas fa-trash"></i></button></td>
                `;
                tbody.appendChild(row);
            });
        }
        
        // أحداث البطاقات
        section.querySelectorAll('.stat-card[data-type]').forEach(card => {
            card.addEventListener('click', () => {
                const type = card.dataset.type;
                navigateTo('transactions');
                setTimeout(() => filterTransactionsByType(type), 300);
            });
        });
        
        // أحداث الأسهم
        section.querySelectorAll('.arrow-btn').forEach(btn => {
            btn.addEventListener('click', () => handleHistoryArrow(btn.dataset.id, btn.dataset.dir, btn));
        });
        
        // أحداث تعديل وحذف
        section.querySelectorAll('.edit-trans-btn').forEach(btn => {
            btn.addEventListener('click', () => editTransaction(btn.dataset.id));
        });
        section.querySelectorAll('.delete-trans-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteTransaction(btn.dataset.id));
        });
        
        setupTransactionForm();
        
    }, (error) => {
        console.error('خطأ:', error);
        section.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">حدث خطأ في تحميل البيانات</p>';
    });
}

// ---------- إعداد نموذج العملية ----------
function setupTransactionForm() {
    const typeSelect = $('#trans-type');
    const qtyInput = $('#trans-quantity');
    const amountInput = $('#trans-amount');
    
    if (!typeSelect || !qtyInput || !amountInput) return;
    
    typeSelect.addEventListener('change', () => {
        const type = typeSelect.value;
        const needsQty = ['sale', 'purchase', 'returned'].includes(type);
        qtyInput.style.display = needsQty ? 'block' : 'none';
        amountInput.placeholder = needsQty ? 'سعر القطعة الواحدة' : 'إدخال القيمة';
    });
    
    $('#transaction-form').addEventListener('submit', handleAddTransaction);
}

// ---------- إضافة عملية جديدة ----------
async function handleAddTransaction(e) {
    e.preventDefault();
    
    const productName = $('#trans-product').value.trim();
    const type = $('#trans-type').value;
    const amount = parseFloat($('#trans-amount').value);
    const currency = $('#trans-currency').value;
    let quantity = parseInt($('#trans-quantity').value) || 1;
    
    if (!productName || !type || !amount || amount <= 0) {
        return showToast('جميع الحقول مطلوبة', 'error');
    }
    
    if (type === 'sale') {
        const available = await getAvailableQuantity(productName, currency);
        if (quantity > available) {
            return showToast(`الكمية غير متاحة. المتاح: ${available}`, 'error');
        }
    }
    
    try {
        await addDoc(collection(db, 'transactions'), {
            uid: currentUser.uid,
            productName, type, amount, currency,
            quantity: ['sale', 'purchase', 'returned'].includes(type) ? quantity : 1,
            note: '',
            createdAt: serverTimestamp(),
            updatedAt: null,
            history: []
        });
        
        showToast('تمت العملية بنجاح', 'success');
        $('#transaction-form').reset();
        $('#trans-quantity').style.display = 'none';
        $('#trans-amount').placeholder = 'إدخال القيمة';
    } catch (error) {
        showToast('فشل في إضافة العملية', 'error');
    }
}

// ---------- حساب الكمية المتاحة ----------
async function getAvailableQuantity(productName, currency) {
    const q = query(
        collection(db, 'transactions'),
        where('uid', '==', currentUser.uid),
        where('productName', '==', productName),
        where('currency', '==', currency)
    );
    const snapshot = await getDocs(q);
    let purchased = 0, sold = 0, returned = 0;
    snapshot.forEach(doc => {
        const t = doc.data();
        const qty = parseInt(t.quantity) || 1;
        if (t.type === 'purchase') purchased += qty;
        else if (t.type === 'sale') sold += qty;
        else if (t.type === 'returned') returned += qty;
    });
    return purchased + returned - sold;
}

// ---------- تعديل عملية ----------
async function editTransaction(transId) {
    const docRef = doc(db, 'transactions', transId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return;
    
    const t = snap.data();
    const newAmount = prompt('أدخل المبلغ الجديد:', t.amount);
    if (!newAmount || parseFloat(newAmount) <= 0) return;
    
    const newType = prompt('نوع العملية (اتركه للتخطي):', t.type);
    const finalType = newType || t.type;
    
    const historyEntry = { amount: t.amount, type: t.type, updatedAt: t.updatedAt || t.createdAt };
    const history = t.history || [];
    history.push(historyEntry);
    
    try {
        await updateDoc(docRef, { amount: parseFloat(newAmount), type: finalType, updatedAt: serverTimestamp(), history });
        showToast('تم تعديل العملية', 'success');
    } catch (error) {
        showToast('فشل في التعديل', 'error');
    }
}

// ---------- حذف عملية ----------
async function deleteTransaction(transId) {
    const confirmed = await showConfirm('حذف هذه العملية؟');
    if (!confirmed) return;
    
    try {
        await deleteDoc(doc(db, 'transactions', transId));
        showToast('تم الحذف', 'success');
    } catch (error) {
        showToast('فشل في الحذف', 'error');
    }
}

// ---------- التنقل بين تاريخ العملية ----------
let currentHistoryIndex = {};
function handleHistoryArrow(transId, dir, btn) {
    const span = btn.parentElement.querySelector('span');
    const arrows = btn.parentElement.querySelectorAll('.arrow-btn');
    
    getDoc(doc(db, 'transactions', transId)).then(snap => {
        if (!snap.exists()) return;
        const t = snap.data();
        const history = t.history || [];
        const fullHistory = [{ amount: t.amount, type: t.type, updatedAt: t.updatedAt || t.createdAt }, ...history];
        
        if (!currentHistoryIndex[transId]) currentHistoryIndex[transId] = 0;
        const idx = currentHistoryIndex[transId];
        
        let newIdx = idx;
        if (dir === 'prev' && idx > 0) newIdx = idx - 1;
        else if (dir === 'next' && idx < fullHistory.length - 1) newIdx = idx + 1;
        else return;
        
        currentHistoryIndex[transId] = newIdx;
        const entry = fullHistory[newIdx];
        span.textContent = formatCurrency(entry.amount, t.currency);
        
        if (arrows[0]) arrows[0].disabled = newIdx === 0;
        if (arrows[1]) arrows[1].disabled = newIdx === fullHistory.length - 1;
    });
}

function filterTransactionsByType(type) {
    sessionStorage.setItem('filterType', type);
}

function updateTopbarTitle(page) {
    const titles = {
        dashboard: 'نظام الإدارة المالية',
        transactions: 'العمليات المؤرشفة',
        debts: 'الديون',
        reports: 'التقارير المالية',
        userslist: 'عرض المستخدمين',
        globalchat: 'الدردشة العالمية',
        friendships: 'تكوين صداقات',
        groups: 'المجموعات',
        chat: isAdmin || isMod || isSuperMod ? 'مشاكل المستخدمين' : 'خدمة العملاء',
        users: 'إدارة المستخدمين',
        settings: 'الإعدادات',
        privacy: 'سياسة الخصوصية',
        profile: 'الملف الشخصي',
        'activate-vip': 'تفعيل VIP',
        'vip-pricing': 'أسعار VIP',
        'vip-payment': 'الدفع'
    };
    $('#topbar-subtitle').textContent = titles[page] || '';
}// =============================================
// نظام الإشعارات
// =============================================

async function sendNotification(targetUid, message, type, link = '') {
    try {
        await addDoc(collection(db, 'notifications'), {
            uid: targetUid,
            message,
            type,
            link,
            read: false,
            createdAt: serverTimestamp()
        });
    } catch (e) {
        console.error('فشل إرسال الإشعار:', e);
    }
}

function loadNotifications() {
    if (!currentUser) return;
    
    const q = query(
        collection(db, 'notifications'),
        where('uid', '==', currentUser.uid),
        orderBy('createdAt', 'desc'),
        limit(50)
    );
    
    onSnapshot(q, (snapshot) => {
        const list = $('#notifications-list');
        const badge = $('#notification-badge');
        
        let unreadCount = 0;
        list.innerHTML = '';
        
        if (snapshot.empty) {
            list.innerHTML = '<div class="notifications-item" style="color:var(--text-muted);">لا توجد إشعارات</div>';
        } else {
            snapshot.forEach(doc => {
                const notif = doc.data();
                if (!notif.read) unreadCount++;
                
                const div = document.createElement('div');
                div.className = `notifications-item ${notif.read ? '' : 'unread'}`;
                div.innerHTML = `
                    <div style="font-size:11px;color:var(--text-muted);">${notif.createdAt ? new Date(notif.createdAt.toDate()).toLocaleString('ar-SY') : ''}</div>
                    <div style="margin:4px 0;">${notif.message}</div>
                `;
                div.addEventListener('click', async () => {
                    // تحديث حالة القراءة
                    if (!notif.read) {
                        await updateDoc(doc(db, 'notifications', doc.id), { read: true });
                    }
                    
                    // إغلاق قائمة الإشعارات
                    $('#notifications-dropdown').classList.add('hidden');
                    
                    // التعامل مع نوع الإشعار
                    if (notif.type === 'vip_upgrade' || notif.type === 'id_upgrade') {
                        const msg = notif.type === 'vip_upgrade' ? notif.message : notif.message;
                        showVipConfetti(msg);
                    } else if (notif.link) {
                        navigateTo(notif.link);
                    }
                });
                list.appendChild(div);
            });
        }
        
        if (unreadCount > 0) {
            badge.classList.remove('hidden');
            badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        } else {
            badge.classList.add('hidden');
        }
    });
}

// ---------- التحقق من إشعارات VIP عند تسجيل الدخول ----------
async function checkVipNotifications() {
    if (!currentUser) return;
    
    const q = query(
        collection(db, 'notifications'),
        where('uid', '==', currentUser.uid),
        where('read', '==', false),
        where('type', 'in', ['vip_upgrade', 'id_upgrade'])
    );
    
    const snapshot = await getDocs(q);
    
    for (const docSnapshot of snapshot.docs) {
        const notif = docSnapshot.data();
        if (notif.type === 'vip_upgrade') {
            showVipConfetti(notif.message);
        } else if (notif.type === 'id_upgrade') {
            showVipConfetti(notif.message);
        }
        await updateDoc(doc(db, 'notifications', docSnapshot.id), { read: true });
    }
}

// =============================================
// شريط VIP المطور
// =============================================

function updateVipTopBar() {
    // جلب الشرائط الترويجية (الترقيات الجديدة)
    const promoQuery = query(
        collection(db, 'vipPromotions'),
        where('expiresAt', '>', new Date()),
        orderBy('expiresAt', 'asc')
    );
    
    // جلب الشرائط المكتوبة
    const barsQuery = query(
        collection(db, 'vipBars'),
        orderBy('createdAt', 'asc')
    );
    
    let allItems = [];
    
    onSnapshot(promoQuery, (promoSnap) => {
        onSnapshot(barsQuery, (barsSnap) => {
            allItems = [];
            
            // إضافة الشرائط الترويجية أولاً
            promoSnap.forEach(doc => {
                const data = doc.data();
                allItems.push({
                    type: 'promo',
                    name: '',
                    avatar: '',
                    text: data.text,
                    color: data.color || '#D4AF37'
                });
            });
            
            // إضافة الشرائط المكتوبة
            barsSnap.forEach(doc => {
                const data = doc.data();
                allItems.push({
                    type: 'user',
                    name: data.name,
                    avatar: data.avatar,
                    text: data.text,
                    color: data.color || '#D4AF37'
                });
            });
            
            // بدء العرض
            startVipBarDisplay(allItems);
        });
    });
}

let vipBarInterval = null;
let currentVipBarIndex = 0;

function startVipBarDisplay(items) {
    if (vipBarInterval) clearInterval(vipBarInterval);
    currentVipBarIndex = 0;
    
    if (items.length === 0) {
        $('#vip-top-bar-content').innerHTML = '';
        return;
    }
    
    const showNext = () => {
        if (currentVipBarIndex >= items.length) currentVipBarIndex = 0;
        const item = items[currentVipBarIndex];
        const content = $('#vip-top-bar-content');
        
        if (item.type === 'promo') {
            content.innerHTML = `
                <div class="vip-top-bar-item">
                    <span style="color:${item.color}; font-size:14px;">${escapeHtml(item.text)}</span>
                </div>
            `;
        } else {
            content.innerHTML = `
                <div class="vip-top-bar-item">
                    <img src="${item.avatar || 'https://ui-avatars.com/api/?name='+encodeURIComponent(item.name||'?')}" alt="${item.name}">
                    <span style="color:${item.color};">${item.name}: ${escapeHtml(item.text)}</span>
                </div>
            `;
        }
        
        currentVipBarIndex++;
    };
    
    showNext();
    vipBarInterval = setInterval(showNext, 15000); // 15 ثانية لكل شريط
}

// =============================================
// نظام الأرشفة التلقائية
// =============================================

async function archiveDailyTransactions() {
    if (!currentUser) return;
    
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
    
    const archiveName = `${getDayName(yesterdayStart)} ${formatDate(yesterdayStart)}`;
    
    await addDoc(collection(db, 'archives'), {
        uid: currentUser.uid,
        name: archiveName,
        date: yesterdayStart,
        type: 'daily',
        transactions: txData,
        createdAt: serverTimestamp()
    });
    
    for (const tx of txData) {
        await deleteDoc(doc(db, 'transactions', tx.id));
    }
}

function getDayName(date) {
    const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    return days[date.getDay()];
}

function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
}

// =============================================
// صفحة العمليات (الأرشيف)
// =============================================

function loadTransactionsPage() {
    const section = $('#page-transactions');
    const filterType = sessionStorage.getItem('filterType') || '';
    sessionStorage.removeItem('filterType');
    
    section.innerHTML = `
        <h2><i class="fas fa-exchange-alt"></i> العمليات المؤرشفة</h2>
        <div id="archives-list"></div>
        <div id="archive-detail" class="hidden"></div>
    `;
    
    const q = query(
        collection(db, 'archives'),
        where('uid', '==', currentUser.uid),
        orderBy('date', 'desc')
    );
    
    onSnapshot(q, (snapshot) => {
        const list = $('#archives-list');
        
        if (snapshot.empty) {
            list.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">لا توجد عمليات مؤرشفة</p>';
            return;
        }
        
        list.innerHTML = '';
        snapshot.forEach(doc => {
            const archive = doc.data();
            const div = document.createElement('div');
            div.className = 'stat-card';
            div.style.cssText = 'cursor:pointer;margin-bottom:8px;';
            div.innerHTML = `
                <div style="display:flex;align-items:center;gap:12px;">
                    <span style="font-size:24px;"><i class="fas fa-folder"></i></span>
                    <div>
                        <div style="font-weight:700;">${archive.name}</div>
                        <div style="font-size:11px;color:var(--text-muted);">${archive.transactions?.length || 0} عملية</div>
                    </div>
                </div>
            `;
            div.addEventListener('click', () => showArchiveDetail(archive, doc.id));
            list.appendChild(div);
        });
    });
}

function showArchiveDetail(archive, archiveId) {
    const detail = $('#archive-detail');
    const list = $('#archives-list');
    
    list.classList.add('hidden');
    detail.classList.remove('hidden');
    
    const txs = archive.transactions || [];
    const filterType = sessionStorage.getItem('filterType') || '';
    
    let filteredTxs = txs;
    if (filterType) {
        filteredTxs = txs.filter(t => t.type === filterType);
    }
    
    detail.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
            <button class="btn-outline btn-sm" id="back-to-archives"><i class="fas fa-arrow-right"></i> عودة</button>
            <h3 style="margin:0;">${archive.name}</h3>
        </div>
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>النوع</th>
                        <th>المنتج</th>
                        <th>الكمية</th>
                        <th>المبلغ</th>
                        <th>العملة</th>
                        <th>تعديل</th>
                        <th>حذف</th>
                    </tr>
                </thead>
                <tbody>
                    ${filteredTxs.length === 0 ? '<tr><td colspan="7" style="color:var(--text-muted);">لا توجد عمليات</td></tr>' :
                        filteredTxs.map(t => `
                            <tr>
                                <td>${getTypeLabel(t.type)}</td>
                                <td>${t.productName || '---'}</td>
                                <td>${t.quantity || 1}</td>
                                <td>${formatCurrency(t.amount, t.currency)}</td>
                                <td>${t.currency}</td>
                                <td><button class="btn-outline btn-sm edit-archive-btn" data-archive="${archiveId}" data-txid="${t.id}"><i class="fas fa-edit"></i></button></td>
                                <td><button class="btn-outline btn-sm delete-archive-btn" data-archive="${archiveId}" data-txid="${t.id}" style="color:var(--red);border-color:var(--red);"><i class="fas fa-trash"></i></button></td>
                            </tr>
                        `).join('')
                    }
                </tbody>
            </table>
        </div>
    `;
    
    $('#back-to-archives').addEventListener('click', () => {
        detail.classList.add('hidden');
        list.classList.remove('hidden');
    });
}

// =============================================
// صفحة الديون
// =============================================

function loadDebtsPage() {
    const section = $('#page-debts');
    
    section.innerHTML = `
        <h2><i class="fas fa-hand-holding-usd"></i> الديون</h2>
        <div id="debts-archives-list"></div>
        <div id="debts-detail" class="hidden"></div>
    `;
    
    const list = $('#debts-archives-list');
    
    const allDebtsDiv = document.createElement('div');
    allDebtsDiv.className = 'stat-card';
    allDebtsDiv.style.cssText = 'cursor:pointer;margin-bottom:8px;border-color:var(--gold);';
    allDebtsDiv.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;">
            <span style="font-size:24px;"><i class="fas fa-folder-open"></i></span>
            <div>
                <div style="font-weight:700;">كل الديون</div>
                <div style="font-size:11px;color:var(--text-muted);">جميع سجلات الديون</div>
            </div>
        </div>
    `;
    allDebtsDiv.addEventListener('click', () => showAllDebts());
    list.appendChild(allDebtsDiv);
    
    const q = query(
        collection(db, 'archives'),
        where('uid', '==', currentUser.uid),
        orderBy('date', 'desc')
    );
    
    onSnapshot(q, (snapshot) => {
        while (list.children.length > 1) list.removeChild(list.lastChild);
        
        snapshot.forEach(doc => {
            const archive = doc.data();
            const txs = archive.transactions || [];
            const debtTypes = ['debt_in', 'debt_out', 'debt_received', 'debt_paid'];
            const hasDebts = txs.some(t => debtTypes.includes(t.type));
            
            if (!hasDebts) return;
            
            const div = document.createElement('div');
            div.className = 'stat-card';
            div.style.cssText = 'cursor:pointer;margin-bottom:8px;';
            div.innerHTML = `
                <div style="display:flex;align-items:center;gap:12px;">
                    <span style="font-size:24px;"><i class="fas fa-folder"></i></span>
                    <div>
                        <div style="font-weight:700;">${archive.name}</div>
                        <div style="font-size:11px;color:var(--text-muted);">ديون</div>
                    </div>
                </div>
            `;
            div.addEventListener('click', () => showArchiveDebts(archive));
            list.appendChild(div);
        });
    });
}

function showAllDebts() {
    const detail = $('#debts-detail');
    const list = $('#debts-archives-list');
    
    list.classList.add('hidden');
    detail.classList.remove('hidden');
    
    detail.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
            <button class="btn-outline btn-sm" id="back-to-debts"><i class="fas fa-arrow-right"></i> عودة</button>
            <h3 style="margin:0;">كل الديون</h3>
        </div>
        <div id="all-debts-content">⏳ جاري التحميل...</div>
    `;
    
    $('#back-to-debts').addEventListener('click', () => {
        detail.classList.add('hidden');
        list.classList.remove('hidden');
    });
    
    const q = query(
        collection(db, 'transactions'),
        where('uid', '==', currentUser.uid),
        orderBy('createdAt', 'desc')
    );
    
    onSnapshot(q, (snapshot) => {
        const txs = [];
        snapshot.forEach(doc => txs.push(doc.data()));
        
        const debtTypes = ['debt_in', 'debt_out', 'debt_received', 'debt_paid'];
        const debts = txs.filter(t => debtTypes.includes(t.type));
        
        const tables = [
            { title: '<i class="fas fa-hand-holding-usd"></i> دين لنا', type: 'debt_in' },
            { title: '<i class="fas fa-hand-holding-usd"></i> دين علينا', type: 'debt_out' },
            { title: '<i class="fas fa-check-circle"></i> دين مقبوض', type: 'debt_received' },
            { title: '<i class="fas fa-times-circle"></i> دين مدفوع', type: 'debt_paid' }
        ];
        
        let html = '';
        tables.forEach(table => {
            const filtered = debts.filter(t => t.type === table.type);
            html += `
                <h4 style="margin:12px 0 8px;color:var(--gold);">${table.title} (${filtered.length})</h4>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr><th>المنتج</th><th>المبلغ</th><th>العملة</th><th>التاريخ</th></tr>
                        </thead>
                        <tbody>
                            ${filtered.length === 0 ? '<tr><td colspan="4" style="color:var(--text-muted);">لا توجد</td></tr>' :
                                filtered.map(t => `
                                    <tr>
                                        <td>${t.productName || '---'}</td>
                                        <td>${formatCurrency(t.amount, t.currency)}</td>
                                        <td>${t.currency}</td>
                                        <td>${t.createdAt ? new Date(t.createdAt.toDate()).toLocaleDateString('ar-SY') : '---'}</td>
                                    </tr>
                                `).join('')
                            }
                        </tbody>
                    </table>
                </div>
            `;
        });
        
        $('#all-debts-content').innerHTML = html;
    });
}

function showArchiveDebts(archive) {
    const detail = $('#debts-detail');
    const list = $('#debts-archives-list');
    
    list.classList.add('hidden');
    detail.classList.remove('hidden');
    
    const txs = archive.transactions || [];
    const debtTypes = ['debt_in', 'debt_out', 'debt_received', 'debt_paid'];
    const debts = txs.filter(t => debtTypes.includes(t.type));
    
    detail.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
            <button class="btn-outline btn-sm" id="back-to-debts-list"><i class="fas fa-arrow-right"></i> عودة</button>
            <h3 style="margin:0;">${archive.name}</h3>
        </div>
        <div class="table-container">
            <table>
                <thead>
                    <tr><th>النوع</th><th>المنتج</th><th>المبلغ</th><th>العملة</th></tr>
                </thead>
                <tbody>
                    ${debts.length === 0 ? '<tr><td colspan="4" style="color:var(--text-muted);">لا توجد ديون</td></tr>' :
                        debts.map(t => `
                            <tr>
                                <td>${getTypeLabel(t.type)}</td>
                                <td>${t.productName || '---'}</td>
                                <td>${formatCurrency(t.amount, t.currency)}</td>
                                <td>${t.currency}</td>
                            </tr>
                        `).join('')
                    }
                </tbody>
            </table>
        </div>
    `;
    
    $('#back-to-debts-list').addEventListener('click', () => {
        detail.classList.add('hidden');
        list.classList.remove('hidden');
    });
}// =============================================
// صفحة التقارير
// =============================================

function loadReportsPage() {
    const section = $('#page-reports');
    
    section.innerHTML = `
        <h2><i class="fas fa-file-invoice"></i> التقارير المالية</h2>
        
        <div class="form-row">
            <div class="input-group">
                <label><i class="fas fa-calendar-alt"></i> من تاريخ</label>
                <input type="date" id="report-from-date">
            </div>
            <div class="input-group">
                <label><i class="fas fa-calendar-alt"></i> إلى تاريخ</label>
                <input type="date" id="report-to-date">
            </div>
        </div>
        
        <div class="form-row">
            <div class="input-group">
                <label><i class="fas fa-filter"></i> نوع العملية</label>
                <select id="report-type-select">
                    <option value="all">كل العمليات</option>
                    <option value="incoming">وارد</option>
                    <option value="outgoing">صادر</option>
                    <option value="sale">بيع</option>
                    <option value="purchase">شراء</option>
                    <option value="debt_in">دين لنا</option>
                    <option value="debt_out">دين علينا</option>
                    <option value="debt_received">دين مقبوض</option>
                    <option value="debt_paid">دين مدفوع</option>
                    <option value="returned">مرتجع</option>
                </select>
            </div>
        </div>
        
        <div id="report-type-toggles" class="form-row" style="display:none; flex-wrap:wrap; gap:8px;">
            ${[
                {type:'incoming',label:'وارد'},{type:'outgoing',label:'صادر'},{type:'sale',label:'بيع'},
                {type:'purchase',label:'شراء'},{type:'debt_in',label:'دين لنا'},{type:'debt_out',label:'دين علينا'},
                {type:'debt_received',label:'دين مقبوض'},{type:'debt_paid',label:'دين مدفوع'},{type:'returned',label:'مرتجع'}
            ].map(t => `
                <div class="toggle-chip" data-type="${t.type}" style="display:flex;align-items:center;gap:4px;padding:6px 10px;border-radius:20px;border:1px solid var(--border);cursor:pointer;background:var(--bg-tertiary);">
                    <span class="toggle-chip-icon"><i class="fas fa-check-circle"></i></span>
                    <span style="font-size:12px;">${t.label}</span>
                </div>
            `).join('')}
        </div>
        
        <div style="display:flex;gap:10px;margin:16px 0;">
            <button id="generate-report-btn" class="btn-primary"><i class="fas fa-file-alt"></i> إنشاء التقرير</button>
            <button id="export-report-btn" class="gold-btn-outline" style="display:none;"><i class="fas fa-download"></i> تصدير PDF</button>
            ${(vipLevel >= 3 || isAdmin || isSuperMod) ? `<button id="watermark-toggle-btn" class="btn-outline"><i class="fas fa-stamp"></i> إعدادات العلامة المائية</button>` : ''}
        </div>
        
        <div id="report-output" class="hidden" style="margin-top:20px;"></div>
    `;
    
    setupReportDates();
    
    $('#report-type-select').addEventListener('change', function() {
        const toggles = $('#report-type-toggles');
        toggles.style.display = this.value === 'all' ? 'flex' : 'none';
    });
    
    section.querySelectorAll('.toggle-chip').forEach(chip => {
        chip.addEventListener('click', function() {
            const icon = this.querySelector('.toggle-chip-icon i');
            if (icon.classList.contains('fa-check-circle')) {
                icon.className = 'fas fa-circle';
                icon.style.opacity = '0.4';
            } else {
                icon.className = 'fas fa-check-circle';
                icon.style.opacity = '1';
            }
        });
    });
    
    $('#generate-report-btn').addEventListener('click', () => generateReport());
    $('#export-report-btn').addEventListener('click', () => showToast('سيتم تفعيل التصدير قريباً', 'info'));
    
    if (vipLevel >= 3 || isAdmin || isSuperMod) {
        $('#watermark-toggle-btn').addEventListener('click', () => {
            const showWM = confirm('هل تريد إزالة العلامة المائية من التقرير؟');
            sessionStorage.setItem('reportNoWatermark', showWM ? 'true' : 'false');
            showToast(showWM ? 'تم إخفاء العلامة المائية' : 'ستظهر العلامة المائية', 'info');
        });
    }
}

function setupReportDates() {
    const q = query(
        collection(db, 'transactions'),
        where('uid', '==', currentUser.uid),
        orderBy('createdAt', 'asc')
    );
    
    getDocs(q).then(snapshot => {
        if (snapshot.empty) return;
        const firstTx = snapshot.docs[0].data();
        
        const fromInput = $('#report-from-date');
        const toInput = $('#report-to-date');
        
        if (fromInput && firstTx?.createdAt) {
            fromInput.min = new Date(firstTx.createdAt.toDate()).toISOString().split('T')[0];
        }
        if (toInput) {
            toInput.max = new Date().toISOString().split('T')[0];
            toInput.value = new Date().toISOString().split('T')[0];
        }
    });
}

function generateReport() {
    const fromDate = $('#report-from-date').value ? new Date($('#report-from-date').value) : null;
    const toDate = $('#report-to-date').value ? new Date($('#report-to-date').value + 'T23:59:59') : null;
    const typeSelect = $('#report-type-select').value;
    
    let selectedTypes = [];
    if (typeSelect === 'all') {
        const toggles = document.querySelectorAll('.toggle-chip');
        toggles.forEach(chip => {
            const icon = chip.querySelector('.toggle-chip-icon i');
            if (icon.classList.contains('fa-check-circle')) {
                selectedTypes.push(chip.dataset.type);
            }
        });
    } else {
        selectedTypes.push(typeSelect);
    }
    
    if (!fromDate || !toDate) return showToast('حدد التاريخين', 'error');
    if (selectedTypes.length === 0) return showToast('اختر نوعاً واحداً على الأقل', 'error');
    
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
        
        const filtered = txs.filter(t => selectedTypes.includes(t.type));
        
        const output = $('#report-output');
        output.classList.remove('hidden');
        $('#export-report-btn').style.display = 'inline-block';
        
        const noWatermark = sessionStorage.getItem('reportNoWatermark') === 'true';
        
        let header = '';
        
        if (vipLevel >= 3 || isAdmin || isSuperMod) {
            if (!noWatermark) {
                header += `<div style="text-align:center;opacity:0.08;font-size:60px;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:0;">HAINON</div>`;
                header += `<div style="text-align:center;font-weight:900;font-size:20px;color:var(--gold);">HAINON</div>
                           <div style="text-align:center;font-size:12px;color:var(--text-muted);">نظام الإدارة المالية</div>`;
            }
        } else if (vipLevel === 2) {
            header += `<div style="text-align:center;font-weight:700;font-size:24px;color:var(--gold);">${userData.name}</div>`;
        } else if (vipLevel === 1) {
            header += `<div style="text-align:center;font-weight:900;font-size:20px;color:var(--gold);">HAINON</div>
                       <div style="text-align:center;font-size:12px;color:var(--text-muted);">نظام الإدارة المالية</div>`;
        } else {
            header += `<div style="text-align:center;opacity:0.08;font-size:60px;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:0;">HAINON</div>
                       <div style="text-align:center;font-weight:900;font-size:20px;color:var(--gold);">HAINON</div>
                       <div style="text-align:center;font-size:12px;color:var(--text-muted);">نظام الإدارة المالية</div>`;
        }
        
        if (!(vipLevel >= 3 && !noWatermark)) {
            header += `<div style="display:flex;align-items:center;gap:8px;margin-top:16px;">
                <img src="${userData.avatar}" style="width:30px;height:30px;border-radius:50%;border:2px solid var(--gold);">
                <span style="font-size:14px;">${userData.name}</span>
            </div>`;
        }
        
        output.innerHTML = `
            <div style="position:relative;padding:20px;background:var(--bg-card);border-radius:var(--radius-md);border:1px solid var(--border);">
                ${header}
                <div style="margin-top:20px;">
                    <h4>تقرير من ${$('#report-from-date').value} إلى ${$('#report-to-date').value}</h4>
                    <div class="table-container" style="margin-top:12px;">
                        <table>
                            <thead>
                                <tr><th>النوع</th><th>المنتج</th><th>المبلغ</th><th>العملة</th><th>التاريخ</th></tr>
                            </thead>
                            <tbody>
                                ${filtered.length === 0 ? '<tr><td colspan="5">لا توجد عمليات</td></tr>' :
                                    filtered.map(t => `
                                        <tr>
                                            <td>${getTypeLabel(t.type)}</td>
                                            <td>${t.productName || '---'}</td>
                                            <td>${formatCurrency(t.amount, t.currency)}</td>
                                            <td>${t.currency}</td>
                                            <td>${t.createdAt ? new Date(t.createdAt.toDate()).toLocaleDateString('ar-SY') : '---'}</td>
                                        </tr>
                                    `).join('')
                                }
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    });
}

// =============================================
// شاشات VIP الجديدة
// =============================================

// ---------- صفحة أسعار VIP ----------
function loadVipPricingPage() {
    const section = $('#page-vip-pricing');
    
    section.innerHTML = `
        <h2><i class="fas fa-star"></i> أسعار VIP</h2>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:16px; margin-top:20px;">
            
            <div class="stat-card" style="text-align:center; padding:24px; border-color:var(--vip1-color);">
                <div class="stat-icon"><i class="fas fa-star" style="color:var(--vip1-color);"></i></div>
                <h3 style="color:var(--vip1-color); margin:8px 0;">VIP 1</h3>
                <div class="stat-value" style="color:var(--vip1-color);">5$</div>
                <p style="font-size:12px;color:var(--text-muted);">شهرياً</p>
                <button class="btn-primary select-vip-btn" data-level="1" style="margin-top:12px; width:100%;">اختيار</button>
            </div>
            
            <div class="stat-card" style="text-align:center; padding:24px; border-color:var(--vip2-color);">
                <div class="stat-icon"><i class="fas fa-star" style="color:var(--vip2-color);"></i></div>
                <h3 style="color:var(--vip2-color); margin:8px 0;">VIP 2</h3>
                <div class="stat-value" style="color:var(--vip2-color);">15$</div>
                <p style="font-size:12px;color:var(--text-muted);">شهرياً</p>
                <button class="btn-primary select-vip-btn" data-level="2" style="margin-top:12px; width:100%;">اختيار</button>
            </div>
            
            <div class="stat-card" style="text-align:center; padding:24px; border-color:var(--vip3-color);">
                <div class="stat-icon"><i class="fas fa-star" style="color:var(--vip3-color);"></i></div>
                <h3 style="color:var(--vip3-color); margin:8px 0;">VIP 3</h3>
                <div class="stat-value" style="color:var(--vip3-color);">35$</div>
                <p style="font-size:12px;color:var(--text-muted);">شهرياً</p>
                <button class="btn-primary select-vip-btn" data-level="3" style="margin-top:12px; width:100%;">اختيار</button>
            </div>
        </div>
    `;
    
    section.querySelectorAll('.select-vip-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const level = btn.dataset.level;
            sessionStorage.setItem('selectedVipLevel', level);
            navigateTo('vip-payment');
        });
    });
}

// ---------- صفحة الدفع (شام كاش) ----------
function loadVipPaymentPage() {
    const section = $('#page-vip-payment');
    const level = sessionStorage.getItem('selectedVipLevel') || '1';
    const levelColors = { '1': 'var(--vip1-color)', '2': 'var(--vip2-color)', '3': 'var(--vip3-color)' };
    const levelNames = { '1': 'VIP 1', '2': 'VIP 2', '3': 'VIP 3' };
    
    section.innerHTML = `
        <h2><i class="fas fa-credit-card"></i> الدفع - ${levelNames[level]}</h2>
        <div style="max-width:500px;margin:0 auto;">
            
            <div class="stat-card" style="margin-bottom:16px; border-color:${levelColors[level]};">
                <h4 style="color:${levelColors[level]};"><i class="fas fa-money-bill-wave"></i> شام كاش</h4>
            </div>
            
            <div class="stat-card" style="margin-bottom:16px;">
                <h4><i class="fas fa-info-circle"></i> تعليمات الدفع</h4>
                <div id="payment-instructions" style="font-size:13px;color:var(--text-secondary);margin-top:8px;">
                    ⏳ جاري تحميل التعليمات...
                </div>
            </div>
            
            <div style="text-align:center; margin:16px 0;">
                <h4 style="color:var(--red);">الوقت المتبقي</h4>
                <div id="payment-timer" style="font-size:28px; font-weight:900; color:var(--gold);">15:00</div>
            </div>
            
            <div class="form-full">
                <label>رقم الحوالة (من المدير)</label>
                <input type="text" id="admin-transfer-number" readonly placeholder="⏳ جاري التحميل...">
            </div>
            
            <div class="form-full">
                <label>رقم العملية الخاص بك</label>
                <input type="text" id="user-operation-number" placeholder="أدخل رقم العملية" inputmode="numeric">
            </div>
            
            <div style="display:flex; gap:10px; margin-top:16px;">
                <button id="confirm-payment-btn" class="btn-primary" style="flex:1;"><i class="fas fa-check"></i> تأكيد العملية</button>
                <button id="cancel-payment-btn" class="btn-outline" style="flex:1;"><i class="fas fa-times"></i> تراجع</button>
            </div>
        </div>
    `;
    
    // تحميل تعليمات الدفع ورقم الحوالة من Firestore
    getDoc(doc(db, 'settings', 'payment')).then(snap => {
        if (snap.exists()) {
            const data = snap.data();
            $('#payment-instructions').innerHTML = data.instructions || 'لا توجد تعليمات حالياً';
            $('#admin-transfer-number').value = data.transferNumber || '';
        }
    });
    
    // المؤقت الزمني (15 دقيقة)
    let timeLeft = 15 * 60;
    const timerInterval = setInterval(() => {
        timeLeft--;
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        $('#payment-timer').textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            $('#confirm-payment-btn').disabled = true;
            $('#confirm-payment-btn').textContent = 'انتهى الوقت';
            showToast('انتهى وقت الدفع المخصص', 'error');
        }
    }, 1000);
    
    // زر تأكيد الدفع
    $('#confirm-payment-btn').addEventListener('click', async () => {
        const opNumber = $('#user-operation-number').value.trim();
        if (!opNumber || !/^\d+$/.test(opNumber)) {
            return showToast('أدخل رقم عملية صحيح (أرقام فقط)', 'error');
        }
        
        // إرسال إشعار للأدمن والمشرفين
        const adminsSnapshot = await getDocs(query(collection(db, 'users'), where('role', 'in', ['admin', 'super_mod', 'moderator'])));
        
        const colorMap = { '1': 'var(--vip1-color)', '2': 'var(--vip2-color)', '3': 'var(--vip3-color)' };
        
        adminsSnapshot.forEach(async (adminDoc) => {
            await sendNotification(
                adminDoc.id,
                `طلب ترقية إلى ${levelNames[level]} - رقم العملية: ${opNumber} من المستخدم ${userData.name}`,
                'vip_request',
                'chat'
            );
        });
        
        // إرسال رسالة في خدمة العملاء بلون مميز
        await addDoc(collection(db, 'supportMessages'), {
            uid: currentUser.uid,
            senderName: userData.name,
            text: `طلب ترقية إلى ${levelNames[level]} - رقم العملية: ${opNumber}`,
            createdAt: serverTimestamp(),
            vipLevel: level
        });
        
        clearInterval(timerInterval);
        showToast('تم إرسال طلبك. سنقوم بمراجعته قريباً.', 'success');
        navigateTo('dashboard');
    });
    
    // زر تراجع
    $('#cancel-payment-btn').addEventListener('click', () => {
        clearInterval(timerInterval);
        navigateTo('vip-pricing');
    });
}// =============================================
// خدمة العملاء / مشاكل المستخدمين
// =============================================

function loadChatPage() {
    const section = $('#page-chat');
    
    if (isAdmin || isMod || isSuperMod) {
        // ---------- واجهة الأدمن والمشرفين: مشاكل المستخدمين ----------
        section.innerHTML = `
            <h2><i class="fas fa-comments"></i> مشاكل المستخدمين</h2>
            <div style="display:flex;gap:8px;margin-bottom:16px;">
                <button id="chat-filter-support" class="btn-primary btn-sm"><i class="fas fa-headset"></i> خدمة العملاء</button>
                <button id="chat-filter-reports" class="btn-outline btn-sm"><i class="fas fa-flag"></i> البلاغات</button>
            </div>
            
            <!-- قائمة المستخدمين (تظهر افتراضياً) -->
            <div id="admin-contacts-list-container">
                <div id="admin-contacts-list"></div>
            </div>
            
            <!-- منطقة المحادثة (تظهر عند اختيار مستخدم) -->
            <div id="admin-chat-area" class="hidden">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
                    <button class="btn-outline btn-sm" id="back-to-contacts-list"><i class="fas fa-arrow-right"></i> عودة</button>
                    <h3 style="margin:0;" id="admin-chat-username"></h3>
                </div>
                <div class="chat-messages" id="admin-chat-messages"></div>
                <div class="chat-input-area">
                    <input type="text" id="admin-chat-input" placeholder="اكتب ردك...">
                    <button id="admin-chat-send"><i class="fas fa-paper-plane"></i></button>
                </div>
            </div>
        `;
        
        let currentFilter = 'support';
        loadAdminContacts(currentFilter);
        
        $('#chat-filter-support').addEventListener('click', () => {
            currentFilter = 'support';
            $('#chat-filter-support').className = 'btn-primary btn-sm';
            $('#chat-filter-reports').className = 'btn-outline btn-sm';
            loadAdminContacts(currentFilter);
        });
        
        $('#chat-filter-reports').addEventListener('click', () => {
            currentFilter = 'reports';
            $('#chat-filter-reports').className = 'btn-primary btn-sm';
            $('#chat-filter-support').className = 'btn-outline btn-sm';
            loadAdminContacts(currentFilter);
        });
        
        $('#back-to-contacts-list').addEventListener('click', () => {
            $('#admin-contacts-list-container').classList.remove('hidden');
            $('#admin-chat-area').classList.add('hidden');
            selectedChatUser = null;
        });
        
    } else {
        // ---------- واجهة المستخدم: خدمة العملاء ----------
        section.innerHTML = `
            <h2><i class="fas fa-headset"></i> خدمة العملاء</h2>
            <div class="chat-container" style="height:calc(100vh - 280px);">
                <div class="chat-messages" id="support-chat-messages">
                    <div style="text-align:center;color:var(--text-muted);padding:20px;">
                        أهلاً بك! كيف يمكننا مساعدتك؟
                    </div>
                </div>
                <div class="chat-input-area">
                    <input type="text" id="support-chat-input" placeholder="اكتب رسالتك...">
                    <button id="support-chat-send"><i class="fas fa-paper-plane"></i></button>
                </div>
            </div>
        `;
        
        loadSupportChat();
    }
}

function loadAdminContacts(filter = 'support') {
    const list = $('#admin-contacts-list');
    
    if (filter === 'support') {
        const q = query(collection(db, 'supportMessages'), orderBy('createdAt', 'desc'));
        onSnapshot(q, (snapshot) => {
            const usersMap = new Map();
            snapshot.forEach(doc => {
                const msg = doc.data();
                if (msg.uid !== currentUser.uid && !usersMap.has(msg.uid)) {
                    usersMap.set(msg.uid, {
                        uid: msg.uid,
                        name: msg.senderName || 'مستخدم',
                        lastMessage: msg.text,
                        lastTime: msg.createdAt,
                        vipLevel: msg.vipLevel || ''
                    });
                }
            });
            renderAdminContactList(usersMap, list, 'support');
        });
    } else if (filter === 'reports') {
        const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'));
        onSnapshot(q, (snapshot) => {
            const usersMap = new Map();
            snapshot.forEach(doc => {
                const report = doc.data();
                if (!usersMap.has(report.from)) {
                    usersMap.set(report.from, {
                        uid: report.from,
                        name: report.fromName || 'مستخدم',
                        lastMessage: report.reason,
                        lastTime: report.createdAt
                    });
                }
            });
            renderAdminContactList(usersMap, list, 'reports');
        });
    }
}

function renderAdminContactList(usersMap, list, type) {
    list.innerHTML = '';
    if (usersMap.size === 0) {
        list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);">لا توجد رسائل</div>';
        return;
    }
    
    usersMap.forEach(async (user, uid) => {
        // جلب بيانات المستخدم للحصول على دوره
        const userSnap = await getDoc(doc(db, 'users', uid));
        const userData = userSnap.exists() ? userSnap.data() : null;
        const role = userData?.role || 'user';
        const vipAvatarClass = getVipAvatarClass(role);
        const vipNameClass = getVipNameClass(role);
        
        // لون VIP للطلبات
        let vipColor = '';
        if (user.vipLevel === '1') vipColor = 'var(--vip1-color)';
        else if (user.vipLevel === '2') vipColor = 'var(--vip2-color)';
        else if (user.vipLevel === '3') vipColor = 'var(--vip3-color)';
        
        const div = document.createElement('div');
        div.className = 'chat-contact-item';
        div.innerHTML = `
            <div class="chat-contact-avatar ${vipAvatarClass}">
                <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=D4AF37&color=111&size=80&bold=true&format=svg">
            </div>
            <div class="chat-contact-info">
                <div class="chat-contact-name ${vipNameClass}">${user.name}</div>
                <div class="chat-contact-last" style="${vipColor ? 'color:' + vipColor : ''}">${user.lastMessage?.substring(0, 30) || ''}...</div>
            </div>
            ${type === 'reports' ? '<span style="color:var(--red);"><i class="fas fa-exclamation-triangle"></i></span>' : ''}
        `;
        div.addEventListener('click', () => openAdminConversation(uid, user.name, type));
        list.appendChild(div);
    });
}

function openAdminConversation(uid, name, type) {
    selectedChatUser = uid;
    $('#admin-contacts-list-container').classList.add('hidden');
    $('#admin-chat-area').classList.remove('hidden');
    $('#admin-chat-username').textContent = name;
    
    const messagesDiv = $('#admin-chat-messages');
    messagesDiv.innerHTML = '<div style="text-align:center;color:var(--text-muted);">جاري تحميل المحادثة...</div>';
    
    const collectionName = type === 'support' ? 'supportMessages' : 'reports';
    const q = query(collection(db, collectionName), orderBy('createdAt', 'asc'));
    
    onSnapshot(q, (snapshot) => {
        messagesDiv.innerHTML = '';
        snapshot.forEach(doc => {
            const msg = doc.data();
            if (type === 'support' && (msg.uid === uid || msg.targetUid === uid)) {
                const isSent = msg.uid === currentUser.uid;
                messagesDiv.innerHTML += `
                    <div class="chat-msg ${isSent ? 'sent' : 'received'}">
                        <strong>${msg.senderName || 'مستخدم'}</strong>
                        <p>${escapeHtml(msg.text)}</p>
                        <small>${msg.createdAt ? new Date(msg.createdAt.toDate()).toLocaleTimeString('ar-SY', {hour:'2-digit', minute:'2-digit'}) : ''}</small>
                    </div>
                `;
            } else if (type === 'reports' && msg.from === uid) {
                messagesDiv.innerHTML += `
                    <div class="chat-msg received frame-default">
                        <strong>${msg.fromName || 'مستخدم'}</strong>
                        <p><i class="fas fa-flag"></i> بلاغ: ${escapeHtml(msg.reason)}</p>
                        <small>${msg.createdAt ? new Date(msg.createdAt.toDate()).toLocaleTimeString('ar-SY', {hour:'2-digit', minute:'2-digit'}) : ''}</small>
                    </div>
                `;
            }
        });
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
    
    const sendFunc = async () => {
        const text = $('#admin-chat-input').value.trim();
        if (!text) return;
        try {
            await addDoc(collection(db, 'supportMessages'), {
                uid: currentUser.uid,
                targetUid: uid,
                senderName: userData?.name || 'مدير',
                text: text,
                createdAt: serverTimestamp()
            });
            $('#admin-chat-input').value = '';
        } catch (error) {
            showToast('فشل في الإرسال', 'error');
        }
    };
    
    $('#admin-chat-send').onclick = sendFunc;
    $('#admin-chat-input').onkeypress = (e) => { if (e.key === 'Enter') sendFunc(); };
}

function loadSupportChat() {
    const messagesDiv = $('#support-chat-messages');
    const q = query(collection(db, 'supportMessages'), orderBy('createdAt', 'asc'));
    
    onSnapshot(q, (snapshot) => {
        messagesDiv.innerHTML = '';
        let hasMessages = false;
        snapshot.forEach(doc => {
            const msg = doc.data();
            if (msg.uid === currentUser.uid || msg.targetUid === currentUser.uid) {
                hasMessages = true;
                const isSent = msg.uid === currentUser.uid;
                messagesDiv.innerHTML += `
                    <div class="chat-msg ${isSent ? 'sent' : 'received'}">
                        <strong>${msg.senderName || 'مستخدم'}</strong>
                        <p>${escapeHtml(msg.text)}</p>
                        <small>${msg.createdAt ? new Date(msg.createdAt.toDate()).toLocaleTimeString('ar-SY', {hour:'2-digit', minute:'2-digit'}) : ''}</small>
                    </div>
                `;
            }
        });
        if (!hasMessages) {
            messagesDiv.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;">أهلاً بك! كيف يمكننا مساعدتك؟</div>';
        }
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
    
    const sendFunc = async () => {
        const text = $('#support-chat-input')?.value.trim();
        if (!text) return;
        if (text.length > 500) return showToast('الرسالة طويلة جداً', 'error');
        try {
            await addDoc(collection(db, 'supportMessages'), {
                uid: currentUser.uid,
                senderName: userData?.name || 'مستخدم',
                text: text,
                createdAt: serverTimestamp()
            });
            if ($('#support-chat-input')) $('#support-chat-input').value = '';
            
            const q = query(collection(db, 'supportMessages'), orderBy('createdAt', 'asc'));
            const snapshot = await getDocs(q);
            let count = 0;
            snapshot.forEach(doc => { if (doc.data().uid === currentUser.uid) count++; });
            if (count === 1) {
                await addDoc(collection(db, 'supportMessages'), {
                    uid: 'admin',
                    senderName: 'HAINON',
                    targetUid: currentUser.uid,
                    text: 'نحن نقوم بالرد على رسائل أخرى حالياً. يمكنك توضيح ما هو المطلوب وسنقوم بالرد عليك في أقرب وقت ممكن. شكراً لتفهمك.',
                    createdAt: serverTimestamp()
                });
            }
        } catch (error) {
            showToast('فشل في الإرسال', 'error');
        }
    };
    
    $('#support-chat-send')?.addEventListener('click', sendFunc);
    $('#support-chat-input')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendFunc(); });
}

// =============================================
// عرض المستخدمين
// =============================================

function loadUsersListPage() {
    const section = $('#page-userslist');
    
    section.innerHTML = `
        <h2><i class="fas fa-users"></i> عرض المستخدمين</h2>
        <button id="global-chat-btn" class="btn-primary" style="margin-bottom:16px;">
            <i class="fas fa-globe"></i> الدردشة العالمية
        </button>
        <div id="users-list-container" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:12px;">
            <p style="color:var(--text-muted);text-align:center;grid-column:1/-1;">جاري التحميل...</p>
        </div>
    `;
    
    $('#global-chat-btn').addEventListener('click', () => navigateTo('globalchat'));
    
    getDocs(collection(db, 'users')).then(snapshot => {
        const container = $('#users-list-container');
        container.innerHTML = '';
        
        if (snapshot.empty) {
            container.innerHTML = '<p style="color:var(--text-muted);text-align:center;grid-column:1/-1;">لا يوجد مستخدمين</p>';
            return;
        }
        
        snapshot.forEach(doc => {
            const u = doc.data();
            if (u.uid === currentUser.uid) return;
            
            const isOnline = onlineUsers[u.uid]?.status === 'online';
            const vipAvatarClass = getVipAvatarClass(u.role);
            const vipNameClass = getVipNameClass(u.role);
            
            const card = document.createElement('div');
            card.className = 'stat-card';
            card.style.cssText = 'cursor:pointer;';
            card.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;">
                    <img src="${u.avatar || 'https://ui-avatars.com/api/?name='+encodeURIComponent(u.name||'?')+'&background=D4AF37&color=111&size=60'}" 
                         class="${vipAvatarClass}"
                         style="width:45px;height:45px;border-radius:50%;border:2px solid var(--gold);object-fit:cover;cursor:pointer;"
                         data-uid="${u.uid}">
                    <div style="flex:1;min-width:0;">
                        <div class="${vipNameClass}" style="font-weight:600;font-size:14px;">${u.name || '---'}</div>
                        <div style="font-size:11px;color:var(--text-muted);">ID: ${u.serialId || '---'}</div>
                        <div style="font-size:10px;">${isOnline ? '<i class="fas fa-circle" style="color:var(--green);"></i> متصل' : '<i class="fas fa-circle" style="color:var(--red);"></i> غير متصل'}</div>
                    </div>
                </div>
            `;
            
            card.querySelector('img').addEventListener('click', () => viewPublicProfile(u.uid));
            card.addEventListener('click', (e) => {
                if (e.target.tagName !== 'IMG') viewPublicProfile(u.uid);
            });
            
            container.appendChild(card);
        });
    });
}

// =============================================
// الدردشة العالمية
// =============================================

function loadGlobalChatPage() {
    const section = $('#page-globalchat');
    
    section.innerHTML = `
        <h2><i class="fas fa-globe"></i> الدردشة العالمية</h2>
        <div class="chat-container" style="height:calc(100vh - 280px);">
            <div class="chat-messages" id="global-chat-messages">
                <p style="text-align:center;color:var(--text-muted);">جاري تحميل المحادثة...</p>
            </div>
            <div class="chat-input-area">
                <input type="text" id="global-chat-input" placeholder="اكتب رسالتك...">
                <button id="global-chat-send"><i class="fas fa-paper-plane"></i></button>
            </div>
        </div>
    `;
    
    const messagesDiv = $('#global-chat-messages');
    
    // جلب آخر 500 رسالة
    const q = query(
        collection(db, 'globalMessages'),
        orderBy('createdAt', 'desc'),
        limit(500)
    );
    
    onSnapshot(q, (snapshot) => {
        messagesDiv.innerHTML = '';
        
        if (snapshot.empty) {
            messagesDiv.innerHTML = '<p style="text-align:center;color:var(--text-muted);">لا توجد رسائل بعد</p>';
        }
        
        // عكس ترتيب الرسائل لتظهر الأحدث في الأسفل
        const messages = [];
        snapshot.forEach(doc => messages.push({ id: doc.id, ...doc.data() }));
        messages.reverse();
        
        messages.forEach(msg => {
            const isSent = msg.uid === currentUser.uid;
            const vipFrameClass = getVipFrameClass(msg.role || 'user');
            
            messagesDiv.innerHTML += `
                <div class="chat-msg ${isSent ? 'sent' : 'received'} ${vipFrameClass}">
                    <strong>${msg.senderName || 'مستخدم'}</strong>
                    <p>${escapeHtml(msg.text)}</p>
                    <small>
                        ${msg.createdAt ? new Date(msg.createdAt.toDate()).toLocaleDateString('ar-SY') + ' - ' + new Date(msg.createdAt.toDate()).toLocaleTimeString('ar-SY', {hour:'2-digit', minute:'2-digit'}) : ''}
                    </small>
                </div>
            `;
        });
        
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        
        // حذف الرسائل الأقدم إذا تجاوزت 500
        if (snapshot.size > 500) {
            const oldestDocs = [];
            let count = 0;
            snapshot.forEach(doc => {
                count++;
                if (count > 500) oldestDocs.push(doc.ref);
            });
            oldestDocs.forEach(ref => deleteDoc(ref));
        }
    });
    
    const sendFunc = async () => {
        const text = $('#global-chat-input')?.value.trim();
        if (!text) return;
        if (text.length > 300) return showToast('الرسالة طويلة جداً (الحد 300 حرف)', 'error');
        
        try {
            await addDoc(collection(db, 'globalMessages'), {
                uid: currentUser.uid,
                senderName: userData?.name || 'مستخدم',
                role: userData?.role || 'user',
                text: text,
                createdAt: serverTimestamp()
            });
            $('#global-chat-input').value = '';
        } catch (e) {
            showToast('فشل في الإرسال', 'error');
        }
    };
    
    $('#global-chat-send')?.addEventListener('click', sendFunc);
    $('#global-chat-input')?.addEventListener('keypress', e => { if (e.key === 'Enter') sendFunc(); });
}// =============================================
// صفحة إدارة المستخدمين (للأدمن والمشرف)
// =============================================

async function loadUsersPage() {
    const section = $('#page-users');
    
    if (!isAdmin && !isMod && !isSuperMod) {
        section.innerHTML = '<h2><i class="fas fa-lock"></i> غير مصرح</h2>';
        return;
    }
    
    section.innerHTML = `
        <h2><i class="fas fa-users"></i> إدارة المستخدمين</h2>
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>صورة</th>
                        <th>الاسم</th>
                        <th>ID</th>
                        <th>البريد</th>
                        <th>الدور</th>
                        <th>الحالة</th>
                        <th>آخر ظهور</th>
                        <th>الموقع</th>
                        <th>الجهاز</th>
                        <th>IP</th>
                        <th>تاريخ التسجيل</th>
                        <th>إجراءات</th>
                    </tr>
                </thead>
                <tbody id="users-tbody">
                    <tr><td colspan="12" style="color:var(--text-muted);">جاري التحميل...</td></tr>
                </tbody>
            </table>
        </div>
        <div id="user-activity-panel" class="hidden" style="margin-top:20px;"></div>
    `;
    
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const tbody = $('#users-tbody');
    tbody.innerHTML = '';
    
    if (usersSnapshot.empty) {
        tbody.innerHTML = '<tr><td colspan="12">لا يوجد مستخدمين</td></tr>';
        return;
    }
    
    usersSnapshot.forEach(doc => {
        const u = doc.data();
        const presence = onlineUsers[u.uid];
        const isOnline = presence?.status === 'online';
        const lastSeen = presence?.lastSeen ? new Date(presence.lastSeen).toLocaleString('ar-SY') : (u.lastLogin ? new Date(u.lastLogin.toDate()).toLocaleString('ar-SY') : '---');
        const deviceInfo = presence?.device || u.device || {};
        
        let roleBadge = '<i class="fas fa-user"></i> مستخدم';
        if (u.role === 'admin') roleBadge = '<i class="fas fa-crown"></i> مدير';
        else if (u.role === 'super_mod') roleBadge = '<i class="fas fa-shield-alt"></i> مشرف مميز';
        else if (u.role === 'moderator') roleBadge = '<i class="fas fa-shield-alt"></i> مشرف';
        else if (u.role?.startsWith('vip')) roleBadge = `<i class="fas fa-star"></i> VIP ${u.role.replace('vip','')}`;
        
        // رابط الموقع للخرائط
        const locationText = u.location?.city ? `${u.location.city}, ${u.location.country}` : '---';
        const locationLink = u.location?.city ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(u.location.city + ' ' + u.location.country)}` : '#';
        const locationHtml = u.location?.city ? `<a href="${locationLink}" target="_blank" style="color:var(--gold);text-decoration:underline;cursor:pointer;">${locationText}</a>` : '---';
        
        tbody.innerHTML += `
            <tr>
                <td><img src="${u.avatar || 'https://ui-avatars.com/api/?name='+encodeURIComponent(u.name||'?')}" style="width:30px;height:30px;border-radius:50%;border:2px solid var(--gold);cursor:pointer;" class="user-activity-img" data-uid="${u.uid}"></td>
                <td>${u.name || '---'}</td>
                <td>${u.serialId || '---'}</td>
                <td>${u.email || '---'}</td>
                <td>${roleBadge}</td>
                <td>${isOnline ? '<i class="fas fa-circle" style="color:var(--green);"></i>' : '<i class="fas fa-circle" style="color:var(--red);"></i>'}</td>
                <td>${lastSeen}</td>
                <td>${locationHtml}</td>
                <td>${deviceInfo.browser || '---'} / ${deviceInfo.os || '---'}</td>
                <td style="font-size:10px;">${u.location?.ip || '---'}</td>
                <td>${u.createdAt ? new Date(u.createdAt.toDate()).toLocaleDateString('ar-SY') : '---'}</td>
                <td>
                    ${isAdmin ? `<button class="btn-outline btn-sm assign-vip-btn" data-uid="${u.uid}" data-role="${u.role}"><i class="fas fa-star"></i></button>` : ''}
                    ${isAdmin || isSuperMod ? `<button class="btn-outline btn-sm edit-id-btn" data-uid="${u.uid}" data-id="${u.serialId}"><i class="fas fa-id-card"></i></button>` : ''}
                    ${isAdmin || isSuperMod ? `<button class="btn-outline btn-sm remove-photo-btn" data-uid="${u.uid}"><i class="fas fa-image"></i></button>` : ''}
                    <button class="btn-outline btn-sm block-user-admin-btn" data-uid="${u.uid}" data-blocked="${u.blocked || false}"><i class="fas fa-ban"></i></button>
                    ${isAdmin ? `<button class="btn-outline btn-sm delete-user-btn" data-uid="${u.uid}" data-name="${u.name}" style="color:var(--red);border-color:var(--red);"><i class="fas fa-trash"></i></button>` : ''}
                </td>
            </tr>
        `;
    });
    
    // أحداث الصور لمراقبة الحركة
    tbody.querySelectorAll('.user-activity-img').forEach(img => {
        img.addEventListener('click', () => viewUserActivity(img.dataset.uid));
    });
    
    // تعيين VIP (للأدمن)
    tbody.querySelectorAll('.assign-vip-btn').forEach(btn => {
        btn.addEventListener('click', () => assignVipModal(btn.dataset.uid, btn.dataset.role));
    });
    
    // تعديل ID (للأدمن والمشرف المميز)
    tbody.querySelectorAll('.edit-id-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $('#edit-id-user-uid').value = btn.dataset.uid;
            $('#edit-id-input').value = btn.dataset.id;
            $('#edit-id-modal').classList.remove('hidden');
        });
    });
    
    // إزالة الصورة
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
    
    // حظر مستخدم
    tbody.querySelectorAll('.block-user-admin-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $('#block-user-uid').value = btn.dataset.uid;
            $('#block-modal').classList.remove('hidden');
        });
    });
    
    // حذف مستخدم (للأدمن فقط)
    tbody.querySelectorAll('.delete-user-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const confirmed = await showConfirm(`حذف ${btn.dataset.name}؟`);
            if (confirmed) {
                await deleteDoc(doc(db, 'users', btn.dataset.uid));
                showToast('تم الحذف', 'success');
                loadUsersPage();
            }
        });
    });
}

async function viewUserActivity(uid) {
    const panel = $('#user-activity-panel');
    panel.classList.remove('hidden');
    panel.innerHTML = '<p>جاري تحميل الحركة...</p>';
    
    const q = query(collection(db, 'transactions'), where('uid', '==', uid), orderBy('createdAt', 'desc'));
    onSnapshot(q, (snapshot) => {
        const txs = [];
        snapshot.forEach(d => txs.push(d.data()));
        panel.innerHTML = `
            <h4><i class="fas fa-chart-line"></i> حركة المستخدم (${txs.length} عملية)</h4>
            <div class="table-container">
                <table>
                    <thead><tr><th>النوع</th><th>المنتج</th><th>المبلغ</th><th>التاريخ</th></tr></thead>
                    <tbody>
                        ${txs.length === 0 ? '<tr><td colspan="4">لا توجد عمليات</td></tr>' :
                            txs.slice(0, 50).map(t => `
                                <tr>
                                    <td>${getTypeLabel(t.type)}</td>
                                    <td>${t.productName || '---'}</td>
                                    <td>${formatCurrency(t.amount, t.currency)}</td>
                                    <td>${t.createdAt ? new Date(t.createdAt.toDate()).toLocaleDateString('ar-SY') : '---'}</td>
                                </tr>
                            `).join('')
                        }
                    </tbody>
                </table>
            </div>
        `;
    });
}

function assignVipModal(uid, currentRole) {
    const level = prompt('أدخل مستوى VIP (1,2,3) أو اتركه فارغاً للإلغاء:');
    if (!level || !['1','2','3'].includes(level)) return showToast('تم الإلغاء', 'info');
    
    const days = prompt('عدد الأيام (اختياري):', '30');
    const expiryDays = parseInt(days) || 30;
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + expiryDays);
    
    const message = prompt('رسالة تهنئة (اختيارية):', 'مبروك! تمت ترقيتك إلى VIP');
    
    updateDoc(doc(db, 'users', uid), {
        role: `vip${level}`,
        vipExpiry: Timestamp.fromDate(expiry),
        vipMessage: message || ''
    }).then(async () => {
        showToast('تم تعيين VIP', 'success');
        
        // إرسال إشعار للمستخدم الذي تمت ترقيته
        await sendNotification(uid, `تهانينا! لقد تمت ترقيتك إلى VIP ${level}`, 'vip_upgrade', '');
        
        // إضافة شريط ترويجي
        const promoColors = { '1': '#8B4513', '2': '#00C853', '3': '#8A2BE2' };
        const userSnap = await getDoc(doc(db, 'users', uid));
        const userName = userSnap.exists() ? userSnap.data().name : 'مستخدم';
        
        const promoExpiry = new Date();
        promoExpiry.setHours(promoExpiry.getHours() + 24);
        
        await addDoc(collection(db, 'vipPromotions'), {
            text: `🎉 تهانينا لـ ${userName} لحصوله على VIP ${level}`,
            color: promoColors[level] || '#D4AF37',
            expiresAt: promoExpiry,
            createdAt: serverTimestamp()
        });
        
        loadUsersPage();
    });
}

async function saveEditedId() {
    const uid = $('#edit-id-user-uid').value;
    const newId = $('#edit-id-input').value.trim();
    if (!uid || !newId) return showToast('أدخل ID صحيح', 'error');
    
    const days = isAdmin ? prompt('مدة ID المؤقت (أيام، اتركه فارغاً للدائم):', '40') : '40';
    const maxDays = isAdmin ? 365 : 40;
    const duration = Math.min(parseInt(days) || 0, maxDays);
    
    const updateData = { serialId: newId };
    if (duration > 0) {
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + duration);
        updateData.tempIdExpiry = Timestamp.fromDate(expiry);
    }
    
    try {
        await updateDoc(doc(db, 'users', uid), updateData);
        showToast('تم تحديث ID', 'success');
        
        // إرسال إشعار ID مميز للمستخدم
        if (duration > 0) {
            await sendNotification(uid, `تهانينا! لقد حصلت على ID مميز لمدة ${duration} يوم`, 'id_upgrade', '');
        }
        
        $('#edit-id-modal').classList.add('hidden');
        loadUsersPage();
    } catch (e) {
        showToast('فشل التحديث', 'error');
    }
}

async function blockUserByAdmin() {
    const uid = $('#block-user-uid').value;
    const reason = $('#block-reason').value.trim();
    const duration = $('#block-duration').value;
    
    if (!reason) return showToast('اكتب سبب الحظر', 'error');
    
    let expiry = null;
    if (duration === 'permanent') {
        expiry = null;
    } else if (duration === 'custom') {
        const customDate = $('#block-custom-date').value;
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

// =============================================
// نظام الصداقة المطور
// =============================================

function openFriendRequestModal(uid, name) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'friend-request-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3><i class="fas fa-user-plus"></i> إرسال طلب صداقة</h3>
            <p style="font-size:12px;color:var(--text-muted);">إلى: ${name}</p>
            <textarea id="friend-request-message" rows="3" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-tertiary);color:var(--text-primary);resize:none;font-size:14px;margin:12px 0;">هل تحب أن تصبح صديقي؟</textarea>
            <input type="hidden" id="friend-request-uid" value="${uid}">
            <input type="hidden" id="friend-request-name" value="${name}">
            <div class="modal-buttons">
                <button id="confirm-friend-request" class="btn-primary"><i class="fas fa-check"></i> تأكيد</button>
                <button id="cancel-friend-request" class="btn-outline"><i class="fas fa-times"></i> تراجع</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    $('#confirm-friend-request').addEventListener('click', async () => {
        const targetUid = $('#friend-request-uid').value;
        const targetName = $('#friend-request-name').value;
        const message = $('#friend-request-message').value.trim() || 'هل تحب أن تصبح صديقي؟';
        
        await sendFriendRequest(targetUid, targetName, message);
        modal.remove();
    });
    
    $('#cancel-friend-request').addEventListener('click', () => modal.remove());
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

async function sendFriendRequest(targetUid, targetName, message = 'هل تحب أن تصبح صديقي؟') {
    try {
        const myFriends = await getMyFriends();
        if (myFriends.length >= getMaxFriends()) {
            return showToast(`وصلت للحد الأقصى (${getMaxFriends()} صديق)`, 'error');
        }
        
        const q = query(
            collection(db, 'friendRequests'),
            where('from', '==', currentUser.uid),
            where('to', '==', targetUid),
            where('status', '==', 'pending')
        );
        const existing = await getDocs(q);
        if (!existing.empty) return showToast('لديك طلب معلق بالفعل', 'info');
        
        await addDoc(collection(db, 'friendRequests'), {
            from: currentUser.uid,
            fromName: userData.name,
            to: targetUid,
            toName: targetName,
            message: message,
            status: 'pending',
            createdAt: serverTimestamp()
        });
        
        // إرسال إشعار للمستخدم المستهدف
        await sendNotification(targetUid, `لديك طلب صداقة من ${userData.name}`, 'friend_request', 'friendships');
        
        showToast('تم إرسال طلب الصداقة', 'success');
    } catch (error) {
        showToast('فشل في إرسال الطلب', 'error');
    }
}

function getMaxFriends() {
    if (vipLevel === 3) return 300;
    if (vipLevel === 2) return 100;
    if (vipLevel === 1) return 50;
    return 5;
}

async function getMyFriends() {
    const q1 = query(collection(db, 'friendships'), where('user1', '==', currentUser.uid));
    const q2 = query(collection(db, 'friendships'), where('user2', '==', currentUser.uid));
    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
    const friends = [];
    snap1.forEach(d => friends.push(d.data().user2));
    snap2.forEach(d => friends.push(d.data().user1));
    return friends;
}

// ---------- عرض الملف الشخصي العام ----------
async function viewPublicProfile(uid) {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return showToast('المستخدم غير موجود', 'error');
    
    const u = snap.data();
    const section = $('#page-profile');
    section.classList.add('active');
    $$('.page').forEach(p => { if (p !== section) p.classList.remove('active'); });
    
    const isOnline = onlineUsers[uid]?.status === 'online';
    const isFriend = (await getMyFriends()).includes(uid);
    const isOwnProfile = uid === currentUser.uid;
    const vipAvatarClass = getVipAvatarClass(u.role);
    const vipNameClass = getVipNameClass(u.role);
    const userVipLevel = u.role?.startsWith('vip') ? parseInt(u.role.replace('vip','')) || 0 : 0;
    
    section.innerHTML = `
        <div class="profile-page">
            <div class="profile-cover ${userVipLevel > 0 && u.coverPhoto ? '' : 'default-cover'}">
                ${userVipLevel > 0 && u.coverPhoto ? `<img src="${u.coverPhoto}" alt="غلاف">` : ''}
                
                <!-- أزرار أعلى اليمين -->
                <div class="profile-actions-top">
                    ${!isOwnProfile ? `<button class="btn-outline report-user-btn" data-uid="${uid}" title="بلاغ"><i class="fas fa-flag"></i></button>` : ''}
                    ${!isOwnProfile && isFriend ? `
                        <button class="btn-outline more-actions-btn" data-uid="${uid}" data-name="${u.name}" title="المزيد">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                    ` : ''}
                </div>
                
                <!-- صورة المستخدم -->
                <div class="profile-avatar-large ${vipAvatarClass}">
                    <img src="${u.avatar || 'https://ui-avatars.com/api/?name='+encodeURIComponent(u.name||'?')+'&background=D4AF37&color=111&size=200'}" alt="${u.name}">
                </div>
            </div>
            
            <div class="profile-info">
                <div class="profile-name ${vipNameClass}">${u.name || '---'}</div>
                <div class="profile-id ${userVipLevel > 0 ? 'vip-id-vip'+userVipLevel : ''}">ID: ${u.serialId || '---'}</div>
                <div class="profile-bio">${u.bio || ''}</div>
                <div class="profile-status">
                    ${isOnline ? '<i class="fas fa-circle" style="color:var(--green);"></i> متصل الآن' : '<i class="fas fa-circle" style="color:var(--red);"></i> غير متصل'}
                    ${u.lastSeen && u.privacy?.showLastSeen ? ' · آخر ظهور: ' + new Date(u.lastSeen.toDate()).toLocaleString('ar-SY') : ''}
                </div>
                
                <!-- أزرار أسفل الصفحة -->
                <div class="profile-actions-bottom">
                    ${isOwnProfile ? `
                        <button class="btn-outline my-friends-btn"><i class="fas fa-users"></i> قائمة الأصدقاء</button>
                        <button class="btn-outline my-blocked-btn"><i class="fas fa-ban"></i> قائمة المحظورين</button>
                    ` : `
                        ${!isFriend ? `
                            <button class="btn-primary add-friend-btn" data-uid="${uid}" data-name="${u.name}"><i class="fas fa-user-plus"></i> إضافة صديق</button>
                        ` : `
                            <button class="btn-outline chat-friend-btn" data-uid="${uid}" data-name="${u.name}"><i class="fas fa-comment-dots"></i> دردشة</button>
                        `}
                    `}
                </div>
            </div>
        </div>
        
        <!-- القائمة المنسدلة للمزيد -->
        <div id="more-actions-menu" class="hidden" style="position:fixed;top:80px;left:20px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:8px;z-index:500;min-width:150px;">
            <button class="btn-outline btn-sm block-profile-btn" data-uid="${uid}" style="width:100%;margin-bottom:4px;"><i class="fas fa-ban"></i> حظر المستخدم</button>
            <button class="btn-outline btn-sm unfriend-profile-btn" data-uid="${uid}" data-name="${u.name}" style="width:100%;color:var(--red);border-color:var(--red);"><i class="fas fa-user-slash"></i> إلغاء الصداقة</button>
        </div>
    `;
    
    // أحداث الأزرار (للمستخدمين الآخرين)
    if (!isOwnProfile) {
        section.querySelector('.report-user-btn')?.addEventListener('click', function() {
            openReportModal(this.dataset.uid);
        });
        
        section.querySelector('.more-actions-btn')?.addEventListener('click', function(e) {
            e.stopPropagation();
            const menu = $('#more-actions-menu');
            menu.classList.toggle('hidden');
        });
        
        section.querySelector('.block-profile-btn')?.addEventListener('click', function() {
            blockUser(this.dataset.uid);
            $('#more-actions-menu').classList.add('hidden');
        });
        
        section.querySelector('.unfriend-profile-btn')?.addEventListener('click', function() {
            removeFriend(this.dataset.uid, this.dataset.name);
            $('#more-actions-menu').classList.add('hidden');
        });
        
        section.querySelector('.add-friend-btn')?.addEventListener('click', function() {
            openFriendRequestModal(this.dataset.uid, this.dataset.name);
        });
        
        section.querySelector('.chat-friend-btn')?.addEventListener('click', function() {
            startFriendChat(this.dataset.uid, this.dataset.name);
        });
    }
    
    // أحداث الأزرار (لصاحب الملف الشخصي)
    if (isOwnProfile) {
        section.querySelector('.my-friends-btn')?.addEventListener('click', () => navigateTo('friendships'));
        section.querySelector('.my-blocked-btn')?.addEventListener('click', () => navigateTo('blocks'));
    }
    
    // إغلاق القائمة المنسدلة عند النقر في أي مكان آخر
    document.addEventListener('click', function closeMenu() {
        const menu = $('#more-actions-menu');
        if (menu && !menu.classList.contains('hidden')) {
            menu.classList.add('hidden');
        }
    }, { once: true });
}

// ---------- بدء محادثة خاصة مع صديق ----------
function startFriendChat(uid, name) {
    selectedChatUser = uid;
    const section = $('#page-friendships');
    
    section.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <button class="btn-outline btn-sm" id="back-to-profile" data-uid="${uid}"><i class="fas fa-arrow-right"></i> عودة للملف</button>
            <h3 style="margin:0;"><i class="fas fa-comment-dots"></i> ${name}</h3>
        </div>
        <div class="chat-container" style="height:calc(100vh - 300px);">
            <div class="chat-messages" id="private-chat-messages">
                <p style="text-align:center;color:var(--text-muted);">جاري تحميل المحادثة...</p>
            </div>
            <div class="chat-input-area">
                <input type="text" id="private-chat-input" placeholder="اكتب رسالتك...">
                <button id="private-chat-send"><i class="fas fa-paper-plane"></i></button>
            </div>
        </div>
    `;
    
    $('#back-to-profile').addEventListener('click', function() {
        viewPublicProfile(this.dataset.uid);
    });
    
    const q = query(collection(db, 'privateMessages'), orderBy('createdAt', 'asc'));
    
    onSnapshot(q, (snapshot) => {
        const messagesDiv = $('#private-chat-messages');
        if (!messagesDiv) return;
        messagesDiv.innerHTML = '';
        
        let hasMessages = false;
        snapshot.forEach(doc => {
            const msg = doc.data();
            if ((msg.from === currentUser.uid && msg.to === uid) ||
                (msg.from === uid && msg.to === currentUser.uid)) {
                hasMessages = true;
                const isSent = msg.from === currentUser.uid;
                messagesDiv.innerHTML += `
                    <div class="chat-msg ${isSent ? 'sent' : 'received'}">
                        <strong>${msg.fromName || 'مستخدم'}</strong>
                        <p>${escapeHtml(msg.text)}</p>
                        <small>${msg.createdAt ? new Date(msg.createdAt.toDate()).toLocaleTimeString('ar-SY', {hour:'2-digit', minute:'2-digit'}) : ''}</small>
                    </div>
                `;
            }
        });
        
        if (!hasMessages) {
            messagesDiv.innerHTML = '<p style="text-align:center;color:var(--text-muted);">ابدأ المحادثة</p>';
        }
        
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
    
    const send = async () => {
        const text = $('#private-chat-input')?.value.trim();
        if (!text) return;
        try {
            await addDoc(collection(db, 'privateMessages'), {
                from: currentUser.uid,
                fromName: userData.name,
                to: uid,
                text,
                createdAt: serverTimestamp()
            });
            if ($('#private-chat-input')) $('#private-chat-input').value = '';
        } catch (e) {
            showToast('فشل في الإرسال', 'error');
        }
    };
    
    $('#private-chat-send')?.addEventListener('click', send);
    $('#private-chat-input')?.addEventListener('keypress', e => { if (e.key === 'Enter') send(); });
}

// ---------- إلغاء الصداقة ----------
async function removeFriend(uid, name) {
    const confirmed = await showConfirm(`إلغاء الصداقة مع ${name}؟`);
    if (!confirmed) return;
    
    const q1 = query(collection(db, 'friendships'), where('user1', '==', currentUser.uid), where('user2', '==', uid));
    const q2 = query(collection(db, 'friendships'), where('user1', '==', uid), where('user2', '==', currentUser.uid));
    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
    
    for (const doc of [...snap1.docs, ...snap2.docs]) {
        await deleteDoc(doc.ref);
    }
    
    showToast('تم إلغاء الصداقة', 'info');
}

// ---------- البلاغات ----------
function openReportModal(uid) {
    $('#report-user-uid').value = uid;
    $('#report-modal').classList.remove('hidden');
}

async function sendReport() {
    const uid = $('#report-user-uid').value;
    const reason = $('#report-reason').value.trim();
    if (!reason) return showToast('اكتب سبب البلاغ', 'error');
    
    try {
        await addDoc(collection(db, 'reports'), {
            from: currentUser.uid,
            fromName: userData.name,
            target: uid,
            reason,
            createdAt: serverTimestamp(),
            status: 'new'
        });
        showToast('تم إرسال البلاغ', 'success');
        $('#report-modal').classList.add('hidden');
        $('#report-reason').value = '';
    } catch (e) {
        showToast('فشل في إرسال البلاغ', 'error');
    }
}

// ---------- الحظر ----------
async function blockUser(uid) {
    const confirmed = await showConfirm('حظر هذا المستخدم؟ لن يتمكن من مراسلتك أو إرسال طلب صداقة.');
    if (!confirmed) return;
    
    try {
        await addDoc(collection(db, 'blocks'), {
            from: currentUser.uid,
            target: uid,
            createdAt: serverTimestamp()
        });
        await removeFriendSilent(uid);
        showToast('تم حظر المستخدم', 'info');
    } catch (e) {
        showToast('فشل في الحظر', 'error');
    }
}

async function removeFriendSilent(uid) {
    const q1 = query(collection(db, 'friendships'), where('user1', '==', currentUser.uid), where('user2', '==', uid));
    const q2 = query(collection(db, 'friendships'), where('user1', '==', uid), where('user2', '==', currentUser.uid));
    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
    for (const doc of [...snap1.docs, ...snap2.docs]) {
        await deleteDoc(doc.ref);
    }
}// =============================================
// صفحة الإعدادات
// =============================================

function loadSettingsPage() {
    const section = $('#page-settings');
    
    const avatarUrl = userData?.avatar || 
        `https://ui-avatars.com/api/?name=${encodeURIComponent(userData?.name || 'مستخدم')}&background=D4AF37&color=111&size=200&bold=true&format=svg`;
    
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
                <label><i class="fas fa-envelope"></i> البريد الإلكتروني</label>
                <input type="email" id="settings-email" value="${userData?.email || ''}" disabled>
                <button id="change-email-btn" class="text-btn" style="font-size:11px;">تغيير البريد</button>
            </div>
            
            <div class="input-group" style="margin-bottom:12px;">
                <label><i class="fas fa-pen"></i> السيرة الذاتية (${(userData?.bio || '').length}/65)</label>
                <textarea id="settings-bio" maxlength="65" rows="2" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-tertiary);color:var(--text-primary);resize:none;">${userData?.bio || ''}</textarea>
            </div>
            
            ${isVip ? `
            <div class="input-group" style="margin-bottom:12px;">
                <label><i class="fas fa-image"></i> صورة الغلاف</label>
                <button id="change-cover-btn" class="btn-outline btn-sm"><i class="fas fa-upload"></i> تغيير الغلاف</button>
                <input type="file" id="settings-cover-upload" accept="image/*" hidden>
                ${userData?.coverPhoto ? '<img src="'+userData.coverPhoto+'" style="width:100%;height:80px;object-fit:cover;border-radius:8px;margin-top:6px;">' : '<div style="width:100%;height:80px;background:var(--bg-tertiary);border-radius:8px;margin-top:6px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);">لا يوجد غلاف</div>'}
            </div>` : `
            <div class="input-group" style="margin-bottom:12px;">
                <label><i class="fas fa-image"></i> صورة الغلاف</label>
                <div style="width:100%;height:80px;background:var(--bg-tertiary);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);cursor:pointer;" id="vip-cover-lock">
                    <i class="fas fa-lock"></i> VIP فقط
                </div>
            </div>`}
            
            <div class="input-group" style="margin-bottom:12px;">
                <label><i class="fas fa-id-card"></i> الرقم التسلسلي ${isAdmin || isSuperMod ? '(قابل للتعديل)' : '(ثابت)'}</label>
                <input type="text" id="settings-id" value="${userData?.serialId || ''}" ${isAdmin || isSuperMod ? '' : 'disabled'}>
            </div>
            
            <h3 style="margin:20px 0 12px;color:var(--gold);"><i class="fas fa-lock"></i> تغيير كلمة المرور</h3>
            <div class="input-group" style="margin-bottom:10px;">
                <label>كلمة المرور الحالية</label>
                <input type="password" id="settings-current-pass" placeholder="كلمة المرور الحالية">
            </div>
            <div class="input-group" style="margin-bottom:10px;">
                <label>كلمة المرور الجديدة</label>
                <input type="password" id="settings-new-pass" placeholder="حرف إنجليزي + أرقام (6 خانات)">
            </div>
            
            <h3 style="margin:20px 0 12px;color:var(--gold);"><i class="fas fa-user-shield"></i> الخصوصية</h3>
            ${buildPrivacyToggles()}
            
            <div style="display:flex;gap:10px;margin-top:20px;">
                <button id="save-profile-btn" class="btn-primary" style="flex:1;"><i class="fas fa-save"></i> حفظ التعديلات</button>
                <button id="change-password-btn" class="btn-outline" style="flex:1;"><i class="fas fa-key"></i> تغيير كلمة المرور</button>
            </div>
        </div>
    `;
    
    setupSettingsEvents();
}

function buildPrivacyToggles() {
    const p = userData?.privacy || {};
    return `
        <div class="notifications-toggle" style="margin-bottom:8px;">
            <span style="font-size:13px;">من يمكنه رؤية ملفي الشخصي</span>
            <div id="privacy-profile" class="toggle-switch ${p.whoCanSeeProfile === 'friends' ? 'active' : ''}" data-key="whoCanSeeProfile" data-value="${p.whoCanSeeProfile || 'everyone'}"></div>
        </div>
        <div class="notifications-toggle" style="margin-bottom:8px;">
            <span style="font-size:13px;">من يمكنه إرسال طلب صداقة</span>
            <div id="privacy-friend" class="toggle-switch ${p.whoCanSendFriend === 'nobody' ? 'active' : ''}" data-key="whoCanSendFriend" data-value="${p.whoCanSendFriend || 'everyone'}"></div>
        </div>
        ${isVip ? `
        <div class="notifications-toggle" style="margin-bottom:8px;">
            <span style="font-size:13px;">إظهار حالة الاتصال</span>
            <div id="privacy-status" class="toggle-switch ${p.showStatus ? 'active' : ''}" data-key="showStatus" data-value="${p.showStatus || false}"></div>
        </div>
        <div class="notifications-toggle" style="margin-bottom:8px;">
            <span style="font-size:13px;">إظهار آخر ظهور</span>
            <div id="privacy-lastseen" class="toggle-switch ${p.showLastSeen ? 'active' : ''}" data-key="showLastSeen" data-value="${p.showLastSeen || false}"></div>
        </div>` : ''}
    `;
}

function setupSettingsEvents() {
    $('#change-avatar-btn')?.addEventListener('click', () => openCropper('avatar'));
    $('#change-cover-btn')?.addEventListener('click', () => openCropper('cover'));
    $('#vip-cover-lock')?.addEventListener('click', () => showToast('ترقية إلى VIP لاستخدام هذه الميزة', 'info'));
    
    $('#change-email-btn')?.addEventListener('click', () => {
        $('#change-email-modal').classList.remove('hidden');
        $('#change-email-step-1').classList.remove('hidden');
        $('#change-email-step-2').classList.add('hidden');
        $('#change-email-step-3').classList.add('hidden');
        $('#change-email-step-4').classList.add('hidden');
    });
    
    $('#change-email-yes')?.addEventListener('click', async () => {
        const code = generateCode();
        pendingCodes[currentUser.email] = { code, expires: Date.now() + 10*60*1000 };
        await sendEmailCode(currentUser.email, code);
        $('#change-email-step-1').classList.add('hidden');
        $('#change-email-step-2').classList.remove('hidden');
    });
    
    $('#change-email-verify')?.addEventListener('click', () => {
        const code = $('#change-email-code').value.trim();
        const pending = pendingCodes[currentUser.email];
        if (!pending || code !== pending.code) return showToast('رمز غير صحيح', 'error');
        delete pendingCodes[currentUser.email];
        $('#change-email-step-2').classList.add('hidden');
        $('#change-email-step-3').classList.remove('hidden');
    });
    
    $('#change-email-save')?.addEventListener('click', async () => {
        const newEmail = $('#change-email-new').value.trim();
        if (!newEmail) return;
        try {
            await updateEmail(currentUser, newEmail);
            await updateDoc(doc(db, 'users', currentUser.uid), { email: newEmail });
            userData.email = newEmail;
            showToast('تم تغيير البريد', 'success');
            $('#change-email-modal').classList.add('hidden');
            loadSettingsPage();
        } catch (e) {
            $('#change-email-step-3').classList.add('hidden');
            $('#change-email-step-4').classList.remove('hidden');
        }
    });
    
    $('#change-email-final')?.addEventListener('click', async () => {
        const pass = $('#change-email-password').value;
        try {
            const cred = EmailAuthProvider.credential(currentUser.email, pass);
            await reauthenticateWithCredential(currentUser, cred);
            const newEmail = $('#change-email-new').value.trim();
            await updateEmail(currentUser, newEmail);
            await updateDoc(doc(db, 'users', currentUser.uid), { email: newEmail });
            showToast('تم تغيير البريد', 'success');
            $('#change-email-modal').classList.add('hidden');
        } catch (e) {
            showToast('كلمة المرور غير صحيحة', 'error');
        }
    });
    
    $('#change-email-cancel')?.addEventListener('click', () => $('#change-email-modal').classList.add('hidden'));
    
    $('#save-profile-btn')?.addEventListener('click', async () => {
        const name = $('#settings-name').value.trim();
        const bio = $('#settings-bio').value.trim();
        const serialId = $('#settings-id').value.trim();
        if (!name) return showToast('الاسم مطلوب', 'error');
        
        const updates = { name, bio };
        if ((isAdmin || isSuperMod) && serialId) updates.serialId = serialId;
        
        await updateDoc(doc(db, 'users', currentUser.uid), updates);
        userData.name = name;
        userData.bio = bio;
        if (serialId) userData.serialId = serialId;
        updateUI();
        showToast('تم حفظ التعديلات', 'success');
    });
    
    $('#change-password-btn')?.addEventListener('click', async () => {
        const cur = $('#settings-current-pass').value;
        const newP = $('#settings-new-pass').value;
        if (!cur || !newP) return showToast('أدخل كلمتي المرور', 'error');
        if (!validatePassword(newP)) return showToast('كلمة المرور ضعيفة', 'error');
        try {
            const cred = EmailAuthProvider.credential(currentUser.email, cur);
            await reauthenticateWithCredential(currentUser, cred);
            await updatePassword(currentUser, newP);
            showToast('تم تغيير كلمة المرور', 'success');
        } catch (e) {
            showToast('كلمة المرور الحالية خاطئة', 'error');
        }
    });
    
    document.querySelectorAll('.toggle-switch[id^="privacy-"]').forEach(toggle => {
        toggle.addEventListener('click', async function() {
            const key = this.dataset.key;
            const currentVal = this.dataset.value;
            let newVal;
            if (key === 'whoCanSeeProfile' || key === 'whoCanSendFriend') {
                newVal = currentVal === 'everyone' ? (key === 'whoCanSeeProfile' ? 'friends' : 'nobody') : 'everyone';
            } else {
                newVal = currentVal === 'true' ? 'false' : 'true';
            }
            const privacy = userData.privacy || {};
            privacy[key] = newVal;
            await updateDoc(doc(db, 'users', currentUser.uid), { privacy });
            userData.privacy = privacy;
            this.classList.toggle('active');
            this.dataset.value = newVal;
        });
    });
}

// ---------- أداة قص الصورة ----------
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
                <div class="cropper-container">
                    <img id="cropper-image" src="${ev.target.result}" alt="قص الصورة">
                </div>
                <div class="cropper-buttons">
                    <button class="btn-primary" id="crop-save"><i class="fas fa-save"></i> حفظ</button>
                    <button class="btn-outline" id="crop-cancel"><i class="fas fa-times"></i> إلغاء</button>
                </div>
            `;
            document.body.appendChild(modal);
            
            const image = $('#cropper-image');
            let cropper = null;
            
            image.onload = () => {
                cropper = new Cropper(image, {
                    aspectRatio: type === 'cover' ? 16 / 9 : 1 / 1,
                    viewMode: 1,
                    dragMode: 'move',
                    autoCropArea: 1,
                    restore: false,
                    guides: true,
                    center: true,
                    highlight: true,
                    cropBoxMovable: true,
                    cropBoxResizable: true,
                    toggleDragModeOnDblclick: false,
                });
            };
            
            $('#crop-save').addEventListener('click', async () => {
                if (!cropper) return;
                const canvas = cropper.getCroppedCanvas();
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                
                if (type === 'avatar') {
                    await updateDoc(doc(db, 'users', currentUser.uid), { avatar: dataUrl });
                    userData.avatar = dataUrl;
                } else if (type === 'cover') {
                    await updateDoc(doc(db, 'users', currentUser.uid), { coverPhoto: dataUrl });
                    userData.coverPhoto = dataUrl;
                }
                
                updateUI();
                if (type === 'avatar') {
                    showToast('تم تحديث الصورة', 'success');
                    $('#onboarding-screen').classList.add('hidden');
                    navigateTo('dashboard');
                } else {
                    showToast('تم تحديث الغلاف', 'success');
                    loadSettingsPage();
                }
                
                cropper.destroy();
                modal.remove();
            });
            
            $('#crop-cancel').addEventListener('click', () => {
                if (cropper) cropper.destroy();
                modal.remove();
            });
        };
        reader.readAsDataURL(file);
    });
}

// =============================================
// سياسة الخصوصية
// =============================================

async function loadPrivacyPage() {
    const section = $('#page-privacy');
    section.innerHTML = '<h2><i class="fas fa-shield-alt"></i> سياسة الخصوصية</h2><div id="privacy-content">جاري التحميل...</div>';
    
    const snap = await getDoc(doc(db, 'settings', 'privacy'));
    let content = snap.exists() ? snap.data().text : 'لم يتم تعيين سياسة الخصوصية بعد.';
    
    $('#privacy-content').innerHTML = `
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

// =============================================
// شريط VIP (أكتب شريط)
// =============================================

function setupWriteBar() {
    $('#sidebar-write-bar').addEventListener('click', () => {
        if (!isVip && !isAdmin && !isMod && !isSuperMod) {
            return showToast('VIP فقط يمكنهم استخدام هذه الميزة', 'info');
        }
        $('#write-bar-modal').classList.remove('hidden');
        $('#write-bar-text').value = '';
        $('#write-bar-color').value = '#D4AF37';
        $('#write-bar-count').textContent = '0/90';
    });
    
    $('#write-bar-text')?.addEventListener('input', function() {
        $('#write-bar-count').textContent = `${this.value.length}/90`;
    });
    
    $('#write-bar-send')?.addEventListener('click', async () => {
        const text = $('#write-bar-text').value.trim();
        const color = $('#write-bar-color')?.value || '#D4AF37';
        if (!text) return showToast('اكتب شيئاً', 'error');
        if (text.length > 90) return showToast('الحد 90 حرفاً', 'error');
        
        try {
            await addDoc(collection(db, 'vipBars'), {
                uid: currentUser.uid,
                name: userData.name,
                avatar: userData.avatar,
                text,
                color,
                createdAt: serverTimestamp()
            });
            showToast('تم رفع الشريط', 'success');
            $('#write-bar-modal').classList.add('hidden');
        } catch (e) {
            showToast('فشل في الرفع', 'error');
        }
    });
    
    $('#write-bar-cancel')?.addEventListener('click', () => $('#write-bar-modal').classList.add('hidden'));
}

// =============================================
// الآلة الحاسبة
// =============================================

function setupCalculator() {
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
    
    header.addEventListener('touchstart', (e) => {
        isDragging = true;
        const rect = calc.getBoundingClientRect();
        calcOffsetX = e.touches[0].clientX - rect.left;
        calcOffsetY = e.touches[0].clientY - rect.top;
        calc.style.transition = 'none';
    });
    
    document.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        let left = e.touches[0].clientX - calcOffsetX;
        let top = e.touches[0].clientY - calcOffsetY;
        left = Math.max(0, Math.min(left, window.innerWidth - calc.offsetWidth));
        top = Math.max(0, Math.min(top, window.innerHeight - calc.offsetHeight));
        calc.style.left = left + 'px';
        calc.style.top = top + 'px';
    });
    
    document.addEventListener('touchend', () => { isDragging = false; });
    
    // جعل الزر قابلاً للسحب أيضاً
    let btnDragging = false, btnOffsetX = 0, btnOffsetY = 0;
    const toggleBtn = $('#calc-toggle');
    
    toggleBtn.addEventListener('mousedown', (e) => {
        btnDragging = true;
        const rect = toggleBtn.getBoundingClientRect();
        btnOffsetX = e.clientX - rect.left;
        btnOffsetY = e.clientY - rect.top;
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!btnDragging) return;
        let left = e.clientX - btnOffsetX;
        let top = e.clientY - btnOffsetY;
        left = Math.max(0, Math.min(left, window.innerWidth - toggleBtn.offsetWidth));
        top = Math.max(0, Math.min(top, window.innerHeight - toggleBtn.offsetHeight));
        toggleBtn.style.left = left + 'px';
        toggleBtn.style.bottom = 'auto';
        toggleBtn.style.top = top + 'px';
    });
    
    document.addEventListener('mouseup', () => { btnDragging = false; });
}

function toggleCalculator() {
    calculatorOpen = !calculatorOpen;
    $('#calculator').classList.toggle('hidden', !calculatorOpen);
    if (calculatorOpen) {
        calcExpression = '';
        $('#calc-display').value = '0';
    }
}

function handleCalcClick(key) {
    const display = $('#calc-display');
    if (key === 'clear') { calcExpression = ''; display.value = '0'; return; }
    if (key === '=') {
        try {
            let exp = calcExpression.replace(/×/g, '*').replace(/÷/g, '/');
            const result = eval(exp);
            if (!isFinite(result)) throw new Error('Invalid');
            display.value = parseFloat(result.toFixed(10));
            calcExpression = result.toString();
        } catch { display.value = 'خطأ'; calcExpression = ''; }
        return;
    }
    const ops = ['+', '-', '*', '/', '×', '÷'];
    const lastChar = calcExpression.slice(-1);
    if (ops.includes(key) && ops.includes(lastChar)) calcExpression = calcExpression.slice(0, -1);
    calcExpression += key;
    display.value = calcExpression;
}

// =============================================
// التنقل بين الصفحات
// =============================================

function navigateTo(page) {
    if (window.innerWidth <= 600) closeSidebar();
    
    historyStack.push(currentPage);
    currentPage = page;
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
        case 'userslist': loadUsersListPage(); break;
        case 'globalchat': loadGlobalChatPage(); break;
        case 'chat': loadChatPage(); break;
        case 'users': loadUsersPage(); break;
        case 'settings': loadSettingsPage(); break;
        case 'privacy': loadPrivacyPage(); break;
        case 'activate-vip': navigateTo('vip-pricing'); break;
        case 'vip-pricing': loadVipPricingPage(); break;
        case 'vip-payment': loadVipPaymentPage(); break;
    }
    
    $$('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.nav-btn[data-page="${page}"]`);
    if (activeBtn) activeBtn.classList.add('active');
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

// =============================================
// القائمة الجانبية والإشعارات
// =============================================

function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
    $('#sidebar').classList.toggle('open', sidebarOpen);
}

function closeSidebar() {
    sidebarOpen = false;
    $('#sidebar').classList.remove('open');
}

function toggleNotificationsDropdown() {
    $('#notifications-dropdown').classList.toggle('hidden');
}

// =============================================
// إعداد جميع الأحداث
// =============================================

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
    $('#upload-avatar-btn')?.addEventListener('click', () => openCropper('avatar'));
    $('#skip-onboarding')?.addEventListener('click', () => completeOnboarding(null));
    
    // القائمة الجانبية
    $('#sidebar-toggle')?.addEventListener('click', toggleSidebar);
    $('#header-avatar')?.addEventListener('click', () => viewPublicProfile(currentUser.uid));
    document.querySelector('.sidebar-overlay')?.addEventListener('click', closeSidebar);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (sidebarOpen) closeSidebar();
            if (calculatorOpen) toggleCalculator();
            $('#notifications-dropdown').classList.add('hidden');
        }
    });
    
    // تسجيل الخروج
    $('#logout-btn')?.addEventListener('click', handleLogout);
    
    // الإشعارات
    $('#notification-bell')?.addEventListener('click', toggleNotificationsDropdown);
    $('#notifications-close')?.addEventListener('click', () => $('#notifications-dropdown').classList.add('hidden'));
    $('#notifications-toggle-switch')?.addEventListener('click', function() {
        this.classList.toggle('active');
        showToast(this.classList.contains('active') ? 'تم تفعيل الإشعارات' : 'تم إيقاف الإشعارات', 'info');
    });
    
    // الشريط السفلي
    $('#bottom-btn-users')?.addEventListener('click', () => navigateTo('userslist'));
    $('#bottom-btn-back')?.addEventListener('click', () => navigateTo('dashboard'));
    
    // الآلة الحاسبة
    $('#calc-toggle')?.addEventListener('click', toggleCalculator);
    $('#calc-close')?.addEventListener('click', toggleCalculator);
    $$('.calc-btn').forEach(btn => btn.addEventListener('click', () => handleCalcClick(btn.dataset.key)));
    setTimeout(setupCalculator, 1000);
    
    // مودالات
    $('#edit-id-save')?.addEventListener('click', saveEditedId);
    $('#edit-id-cancel')?.addEventListener('click', () => $('#edit-id-modal').classList.add('hidden'));
    $('#report-send')?.addEventListener('click', sendReport);
    $('#report-cancel')?.addEventListener('click', () => $('#report-modal').classList.add('hidden'));
    $('#block-confirm')?.addEventListener('click', blockUserByAdmin);
    $('#block-cancel')?.addEventListener('click', () => $('#block-modal').classList.add('hidden'));
    $('#group-save')?.addEventListener('click', createGroup);
    $('#group-cancel')?.addEventListener('click', () => $('#group-modal').classList.add('hidden'));
    
    // إغلاق المودالات
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) e.target.classList.add('hidden');
    });
    
    // شريط VIP
    setupWriteBar();
    
    // الوضع الفاتح
    $('#theme-toggle-btn')?.addEventListener('click', toggleTheme);
    
    // زر الرجوع في الهاتف
    window.addEventListener('popstate', (e) => {
        if (historyStack.length > 0) {
            const prevPage = historyStack.pop();
            navigateTo(prevPage);
        }
    });
}

// =============================================
// الوضع الفاتح/الداكن
// =============================================

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

// =============================================
// تأثير رقاقات التهنئة الذهبية
// =============================================

function showVipConfetti(message = 'مبروك! تمت ترقيتك إلى VIP') {
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

// =============================================
// نظام مراجعة الصور
// =============================================

async function notifyAdminsAboutImage(imageUrl, uploaderUid) {
    if (isAdmin || isMod || isSuperMod) return;
    const uploaderSnap = await getDoc(doc(db, 'users', uploaderUid));
    const uploaderName = uploaderSnap.exists() ? uploaderSnap.data().name : 'مستخدم';
    await addDoc(collection(db, 'imageApprovals'), {
        imageUrl, uploaderUid, uploaderName,
        status: 'pending', createdAt: serverTimestamp()
    });
}

function listenForImageApprovals() {
    if (!isAdmin && !isMod && !isSuperMod) return;
    const q = query(collection(db, 'imageApprovals'), where('status', '==', 'pending'), orderBy('createdAt', 'desc'));
    onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') showImageReviewModal(change.doc.id, change.doc.data());
        });
    });
}

function showImageReviewModal(approvalId, data) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:10000;display:flex;align-items:center;justify-content:center;';
    const modal = document.createElement('div');
    modal.className = 'modal-content';
    modal.style.maxWidth = '400px';
    modal.innerHTML = `
        <h3><i class="fas fa-image"></i> مراجعة صورة</h3>
        <img src="${data.imageUrl}" style="width:100px;height:100px;border-radius:50%;border:2px solid var(--gold);margin:12px 0;">
        <p>رفعها: ${data.uploaderName}</p>
        <div class="modal-buttons">
            <button class="btn-primary approve-btn"><i class="fas fa-check"></i> قبول</button>
            <button class="btn-danger reject-btn"><i class="fas fa-times"></i> رفض</button>
        </div>`;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    modal.querySelector('.approve-btn').addEventListener('click', async () => {
        await updateDoc(doc(db, 'imageApprovals', approvalId), { status: 'approved' });
        overlay.remove(); showToast('تم قبول الصورة', 'success');
    });
    
    modal.querySelector('.reject-btn').addEventListener('click', async () => {
        await updateDoc(doc(db, 'users', data.uploaderUid), {
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(data.uploaderName)}&background=D4AF37&color=111&size=200`
        });
        await updateDoc(doc(db, 'imageApprovals', approvalId), { status: 'rejected' });
        overlay.remove(); showToast('تم رفض الصورة وحذفها', 'info');
    });
}

// =============================================
// مراقب المصادقة وبدء التطبيق
// =============================================

onAuthStateChanged(auth, async (user) => {
    hideLoading();
    
    if (user) {
        currentUser = user;
        const exists = await loadUserData();
        
        if (exists) {
            setupPresence(user.uid);
            if (isAdmin || isMod || isSuperMod) {
                monitorPresence();
                listenForImageApprovals();
            }
            updateVipTopBar();
            loadNotifications();
            
            const location = await getUserLocation();
            const device = getDeviceInfo();
            await updateDoc(doc(db, 'users', user.uid), {
                lastLogin: serverTimestamp(),
                location,
                device
            });
            
            if (userData.blocked) {
                const reason = userData.blockReason || 'غير محدد';
                const expiry = userData.blockExpiry ? new Date(userData.blockExpiry.toDate()).toLocaleString('ar-SY') : 'دائم';
                await signOut(auth);
                return showToast(`حسابك محظور. السبب: ${reason}. ينتهي: ${expiry}`, 'error');
            }
            
            // ✅ إصلاح الثغرة الأمنية: تأكيد البريد أولاً
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
                checkVipNotifications();
            }
        } else {
            showOnboarding();
        }
    } else {
        currentUser = null;
        userData = null;
        isAdmin = false;
        isMod = false;
        isSuperMod = false;
        isVip = false;
        vipLevel = 0;
        $('#app').classList.add('hidden');
        $('#onboarding-screen').classList.add('hidden');
        $('#verify-email-screen').classList.add('hidden');
        $('#auth-screen').classList.remove('hidden');
    }
});

// ---------- بدء التطبيق ----------
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    showLoading();
});

// ---------- تصدير الدوال ----------
export { navigateTo, showToast, showConfirm, formatCurrency, getTypeLabel }; 
