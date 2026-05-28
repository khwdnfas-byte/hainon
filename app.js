// =============================================
// HAINON - التطبيق الرئيسي
// نظام المحاسبة والإدارة المالية
// =============================================

// ---------- إعدادات EmailJS ----------
const EMAILJS_PUBLIC_KEY = "ILfMM-EFqQXbiBmeZ";
const EMAILJS_SERVICE_ID = "service_91tlpl2";
const EMAILJS_TEMPLATE_ID = "wzszz2h";

// ---------- استيراد Firebase ----------
import { auth, db, rtdb } from './firebase.js';

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile,
    sendPasswordResetEmail,
    updateEmail,
    updatePassword,
    reauthenticateWithCredential,
    EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import {
    doc, setDoc, getDoc, collection, addDoc, query,
    where, orderBy, onSnapshot, serverTimestamp, getDocs,
    updateDoc, deleteDoc, Timestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import {
    ref, set, onValue, onDisconnect,
    serverTimestamp as rtdbTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// ---------- تحميل EmailJS ----------
const emailjsScript = document.createElement('script');
emailjsScript.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js";
document.head.appendChild(emailjsScript);

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
let friendshipPageActive = false;
let groupsPageActive = false;

// =============================================
// اختصارات DOM
// =============================================
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

function generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateSerialId() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function validatePassword(pw) {
    return /^(?=.*[a-zA-Z])[a-zA-Z0-9]{6,}$/.test(pw);
}

function getTypeLabel(type) {
    const labels = {
        incoming: '📥 وارد', outgoing: '📤 صادر', sale: '💰 بيع',
        purchase: '🛒 شراء', debt_in: '🟢 دين لنا', debt_out: '🔴 دين علينا',
        debt_received: '✅ دين مقبوض', debt_paid: '💸 دين مدفوع', returned: '↩️ مرتجع'
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

// ---------- إرسال رمز التحقق عبر EmailJS ----------
async function sendEmailCode(email, code) {
    try {
        if (typeof emailjs !== 'undefined') {
            await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
                to_email: email,
                passcode: code,
                time: new Date(Date.now() + 15 * 60 * 1000).toLocaleTimeString('ar-SY')
            });
        } else {
            console.log('EmailJS غير محمل. رمز التحقق:', code);
        }
    } catch (error) {
        console.error('فشل إرسال البريد:', error);
    }
}

// ---------- تخزين مؤقت للرموز ----------
const pendingCodes = {};

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
  }

// ---------- حالة الاتصال (Presence) ----------
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
        addBtn('activate-vip', 'fa-star', '⭐ تفعيل VIP');
    }
    
    addBtn('dashboard', 'fa-chart-pie', '🏠 الرئيسية');
    addBtn('reports', 'fa-file-invoice', '📊 التقارير');
    addBtn('debts', 'fa-hand-holding-usd', '📝 الديون');
    addBtn('transactions', 'fa-exchange-alt', '💱 العمليات');
    
    if (isAdmin || isMod || isSuperMod) {
        addBtn('users', 'fa-users', '👥 إدارة المستخدمين');
    }
    
    addBtn('settings', 'fa-cog', '⚙️ الإعدادات');
    addBtn('privacy', 'fa-shield-alt', '📜 سياسة الخصوصية');
    
    if (isAdmin || isMod || isSuperMod) {
        addBtn('chat', 'fa-comments', '💭 مشاكل المستخدمين');
    } else {
        addBtn('chat', 'fa-headset', '🎧 خدمة العملاء');
    }
    
    // زر أكتب شريط (لـ VIP والمشرفين والمدير)
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
    
    let roleText = '👤 مستخدم';
    if (isAdmin) roleText = '👑 مدير';
    else if (isSuperMod) roleText = '🛡️ مشرف مميز';
    else if (isMod) roleText = '🛡️ مشرف';
    else if (vipLevel > 0) roleText = `⭐ VIP ${vipLevel}`;
    $('#sidebar-role').textContent = roleText;
    
    const avatarContainer = $('#sidebar-avatar-container');
    avatarContainer.style.border = '3px solid var(--gold)';
    if (vipLevel === 3) avatarContainer.style.boxShadow = '0 0 20px rgba(212,175,55,0.8)';
    else if (vipLevel === 2) avatarContainer.style.boxShadow = '0 0 15px rgba(212,175,55,0.5)';
    else if (vipLevel === 1) avatarContainer.style.boxShadow = '0 0 8px rgba(212,175,55,0.3)';
    
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
            
            // التحقق من VIP منتهي الصلاحية
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

        // أول مستخدم = Admin
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const isFirstUser = usersSnapshot.empty;
        const serialId = isFirstUser ? '11110' : generateSerialId();

        const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=D4AF37&color=111&size=200&bold=true&format=svg`;

        // حفظ بيانات المستخدم
        await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid,
            name, email, serialId,
            role: isFirstUser ? 'admin' : 'user',
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
        
        // إرسال رمز تأكيد البريد
        const code = generateCode();
        pendingCodes[email] = { code, expires: Date.now() + 10 * 60 * 1000 };
        await sendEmailCode(email, code);
        
        hideLoading();
        showToast('✅ تم إنشاء الحساب. تم إرسال رمز تأكيد إلى بريدك', 'success');
        showVerifyEmailScreen();
        
    } catch (error) {
        hideLoading();
        let msg = 'حدث خطأ في إنشاء الحساب';
        if (error.code === 'auth/email-already-in-use') msg = 'البريد الإلكتروني مستخدم مسبقاً';
        if (error.code === 'auth/invalid-email') msg = 'صيغة البريد غير صحيحة';
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
        showToast('✅ تم تأكيد البريد بنجاح', 'success');
        $('#verify-email-screen').classList.add('hidden');
        showOnboarding();
    } catch (error) {
        showToast('❌ فشل في تحديث الحالة', 'error');
    }
}

// ---------- إعادة إرسال رمز التأكيد ----------
async function resendVerificationCode() {
    if (!currentUser) return;
    const email = currentUser.email;
    const code = generateCode();
    pendingCodes[email] = { code, expires: Date.now() + 10 * 60 * 1000 };
    await sendEmailCode(email, code);
    showToast('✅ تم إعادة إرسال الرمز', 'success');
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
        showToast('✅ تم تسجيل الدخول بنجاح', 'success');
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
        // التحقق من وجود المستخدم
        const usersSnapshot = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
        if (usersSnapshot.empty) return showToast('البريد غير مسجل', 'error');
        
        const code = generateCode();
        pendingCodes[email] = { code, expires: Date.now() + 10 * 60 * 1000, type: 'reset' };
        await sendEmailCode(email, code);
        showToast('✅ تم إرسال رمز التحقق إلى بريدك', 'success');
        $('#forgot-password-modal').classList.add('hidden');
        
        // إظهار مودال إعادة التعيين
        $('#reset-password-modal').classList.remove('hidden');
        $('#reset-password-modal').dataset.email = email;
    } catch (error) {
        showToast('❌ فشل في إرسال الرمز', 'error');
    }
}

// ---------- إعادة تعيين كلمة المرور (بعد التحقق من الرمز) ----------
async function handleResetPassword() {
    const email = $('#reset-password-modal').dataset.email;
    const enteredCode = $('#reset-code-input').value.trim();
    const newPass = $('#reset-new-password').value;
    const confirmPass = $('#reset-confirm-password').value;
    
    if (!enteredCode) return showToast('أدخل رمز التحقق', 'error');
    if (!newPass || !confirmPass) return showToast('أدخل كلمة المرور الجديدة', 'error');
    if (newPass !== confirmPass) return showToast('كلمتا المرور غير متطابقتين', 'error');
    if (!validatePassword(newPass)) return showToast('كلمة المرور ضعيفة', 'error');
    
    const pending = pendingCodes[email];
    if (!pending || pending.type !== 'reset' || Date.now() > pending.expires) {
        return showToast('انتهت صلاحية الرمز أو غير صحيح', 'error');
    }
    if (pending.code !== enteredCode) {
        return showToast('الرمز غير صحيح', 'error');
    }
    
    // الرمز صحيح
    delete pendingCodes[email];
    
    // إنشاء كلمة مرور مؤقتة وإرسالها
    const tempPass = 'Hainon' + Math.random().toString(36).slice(-6) + '!';
    
    try {
        await sendEmailCode(email, `كلمة المرور المؤقتة: ${tempPass}\nاستخدمها لتسجيل الدخول ثم قم بتغيير كلمة مرورك فوراً.`);
        
        showToast('✅ تم التحقق. تم إرسال كلمة مرور مؤقتة إلى بريدك. استخدمها لتسجيل الدخول ثم غير كلمة مرورك.', 'success');
        $('#reset-password-modal').classList.add('hidden');
        
    } catch (error) {
        showToast('❌ فشل في إرسال كلمة المرور المؤقتة', 'error');
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
        showToast('✅ تم إكمال الإعداد بنجاح', 'success');
    } catch (error) {
        showToast('❌ حدث خطأ في حفظ البيانات', 'error');
    }
      }// =============================================
// الصفحة الرئيسية - Dashboard
// =============================================

function loadDashboardPage() {
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
        const usdPL = calculateProfitLoss(allTx, 'USD');
        const sypPL = calculateProfitLoss(allTx, 'SYP');
        
        const stats = [
            { icon: '📥', label: 'وارد', valueUSD: 0, valueSYP: 0, type: 'incoming' },
            { icon: '📤', label: 'صادر', valueUSD: 0, valueSYP: 0, type: 'outgoing' },
            { icon: '💰', label: 'بيع', valueUSD: 0, valueSYP: 0, type: 'sale' },
            { icon: '🛒', label: 'شراء', valueUSD: 0, valueSYP: 0, type: 'purchase' },
            { icon: '🟢', label: 'دين لنا', valueUSD: 0, valueSYP: 0, type: 'debt_in' },
            { icon: '🔴', label: 'دين علينا', valueUSD: 0, valueSYP: 0, type: 'debt_out' },
            { icon: '✅', label: 'دين مقبوض', valueUSD: 0, valueSYP: 0, type: 'debt_received' },
            { icon: '💸', label: 'دين مدفوع', valueUSD: 0, valueSYP: 0, type: 'debt_paid' },
            { icon: '↩️', label: 'مرتجع', valueUSD: 0, valueSYP: 0, type: 'returned' }
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
        
        const vipClass = vipLevel > 0 ? ' vip-card vip-glow' : '';
        
        section.innerHTML = `
            <div class="stats-grid">
                ${stats.map(s => `
                    <div class="stat-card stat-net ${s.type === 'returned' ? 'stat-loss' : 'stat-profit'}${vipClass}" data-type="${s.type}">
                        <div class="stat-icon">${s.icon}</div>
                        <div class="stat-value">
                            <div>${formatCurrency(s.valueUSD)}</div>
                            <div><small>${formatCurrency(s.valueSYP, 'SYP')}</small></div>
                        </div>
                        <div class="stat-label">${s.label}</div>
                    </div>
                `).join('')}
                <div class="stat-card stat-net no-click${vipClass}">
                    <div class="stat-icon">🏦</div>
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
                    <span>➕ إضافة عملية جديدة</span>
                    <i class="fas fa-chevron-down" style="display:none;"></i>
                </div>
                <div class="accordion-body" style="max-height:800px;">
                    <div class="accordion-inner">
                        <form id="transaction-form">
                            <div class="form-row">
                                <input type="text" id="trans-product" placeholder="اسم العملية (المنتج)" required>
                                <input type="number" id="trans-quantity" placeholder="الكمية" min="1" value="1" style="display:none;">
                            </div>
                            <div class="form-row">
                                <input type="number" id="trans-amount" placeholder="إدخال القيمة" step="0.01" required>
                                <select id="trans-currency">
                                    <option value="USD">💵 USD</option>
                                    <option value="SYP">💷 SYP</option>
                                </select>
                            </div>
                            <div class="form-row">
                                <select id="trans-type" required>
                                    <option value="">-- نوع العملية --</option>
                                    <option value="incoming">📥 وارد</option>
                                    <option value="outgoing">📤 صادر</option>
                                    <option value="sale">💰 بيع</option>
                                    <option value="purchase">🛒 شراء</option>
                                    <option value="debt_in">🟢 دين لنا</option>
                                    <option value="debt_out">🔴 دين علينا</option>
                                    <option value="debt_received">✅ دين مقبوض</option>
                                    <option value="debt_paid">💸 دين مدفوع</option>
                                    <option value="returned">↩️ مرتجع</option>
                                </select>
                            </div>
                            <button type="submit" class="btn-primary" style="width:100%;">💾 تأكيد العملية</button>
                        </form>
                    </div>
                </div>
            </div>
            
            <!-- جدول عمليات اليوم -->
            <h3 style="margin:16px 0 8px;">📋 عمليات اليوم</h3>
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
                            ${hasHistory ? `<button class="arrow-btn" data-dir="prev" data-id="${t.id}">→</button>` : ''}
                            <span>${formatCurrency(t.amount, t.currency)}</span>
                            ${hasHistory ? `<button class="arrow-btn" data-dir="next" data-id="${t.id}">←</button>` : ''}
                        </div>
                    </td>
                    <td>${t.currency}</td>
                    <td>${t.createdAt ? new Date(t.createdAt.toDate()).toLocaleDateString('ar-SY') : '---'}</td>
                    <td>${t.createdAt ? new Date(t.createdAt.toDate()).toLocaleTimeString('ar-SY', {hour:'2-digit', minute:'2-digit'}) : '---'}</td>
                    <td><button class="btn-outline btn-sm edit-trans-btn" data-id="${t.id}">✏️</button></td>
                    <td><button class="btn-outline btn-sm delete-trans-btn" data-id="${t.id}" style="color:var(--red);border-color:var(--red);">🗑️</button></td>
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
        
        // إعداد نموذج العملية
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
        const needsPricePerUnit = ['sale', 'purchase', 'returned'].includes(type);
        
        qtyInput.style.display = needsQty ? 'block' : 'none';
        amountInput.placeholder = needsPricePerUnit ? 'سعر القطعة الواحدة' : 'إدخال القيمة';
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
    
    // التحقق من الكمية في حالة البيع
    if (type === 'sale') {
        const available = await getAvailableQuantity(productName, currency);
        if (quantity > available) {
            return showToast(`❌ الكمية غير متاحة. المتاح: ${available}`, 'error');
        }
    }
    
    try {
        await addDoc(collection(db, 'transactions'), {
            uid: currentUser.uid,
            productName,
            type,
            amount,
            currency,
            quantity: ['sale', 'purchase', 'returned'].includes(type) ? quantity : 1,
            note: '',
            createdAt: serverTimestamp(),
            updatedAt: null,
            history: []
        });
        
        showToast('✅ تمت العملية بنجاح', 'success');
        $('#transaction-form').reset();
        $('#trans-quantity').style.display = 'none';
        $('#trans-amount').placeholder = 'إدخال القيمة';
    } catch (error) {
        showToast('❌ فشل في إضافة العملية', 'error');
    }
}

// ---------- حساب الكمية المتاحة لمنتج ----------
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
    
    const historyEntry = {
        amount: t.amount,
        type: t.type,
        updatedAt: t.updatedAt || t.createdAt
    };
    const history = t.history || [];
    history.push(historyEntry);
    
    try {
        await updateDoc(docRef, {
            amount: parseFloat(newAmount),
            type: finalType,
            updatedAt: serverTimestamp(),
            history
        });
        showToast('✅ تم تعديل العملية', 'success');
    } catch (error) {
        showToast('❌ فشل في التعديل', 'error');
    }
}

// ---------- حذف عملية ----------
async function deleteTransaction(transId) {
    const confirmed = await showConfirm('حذف هذه العملية؟');
    if (!confirmed) return;
    
    try {
        await deleteDoc(doc(db, 'transactions', transId));
        showToast('🗑️ تم الحذف', 'success');
    } catch (error) {
        showToast('❌ فشل في الحذف', 'error');
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

// ---------- تصفية حسب النوع ----------
function filterTransactionsByType(type) {
    sessionStorage.setItem('filterType', type);
}

// ---------- تحديث عنوان الشريط العلوي ----------
function updateTopbarTitle(page) {
    const titles = {
        dashboard: 'نظام الإدارة المالية',
        transactions: 'العمليات المؤرشفة',
        debts: 'الديون',
        reports: 'التقارير المالية',
        friendships: 'تكوين صداقات',
        groups: 'المجموعات',
        chat: isAdmin || isMod || isSuperMod ? 'مشاكل المستخدمين' : 'خدمة العملاء',
        users: 'إدارة المستخدمين',
        settings: 'الإعدادات',
        privacy: 'سياسة الخصوصية',
        profile: 'الملف الشخصي',
        'activate-vip': 'تفعيل VIP'
    };
    $('#topbar-subtitle').textContent = titles[page] || '';
               }// =============================================
// نظام الأرشفة التلقائية
// =============================================

async function archiveDailyTransactions() {
    if (!currentUser) return;
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    
    // جلب عمليات الأمس غير المؤرشفة
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
    
    // إنشاء مجلد أرشيف
    const archiveName = `${getDayName(yesterdayStart)} ${formatDate(yesterdayStart)}`;
    
    await addDoc(collection(db, 'archives'), {
        uid: currentUser.uid,
        name: archiveName,
        date: yesterdayStart,
        type: 'daily',
        transactions: txData,
        createdAt: serverTimestamp()
    });
    
    // حذف العمليات الأصلية بعد الأرشفة
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
        <h2>💱 العمليات المؤرشفة</h2>
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
                    <span style="font-size:24px;">📁</span>
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
            <button class="btn-outline btn-sm" id="back-to-archives">← عودة</button>
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
                                <td><button class="btn-outline btn-sm edit-archive-btn" data-archive="${archiveId}" data-txid="${t.id}">✏️</button></td>
                                <td><button class="btn-outline btn-sm delete-archive-btn" data-archive="${archiveId}" data-txid="${t.id}" style="color:var(--red);border-color:var(--red);">🗑️</button></td>
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
        <h2>📝 الديون</h2>
        <div id="debts-archives-list"></div>
        <div id="debts-detail" class="hidden"></div>
    `;
    
    const list = $('#debts-archives-list');
    
    // مجلد "كل الديون" الدائم
    const allDebtsDiv = document.createElement('div');
    allDebtsDiv.className = 'stat-card';
    allDebtsDiv.style.cssText = 'cursor:pointer;margin-bottom:8px;border-color:var(--gold);';
    allDebtsDiv.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;">
            <span style="font-size:24px;">📂</span>
            <div>
                <div style="font-weight:700;">كل الديون</div>
                <div style="font-size:11px;color:var(--text-muted);">جميع سجلات الديون</div>
            </div>
        </div>
    `;
    allDebtsDiv.addEventListener('click', () => showAllDebts());
    list.appendChild(allDebtsDiv);
    
    // المجلدات المؤرشفة
    const q = query(
        collection(db, 'archives'),
        where('uid', '==', currentUser.uid),
        orderBy('date', 'desc')
    );
    
    onSnapshot(q, (snapshot) => {
        // إزالة المجلدات القديمة (عدا كل الديون)
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
                    <span style="font-size:24px;">📁</span>
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
            <button class="btn-outline btn-sm" id="back-to-debts">← عودة</button>
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
            { title: '🟢 دين لنا', type: 'debt_in' },
            { title: '🔴 دين علينا', type: 'debt_out' },
            { title: '✅ دين مقبوض', type: 'debt_received' },
            { title: '💸 دين مدفوع', type: 'debt_paid' }
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
            <button class="btn-outline btn-sm" id="back-to-debts-list">← عودة</button>
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
        <h2>📊 التقارير المالية</h2>
        
        <!-- حقول التاريخ -->
        <div class="form-row">
            <div class="input-group">
                <label>📅 من تاريخ</label>
                <input type="date" id="report-from-date">
            </div>
            <div class="input-group">
                <label>📅 إلى تاريخ</label>
                <input type="date" id="report-to-date">
            </div>
        </div>
        
        <!-- منسدلة نوع العملية -->
        <div class="form-row">
            <div class="input-group">
                <label>نوع العملية</label>
                <select id="report-type-select">
                    <option value="all">كل العمليات</option>
                    <option value="incoming">📥 وارد</option>
                    <option value="outgoing">📤 صادر</option>
                    <option value="sale">💰 بيع</option>
                    <option value="purchase">🛒 شراء</option>
                    <option value="debt_in">🟢 دين لنا</option>
                    <option value="debt_out">🔴 دين علينا</option>
                    <option value="debt_received">✅ دين مقبوض</option>
                    <option value="debt_paid">💸 دين مدفوع</option>
                    <option value="returned">↩️ مرتجع</option>
                </select>
            </div>
        </div>
        
        <!-- مربعات التفعيل (عند اختيار "كل العمليات") -->
        <div id="report-type-toggles" class="form-row" style="display:none; flex-wrap:wrap; gap:8px;">
            ${[
                {type:'incoming',label:'وارد'},{type:'outgoing',label:'صادر'},{type:'sale',label:'بيع'},
                {type:'purchase',label:'شراء'},{type:'debt_in',label:'دين لنا'},{type:'debt_out',label:'دين علينا'},
                {type:'debt_received',label:'دين مقبوض'},{type:'debt_paid',label:'دين مدفوع'},{type:'returned',label:'مرتجع'}
            ].map(t => `
                <div class="toggle-chip" data-type="${t.type}" style="display:flex;align-items:center;gap:4px;padding:6px 10px;border-radius:20px;border:1px solid var(--border);cursor:pointer;background:var(--bg-tertiary);">
                    <span class="toggle-chip-icon">✅</span>
                    <span style="font-size:12px;">${t.label}</span>
                </div>
            `).join('')}
        </div>
        
        <!-- أزرار -->
        <div style="display:flex;gap:10px;margin:16px 0;">
            <button id="generate-report-btn" class="btn-primary">📄 إنشاء التقرير</button>
            <button id="export-report-btn" class="gold-btn-outline" style="display:none;">📤 تصدير PDF</button>
            ${(vipLevel >= 3 || isAdmin || isSuperMod) ? `<button id="watermark-toggle-btn" class="btn-outline">🖼️ إعدادات العلامة المائية</button>` : ''}
        </div>
        
        <!-- منطقة عرض التقرير -->
        <div id="report-output" class="hidden" style="margin-top:20px;"></div>
    `;
    
    // إعداد حدود التاريخ
    setupReportDates();
    
    // حدث تغيير نوع العملية
    $('#report-type-select').addEventListener('change', function() {
        const toggles = $('#report-type-toggles');
        if (this.value === 'all') {
            toggles.style.display = 'flex';
        } else {
            toggles.style.display = 'none';
        }
    });
    
    // أحداث مربعات التفعيل
    section.querySelectorAll('.toggle-chip').forEach(chip => {
        chip.addEventListener('click', function() {
            const icon = this.querySelector('.toggle-chip-icon');
            if (icon.textContent === '✅') {
                icon.textContent = '⬜';
                icon.style.opacity = '0.4';
            } else {
                icon.textContent = '✅';
                icon.style.opacity = '1';
            }
        });
    });
    
    // إنشاء التقرير
    $('#generate-report-btn').addEventListener('click', () => generateReport());
    
    // تصدير PDF
    $('#export-report-btn').addEventListener('click', () => {
        showToast('سيتم تفعيل التصدير قريباً', 'info');
    });
    
    // إعدادات العلامة المائية
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
        const lastTx = snapshot.docs[snapshot.docs.length - 1].data();
        
        const fromInput = $('#report-from-date');
        const toInput = $('#report-to-date');
        
        if (fromInput && firstTx?.createdAt) {
            fromInput.min = new Date(firstTx.createdAt.toDate()).toISOString().split('T')[0];
        }
        if (toInput && lastTx?.createdAt) {
            const today = new Date().toISOString().split('T')[0];
            toInput.max = today;
            toInput.value = today;
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
            const icon = chip.querySelector('.toggle-chip-icon');
            if (icon.textContent === '✅') {
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
        
        // بناء الترويسة حسب VIP
        if (vipLevel >= 3 || isAdmin || isSuperMod) {
            if (!noWatermark) {
                header += `<div style="text-align:center;opacity:0.08;font-size:60px;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:0;">HAINON</div>`;
            }
            if (!noWatermark) {
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
        
        // صورة المستخدم (إذا لم تكن VIP3 وأزالها)
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
                                                    }// =============================================
// صفحة الدردشة الاجتماعية (تكوين صداقات)
// =============================================

function loadFriendshipsPage() {
    const section = $('#page-friendships');
    
    section.innerHTML = `
        <h2>👥 تكوين صداقات</h2>
        
        <!-- شريط بحث -->
        <div class="form-full" style="margin-bottom:16px;">
            <input type="text" id="friend-search" placeholder="🔍 بحث عن مستخدم (بالاسم أو ID)...">
        </div>
        
        <!-- قائمة المستخدمين -->
        <div id="friends-list" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:12px;">
            <p style="color:var(--text-muted);text-align:center;grid-column:1/-1;">⏳ جاري تحميل المستخدمين...</p>
        </div>
        
        <!-- قائمة الأصدقاء -->
        <h3 style="margin:20px 0 12px;">👥 أصدقائي (<span id="friends-count">0</span>/${getMaxFriends()})</h3>
        <div id="my-friends-list" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:8px;">
            <p style="color:var(--text-muted);text-align:center;grid-column:1/-1;">⏳ جاري التحميل...</p>
        </div>
    `;
    
    loadAllUsers();
    loadMyFriends();
    setupFriendSearch();
}

function getMaxFriends() {
    if (vipLevel === 3) return 300;
    if (vipLevel === 2) return 100;
    if (vipLevel === 1) return 50;
    return 5;
}

async function loadAllUsers(filterText = '') {
    const list = $('#friends-list');
    
    const snapshot = await getDocs(collection(db, 'users'));
    const users = [];
    snapshot.forEach(doc => {
        const u = doc.data();
        if (u.uid !== currentUser.uid) users.push(u);
    });
    
    let filtered = users;
    if (filterText) {
        const ft = filterText.toLowerCase();
        filtered = users.filter(u => 
            u.name?.toLowerCase().includes(ft) || 
            u.serialId?.includes(ft)
        );
    }
    
    if (filtered.length === 0) {
        list.innerHTML = '<p style="color:var(--text-muted);text-align:center;grid-column:1/-1;">لا يوجد مستخدمين</p>';
        return;
    }
    
    list.innerHTML = '';
    filtered.forEach(u => {
        const isOnline = onlineUsers[u.uid]?.status === 'online';
        const card = document.createElement('div');
        card.className = 'stat-card';
        card.style.cssText = 'cursor:pointer;';
        card.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;">
                <img src="${u.avatar || 'https://ui-avatars.com/api/?name='+encodeURIComponent(u.name||'?')+'&background=D4AF37&color=111&size=60'}" 
                     style="width:45px;height:45px;border-radius:50%;border:2px solid var(--gold);object-fit:cover;cursor:pointer;"
                     data-uid="${u.uid}" class="view-profile-img">
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;font-size:14px;">${u.name || '---'}</div>
                    <div style="font-size:11px;color:var(--text-muted);">ID: ${u.serialId || '---'}</div>
                    <div style="font-size:10px;">${isOnline ? '🟢 متصل' : '🔴 غير متصل'}</div>
                </div>
            </div>
            <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
                <button class="btn-outline btn-sm send-friend-btn" data-uid="${u.uid}" data-name="${u.name}">👥 إضافة صديق</button>
                <button class="btn-outline btn-sm view-profile-btn" data-uid="${u.uid}" style="font-size:11px;">👤 ملف</button>
                <button class="btn-outline btn-sm report-user-btn" data-uid="${u.uid}" style="font-size:11px;color:var(--red);border-color:var(--red);">⚠️ بلاغ</button>
            </div>
        `;
        list.appendChild(card);
    });
    
    // أحداث الصور والملفات الشخصية
    list.querySelectorAll('.view-profile-img, .view-profile-btn').forEach(btn => {
        btn.addEventListener('click', () => viewPublicProfile(btn.dataset.uid));
    });
    
    // أحداث إضافة صديق
    list.querySelectorAll('.send-friend-btn').forEach(btn => {
        btn.addEventListener('click', () => sendFriendRequest(btn.dataset.uid, btn.dataset.name));
    });
    
    // أحداث البلاغ
    list.querySelectorAll('.report-user-btn').forEach(btn => {
        btn.addEventListener('click', () => openReportModal(btn.dataset.uid));
    });
}

function setupFriendSearch() {
    const input = $('#friend-search');
    if (!input) return;
    input.addEventListener('input', () => {
        loadAllUsers(input.value.trim());
    });
}

// ---------- نظام الصداقة ----------
async function sendFriendRequest(targetUid, targetName) {
    try {
        const myFriends = await getMyFriends();
        if (myFriends.length >= getMaxFriends()) {
            return showToast(`❌ وصلت للحد الأقصى (${getMaxFriends()} صديق)`, 'error');
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
            status: 'pending',
            createdAt: serverTimestamp()
        });
        
        showToast('✅ تم إرسال طلب الصداقة', 'success');
    } catch (error) {
        showToast('❌ فشل في إرسال الطلب', 'error');
    }
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

async function loadMyFriends() {
    const list = $('#my-friends-list');
    const countEl = $('#friends-count');
    
    const friendUids = await getMyFriends();
    if (countEl) countEl.textContent = friendUids.length;
    
    if (friendUids.length === 0) {
        list.innerHTML = '<p style="color:var(--text-muted);text-align:center;grid-column:1/-1;">لا يوجد أصدقاء بعد</p>';
        return;
    }
    
    list.innerHTML = '';
    for (const uid of friendUids) {
        const snap = await getDoc(doc(db, 'users', uid));
        if (!snap.exists()) continue;
        const u = snap.data();
        const isOnline = onlineUsers[u.uid]?.status === 'online';
        
        const card = document.createElement('div');
        card.className = 'stat-card';
        card.style.cssText = 'cursor:pointer;padding:10px;';
        card.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;">
                <img src="${u.avatar || 'https://ui-avatars.com/api/?name='+encodeURIComponent(u.name||'?')+'&background=D4AF37&color=111&size=40'}" 
                     style="width:35px;height:35px;border-radius:50%;border:2px solid var(--gold);object-fit:cover;">
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;font-size:13px;">${u.name}</div>
                    <div style="font-size:10px;color:var(--text-muted);">${isOnline ? '🟢 متصل' : '🔴 غير متصل'}</div>
                </div>
                <div style="display:flex;gap:4px;">
                    <button class="btn-outline btn-sm chat-friend-btn" data-uid="${u.uid}" title="مراسلة">💬</button>
                    <button class="btn-outline btn-sm remove-friend-btn" data-uid="${u.uid}" data-name="${u.name}" title="إلغاء الصداقة" style="color:var(--red);border-color:var(--red);">✕</button>
                </div>
            </div>
        `;
        list.appendChild(card);
        
        card.querySelector('.view-profile-img, .view-profile-btn')?.addEventListener('click', () => viewPublicProfile(u.uid));
        card.querySelector('.chat-friend-btn')?.addEventListener('click', () => startFriendChat(u.uid, u.name));
        card.querySelector('.remove-friend-btn')?.addEventListener('click', () => removeFriend(u.uid, u.name));
    }
}

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
    loadMyFriends();
}

// ---------- مراسلة صديق ----------
function startFriendChat(uid, name) {
    selectedChatUser = uid;
    const section = $('#page-friendships');
    
    section.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <button class="btn-outline btn-sm" id="back-to-friends">← عودة</button>
            <h3 style="margin:0;">💬 ${name}</h3>
        </div>
        <div class="chat-container" style="height:calc(100vh - 300px);">
            <div class="chat-messages" id="private-chat-messages">
                <p style="text-align:center;color:var(--text-muted);">⏳ جاري تحميل المحادثة...</p>
            </div>
            <div class="chat-input-area">
                <input type="text" id="private-chat-input" placeholder="✍️ اكتب رسالتك...">
                <button id="private-chat-send"><i class="fas fa-paper-plane"></i></button>
            </div>
        </div>
    `;
    
    $('#back-to-friends').addEventListener('click', () => loadFriendshipsPage());
    
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
            messagesDiv.innerHTML = '<p style="text-align:center;color:var(--text-muted);">💬 ابدأ المحادثة</p>';
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
            showToast('❌ فشل في الإرسال', 'error');
        }
    };
    
    $('#private-chat-send')?.addEventListener('click', send);
    $('#private-chat-input')?.addEventListener('keypress', e => { if (e.key === 'Enter') send(); });
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
    const userVipLevel = u.role?.startsWith('vip') ? parseInt(u.role.replace('vip','')) || 0 : 0;
    
    section.innerHTML = `
        <div class="profile-page">
            <div class="profile-cover ${userVipLevel > 0 && u.coverPhoto ? '' : 'default-cover'}">
                ${userVipLevel > 0 && u.coverPhoto ? `<img src="${u.coverPhoto}" alt="غلاف">` : ''}
                <div class="profile-avatar-large">
                    <img src="${u.avatar || 'https://ui-avatars.com/api/?name='+encodeURIComponent(u.name||'?')+'&background=D4AF37&color=111&size=200'}" alt="${u.name}">
                </div>
            </div>
            <div class="profile-info">
                <div class="profile-name">${u.name || '---'}</div>
                <div class="profile-id ${userVipLevel > 0 ? 'vip-id-vip'+userVipLevel : ''}">ID: ${u.serialId || '---'}</div>
                <div class="profile-bio">${u.bio || ''}</div>
                <div class="profile-status">${isOnline ? '🟢 متصل الآن' : '🔴 غير متصل'} ${u.lastSeen && u.privacy?.showLastSeen ? '· آخر ظهور: ' + new Date(u.lastSeen.toDate()).toLocaleString('ar-SY') : ''}</div>
                <div class="profile-actions">
                    ${!isFriend ? `<button class="btn-primary btn-sm send-friend-btn" data-uid="${uid}" data-name="${u.name}">👥 إضافة صديق</button>` :
                      `<button class="btn-outline btn-sm remove-friend-btn" data-uid="${uid}" data-name="${u.name}">❌ إلغاء الصداقة</button>`}
                    <button class="btn-outline btn-sm report-user-btn" data-uid="${uid}" style="color:var(--red);border-color:var(--red);">⚠️ بلاغ</button>
                    <button class="btn-outline btn-sm block-user-btn" data-uid="${uid}" data-name="${u.name}">🚫 حظر</button>
                </div>
            </div>
        </div>
    `;
    
    section.querySelector('.send-friend-btn')?.addEventListener('click', function() {
        sendFriendRequest(this.dataset.uid, this.dataset.name);
    });
    section.querySelector('.remove-friend-btn')?.addEventListener('click', function() {
        removeFriend(this.dataset.uid, this.dataset.name);
    });
    section.querySelector('.report-user-btn')?.addEventListener('click', function() {
        openReportModal(this.dataset.uid);
    });
    section.querySelector('.block-user-btn')?.addEventListener('click', function() {
        blockUser(this.dataset.uid);
    });
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
        showToast('✅ تم إرسال البلاغ', 'success');
        $('#report-modal').classList.add('hidden');
        $('#report-reason').value = '';
    } catch (e) {
        showToast('❌ فشل في إرسال البلاغ', 'error');
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
        showToast('🚫 تم حظر المستخدم', 'info');
    } catch (e) {
        showToast('❌ فشل في الحظر', 'error');
    }
}

async function removeFriendSilent(uid) {
    const q1 = query(collection(db, 'friendships'), where('user1', '==', currentUser.uid), where('user2', '==', uid));
    const q2 = query(collection(db, 'friendships'), where('user1', '==', uid), where('user2', '==', currentUser.uid));
    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
    for (const doc of [...snap1.docs, ...snap2.docs]) {
        await deleteDoc(doc.ref);
    }
}

// =============================================
// صفحة المجموعات
// =============================================

function loadGroupsPage() {
    const section = $('#page-groups');
    
    section.innerHTML = `
        <h2>💬 المجموعات</h2>
        <button id="create-group-btn" class="btn-primary" style="margin-bottom:16px;">➕ إنشاء مجموعة</button>
        <div id="groups-list" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap:10px;">
            <p style="color:var(--text-muted);text-align:center;grid-column:1/-1;">⏳ جاري التحميل...</p>
        </div>
        <div id="group-chat-area" class="hidden"></div>
    `;
    
    $('#create-group-btn').addEventListener('click', () => {
        $('#group-modal-title').textContent = '👥 مجموعة جديدة';
        $('#group-name').value = '';
        $('#group-id').value = '';
        $('#group-action').value = 'create';
        $('#group-modal').classList.remove('hidden');
    });
    
    loadGroups();
}

async function loadGroups() {
    const list = $('#groups-list');
    
    const q = query(
        collection(db, 'groups'),
        where('members', 'array-contains', currentUser.uid)
    );
    
    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            list.innerHTML = '<p style="color:var(--text-muted);text-align:center;grid-column:1/-1;">لا توجد مجموعات</p>';
            return;
        }
        
        list.innerHTML = '';
        snapshot.forEach(doc => {
            const g = doc.data();
            const card = document.createElement('div');
            card.className = 'stat-card';
            card.style.cssText = 'cursor:pointer;';
            card.innerHTML = `
                <div style="font-weight:700;">💬 ${g.name}</div>
                <div style="font-size:11px;color:var(--text-muted);">${g.members?.length || 0} أعضاء</div>
                <div style="font-size:10px;color:var(--text-muted);">أنشأها: ${g.creatorName || '---'}</div>
                <button class="btn-outline btn-sm open-group-btn" data-id="${doc.id}" data-name="${g.name}" style="margin-top:6px;">فتح</button>
            `;
            list.appendChild(card);
        });
        
        list.querySelectorAll('.open-group-btn').forEach(btn => {
            btn.addEventListener('click', () => openGroupChat(btn.dataset.id, btn.dataset.name));
        });
    });
}

async function createGroup() {
    const name = $('#group-name').value.trim();
    if (!name) return showToast('أدخل اسم المجموعة', 'error');
    
    try {
        await addDoc(collection(db, 'groups'), {
            name,
            creator: currentUser.uid,
            creatorName: userData.name,
            members: [currentUser.uid],
            moderators: [currentUser.uid],
            createdAt: serverTimestamp()
        });
        showToast('✅ تم إنشاء المجموعة', 'success');
        $('#group-modal').classList.add('hidden');
    } catch (e) {
        showToast('❌ فشل في الإنشاء', 'error');
    }
}

function openGroupChat(groupId, groupName) {
    const section = $('#page-groups');
    const list = $('#groups-list');
    const chatArea = $('#group-chat-area');
    
    list.classList.add('hidden');
    chatArea.classList.remove('hidden');
    $('#create-group-btn').classList.add('hidden');
    
    chatArea.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <button class="btn-outline btn-sm" id="back-to-groups">← عودة</button>
            <h3 style="margin:0;">💬 ${groupName}</h3>
        </div>
        <div class="chat-container" style="height:calc(100vh - 300px);">
            <div class="chat-messages" id="group-chat-messages">
                <p style="text-align:center;color:var(--text-muted);">⏳ جاري التحميل...</p>
            </div>
            <div class="chat-input-area">
                <input type="text" id="group-chat-input" placeholder="✍️ اكتب رسالتك...">
                <button id="group-chat-send"><i class="fas fa-paper-plane"></i></button>
            </div>
        </div>
    `;
    
    $('#back-to-groups').addEventListener('click', () => {
        chatArea.classList.add('hidden');
        list.classList.remove('hidden');
        $('#create-group-btn').classList.remove('hidden');
    });
    
    const q = query(collection(db, 'groupMessages'), where('groupId', '==', groupId), orderBy('createdAt', 'asc'));
    
    onSnapshot(q, (snapshot) => {
        const messagesDiv = $('#group-chat-messages');
        if (!messagesDiv) return;
        messagesDiv.innerHTML = '';
        
        if (snapshot.empty) {
            messagesDiv.innerHTML = '<p style="text-align:center;color:var(--text-muted);">💬 لا توجد رسائل</p>';
        }
        
        let count = 0;
        snapshot.forEach(doc => {
            count++;
            const msg = doc.data();
            const isSent = msg.from === currentUser.uid;
            messagesDiv.innerHTML += `
                <div class="chat-msg ${isSent ? 'sent' : 'received'}">
                    <strong>${msg.fromName || 'مستخدم'}</strong>
                    <p>${escapeHtml(msg.text)}</p>
                    <small>${msg.createdAt ? new Date(msg.createdAt.toDate()).toLocaleTimeString('ar-SY', {hour:'2-digit', minute:'2-digit'}) : ''}</small>
                </div>
            `;
        });
        
        // حذف تلقائي إذا تجاوز 1000 رسالة
        if (count > 1000) {
            const oldestDocs = snapshot.docs.slice(0, count - 1000);
            oldestDocs.forEach(d => deleteDoc(d.ref));
        }
        
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
    
    const send = async () => {
        const text = $('#group-chat-input')?.value.trim();
        if (!text) return;
        try {
            await addDoc(collection(db, 'groupMessages'), {
                groupId,
                from: currentUser.uid,
                fromName: userData.name,
                text,
                createdAt: serverTimestamp()
            });
            if ($('#group-chat-input')) $('#group-chat-input').value = '';
        } catch (e) {
            showToast('❌ فشل في الإرسال', 'error');
        }
    };
    
    $('#group-chat-send')?.addEventListener('click', send);
    $('#group-chat-input')?.addEventListener('keypress', e => { if (e.key === 'Enter') send(); });
                  }// =============================================
// خدمة العملاء / مشاكل المستخدمين
// =============================================

function loadChatPage() {
    const section = $('#page-chat');
    
    if (isAdmin || isMod || isSuperMod) {
        // ---------- واجهة الأدمن والمشرفين: مشاكل المستخدمين ----------
        section.innerHTML = `
            <h2>💭 مشاكل المستخدمين</h2>
            <div style="display:flex;gap:8px;margin-bottom:16px;">
                <button id="chat-filter-support" class="btn-primary btn-sm">🎧 خدمة العملاء</button>
                <button id="chat-filter-reports" class="btn-outline btn-sm">⚠️ البلاغات</button>
            </div>
            <div class="chat-wrapper">
                <div class="chat-contacts" id="admin-chat-contacts">
                    <div class="chat-contacts-header">جهات الاتصال</div>
                    <div id="admin-contacts-list"></div>
                </div>
                <div class="chat-main" id="admin-chat-main">
                    <div class="chat-empty" id="admin-chat-empty">
                        <p>👈 اختر جهة اتصال من القائمة</p>
                    </div>
                    <div class="chat-messages hidden" id="admin-chat-messages"></div>
                    <div class="chat-input-area hidden" id="admin-chat-input-area">
                        <input type="text" id="admin-chat-input" placeholder="✍️ اكتب ردك...">
                        <button id="admin-chat-send"><i class="fas fa-paper-plane"></i></button>
                    </div>
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
        
    } else {
        // ---------- واجهة المستخدم: خدمة العملاء ----------
        section.innerHTML = `
            <h2>🎧 خدمة العملاء</h2>
            <div class="chat-container" style="height:calc(100vh - 280px);">
                <div class="chat-messages" id="support-chat-messages">
                    <div style="text-align:center;color:var(--text-muted);padding:20px;">
                        💬 أهلاً بك! كيف يمكننا مساعدتك؟
                    </div>
                </div>
                <div class="chat-input-area">
                    <input type="text" id="support-chat-input" placeholder="✍️ اكتب رسالتك...">
                    <button id="support-chat-send"><i class="fas fa-paper-plane"></i></button>
                </div>
            </div>
        `;
        
        loadSupportChat();
    }
}

// ---------- تحميل قائمة جهات الاتصال للأدمن ----------
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
                        lastTime: msg.createdAt
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
                        lastTime: report.createdAt,
                        reportId: doc.id
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
    
    usersMap.forEach((user, uid) => {
        const div = document.createElement('div');
        div.className = 'chat-contact-item';
        div.innerHTML = `
            <div class="chat-contact-avatar">
                <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=D4AF37&color=111&size=80&bold=true&format=svg">
            </div>
            <div class="chat-contact-info">
                <div class="chat-contact-name">${user.name}</div>
                <div class="chat-contact-last">${user.lastMessage?.substring(0, 30) || ''}...</div>
            </div>
            ${type === 'reports' ? '<span style="color:var(--red);">⚠️</span>' : ''}
        `;
        div.addEventListener('click', () => openAdminConversation(uid, user.name, type));
        list.appendChild(div);
    });
}

function openAdminConversation(uid, name, type) {
    selectedChatUser = uid;
    $('#admin-chat-empty').classList.add('hidden');
    $('#admin-chat-messages').classList.remove('hidden');
    $('#admin-chat-input-area').classList.remove('hidden');
    
    const messagesDiv = $('#admin-chat-messages');
    messagesDiv.innerHTML = '<div style="text-align:center;color:var(--text-muted);">⏳ جاري تحميل المحادثة...</div>';
    
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
                    <div class="chat-msg received">
                        <strong>${msg.fromName || 'مستخدم'}</strong>
                        <p>⚠️ بلاغ: ${escapeHtml(msg.reason)}</p>
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
            showToast('❌ فشل في الإرسال', 'error');
        }
    };
    
    $('#admin-chat-send').onclick = sendFunc;
    $('#admin-chat-input').onkeypress = (e) => { if (e.key === 'Enter') sendFunc(); };
}

// ---------- خدمة العملاء (للمستخدم) ----------
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
            messagesDiv.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;">💬 أهلاً بك! كيف يمكننا مساعدتك؟</div>';
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
        } catch (error) {
            showToast('❌ فشل في الإرسال', 'error');
        }
    };
    
    $('#support-chat-send')?.addEventListener('click', sendFunc);
    $('#support-chat-input')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendFunc(); });
}

// =============================================
// صفحة إدارة المستخدمين (للأدمن والمشرف)
// =============================================

async function loadUsersPage() {
    const section = $('#page-users');
    
    if (!isAdmin && !isMod && !isSuperMod) {
        section.innerHTML = '<h2>⛔ غير مصرح</h2>';
        return;
    }
    
    section.innerHTML = `
        <h2>👥 إدارة المستخدمين</h2>
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
                    <tr><td colspan="12" style="color:var(--text-muted);">⏳ جاري التحميل...</td></tr>
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
        
        let roleBadge = '👤 مستخدم';
        if (u.role === 'admin') roleBadge = '👑 مدير';
        else if (u.role === 'super_mod') roleBadge = '🛡️ مشرف مميز';
        else if (u.role === 'moderator') roleBadge = '🛡️ مشرف';
        else if (u.role?.startsWith('vip')) roleBadge = `⭐ VIP ${u.role.replace('vip','')}`;
        
        tbody.innerHTML += `
            <tr>
                <td><img src="${u.avatar || 'https://ui-avatars.com/api/?name='+encodeURIComponent(u.name||'?')}" style="width:30px;height:30px;border-radius:50%;border:2px solid var(--gold);cursor:pointer;" class="user-activity-img" data-uid="${u.uid}"></td>
                <td>${u.name || '---'}</td>
                <td>${u.serialId || '---'}</td>
                <td>${u.email || '---'}</td>
                <td>${roleBadge}</td>
                <td>${isOnline ? '🟢' : '🔴'}</td>
                <td>${lastSeen}</td>
                <td>${u.location?.country || '---'}</td>
                <td>${deviceInfo.browser || '---'} / ${deviceInfo.os || '---'}</td>
                <td style="font-size:10px;">${u.location?.ip || '---'}</td>
                <td>${u.createdAt ? new Date(u.createdAt.toDate()).toLocaleDateString('ar-SY') : '---'}</td>
                <td>
                    ${isAdmin ? `<button class="btn-outline btn-sm assign-vip-btn" data-uid="${u.uid}" data-role="${u.role}">⭐</button>` : ''}
                    ${isAdmin || isSuperMod ? `<button class="btn-outline btn-sm edit-id-btn" data-uid="${u.uid}" data-id="${u.serialId}">🆔</button>` : ''}
                    ${isAdmin || isSuperMod ? `<button class="btn-outline btn-sm remove-photo-btn" data-uid="${u.uid}">🖼️</button>` : ''}
                    <button class="btn-outline btn-sm block-user-admin-btn" data-uid="${u.uid}" data-blocked="${u.blocked || false}">🚫</button>
                    ${isAdmin ? `<button class="btn-outline btn-sm delete-user-btn" data-uid="${u.uid}" data-name="${u.name}" style="color:var(--red);border-color:var(--red);">🗑️</button>` : ''}
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

// ---------- مراقبة حركة المستخدم ----------
async function viewUserActivity(uid) {
    const panel = $('#user-activity-panel');
    panel.classList.remove('hidden');
    panel.innerHTML = '<p>⏳ جاري تحميل الحركة...</p>';
    
    const q = query(collection(db, 'transactions'), where('uid', '==', uid), orderBy('createdAt', 'desc'));
    onSnapshot(q, (snapshot) => {
        const txs = [];
        snapshot.forEach(d => txs.push(d.data()));
        panel.innerHTML = `
            <h4>📊 حركة المستخدم (${txs.length} عملية)</h4>
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

// ---------- تعيين VIP ----------
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
    }).then(() => {
        showToast('✅ تم تعيين VIP', 'success');
        loadUsersPage();
    });
}

// ---------- حفظ تعديل ID ----------
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
        showToast('✅ تم تحديث ID', 'success');
        $('#edit-id-modal').classList.add('hidden');
        loadUsersPage();
    } catch (e) {
        showToast('❌ فشل التحديث', 'error');
    }
}

// ---------- حظر مستخدم (من قبل الأدمن/المشرف) ----------
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
        showToast('🚫 تم حظر المستخدم', 'success');
        $('#block-modal').classList.add('hidden');
        loadUsersPage();
    } catch (e) {
        showToast('❌ فشل الحظر', 'error');
    }
      }// =============================================
// صفحة الإعدادات
// =============================================

function loadSettingsPage() {
    const section = $('#page-settings');
    
    const avatarUrl = userData?.avatar || 
        `https://ui-avatars.com/api/?name=${encodeURIComponent(userData?.name || 'مستخدم')}&background=D4AF37&color=111&size=200&bold=true&format=svg`;
    
    section.innerHTML = `
        <h2>⚙️ الإعدادات</h2>
        <div style="max-width:500px;margin:0 auto;">
            
            <!-- الصورة الشخصية -->
            <div style="text-align:center;margin-bottom:20px;">
                <div class="sidebar-avatar" style="margin:0 auto 10px;width:90px;height:90px;">
                    <img id="settings-avatar-img" src="${avatarUrl}" alt="الصورة">
                </div>
                <button id="change-avatar-btn" class="gold-btn-outline">📷 تغيير الصورة</button>
                <input type="file" id="settings-avatar-upload" accept="image/*" hidden>
            </div>
            
            <!-- الاسم -->
            <div class="input-group" style="margin-bottom:12px;">
                <label>الاسم الكامل</label>
                <input type="text" id="settings-name" value="${userData?.name || ''}">
            </div>
            
            <!-- البريد الإلكتروني -->
            <div class="input-group" style="margin-bottom:12px;">
                <label>البريد الإلكتروني</label>
                <input type="email" id="settings-email" value="${userData?.email || ''}" disabled>
                <button id="change-email-btn" class="text-btn" style="font-size:11px;">تغيير البريد</button>
            </div>
            
            <!-- السيرة الذاتية -->
            <div class="input-group" style="margin-bottom:12px;">
                <label>السيرة الذاتية (${(userData?.bio || '').length}/65)</label>
                <textarea id="settings-bio" maxlength="65" rows="2" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-tertiary);color:var(--text-primary);resize:none;">${userData?.bio || ''}</textarea>
            </div>
            
            <!-- صورة الغلاف (لـ VIP فقط) -->
            ${isVip ? `
            <div class="input-group" style="margin-bottom:12px;">
                <label>صورة الغلاف</label>
                <button id="change-cover-btn" class="btn-outline btn-sm">🖼️ تغيير الغلاف</button>
                <input type="file" id="settings-cover-upload" accept="image/*" hidden>
                ${userData?.coverPhoto ? '<img src="'+userData.coverPhoto+'" style="width:100%;height:80px;object-fit:cover;border-radius:8px;margin-top:6px;">' : '<div style="width:100%;height:80px;background:var(--bg-tertiary);border-radius:8px;margin-top:6px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);">لا يوجد غلاف</div>'}
            </div>` : `
            <div class="input-group" style="margin-bottom:12px;">
                <label>صورة الغلاف</label>
                <div style="width:100%;height:80px;background:var(--bg-tertiary);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);cursor:pointer;" id="vip-cover-lock">
                    🔒 VIP فقط
                </div>
            </div>`}
            
            <!-- ID -->
            <div class="input-group" style="margin-bottom:12px;">
                <label>الرقم التسلسلي ${isAdmin || isSuperMod ? '(قابل للتعديل)' : '(ثابت)'}</label>
                <input type="text" id="settings-id" value="${userData?.serialId || ''}" ${isAdmin || isSuperMod ? '' : 'disabled'}>
            </div>
            
            <!-- كلمة المرور -->
            <h3 style="margin:20px 0 12px;color:var(--gold);">🔒 تغيير كلمة المرور</h3>
            <div class="input-group" style="margin-bottom:10px;">
                <label>كلمة المرور الحالية</label>
                <input type="password" id="settings-current-pass" placeholder="كلمة المرور الحالية">
            </div>
            <div class="input-group" style="margin-bottom:10px;">
                <label>كلمة المرور الجديدة</label>
                <input type="password" id="settings-new-pass" placeholder="حرف إنجليزي + أرقام (6 خانات)">
            </div>
            
            <!-- إعدادات الخصوصية -->
            <h3 style="margin:20px 0 12px;color:var(--gold);">🔒 الخصوصية</h3>
            ${buildPrivacyToggles()}
            
            <!-- أزرار الحفظ -->
            <div style="display:flex;gap:10px;margin-top:20px;">
                <button id="save-profile-btn" class="btn-primary" style="flex:1;">💾 حفظ التعديلات</button>
                <button id="change-password-btn" class="btn-outline" style="flex:1;">🔒 تغيير كلمة المرور</button>
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
    // تغيير الصورة
    $('#change-avatar-btn')?.addEventListener('click', () => $('#settings-avatar-upload').click());
    $('#settings-avatar-upload')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            await updateDoc(doc(db, 'users', currentUser.uid), { avatar: ev.target.result });
            userData.avatar = ev.target.result;
            updateUI();
            showToast('✅ تم تحديث الصورة', 'success');
        };
        reader.readAsDataURL(file);
    });
    
    // تغيير الغلاف (VIP)
    $('#change-cover-btn')?.addEventListener('click', () => $('#settings-cover-upload').click());
    $('#settings-cover-upload')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            await updateDoc(doc(db, 'users', currentUser.uid), { coverPhoto: ev.target.result });
            userData.coverPhoto = ev.target.result;
            showToast('✅ تم تحديث الغلاف', 'success');
            loadSettingsPage();
        };
        reader.readAsDataURL(file);
    });
    
    // قفل VIP للغلاف
    $('#vip-cover-lock')?.addEventListener('click', () => showToast('⭐ ترقية إلى VIP لاستخدام هذه الميزة', 'info'));
    
    // تغيير البريد
    $('#change-email-btn')?.addEventListener('click', () => {
        $('#change-email-modal').classList.remove('hidden');
        $('#change-email-step-1').classList.remove('hidden');
        $('#change-email-step-2').classList.add('hidden');
        $('#change-email-step-3').classList.add('hidden');
        $('#change-email-step-4').classList.add('hidden');
    });
    
    // خطوات تغيير البريد
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
            showToast('✅ تم تغيير البريد', 'success');
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
            showToast('✅ تم تغيير البريد', 'success');
            $('#change-email-modal').classList.add('hidden');
        } catch (e) {
            showToast('❌ كلمة المرور غير صحيحة', 'error');
        }
    });
    
    $('#change-email-cancel')?.addEventListener('click', () => $('#change-email-modal').classList.add('hidden'));
    
    // حفظ التعديلات
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
        showToast('✅ تم حفظ التعديلات', 'success');
    });
    
    // تغيير كلمة المرور
    $('#change-password-btn')?.addEventListener('click', async () => {
        const cur = $('#settings-current-pass').value;
        const newP = $('#settings-new-pass').value;
        if (!cur || !newP) return showToast('أدخل كلمتي المرور', 'error');
        if (!validatePassword(newP)) return showToast('كلمة المرور ضعيفة', 'error');
        try {
            const cred = EmailAuthProvider.credential(currentUser.email, cur);
            await reauthenticateWithCredential(currentUser, cred);
            await updatePassword(currentUser, newP);
            showToast('✅ تم تغيير كلمة المرور', 'success');
        } catch (e) {
            showToast('❌ كلمة المرور الحالية خاطئة', 'error');
        }
    });
    
    // مفاتيح الخصوصية
    section.querySelectorAll('.toggle-switch[id^="privacy-"]').forEach(toggle => {
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

// =============================================
// سياسة الخصوصية
// =============================================

async function loadPrivacyPage() {
    const section = $('#page-privacy');
    section.innerHTML = '<h2>📜 سياسة الخصوصية</h2><div id="privacy-content">⏳ جاري التحميل...</div>';
    
    const snap = await getDoc(doc(db, 'settings', 'privacy'));
    let content = snap.exists() ? snap.data().text : 'لم يتم تعيين سياسة الخصوصية بعد.';
    
    $('#privacy-content').innerHTML = `
        <div style="white-space:pre-wrap;line-height:1.8;background:var(--bg-card);padding:20px;border-radius:var(--radius-md);border:1px solid var(--border);">
            ${escapeHtml(content)}
        </div>
        ${isAdmin ? '<button id="edit-privacy-btn" class="btn-outline btn-sm" style="margin-top:12px;">✏️ تعديل</button>' : ''}
    `;
    
    $('#edit-privacy-btn')?.addEventListener('click', () => {
        const newText = prompt('أدخل نص سياسة الخصوصية الجديد:', content);
        if (newText !== null) {
            setDoc(doc(db, 'settings', 'privacy'), { text: newText }).then(() => {
                showToast('✅ تم تحديث سياسة الخصوصية', 'success');
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
            return showToast('⭐ VIP فقط يمكنهم استخدام هذه الميزة', 'info');
        }
        $('#write-bar-modal').classList.remove('hidden');
        $('#write-bar-text').value = '';
        $('#write-bar-count').textContent = '0/90';
    });
    
    $('#write-bar-text')?.addEventListener('input', function() {
        $('#write-bar-count').textContent = `${this.value.length}/90`;
    });
    
    $('#write-bar-send')?.addEventListener('click', async () => {
        const text = $('#write-bar-text').value.trim();
        if (!text) return showToast('اكتب شيئاً', 'error');
        if (text.length > 90) return showToast('الحد 90 حرفاً', 'error');
        
        try {
            await addDoc(collection(db, 'vipBars'), {
                uid: currentUser.uid,
                name: userData.name,
                avatar: userData.avatar,
                text,
                createdAt: serverTimestamp()
            });
            showToast('✅ تم رفع الشريط', 'success');
            $('#write-bar-modal').classList.add('hidden');
        } catch (e) {
            showToast('❌ فشل في الرفع', 'error');
        }
    });
    
    $('#write-bar-cancel')?.addEventListener('click', () => $('#write-bar-modal').classList.add('hidden'));
}

function updateVipTopBar() {
    const q = query(collection(db, 'vipBars'), orderBy('createdAt', 'asc'));
    onSnapshot(q, (snapshot) => {
        const bars = [];
        snapshot.forEach(doc => bars.push(doc.data()));
        if (bars.length === 0) return;
        
        let currentIndex = 0;
        const showNext = () => {
            if (currentIndex >= bars.length) currentIndex = 0;
            const bar = bars[currentIndex];
            const content = $('#vip-top-bar-content');
            content.innerHTML = `
                <div class="vip-top-bar-item">
                    <img src="${bar.avatar || 'https://ui-avatars.com/api/?name='+encodeURIComponent(bar.name||'?')}" alt="${bar.name}">
                    <span>${bar.name}: ${escapeHtml(bar.text)}</span>
                </div>
            `;
            currentIndex++;
        };
        
        showNext();
        setInterval(showNext, 15000);
    });
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
        calc.style.bottom = 'auto';
    });
    
    document.addEventListener('mouseup', () => { isDragging = false; calc.style.transition = '0.2s ease'; });
    
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
        calc.style.bottom = 'auto';
    });
    
    document.addEventListener('touchend', () => { isDragging = false; calc.style.transition = '0.2s ease'; });
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
    const lastChar = calcExpression.slice(-1);
    const ops = ['+', '-', '*', '/', '×', '÷'];
    if (ops.includes(key) && ops.includes(lastChar)) calcExpression = calcExpression.slice(0, -1);
    calcExpression += key;
    display.value = calcExpression;
}

// =============================================
// التنقل بين الصفحات
// =============================================

function navigateTo(page) {
    if (window.innerWidth <= 600) closeSidebar();
    
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
        case 'friendships': loadFriendshipsPage(); break;
        case 'groups': loadGroupsPage(); break;
        case 'chat': loadChatPage(); break;
        case 'users': loadUsersPage(); break;
        case 'settings': loadSettingsPage(); break;
        case 'privacy': loadPrivacyPage(); break;
        case 'activate-vip': navigateTo('chat'); break;
    }
    
    $$('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.nav-btn[data-page="${page}"]`);
    if (activeBtn) activeBtn.classList.add('active');
}

function updateBottomBar(page) {
    const btnFriends = $('#bottom-btn-friendships');
    const btnGroups = $('#bottom-btn-groups');
    const btnBack = $('#bottom-btn-back');
    
    if (!btnFriends || !btnGroups || !btnBack) return;
    
    if (page === 'dashboard') {
        btnFriends.classList.remove('hidden');
        btnGroups.classList.remove('hidden');
        btnBack.classList.add('hidden');
    } else if (page === 'friendships' || page === 'groups') {
        btnFriends.classList.add('hidden');
        btnGroups.classList.add('hidden');
        btnBack.classList.remove('hidden');
    } else {
        btnFriends.classList.add('hidden');
        btnGroups.classList.add('hidden');
        btnBack.classList.remove('hidden');
    }
}

// =============================================
// القائمة الجانبية والإشعارات
// =============================================

function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
    $('#sidebar').classList.toggle('open', sidebarOpen);
    $('#header-avatar').style.visibility = sidebarOpen ? 'hidden' : 'visible';
}

function closeSidebar() {
    sidebarOpen = false;
    $('#sidebar').classList.remove('open');
    $('#header-avatar').style.visibility = 'visible';
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
    $('#upload-avatar-btn')?.addEventListener('click', () => $('#avatar-upload').click());
    $('#avatar-upload')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            $('#onboarding-avatar-img').src = ev.target.result;
            $('#save-onboarding-btn').style.display = 'block';
            $('#save-onboarding-btn').onclick = () => completeOnboarding(ev.target.result);
        };
        reader.readAsDataURL(file);
    });
    $('#skip-onboarding')?.addEventListener('click', () => completeOnboarding(null));
    
    // القائمة الجانبية
    $('#sidebar-toggle')?.addEventListener('click', toggleSidebar);
    $('#header-avatar')?.addEventListener('click', toggleSidebar);
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
        showToast(this.classList.contains('active') ? '✅ تم تفعيل الإشعارات' : '🔕 تم إيقاف الإشعارات', 'info');
    });
    
    // الشريط السفلي
    $('#bottom-btn-friendships')?.addEventListener('click', () => navigateTo('friendships'));
    $('#bottom-btn-groups')?.addEventListener('click', () => navigateTo('groups'));
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
            if (isAdmin || isMod || isSuperMod) monitorPresence();
            updateVipTopBar();
            
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
                return showToast(`🚫 حسابك محظور. السبب: ${reason}. ينتهي: ${expiry}`, 'error');
            }
            
            if (!userData.onboardingCompleted) {
                showOnboarding();
            } else if (!userData.emailVerified) {
                showVerifyEmailScreen();
            } else {
                $('#auth-screen').classList.add('hidden');
                $('#onboarding-screen').classList.add('hidden');
                $('#verify-email-screen').classList.add('hidden');
                $('#app').classList.remove('hidden');
                updateUI();
                navigateTo('dashboard');
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
