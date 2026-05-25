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
