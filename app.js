// =============================================
// HAINON - التطبيق الرئيسي
// نظام المحاسبة والإدارة المالية
// =============================================

// ---------- استيراد الخدمات ----------
import { auth, db, rtdb, presenceRef } from './firebase.js';

// ---------- Firebase Auth ----------
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile,
    sendEmailVerification,
    sendPasswordResetEmail,
    updateEmail,
    updatePassword,
    reauthenticateWithCredential,
    EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ---------- Firestore ----------
import {
    doc,
    setDoc,
    getDoc,
    collection,
    addDoc,
    query,
    where,
    orderBy,
    onSnapshot,
    serverTimestamp,
    getDocs,
    updateDoc,
    deleteDoc,
    limit,
    Timestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ---------- Realtime Database ----------
import {
    ref,
    set,
    onValue,
    onDisconnect,
    serverTimestamp as rtdbTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// =============================================
// متغيرات عامة
// =============================================
let currentUser = null;
let userData = null;
let isAdmin = false;
let sidebarOpen = false;
let calculatorOpen = false;
let calcExpression = '';
let selectedChatUser = null;
let onlineUsers = {};

// =============================================
// دوال مساعدة لاختصار عناصر DOM
// =============================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// =============================================
// نظام التنبيهات Toast
// =============================================
function showToast(message, type = 'info') {
    const container = $('#toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3300);
}

// =============================================
// شاشة التحميل
// =============================================
function showLoading() { $('#loading-screen').classList.remove('hidden'); }
function hideLoading() { $('#loading-screen').classList.add('hidden'); }

// =============================================
// مودال التأكيد
// =============================================
function showConfirm(message) {
    return new Promise((resolve) => {
        const modal = $('#confirm-modal');
        $('#confirm-message').textContent = message;
        modal.classList.remove('hidden');
        
        const cleanup = () => {
            modal.classList.add('hidden');
            $('#confirm-yes').removeEventListener('click', onYes);
            $('#confirm-no').removeEventListener('click', onNo);
        };
        
        const onYes = () => { cleanup(); resolve(true); };
        const onNo = () => { cleanup(); resolve(false); };
        
        $('#confirm-yes').addEventListener('click', onYes);
        $('#confirm-no').addEventListener('click', onNo);
    });
}

// =============================================
// تنسيق العملات
// =============================================
function formatCurrency(amount, currency = 'USD') {
    const num = parseFloat(amount) || 0;
    if (currency === 'SYP') return `${num.toLocaleString('ar-SY')} ل.س`;
    return `$${num.toFixed(2)}`;
}

// =============================================
// توليد رقم تسلسلي
// =============================================
function generateSerialId() {
    return Math.floor(10000 + Math.random() * 90000).toString();
}

// =============================================
// التحقق من كلمة المرور
// =============================================
function validatePassword(password) {
    const regex = /^(?=.*[a-zA-Z])[a-zA-Z0-9]{6,}$/;
    return regex.test(password);
}

// =============================================
// تسمية نوع العملية
// =============================================
function getTypeLabel(type) {
    const labels = {
        incoming: '📥 وارد',
        outgoing: '📤 صادر',
        sale: '💰 بيع',
        purchase: '🛒 شراء',
        debt: '📝 دين',
        returned: '↩️ مرتجع'
    };
    return labels[type] || type;
}

// =============================================
// منع HTML Injection
// =============================================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =============================================
// الحصول على موقع المستخدم من IP
// =============================================
async function getUserLocation() {
    try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        return {
            ip: data.ip || 'غير معروف',
            country: data.country_name || 'غير معروف',
            city: data.city || 'غير معروف',
            region: data.region || 'غير معروف'
        };
    } catch (error) {
        return { ip: 'غير معروف', country: 'غير معروف', city: 'غير معروف', region: 'غير معروف' };
    }
}

// =============================================
// الحصول على معلومات الجهاز
// =============================================
function getDeviceInfo() {
    const ua = navigator.userAgent;
    let browser = 'غير معروف';
    let os = 'غير معروف';
    let isMobile = false;
    
    if (ua.includes('Chrome')) browser = 'Chrome';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Safari')) browser = 'Safari';
    else if (ua.includes('Edge')) browser = 'Edge';
    
    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac')) os = 'MacOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) { os = 'Android'; isMobile = true; }
    else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) { os = 'iOS'; isMobile = true; }
    
    return { browser, os, isMobile, userAgent: ua };
}

// =============================================
// تحديث حالة الاتصال
// =============================================
function setupPresence(uid) {
    if (!uid) return;
    
    const userPresenceRef = presenceRef(uid);
    const connectedRef = ref(rtdb, '.info/connected');
    
    onValue(connectedRef, (snap) => {
        if (snap.val() === true) {
            const presenceData = {
                status: 'online',
                lastSeen: rtdbTimestamp(),
                device: getDeviceInfo()
            };
            
            onDisconnect(userPresenceRef).set({
                status: 'offline',
                lastSeen: rtdbTimestamp(),
                device: getDeviceInfo()
            });
            
            set(userPresenceRef, presenceData);
        }
    });
}

// =============================================
// مراقبة حالة المستخدمين (للأدمن)
// =============================================
function monitorAllUsersPresence() {
    const presenceRootRef = ref(rtdb, 'presence');
    
    onValue(presenceRootRef, (snapshot) => {
        onlineUsers = {};
        const data = snapshot.val();
        if (data) {
            Object.keys(data).forEach(uid => {
                onlineUsers[uid] = data[uid];
            });
        }
        // تحديث واجهة المستخدمين إذا كانت مفتوحة
        if (document.querySelector('#page-users.active')) {
            loadUsersPage();
        }
    });
}

// =============================================
// المعادلات المالية - حساب الصافي
// =============================================
function calculateNet(transactions, currency = 'USD') {
    let incoming = 0, outgoing = 0, sales = 0, purchases = 0;
    
    transactions.forEach(t => {
        if (t.currency !== currency) return;
        const amount = parseFloat(t.amount) || 0;
        switch (t.type) {
            case 'incoming': incoming += amount; break;
            case 'outgoing': outgoing += amount; break;
            case 'sale': sales += amount; break;
            case 'purchase': purchases += amount; break;
        }
    });
    
    return (incoming + sales) - (outgoing + purchases);
}

// =============================================
// المعادلات المالية - حساب الأرباح والخسائر
// =============================================
function calculateProfitLoss(transactions, currency = 'USD') {
    let totalProfit = 0, totalLoss = 0;
    
    transactions.forEach(t => {
        if (t.currency !== currency || t.type !== 'sale') return;
        const purchasePrice = parseFloat(t.purchasePrice) || 0;
        const salePrice = parseFloat(t.salePrice) || parseFloat(t.amount) || 0;
        const returned = parseFloat(t.returned) || 0;
        const result = (salePrice - purchasePrice) - returned;
        if (result > 0) totalProfit += result;
        else totalLoss += Math.abs(result);
    });
    
    return { profit: totalProfit, loss: totalLoss };
}

// =============================================
// بناء القائمة الجانبية حسب نوع المستخدم
// =============================================
function buildSidebarNav() {
    const nav = $('#sidebar-nav');
    nav.innerHTML = '';
    
    // قائمة مشتركة
    const commonLinks = [
        { page: 'dashboard', icon: 'fa-chart-pie', label: 'الرئيسية' },
        { page: 'transactions', icon: 'fa-exchange-alt', label: 'العمليات' },
        { page: 'debts', icon: 'fa-hand-holding-usd', label: 'الديون' },
        { page: 'reports', icon: 'fa-file-invoice', label: 'التقارير' }
    ];
    
    // قائمة خاصة
    if (isAdmin) {
        commonLinks.push(
            { page: 'chat', icon: 'fa-comments', label: 'المحادثات' },
            { page: 'users', icon: 'fa-users', label: 'إدارة المستخدمين' }
        );
    } else {
        commonLinks.push(
            { page: 'chat', icon: 'fa-headset', label: 'خدمة العملاء' }
        );
    }
    
    commonLinks.push(
        { page: 'settings', icon: 'fa-cog', label: 'الإعدادات' }
    );
    
    commonLinks.forEach(link => {
        const btn = document.createElement('button');
        btn.className = 'nav-btn';
        btn.dataset.page = link.page;
        btn.innerHTML = `<i class="fas ${link.icon}"></i> ${link.label}`;
        btn.addEventListener('click', () => navigateTo(link.page));
        nav.appendChild(btn);
    });
}

// =============================================
// تحديث واجهة المستخدم بالبيانات
// =============================================
function updateUIWithUserData() {
    if (!userData) return;
    
    const avatarUrl = userData.avatar || 
        `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name || 'مستخدم')}&background=D4AF37&color=111&size=200&bold=true&format=svg`;
    
    $('#header-avatar-img').src = avatarUrl;
    $('#sidebar-avatar-img').src = avatarUrl;
    $('#sidebar-username').textContent = userData.name || 'مستخدم';
    $('#sidebar-id').textContent = `ID: ${userData.serialId || '----'}`;
    $('#sidebar-role').textContent = isAdmin ? '👑 مدير النظام' : '👤 مستخدم';
    $('#sidebar-role').style.color = isAdmin ? 'var(--gold)' : 'var(--text-muted)';
    
    buildSidebarNav();
}

// =============================================
// تحميل بيانات المستخدم
// =============================================
async function loadUserData() {
    if (!currentUser) return false;
    try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
            userData = userDoc.data();
            isAdmin = userData.role === 'admin';
            updateUIWithUserData();
            return true;
        }
        return false;
    } catch (error) {
        console.error('خطأ في تحميل بيانات المستخدم:', error);
        return false;
    }
                       }
// =============================================
// تابع: نظام المصادقة الكامل
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
            lastLogin: serverTimestamp()
        });

        await updateProfile(user, { displayName: name });
        
        // إرسال رمز تأكيد البريد
        await sendEmailVerification(user);
        
        hideLoading();
        showToast('✅ تم إنشاء الحساب. تم إرسال رابط تأكيد إلى بريدك', 'success');
        showVerifyEmailScreen();
        
    } catch (error) {
        hideLoading();
        let msg = 'حدث خطأ في إنشاء الحساب';
        if (error.code === 'auth/email-already-in-use') msg = 'البريد الإلكتروني مستخدم مسبقاً';
        if (error.code === 'auth/invalid-email') msg = 'صيغة البريد غير صحيحة';
        showToast(msg, 'error');
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
        await sendPasswordResetEmail(auth, email);
        showToast('✅ تم إرسال رابط استعادة كلمة المرور إلى بريدك', 'success');
        $('#forgot-password-modal').classList.add('hidden');
    } catch (error) {
        let msg = 'حدث خطأ';
        if (error.code === 'auth/user-not-found') msg = 'البريد غير مسجل';
        showToast(msg, 'error');
    }
}

// ---------- إعادة إرسال تأكيد البريد ----------
async function resendVerificationEmail() {
    if (!currentUser) return;
    try {
        await sendEmailVerification(currentUser);
        showToast('✅ تم إعادة إرسال رابط التأكيد', 'success');
    } catch (error) {
        showToast('❌ حدث خطأ. حاول لاحقاً', 'error');
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
        updateUIWithUserData();
        navigateTo('dashboard');
        showToast('✅ تم إكمال الإعداد بنجاح', 'success');
    } catch (error) {
        showToast('❌ حدث خطأ في حفظ البيانات', 'error');
    }
}

// =============================================
// تابع: صفحات التطبيق
// =============================================

// ---------- 🏠 الصفحة الرئيسية ----------
function loadDashboardPage() {
    const section = $('#page-dashboard');
    
    const q = query(
        collection(db, 'transactions'),
        where('uid', '==', currentUser.uid),
        orderBy('createdAt', 'desc')
    );
    
    onSnapshot(q, (snapshot) => {
        const transactions = [];
        snapshot.forEach(doc => transactions.push({ id: doc.id, ...doc.data() }));
        
        const usdNet = calculateNet(transactions, 'USD');
        const sypNet = calculateNet(transactions, 'SYP');
        const usdPL = calculateProfitLoss(transactions, 'USD');
        const sypPL = calculateProfitLoss(transactions, 'SYP');
        
        section.innerHTML = `
            <h2>🏠 لوحة التحكم</h2>
            
            <div class="stats-grid">
                <div class="stat-card stat-net">
                    <div class="stat-icon">💵</div>
                    <div class="stat-value">${formatCurrency(usdNet)}</div>
                    <div class="stat-label">الصافي USD</div>
                </div>
                <div class="stat-card stat-net">
                    <div class="stat-icon">💷</div>
                    <div class="stat-value">${formatCurrency(sypNet, 'SYP')}</div>
                    <div class="stat-label">الصافي SYP</div>
                </div>
                <div class="stat-card stat-profit">
                    <div class="stat-icon">📈</div>
                    <div class="stat-value">${formatCurrency(usdPL.profit)}</div>
                    <div class="stat-label">الأرباح</div>
                </div>
                <div class="stat-card stat-loss">
                    <div class="stat-icon">📉</div>
                    <div class="stat-value">${formatCurrency(usdPL.loss)}</div>
                    <div class="stat-label">الخسائر</div>
                </div>
            </div>
            
            <h3>📋 آخر العمليات</h3>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>النوع</th>
                            <th>المبلغ</th>
                            <th>العملة</th>
                            <th>ملاحظات</th>
                            <th>التاريخ</th>
                            <th>الوقت</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${transactions.length === 0 ? 
                            '<tr><td colspan="6" style="color:var(--text-muted);padding:20px;">لا توجد عمليات حتى الآن</td></tr>' :
                            transactions.slice(0, 20).map(t => `
                                <tr>
                                    <td>${getTypeLabel(t.type)}</td>
                                    <td>${formatCurrency(t.amount, t.currency)}</td>
                                    <td>${t.currency}</td>
                                    <td>${t.note || '---'}</td>
                                    <td>${t.createdAt ? new Date(t.createdAt.toDate()).toLocaleDateString('ar-SY') : '---'}</td>
                                    <td>${t.createdAt ? new Date(t.createdAt.toDate()).toLocaleTimeString('ar-SY', {hour:'2-digit', minute:'2-digit'}) : '---'}</td>
                                </tr>
                            `).join('')
                        }
                    </tbody>
                </table>
            </div>
        `;
    });
}

// ---------- 💱 صفحة العمليات ----------
function loadTransactionsPage() {
    const section = $('#page-transactions');
    
    section.innerHTML = `
        <h2>💱 العمليات المالية</h2>
        
        <div class="accordion" id="accordion-add">
            <button class="accordion-header" id="accordion-toggle-btn">
                <span>➕ إضافة عملية جديدة</span>
                <i class="fas fa-chevron-down"></i>
            </button>
            <div class="accordion-body">
                <div class="accordion-inner">
                    <form id="transaction-form">
                        <div class="form-row">
                            <select id="trans-type" required>
                                <option value="">-- نوع العملية --</option>
                                <option value="incoming">📥 وارد</option>
                                <option value="outgoing">📤 صادر</option>
                                <option value="sale">💰 بيع</option>
                                <option value="purchase">🛒 شراء</option>
                                <option value="debt">📝 دين</option>
                                <option value="returned">↩️ مرتجع</option>
                            </select>
                            <input type="number" id="trans-amount" placeholder="المبلغ" step="0.01" required>
                        </div>
                        <div class="form-row">
                            <select id="trans-currency">
                                <option value="USD">💵 USD</option>
                                <option value="SYP">💷 SYP</option>
                            </select>
                            <input type="number" id="trans-purchase-price" placeholder="سعر الشراء (للبيع)" step="0.01">
                        </div>
                        <div class="form-row">
                            <input type="number" id="trans-sale-price" placeholder="سعر البيع (للبيع)" step="0.01">
                            <input type="number" id="trans-returned" placeholder="المرتجع (للبيع)" step="0.01">
                        </div>
                        <div class="form-full">
                            <input type="text" id="trans-note" placeholder="📝 ملاحظات (اختياري)">
                        </div>
                        <button type="submit" class="btn-primary">💾 حفظ العملية</button>
                    </form>
                </div>
            </div>
        </div>
        
        <div class="table-container" style="margin-top:20px;">
            <table>
                <thead>
                    <tr>
                        <th>النوع</th>
                        <th>المبلغ</th>
                        <th>العملة</th>
                        <th>ملاحظات</th>
                        <th>التاريخ</th>
                        <th>الوقت</th>
                        <th>حذف</th>
                    </tr>
                </thead>
                <tbody id="transactions-tbody">
                    <tr><td colspan="7" style="color:var(--text-muted);">⏳ جاري التحميل...</td></tr>
                </tbody>
            </table>
        </div>
    `;
    
    // أكورديون
    $('#accordion-toggle-btn').addEventListener('click', () => {
        $('#accordion-add').classList.toggle('open');
    });
    
    // إضافة عملية
    $('#transaction-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const type = $('#trans-type').value;
        const amount = parseFloat($('#trans-amount').value);
        const currency = $('#trans-currency').value;
        
        if (!type) return showToast('اختر نوع العملية', 'error');
        if (!amount || amount <= 0) return showToast('أدخل مبلغ صحيح', 'error');
        
        try {
            await addDoc(collection(db, 'transactions'), {
                uid: currentUser.uid,
                type, amount, currency,
                purchasePrice: parseFloat($('#trans-purchase-price').value) || 0,
                salePrice: parseFloat($('#trans-sale-price').value) || 0,
                returned: parseFloat($('#trans-returned').value) || 0,
                note: $('#trans-note').value.trim() || '',
                createdAt: serverTimestamp()
            });
            
            showToast('✅ تمت الإضافة', 'success');
            $('#transaction-form').reset();
            $('#accordion-add').classList.remove('open');
        } catch (error) {
            showToast('❌ فشل في الإضافة', 'error');
        }
    });
    
    // مراقبة لحظية
    const q = query(collection(db, 'transactions'), where('uid', '==', currentUser.uid), orderBy('createdAt', 'desc'));
    
    onSnapshot(q, (snapshot) => {
        const tbody = $('#transactions-tbody');
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="7" style="color:var(--text-muted);padding:20px;">لا توجد عمليات</td></tr>';
            return;
        }
        
        tbody.innerHTML = '';
        snapshot.forEach(doc => {
            const t = doc.data();
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${getTypeLabel(t.type)}</td>
                <td>${formatCurrency(t.amount, t.currency)}</td>
                <td>${t.currency}</td>
                <td>${t.note || '---'}</td>
                <td>${t.createdAt ? new Date(t.createdAt.toDate()).toLocaleDateString('ar-SY') : '---'}</td>
                <td>${t.createdAt ? new Date(t.createdAt.toDate()).toLocaleTimeString('ar-SY', {hour:'2-digit', minute:'2-digit'}) : '---'}</td>
                <td><button class="btn-outline btn-sm delete-btn" data-id="${doc.id}" style="color:var(--red);border-color:var(--red);">🗑️</button></td>
            `;
            tbody.appendChild(row);
        });
        
        tbody.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const confirmed = await showConfirm('حذف هذه العملية؟');
                if (confirmed) {
                    await deleteDoc(doc(db, 'transactions', btn.dataset.id));
                    showToast('🗑️ تم الحذف', 'success');
                }
            });
        });
    });
}

// ---------- 📝 صفحة الديون ----------
function loadDebtsPage() {
    const section = $('#page-debts');
    
    section.innerHTML = `
        <h2>📝 الديون</h2>
        <div class="table-container">
            <table>
                <thead>
                    <tr><th>المبلغ</th><th>العملة</th><th>ملاحظات</th><th>التاريخ</th><th>الوقت</th></tr>
                </thead>
                <tbody id="debts-tbody">
                    <tr><td colspan="5" style="color:var(--text-muted);">⏳ جاري التحميل...</td></tr>
                </tbody>
            </table>
        </div>
    `;
    
    const q = query(collection(db, 'transactions'), where('uid', '==', currentUser.uid), where('type', '==', 'debt'), orderBy('createdAt', 'desc'));
    
    onSnapshot(q, (snapshot) => {
        const tbody = $('#debts-tbody');
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text-muted);padding:20px;">✅ لا توجد ديون</td></tr>';
            return;
        }
        
        tbody.innerHTML = '';
        snapshot.forEach(doc => {
            const t = doc.data();
            tbody.innerHTML += `
                <tr>
                    <td>${formatCurrency(t.amount, t.currency)}</td>
                    <td>${t.currency}</td>
                    <td>${t.note || '---'}</td>
                    <td>${t.createdAt ? new Date(t.createdAt.toDate()).toLocaleDateString('ar-SY') : '---'}</td>
                    <td>${t.createdAt ? new Date(t.createdAt.toDate()).toLocaleTimeString('ar-SY', {hour:'2-digit', minute:'2-digit'}) : '---'}</td>
                </tr>
            `;
        });
    });
}

// ---------- 📊 صفحة التقارير ----------
function loadReportsPage() {
    const section = $('#page-reports');
    
    const q = query(collection(db, 'transactions'), where('uid', '==', currentUser.uid), orderBy('createdAt', 'desc'));
    
    onSnapshot(q, (snapshot) => {
        const transactions = [];
        snapshot.forEach(doc => transactions.push({ id: doc.id, ...doc.data() }));
        
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        
        const filterByDate = (startDate) => transactions.filter(t => {
            if (!t.createdAt) return false;
            return t.createdAt.toDate() >= startDate;
        });
        
        const todayTx = filterByDate(today);
        const weekTx = filterByDate(weekAgo);
        const monthTx = filterByDate(monthAgo);
        
        section.innerHTML = `
            <h2>📊 التقارير المالية</h2>
            
            <div class="stats-grid">
                <div class="stat-card stat-net"><div class="stat-icon">📅</div><div class="stat-value">${formatCurrency(calculateNet(todayTx, 'USD'))}</div><div class="stat-label">صافي اليوم USD</div></div>
                <div class="stat-card stat-net"><div class="stat-icon">📆</div><div class="stat-value">${formatCurrency(calculateNet(weekTx, 'USD'))}</div><div class="stat-label">صافي الأسبوع USD</div></div>
                <div class="stat-card stat-net"><div class="stat-icon">🗓️</div><div class="stat-value">${formatCurrency(calculateNet(monthTx, 'USD'))}</div><div class="stat-label">صافي الشهر USD</div></div>
                <div class="stat-card stat-profit"><div class="stat-icon">📈</div><div class="stat-value">${formatCurrency(calculateProfitLoss(monthTx, 'USD').profit)}</div><div class="stat-label">أرباح الشهر</div></div>
            </div>
            
            <div class="stats-grid">
                <div class="stat-card stat-net"><div class="stat-icon">📅</div><div class="stat-value">${formatCurrency(calculateNet(todayTx, 'SYP'), 'SYP')}</div><div class="stat-label">صافي اليوم SYP</div></div>
                <div class="stat-card stat-net"><div class="stat-icon">📆</div><div class="stat-value">${formatCurrency(calculateNet(weekTx, 'SYP'), 'SYP')}</div><div class="stat-label">صافي الأسبوع SYP</div></div>
                <div class="stat-card stat-net"><div class="stat-icon">🗓️</div><div class="stat-value">${formatCurrency(calculateNet(monthTx, 'SYP'), 'SYP')}</div><div class="stat-label">صافي الشهر SYP</div></div>
                <div class="stat-card stat-loss"><div class="stat-icon">📉</div><div class="stat-value">${formatCurrency(calculateProfitLoss(monthTx, 'SYP').loss, 'SYP')}</div><div class="stat-label">خسائر الشهر</div></div>
            </div>
        `;
    });
            }
// =============================================
// تابع: صفحة المحادثة / خدمة العملاء
// =============================================

function loadChatPage() {
    const section = $('#page-chat');
    
    if (isAdmin) {
        // ---------- واجهة الأدمن: قائمة جهات اتصال + محادثة ----------
        section.innerHTML = `
            <h2>💬 المحادثات</h2>
            <div class="chat-wrapper">
                <div class="chat-contacts" id="chat-contacts">
                    <div class="chat-contacts-header">👥 جهات الاتصال</div>
                    <div id="chat-contacts-list"></div>
                </div>
                <div class="chat-main" id="chat-main">
                    <div class="chat-empty" id="chat-empty">
                        <p>👈 اختر جهة اتصال من القائمة</p>
                    </div>
                    <div class="chat-messages hidden" id="chat-messages"></div>
                    <div class="chat-input-area hidden" id="chat-input-area">
                        <input type="text" id="chat-input" placeholder="✍️ اكتب ردك...">
                        <button id="chat-send"><i class="fas fa-paper-plane"></i></button>
                    </div>
                </div>
            </div>
        `;
        
        loadAdminContacts();
        
    } else {
        // ---------- واجهة المستخدم: خدمة عملاء مباشرة ----------
        section.innerHTML = `
            <h2>🎧 خدمة العملاء</h2>
            <div class="chat-container">
                <div class="chat-messages" id="chat-messages">
                    <div style="text-align:center;color:var(--text-muted);padding:20px;">💬 أهلاً بك! كيف يمكننا مساعدتك؟</div>
                </div>
                <div class="chat-input-area">
                    <input type="text" id="chat-input" placeholder="✍️ اكتب رسالتك...">
                    <button id="chat-send"><i class="fas fa-paper-plane"></i></button>
                </div>
            </div>
        `;
        
        loadUserChat();
    }
}

// ---------- تحميل جهات اتصال الأدمن ----------
function loadAdminContacts() {
    const contactsList = $('#chat-contacts-list');
    
    // جلب كل المستخدمين الذين أرسلوا رسائل
    const q = query(collection(db, 'messages'), orderBy('createdAt', 'desc'));
    
    onSnapshot(q, (snapshot) => {
        const usersMap = new Map();
        
        snapshot.forEach(doc => {
            const msg = doc.data();
            if (msg.uid !== currentUser.uid && !usersMap.has(msg.uid)) {
                usersMap.set(msg.uid, {
                    uid: msg.uid,
                    senderName: msg.senderName || 'مستخدم',
                    lastMessage: msg.text,
                    lastTime: msg.createdAt
                });
            }
        });
        
        contactsList.innerHTML = '';
        
        if (usersMap.size === 0) {
            contactsList.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);">لا توجد رسائل</div>';
            return;
        }
        
        usersMap.forEach((user, uid) => {
            const contactDiv = document.createElement('div');
            contactDiv.className = 'chat-contact-item';
            contactDiv.dataset.uid = uid;
            contactDiv.innerHTML = `
                <div class="chat-contact-avatar">
                    <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(user.senderName)}&background=D4AF37&color=111&size=80&bold=true&format=svg" alt="${user.senderName}">
                </div>
                <div class="chat-contact-info">
                    <div class="chat-contact-name">${user.senderName}</div>
                    <div class="chat-contact-last">${user.lastMessage?.substring(0, 30) || ''}...</div>
                </div>
                ${onlineUsers[uid]?.status === 'online' ? '<span style="color:var(--green);font-size:10px;">🟢</span>' : '<span style="color:var(--text-muted);font-size:10px;">🔴</span>'}
            `;
            
            contactDiv.addEventListener('click', () => openAdminChat(uid, user.senderName));
            contactsList.appendChild(contactDiv);
        });
    });
}

// ---------- فتح محادثة مع مستخدم (للأدمن) ----------
function openAdminChat(targetUid, targetName) {
    selectedChatUser = targetUid;
    
    // تحديث حالة النشط
    $$('.chat-contact-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`.chat-contact-item[data-uid="${targetUid}"]`)?.classList.add('active');
    
    $('#chat-empty').classList.add('hidden');
    $('#chat-messages').classList.remove('hidden');
    $('#chat-input-area').classList.remove('hidden');
    
    const messagesDiv = $('#chat-messages');
    messagesDiv.innerHTML = '<div style="text-align:center;color:var(--text-muted);">⏳ جاري تحميل المحادثة...</div>';
    
    const q = query(collection(db, 'messages'), orderBy('createdAt', 'asc'));
    
    onSnapshot(q, (snapshot) => {
        messagesDiv.innerHTML = '';
        
        snapshot.forEach(doc => {
            const msg = doc.data();
            // عرض رسائل الأدمن مع هذا المستخدم فقط
            if ((msg.uid === currentUser.uid && msg.targetUid === targetUid) ||
                (msg.uid === targetUid && (msg.targetUid === currentUser.uid || !msg.targetUid))) {
                
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
        
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
    
    // إرسال رسالة
    const sendFunc = async () => {
        const text = $('#chat-input').value.trim();
        if (!text) return;
        
        try {
            await addDoc(collection(db, 'messages'), {
                uid: currentUser.uid,
                targetUid: targetUid,
                senderName: userData?.name || 'مدير النظام',
                text: text,
                createdAt: serverTimestamp()
            });
            $('#chat-input').value = '';
        } catch (error) {
            showToast('❌ فشل في الإرسال', 'error');
        }
    };
    
    $('#chat-send').onclick = sendFunc;
    $('#chat-input').onkeypress = (e) => { if (e.key === 'Enter') sendFunc(); };
}

// ---------- تحميل محادثة المستخدم مع خدمة العملاء ----------
function loadUserChat() {
    const messagesDiv = $('#chat-messages');
    
    const q = query(collection(db, 'messages'), orderBy('createdAt', 'asc'));
    
    onSnapshot(q, (snapshot) => {
        messagesDiv.innerHTML = '';
        let hasMessages = false;
        
        snapshot.forEach(doc => {
            const msg = doc.data();
            // عرض رسائل المستخدم مع الأدمن
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
        const text = $('#chat-input').value.trim();
        if (!text) return;
        if (text.length > 500) return showToast('الرسالة طويلة جداً', 'error');
        
        try {
            await addDoc(collection(db, 'messages'), {
                uid: currentUser.uid,
                senderName: userData?.name || 'مستخدم',
                text: text,
                createdAt: serverTimestamp()
            });
            $('#chat-input').value = '';
        } catch (error) {
            showToast('❌ فشل في الإرسال', 'error');
        }
    };
    
    $('#chat-send').addEventListener('click', sendFunc);
    $('#chat-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') sendFunc(); });
}

// =============================================
// تابع: صفحة إدارة المستخدمين (للأدمن)
// =============================================

async function loadUsersPage() {
    const section = $('#page-users');
    
    if (!isAdmin) {
        section.innerHTML = '<h2>⛔ غير مصرح</h2><p>هذه الصفحة مخصصة للمدير فقط</p>';
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
    `;
    
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const tbody = $('#users-tbody');
    tbody.innerHTML = '';
    
    if (usersSnapshot.empty) {
        tbody.innerHTML = '<tr><td colspan="12" style="color:var(--text-muted);">لا يوجد مستخدمين</td></tr>';
        return;
    }
    
    usersSnapshot.forEach(doc => {
        const u = doc.data();
        const presence = onlineUsers[u.uid];
        const isOnline = presence?.status === 'online';
        const lastSeen = presence?.lastSeen ? new Date(presence.lastSeen).toLocaleString('ar-SY') : (u.lastLogin ? new Date(u.lastLogin.toDate()).toLocaleString('ar-SY') : 'غير معروف');
        const deviceInfo = presence?.device || u.device || {};
        
        tbody.innerHTML += `
            <tr>
                <td><img src="${u.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(u.name) + '&background=D4AF37&color=111&size=40'}" style="width:35px;height:35px;border-radius:50%;object-fit:cover;border:2px solid var(--gold);"></td>
                <td>${u.name || '---'}</td>
                <td>${u.serialId || '---'}</td>
                <td>${u.email || '---'}</td>
                <td>${u.role === 'admin' ? '👑 مدير' : '👤 مستخدم'}</td>
                <td>${isOnline ? '<span style="color:var(--green);">🟢 متصل</span>' : '<span style="color:var(--text-muted);">🔴 غير متصل</span>'}</td>
                <td>${lastSeen}</td>
                <td>${u.location?.country || '---'} - ${u.location?.city || ''}</td>
                <td>${deviceInfo.browser || '---'} - ${deviceInfo.os || '---'}</td>
                <td style="font-size:11px;">${u.location?.ip || '---'}</td>
                <td>${u.createdAt ? new Date(u.createdAt.toDate()).toLocaleDateString('ar-SY') : '---'}</td>
                <td>
                    <button class="btn-outline btn-sm edit-id-btn" data-uid="${u.uid}" data-current-id="${u.serialId}" style="margin:2px;">🆔</button>
                    <button class="btn-outline btn-sm delete-user-btn" data-uid="${u.uid}" data-name="${u.name}" style="margin:2px;color:var(--red);border-color:var(--red);">🗑️</button>
                </td>
            </tr>
        `;
    });
    
    // أحداث تعديل ID
    tbody.querySelectorAll('.edit-id-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $('#edit-id-user-uid').value = btn.dataset.uid;
            $('#edit-id-input').value = btn.dataset.currentId;
            $('#edit-id-modal').classList.remove('hidden');
        });
    });
    
    // أحداث حذف مستخدم
    tbody.querySelectorAll('.delete-user-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const confirmed = await showConfirm(`حذف المستخدم "${btn.dataset.name}"؟`);
            if (confirmed) {
                await deleteDoc(doc(db, 'users', btn.dataset.uid));
                showToast('🗑️ تم حذف المستخدم', 'success');
                loadUsersPage();
            }
        });
    });
}

// ---------- حفظ تعديل ID ----------
async function saveEditedId() {
    const uid = $('#edit-id-user-uid').value;
    const newId = $('#edit-id-input').value.trim();
    
    if (!uid || !newId) return showToast('أدخل رقماً صحيحاً', 'error');
    
    try {
        await updateDoc(doc(db, 'users', uid), { serialId: newId });
        showToast('✅ تم تحديث الرقم التسلسلي', 'success');
        $('#edit-id-modal').classList.add('hidden');
        loadUsersPage();
    } catch (error) {
        showToast('❌ فشل في التحديث', 'error');
    }
}

// =============================================
// تابع: صفحة الإعدادات
// =============================================

function loadSettingsPage() {
    const section = $('#page-settings');
    
    const avatarUrl = userData?.avatar || 
        `https://ui-avatars.com/api/?name=${encodeURIComponent(userData?.name || 'مستخدم')}&background=D4AF37&color=111&size=200&bold=true&format=svg`;
    
    section.innerHTML = `
        <h2>⚙️ الإعدادات</h2>
        <div style="max-width:500px;margin:0 auto;">
            
            <!-- الصورة -->
            <div style="text-align:center;margin-bottom:24px;">
                <div class="sidebar-avatar" style="margin:0 auto 12px;width:100px;height:100px;">
                    <img id="settings-avatar-img" src="${avatarUrl}" alt="الصورة" style="width:100%;height:100%;object-fit:cover;">
                </div>
                <button id="change-avatar-btn" class="gold-btn-outline">📷 تغيير الصورة</button>
                <input type="file" id="settings-avatar-upload" accept="image/*" hidden>
            </div>
            
            <!-- تعديل الاسم -->
            <div class="input-group" style="margin-bottom:16px;">
                <label>الاسم الكامل</label>
                <input type="text" id="settings-name" value="${userData?.name || ''}" placeholder="اسمك الكامل">
            </div>
            
            <!-- تعديل البريد -->
            <div class="input-group" style="margin-bottom:16px;">
                <label>البريد الإلكتروني</label>
                <input type="email" id="settings-email" value="${userData?.email || ''}" placeholder="بريدك الإلكتروني">
            </div>
            
            <!-- الرقم التسلسلي (للأدمن فقط) -->
            <div class="input-group" style="margin-bottom:16px;">
                <label>الرقم التسلسلي ${isAdmin ? '(قابل للتعديل)' : '(ثابت)'}</label>
                <input type="text" id="settings-serial" value="${userData?.serialId || ''}" ${isAdmin ? '' : 'disabled'} style="${isAdmin ? '' : 'opacity:0.6;'}">
            </div>
            
            <!-- تغيير كلمة المرور -->
            <h3 style="margin:24px 0 16px;color:var(--gold);">🔒 تغيير كلمة المرور</h3>
            <div class="input-group" style="margin-bottom:12px;">
                <label>كلمة المرور الحالية</label>
                <input type="password" id="settings-current-password" placeholder="كلمة المرور الحالية">
            </div>
            <div class="input-group" style="margin-bottom:12px;">
                <label>كلمة المرور الجديدة</label>
                <input type="password" id="settings-new-password" placeholder="حرف إنجليزي + أرقام (6 خانات)">
            </div>
            
            <!-- أزرار -->
            <div style="display:flex;gap:10px;margin-top:24px;">
                <button id="save-profile-btn" class="btn-primary" style="flex:1;">💾 حفظ التعديلات</button>
                <button id="change-password-btn" class="btn-outline" style="flex:1;">🔒 تغيير كلمة المرور</button>
            </div>
        </div>
    `;
    
    // تغيير الصورة
    $('#change-avatar-btn').addEventListener('click', () => $('#settings-avatar-upload').click());
    
    $('#settings-avatar-upload').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) return showToast('اختر صورة صالحة', 'error');
        if (file.size > 2 * 1024 * 1024) return showToast('حجم الصورة كبير (أقصى 2MB)', 'error');
        
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const url = ev.target.result;
            await updateDoc(doc(db, 'users', currentUser.uid), { avatar: url });
            userData.avatar = url;
            updateUIWithUserData();
            $('#settings-avatar-img').src = url;
            showToast('✅ تم تحديث الصورة', 'success');
        };
        reader.readAsDataURL(file);
    });
    
    // حفظ التعديلات
    $('#save-profile-btn').addEventListener('click', async () => {
        const name = $('#settings-name').value.trim();
        const email = $('#settings-email').value.trim();
        const serialId = $('#settings-serial').value.trim();
        
        if (!name) return showToast('الاسم مطلوب', 'error');
        
        try {
            const updates = { name };
            if (isAdmin && serialId) updates.serialId = serialId;
            
            await updateDoc(doc(db, 'users', currentUser.uid), updates);
            
            if (email !== userData.email) {
                await updateEmail(currentUser, email);
                await updateDoc(doc(db, 'users', currentUser.uid), { email });
            }
            
            userData = { ...userData, ...updates };
            updateUIWithUserData();
            showToast('✅ تم حفظ التعديلات', 'success');
        } catch (error) {
            showToast('❌ فشل في الحفظ. قد تحتاج إعادة تسجيل الدخول لتعديل البريد', 'error');
        }
    });
    
    // تغيير كلمة المرور
    $('#change-password-btn').addEventListener('click', async () => {
        const currentPass = $('#settings-current-password').value;
        const newPass = $('#settings-new-password').value;
        
        if (!currentPass || !newPass) return showToast('أدخل كلمتي المرور', 'error');
        if (!validatePassword(newPass)) return showToast('كلمة المرور الجديدة ضعيفة', 'error');
        
        try {
            const credential = EmailAuthProvider.credential(currentUser.email, currentPass);
            await reauthenticateWithCredential(currentUser, credential);
            await updatePassword(currentUser, newPass);
            showToast('✅ تم تغيير كلمة المرور', 'success');
            $('#settings-current-password').value = '';
            $('#settings-new-password').value = '';
        } catch (error) {
            showToast('❌ كلمة المرور الحالية غير صحيحة', 'error');
        }
    });
            }
// =============================================
// تابع: التنقل بين الصفحات
// =============================================

function navigateTo(page) {
    // إغلاق القائمة في الموبايل
    if (window.innerWidth <= 600) {
        closeSidebar();
    }
    
    // تحديث الأزرار النشطة
    $$('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.page === page) {
            btn.classList.add('active');
        }
    });
    
    // إخفاء كل الصفحات
    $$('.page').forEach(p => p.classList.remove('active'));
    
    // إظهار الصفحة المطلوبة
    const targetPage = $(`#page-${page}`);
    if (targetPage) {
        targetPage.classList.add('active');
    }
    
    // تحميل محتوى الصفحة
    switch (page) {
        case 'dashboard':
            loadDashboardPage();
            break;
        case 'transactions':
            loadTransactionsPage();
            break;
        case 'debts':
            loadDebtsPage();
            break;
        case 'reports':
            loadReportsPage();
            break;
        case 'chat':
            loadChatPage();
            break;
        case 'users':
            loadUsersPage();
            break;
        case 'settings':
            loadSettingsPage();
            break;
    }
}

// =============================================
// القائمة الجانبية
// =============================================

function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
    $('#sidebar').classList.toggle('open', sidebarOpen);
}

function closeSidebar() {
    sidebarOpen = false;
    $('#sidebar').classList.remove('open');
}

// =============================================
// الآلة الحاسبة العائمة القابلة للتحريك
// =============================================

let isDragging = false;
let calcOffsetX = 0;
let calcOffsetY = 0;

function makeCalculatorDraggable() {
    const calc = $('#calculator');
    const header = document.querySelector('.calculator-header');
    
    if (!header) return;
    
    header.style.cursor = 'move';
    
    header.addEventListener('mousedown', (e) => {
        isDragging = true;
        const rect = calc.getBoundingClientRect();
        calcOffsetX = e.clientX - rect.left;
        calcOffsetY = e.clientY - rect.top;
        calc.style.transition = 'none';
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        let left = e.clientX - calcOffsetX;
        let top = e.clientY - calcOffsetY;
        
        // منع الخروج من الشاشة
        const maxX = window.innerWidth - calc.offsetWidth;
        const maxY = window.innerHeight - calc.offsetHeight;
        
        left = Math.max(0, Math.min(left, maxX));
        top = Math.max(0, Math.min(top, maxY));
        
        calc.style.left = left + 'px';
        calc.style.top = top + 'px';
        calc.style.bottom = 'auto';
    });
    
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            calc.style.transition = '0.2s ease';
        }
    });
    
    // دعم اللمس للموبايل
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
        
        const maxX = window.innerWidth - calc.offsetWidth;
        const maxY = window.innerHeight - calc.offsetHeight;
        
        left = Math.max(0, Math.min(left, maxX));
        top = Math.max(0, Math.min(top, maxY));
        
        calc.style.left = left + 'px';
        calc.style.top = top + 'px';
        calc.style.bottom = 'auto';
    });
    
    document.addEventListener('touchend', () => {
        if (isDragging) {
            isDragging = false;
            calc.style.transition = '0.2s ease';
        }
    });
}

function toggleCalculator() {
    calculatorOpen = !calculatorOpen;
    const calc = $('#calculator');
    
    if (calculatorOpen) {
        calc.classList.remove('hidden');
        calc.style.left = 'auto';
        calc.style.bottom = '80px';
        calc.style.top = 'auto';
        calcExpression = '';
        $('#calc-display').value = '0';
    } else {
        calc.classList.add('hidden');
    }
}

function handleCalcClick(key) {
    const display = $('#calc-display');
    
    if (key === 'clear') {
        calcExpression = '';
        display.value = '0';
        return;
    }
    
    if (key === '=') {
        try {
            let exp = calcExpression.replace(/×/g, '*').replace(/÷/g, '/');
            const result = eval(exp);
            if (!isFinite(result)) throw new Error('Invalid');
            display.value = parseFloat(result.toFixed(10));
            calcExpression = result.toString();
        } catch {
            display.value = 'خطأ';
            calcExpression = '';
        }
        return;
    }
    
    const lastChar = calcExpression.slice(-1);
    const operators = ['+', '-', '*', '/', '×', '÷'];
    if (operators.includes(key) && operators.includes(lastChar)) {
        calcExpression = calcExpression.slice(0, -1);
    }
    
    if (calcExpression === '0' && !operators.includes(key) && key !== '.') {
        calcExpression = key;
    } else {
        calcExpression += key;
    }
    
    display.value = calcExpression;
}

// =============================================
// إعداد جميع أحداث DOM
// =============================================

function setupEventListeners() {
    
    // ---- تبويبات المصادقة ----
    $('#tab-login').addEventListener('click', () => {
        $('#tab-login').classList.add('active');
        $('#tab-register').classList.remove('active');
        $('#login-form').classList.add('active');
        $('#register-form').classList.remove('active');
    });
    
    $('#tab-register').addEventListener('click', () => {
        $('#tab-register').classList.add('active');
        $('#tab-login').classList.remove('active');
        $('#register-form').classList.add('active');
        $('#login-form').classList.remove('active');
    });
    
    // ---- نماذج المصادقة ----
    $('#login-form').addEventListener('submit', handleLogin);
    $('#register-form').addEventListener('submit', handleRegister);
    
    // ---- نسيت كلمة المرور ----
    $('#forgot-password-btn').addEventListener('click', () => {
        $('#forgot-password-modal').classList.remove('hidden');
    });
    
    $('#forgot-send').addEventListener('click', handleForgotPassword);
    $('#forgot-cancel').addEventListener('click', () => {
        $('#forgot-password-modal').classList.add('hidden');
    });
    
    // ---- تأكيد البريد ----
    $('#resend-verify-btn').addEventListener('click', resendVerificationEmail);
    $('#skip-verify-btn').addEventListener('click', () => {
        $('#verify-email-screen').classList.add('hidden');
        showOnboarding();
    });
    
    // ---- القائمة الجانبية ----
    $('#sidebar-toggle').addEventListener('click', toggleSidebar);
    $('#header-avatar').addEventListener('click', toggleSidebar);
    document.querySelector('.sidebar-overlay').addEventListener('click', closeSidebar);
    
    // إغلاق بـ Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (sidebarOpen) closeSidebar();
            if (calculatorOpen) toggleCalculator();
        }
    });
    
    // ---- تسجيل الخروج ----
    $('#logout-btn').addEventListener('click', handleLogout);
    
    // ---- الإعداد الأولي Onboarding ----
    $('#upload-avatar-btn').addEventListener('click', () => {
        $('#avatar-upload').click();
    });
    
    $('#avatar-upload').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        if (!file.type.startsWith('image/')) {
            return showToast('اختر صورة صالحة', 'error');
        }
        
        const reader = new FileReader();
        reader.onload = (ev) => {
            $('#onboarding-avatar-img').src = ev.target.result;
            $('#save-onboarding-btn').style.display = 'block';
            // حفظ الصورة مباشرة عند اختيارها
            $('#save-onboarding-btn').onclick = () => completeOnboarding(ev.target.result);
        };
        reader.readAsDataURL(file);
    });
    
    $('#skip-onboarding').addEventListener('click', () => {
        completeOnboarding(null);
    });
    
    // ---- الآلة الحاسبة ----
    $('#calc-toggle').addEventListener('click', toggleCalculator);
    $('#calc-close').addEventListener('click', toggleCalculator);
    
    $$('.calc-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            handleCalcClick(btn.dataset.key);
        });
    });
    
    // جعل الآلة الحاسبة قابلة للسحب
    setTimeout(makeCalculatorDraggable, 1000);
    
    // ---- مودال تعديل ID ----
    $('#edit-id-save').addEventListener('click', saveEditedId);
    $('#edit-id-cancel').addEventListener('click', () => {
        $('#edit-id-modal').classList.add('hidden');
    });
    
    // ---- إغلاق المودالات بالنقر خارجها ----
    window.addEventListener('click', (e) => {
        if (e.target.id === 'confirm-modal') {
            $('#confirm-modal').classList.add('hidden');
        }
        if (e.target.id === 'forgot-password-modal') {
            $('#forgot-password-modal').classList.add('hidden');
        }
        if (e.target.id === 'edit-id-modal') {
            $('#edit-id-modal').classList.add('hidden');
        }
    });
}

// =============================================
// مراقب حالة المصادقة
// =============================================

onAuthStateChanged(auth, async (user) => {
    hideLoading();
    
    if (user) {
        currentUser = user;
        const exists = await loadUserData();
        
        if (exists) {
            // تفعيل نظام المراقبة
            setupPresence(user.uid);
            if (isAdmin) {
                monitorAllUsersPresence();
            }
            
            // تحديث آخر تسجيل دخول ومعلومات الجهاز
            const location = await getUserLocation();
            const device = getDeviceInfo();
            
            await updateDoc(doc(db, 'users', user.uid), {
                lastLogin: serverTimestamp(),
                location: location,
                device: device
            });
            
            if (!userData.onboardingCompleted) {
                showOnboarding();
            } else if (!user.emailVerified) {
                showVerifyEmailScreen();
            } else {
                $('#auth-screen').classList.add('hidden');
                $('#onboarding-screen').classList.add('hidden');
                $('#verify-email-screen').classList.add('hidden');
                $('#app').classList.remove('hidden');
                updateUIWithUserData();
                navigateTo('dashboard');
            }
        } else {
            // مستخدم جديد بدون وثيقة
            showOnboarding();
        }
    } else {
        // غير مسجل دخول
        currentUser = null;
        userData = null;
        isAdmin = false;
        $('#app').classList.add('hidden');
        $('#onboarding-screen').classList.add('hidden');
        $('#verify-email-screen').classList.add('hidden');
        $('#auth-screen').classList.remove('hidden');
    }
});

// =============================================
// بدء التطبيق عند تحميل الصفحة
// =============================================

document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    
    // إظهار شاشة التحميل في البداية
    showLoading();
});

// =============================================
// تصدير الدوال للاستخدام العام
// =============================================

export {
    navigateTo,
    showToast,
    showConfirm,
    formatCurrency,
    getTypeLabel
};
