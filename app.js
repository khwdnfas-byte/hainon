// app.js - التطبيق الرئيسي لمشروع HAINON
import { auth, db } from './firebase.js';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
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
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// =============================================
// متغيرات عامة
// =============================================
let currentUser = null;
let userData = null;
let isAdmin = false;
let sidebarOpen = false;
let calculatorOpen = false;
let calcExpression = '';

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
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
    }, 3300);
}

// =============================================
// شاشة التحميل
// =============================================
function showLoading() {
    $('#loading-screen').classList.remove('hidden');
}

function hideLoading() {
    $('#loading-screen').classList.add('hidden');
}

// =============================================
// مودال التأكيد
// =============================================
function showConfirm(message) {
    return new Promise((resolve) => {
        const modal = $('#confirm-modal');
        const messageEl = $('#confirm-message');
        const yesBtn = $('#confirm-yes');
        const noBtn = $('#confirm-no');
        
        messageEl.textContent = message;
        modal.classList.remove('hidden');
        
        const cleanup = () => {
            modal.classList.add('hidden');
            yesBtn.removeEventListener('click', onYes);
            noBtn.removeEventListener('click', onNo);
        };
        
        const onYes = () => { cleanup(); resolve(true); };
        const onNo = () => { cleanup(); resolve(false); };
        
        yesBtn.addEventListener('click', onYes);
        noBtn.addEventListener('click', onNo);
    });
}

// =============================================
// تنسيق العملات
// =============================================
function formatCurrency(amount, currency = 'USD') {
    const num = parseFloat(amount) || 0;
    if (currency === 'SYP') {
        return `${num.toLocaleString('ar-SY')} ل.س`;
    }
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
// نظام المصادقة - تسجيل مستخدم جديد
// =============================================
async function handleRegister(e) {
    e.preventDefault();
    
    const name = $('#register-name').value.trim();
    const email = $('#register-email').value.trim();
    const password = $('#register-password').value;

    if (!name || !email || !password) {
        return showToast('جميع الحقول مطلوبة', 'error');
    }

    if (name.length < 2) {
        return showToast('الاسم يجب أن يكون حرفين على الأقل', 'error');
    }

    if (!validatePassword(password)) {
        return showToast('كلمة المرور يجب أن تحتوي على حرف إنجليزي واحد على الأقل وأرقام (6 خانات كحد أدنى)', 'error');
    }

    try {
        showLoading();
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // التحقق من أول مستخدم في النظام
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const isFirstUser = usersSnapshot.empty;
        const serialId = isFirstUser ? '11110' : generateSerialId();

        // إنشاء avatar تلقائي بالاسم
        const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=D4AF37&color=111&size=200&bold=true&format=svg`;

        // حفظ بيانات المستخدم في Firestore
        await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid,
            name: name,
            email: email,
            serialId: serialId,
            role: isFirstUser ? 'admin' : 'user',
            avatar: avatarUrl,
            onboardingCompleted: false,
            createdAt: serverTimestamp()
        });

        // تحديث الملف الشخصي في Firebase Auth
        await updateProfile(user, { displayName: name });

        hideLoading();
        showToast('تم إنشاء الحساب بنجاح', 'success');
        
        // توجيه إلى صفحة الإعداد الأولي
        showOnboarding();
    } catch (error) {
        hideLoading();
        console.error('خطأ في التسجيل:', error);
        
        let msg = 'حدث خطأ في إنشاء الحساب';
        if (error.code === 'auth/email-already-in-use') {
            msg = 'البريد الإلكتروني مستخدم مسبقاً';
        } else if (error.code === 'auth/weak-password') {
            msg = 'كلمة المرور ضعيفة جداً';
        } else if (error.code === 'auth/invalid-email') {
            msg = 'صيغة البريد الإلكتروني غير صحيحة';
        }
        showToast(msg, 'error');
    }
}

// =============================================
// نظام المصادقة - تسجيل الدخول
// =============================================
async function handleLogin(e) {
    e.preventDefault();
    
    const email = $('#login-email').value.trim();
    const password = $('#login-password').value;

    if (!email || !password) {
        return showToast('جميع الحقول مطلوبة', 'error');
    }

    try {
        showLoading();
        await signInWithEmailAndPassword(auth, email, password);
        showToast('تم تسجيل الدخول بنجاح', 'success');
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('خطأ في الدخول:', error);
        
        let msg = 'بيانات الدخول غير صحيحة';
        if (error.code === 'auth/user-not-found') {
            msg = 'المستخدم غير موجود';
        } else if (error.code === 'auth/wrong-password') {
            msg = 'كلمة المرور خاطئة';
        } else if (error.code === 'auth/invalid-email') {
            msg = 'صيغة البريد الإلكتروني غير صحيحة';
        } else if (error.code === 'auth/too-many-requests') {
            msg = 'محاولات كثيرة، حاول لاحقاً';
        }
        showToast(msg, 'error');
    }
}

// =============================================
// تسجيل الخروج
// =============================================
async function handleLogout() {
    const confirmed = await showConfirm('هل أنت متأكد من تسجيل الخروج؟');
    if (confirmed) {
        try {
            await signOut(auth);
            showToast('تم تسجيل الخروج', 'info');
        } catch (error) {
            showToast('حدث خطأ في تسجيل الخروج', 'error');
        }
    }
}

// =============================================
// صفحة الإعداد الأولي (Onboarding)
// =============================================
function showOnboarding() {
    $('#auth-screen').classList.add('hidden');
    $('#app').classList.add('hidden');
    $('#onboarding-screen').classList.remove('hidden');
    
    // تحديث الصورة الأولية
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
        if (avatarUrl) {
            updateData.avatar = avatarUrl;
        }
        
        await updateDoc(userRef, updateData);
        
        // تحديث userData محلياً
        if (avatarUrl) {
            userData.avatar = avatarUrl;
        }
        userData.onboardingCompleted = true;
        
        $('#onboarding-screen').classList.add('hidden');
        $('#app').classList.remove('hidden');
        
        updateUIWithUserData();
        navigateTo('dashboard');
        showToast('تم إكمال الإعداد بنجاح', 'success');
    } catch (error) {
        console.error('خطأ في إكمال الإعداد:', error);
        showToast('حدث خطأ في حفظ البيانات', 'error');
    }
}

// =============================================
// تحميل بيانات المستخدم
// =============================================
async function loadUserData() {
    if (!currentUser) return;
    
    try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        
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
// تحديث واجهة المستخدم ببيانات المستخدم
// =============================================
function updateUIWithUserData() {
    if (!userData) return;
    
    const avatarUrl = userData.avatar || 
        `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name || 'مستخدم')}&background=D4AF37&color=111&size=200&bold=true&format=svg`;
    
    $('#header-avatar-img').src = avatarUrl;
    $('#sidebar-avatar-img').src = avatarUrl;
    $('#sidebar-username').textContent = userData.name || 'مستخدم';
    $('#sidebar-id').textContent = `ID: ${userData.serialId || '----'}`;
}

// =============================================
// المعادلات المالية - حساب الصافي
// =============================================
function calculateNet(transactions, currency = 'USD') {
    let incoming = 0;   // وارد
    let outgoing = 0;   // صادر
    let sales = 0;      // بيع
    let purchases = 0;  // شراء

    transactions.forEach(t => {
        if (t.currency !== currency) return;
        const amount = parseFloat(t.amount) || 0;
        
        switch (t.type) {
            case 'incoming': incoming += amount; break;
            case 'outgoing': outgoing += amount; break;
            case 'sale': sales += amount; break;
            case 'purchase': purchases += amount; break;
            // الديون والمرتجع لا يدخلون في الصافي
        }
    });

    // الصافي = (الوارد + البيع) - (الصادر + الشراء)
    return (incoming + sales) - (outgoing + purchases);
}

// =============================================
// المعادلات المالية - حساب الأرباح والخسائر
// =============================================
function calculateProfitLoss(transactions, currency = 'USD') {
    let totalProfit = 0;
    let totalLoss = 0;

    transactions.forEach(t => {
        if (t.currency !== currency || t.type !== 'sale') return;
        
        const purchasePrice = parseFloat(t.purchasePrice) || 0;
        const salePrice = parseFloat(t.salePrice) || parseFloat(t.amount) || 0;
        const returned = parseFloat(t.returned) || 0;
        
        // الربح/الخسارة = (سعر البيع - سعر الشراء) - المرتجع
        const result = (salePrice - purchasePrice) - returned;
        
        if (result > 0) {
            totalProfit += result;
        } else {
            totalLoss += Math.abs(result);
        }
    });

    return { profit: totalProfit, loss: totalLoss };
}

// =============================================
// الحصول على تسمية نوع العملية
// =============================================
function getTypeLabel(type) {
    const labels = {
        incoming: 'وارد',
        outgoing: 'صادر',
        sale: 'بيع',
        purchase: 'شراء',
        debt: 'دين',
        returned: 'مرتجع'
    };
    return labels[type] || type;
}

// =============================================
// صفحة لوحة التحكم
// =============================================
function loadDashboardPage() {
    const section = $('#page-dashboard');
    
    // استعلام العمليات الخاصة بالمستخدم
    const q = query(
        collection(db, 'transactions'),
        where('uid', '==', currentUser.uid),
        orderBy('createdAt', 'desc')
    );
    
    // مراقبة لحظية (Real-time)
    onSnapshot(q, (snapshot) => {
        const transactions = [];
        snapshot.forEach(doc => {
            transactions.push({ id: doc.id, ...doc.data() });
        });
        
        const usdNet = calculateNet(transactions, 'USD');
        const sypNet = calculateNet(transactions, 'SYP');
        const usdPL = calculateProfitLoss(transactions, 'USD');
        const sypPL = calculateProfitLoss(transactions, 'SYP');
        
        section.innerHTML = `
            <h2>📊 لوحة التحكم</h2>
            
            <!-- بطاقات إحصائية -->
            <div class="stats-grid">
                <div class="stat-card stat-profit">
                    <div class="stat-value">${formatCurrency(usdPL.profit)}</div>
                    <div class="stat-label">أرباح USD</div>
                </div>
                <div class="stat-card stat-loss">
                    <div class="stat-value">${formatCurrency(usdPL.loss)}</div>
                    <div class="stat-label">خسائر USD</div>
                </div>
                <div class="stat-card stat-net">
                    <div class="stat-value">${formatCurrency(usdNet)}</div>
                    <div class="stat-label">الصافي USD</div>
                </div>
                <div class="stat-card stat-net">
                    <div class="stat-value">${formatCurrency(sypNet, 'SYP')}</div>
                    <div class="stat-label">الصافي SYP</div>
                </div>
            </div>
            
            <!-- جدول آخر العمليات -->
            <h3>📋 آخر العمليات</h3>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>النوع</th>
                            <th>المبلغ</th>
                            <th>العملة</th>
                            <th>التاريخ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${transactions.length === 0 ? 
                            '<tr><td colspan="4" style="color:var(--text-muted);padding:20px;">لا توجد عمليات حتى الآن</td></tr>' :
                            transactions.slice(0, 20).map(t => `
                                <tr>
                                    <td>${getTypeLabel(t.type)}</td>
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
    }, (error) => {
        console.error('خطأ في تحميل العمليات:', error);
        section.innerHTML = `
            <h2>📊 لوحة التحكم</h2>
            <p style="color:var(--text-muted);text-align:center;padding:40px;">حدث خطأ في تحميل البيانات</p>
        `;
    });
}

// =============================================
// صفحة العمليات المالية
// =============================================
function loadTransactionsPage() {
    const section = $('#page-transactions');
    
    section.innerHTML = `
        <h2>💱 العمليات المالية</h2>
        
        <!-- أكورديون إضافة عملية -->
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
                                <option value="USD">💵 USD - دولار</option>
                                <option value="SYP">💷 SYP - ليرة سورية</option>
                            </select>
                            <input type="number" id="trans-purchase-price" placeholder="سعر الشراء (للبيع فقط)" step="0.01">
                        </div>
                        <div class="form-row">
                            <input type="number" id="trans-sale-price" placeholder="سعر البيع (للبيع فقط)" step="0.01">
                            <input type="number" id="trans-returned" placeholder="المرتجع (للبيع فقط)" step="0.01">
                        </div>
                        <input type="text" id="trans-note" placeholder="📝 ملاحظات (اختياري)" style="width:100%;margin-bottom:10px;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-tertiary);color:var(--text-primary);font-size:14px;">
                        <button type="submit" class="btn-primary">💾 حفظ العملية</button>
                    </form>
                </div>
            </div>
        </div>
        
        <!-- جدول العمليات -->
        <div class="table-container" style="margin-top:20px;">
            <table>
                <thead>
                    <tr>
                        <th>النوع</th>
                        <th>المبلغ</th>
                        <th>العملة</th>
                        <th>ملاحظات</th>
                        <th>التاريخ</th>
                        <th>حذف</th>
                    </tr>
                </thead>
                <tbody id="transactions-tbody">
                    <tr><td colspan="6" style="color:var(--text-muted);">⏳ جاري تحميل العمليات...</td></tr>
                </tbody>
            </table>
        </div>
    `;
    
    // حدث فتح/إغلاق الأكورديون
    $('#accordion-toggle-btn').addEventListener('click', () => {
        $('#accordion-add').classList.toggle('open');
    });
    
    // حدث إضافة عملية جديدة
    $('#transaction-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const type = $('#trans-type').value;
        const amount = parseFloat($('#trans-amount').value);
        const currency = $('#trans-currency').value;
        
        if (!type) return showToast('يرجى اختيار نوع العملية', 'error');
        if (!amount || amount <= 0) return showToast('يرجى إدخال مبلغ صحيح', 'error');
        
        try {
            const transactionData = {
                uid: currentUser.uid,
                type: type,
                amount: amount,
                currency: currency,
                purchasePrice: parseFloat($('#trans-purchase-price').value) || 0,
                salePrice: parseFloat($('#trans-sale-price').value) || 0,
                returned: parseFloat($('#trans-returned').value) || 0,
                note: $('#trans-note').value.trim() || '',
                createdAt: serverTimestamp()
            };
            
            await addDoc(collection(db, 'transactions'), transactionData);
            
            showToast('✅ تمت إضافة العملية بنجاح', 'success');
            $('#transaction-form').reset();
            $('#accordion-add').classList.remove('open');
        } catch (error) {
            console.error('خطأ في إضافة العملية:', error);
            showToast('❌ فشل في إضافة العملية', 'error');
        }
    });
    
    // مراقبة لحظية للعمليات
    const q = query(
        collection(db, 'transactions'),
        where('uid', '==', currentUser.uid),
        orderBy('createdAt', 'desc')
    );
    
    onSnapshot(q, (snapshot) => {
        const tbody = $('#transactions-tbody');
        
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="6" style="color:var(--text-muted);padding:20px;">لا توجد عمليات حتى الآن</td></tr>';
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
                <td>
                    <button class="btn-outline delete-trans-btn" data-id="${doc.id}" style="font-size:11px;padding:6px 10px;color:var(--red);border-color:var(--red);">
                        🗑️
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
        
        // أحداث الحذف
        tbody.querySelectorAll('.delete-trans-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                const confirmed = await showConfirm('⚠️ هل أنت متأكد من حذف هذه العملية؟');
                if (confirmed) {
                    try {
                        await deleteDoc(doc(db, 'transactions', id));
                        showToast('🗑️ تم حذف العملية', 'success');
                    } catch (error) {
                        showToast('❌ فشل في حذف العملية', 'error');
                    }
                }
            });
        });
    });
}

// =============================================
// صفحة الديون
// =============================================
function loadDebtsPage() {
    const section = $('#page-debts');
    
    section.innerHTML = `
        <h2>📝 الديون</h2>
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>المبلغ</th>
                        <th>العملة</th>
                        <th>ملاحظات</th>
                        <th>التاريخ</th>
                    </tr>
                </thead>
                <tbody id="debts-tbody">
                    <tr><td colspan="4" style="color:var(--text-muted);">⏳ جاري تحميل الديون...</td></tr>
                </tbody>
            </table>
        </div>
    `;
    
    // استعلام الديون فقط
    const q = query(
        collection(db, 'transactions'),
        where('uid', '==', currentUser.uid),
        where('type', '==', 'debt'),
        orderBy('createdAt', 'desc')
    );
    
    onSnapshot(q, (snapshot) => {
        const tbody = $('#debts-tbody');
        
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="4" style="color:var(--text-muted);padding:20px;">✅ لا توجد ديون مسجلة</td></tr>';
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
                </tr>
            `;
        });
    });
}

// =============================================
// صفحة المحادثة
// =============================================
function loadChatPage() {
    const section = $('#page-chat');
    
    section.innerHTML = `
        <h2>💬 المحادثة</h2>
        <div class="chat-container">
            <div class="chat-messages" id="chat-messages">
                <div style="text-align:center;color:var(--text-muted);padding:20px;">⏳ جاري تحميل المحادثة...</div>
            </div>
            <div class="chat-input-area">
                <input type="text" id="chat-input" placeholder="✍️ اكتب رسالتك هنا...">
                <button id="chat-send" title="إرسال"><i class="fas fa-paper-plane"></i></button>
            </div>
        </div>
    `;
    
    const chatMessages = $('#chat-messages');
    const chatInput = $('#chat-input');
    
    // استعلام جميع الرسائل
    const q = query(
        collection(db, 'messages'),
        orderBy('createdAt', 'asc')
    );
    
    onSnapshot(q, (snapshot) => {
        chatMessages.innerHTML = '';
        
        if (snapshot.empty) {
            chatMessages.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;">💬 لا توجد رسائل. ابدأ محادثة!</div>';
        }
        
        snapshot.forEach(doc => {
            const msg = doc.data();
            const isSent = msg.uid === currentUser.uid;
            
            chatMessages.innerHTML += `
                <div class="chat-msg ${isSent ? 'sent' : 'received'}">
                    <strong>${msg.senderName || 'مستخدم'}</strong>
                    <p>${escapeHtml(msg.text)}</p>
                    <small>${msg.createdAt ? new Date(msg.createdAt.toDate()).toLocaleTimeString('ar-SY', {hour:'2-digit', minute:'2-digit'}) : ''}</small>
                </div>
            `;
        });
        
        // تمرير للأسفل
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
    
    // دالة إرسال رسالة
    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text) return;
        
        if (text.length > 500) {
            return showToast('الرسالة طويلة جداً (الحد الأقصى 500 حرف)', 'error');
        }
        
        try {
            await addDoc(collection(db, 'messages'), {
                uid: currentUser.uid,
                senderName: userData?.name || 'مستخدم',
                text: text,
                createdAt: serverTimestamp()
            });
            chatInput.value = '';
            chatInput.focus();
        } catch (error) {
            console.error('خطأ في الإرسال:', error);
            showToast('❌ فشل في إرسال الرسالة', 'error');
        }
    }
    
    // أحداث الإرسال
    $('#chat-send').addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendMessage();
        }
    });
}

// =============================================
// منع HTML injection في المحادثة
// =============================================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =============================================
// صفحة الإعدادات
// =============================================
function loadSettingsPage() {
    const section = $('#page-settings');
    
    const avatarUrl = userData?.avatar || 
        `https://ui-avatars.com/api/?name=${encodeURIComponent(userData?.name || 'مستخدم')}&background=D4AF37&color=111&size=200&bold=true&format=svg`;
    
    section.innerHTML = `
        <h2>⚙️ الإعدادات</h2>
        <div style="max-width:400px;margin:0 auto;text-align:center;padding:24px;">
            <div class="sidebar-avatar" style="margin:0 auto 16px;width:120px;height:120px;">
                <img id="settings-avatar-img" src="${avatarUrl}" alt="الصورة الشخصية" style="width:100%;height:100%;object-fit:cover;">
            </div>
            <p style="font-size:18px;font-weight:700;">${userData?.name || ''}</p>
            <p style="color:var(--text-muted);">ID: ${userData?.serialId || ''}</p>
            <p style="color:var(--gold);font-weight:600;">${isAdmin ? '👑 مدير النظام (Admin)' : '👤 مستخدم عادي'}</p>
            <p style="color:var(--text-muted);font-size:13px;">${userData?.email || ''}</p>
            
            <button id="change-avatar-btn" class="gold-btn-outline" style="margin-top:20px;">📷 تغيير الصورة الشخصية</button>
            <input type="file" id="settings-avatar-upload" accept="image/*" hidden>
            
            <hr style="border-color:var(--border);margin:24px 0;">
            
            <button id="reset-onboarding-btn" class="btn-outline" style="width:100%;margin-top:8px;">🔄 إعادة ضبط الإعداد الأولي</button>
        </div>
    `;
    
    // حدث تغيير الصورة
    $('#change-avatar-btn').addEventListener('click', () => {
        $('#settings-avatar-upload').click();
    });
    
    $('#settings-avatar-upload').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // التحقق من نوع الملف
        if (!file.type.startsWith('image/')) {
            return showToast('يرجى اختيار ملف صورة صالح', 'error');
        }
        
        // التحقق من الحجم (أقصى 2MB)
        if (file.size > 2 * 1024 * 1024) {
            return showToast('حجم الصورة كبير جداً (الحد الأقصى 2MB)', 'error');
        }
        
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const avatarUrl = ev.target.result;
            
            try {
                await updateDoc(doc(db, 'users', currentUser.uid), { avatar: avatarUrl });
                userData.avatar = avatarUrl;
                updateUIWithUserData();
                $('#settings-avatar-img').src = avatarUrl;
                showToast('✅ تم تحديث الصورة الشخصية', 'success');
            } catch (error) {
                showToast('❌ فشل في تحديث الصورة', 'error');
            }
        };
        reader.readAsDataURL(file);
    });
    
    // حدث إعادة ضبط الإعداد الأولي
    $('#reset-onboarding-btn').addEventListener('click', async () => {
        const confirmed = await showConfirm('هل أنت متأكد من إعادة ضبط الإعداد الأولي؟ سيُطلب منك اختيار صورة جديدة.');
        if (confirmed) {
            try {
                await updateDoc(doc(db, 'users', currentUser.uid), { onboardingCompleted: false });
                userData.onboardingCompleted = false;
                showOnboarding();
                showToast('تم إعادة ضبط الإعداد الأولي', 'info');
            } catch (error) {
                showToast('❌ فشل في إعادة الضبط', 'error');
            }
        }
    });
}

// =============================================
// التنقل بين الصفحات
// =============================================
function navigateTo(page) {
    currentPage = page;
    
    // تحديث أزرار التنقل
    $$('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.page === page) {
            btn.classList.add('active');
        }
    });
    
    // تحديث الصفحات
    $$('.page').forEach(p => p.classList.remove('active'));
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
        case 'chat':
            loadChatPage();
            break;
        case 'settings':
            loadSettingsPage();
            break;
    }
    
    // إغلاق القائمة الجانبية في الجوال
    if (window.innerWidth <= 600) {
        closeSidebar();
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
// الآلة الحاسبة
// =============================================
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
    
    if (key === 'clear') {
        calcExpression = '';
        display.value = '0';
        return;
    }
    
    if (key === '=') {
        try {
            let exp = calcExpression
                .replace(/×/g, '*')
                .replace(/÷/g, '/');
            // eslint-disable-next-line no-eval
            const result = eval(exp);
            if (!isFinite(result)) {
                throw new Error('Invalid result');
            }
            display.value = parseFloat(result.toFixed(10));
            calcExpression = result.toString();
        } catch (error) {
            display.value = 'Error';
            calcExpression = '';
        }
        return;
    }
    
    // منع إدخال عمليتين متتاليتين
    const lastChar = calcExpression.slice(-1);
    const operators = ['+', '-', '*', '/', '×', '÷'];
    if (operators.includes(key) && operators.includes(lastChar)) {
        calcExpression = calcExpression.slice(0, -1);
    }
    
    calcExpression += key;
    display.value = calcExpression;
}

// =============================================
// أحداث DOM عند تحميل الصفحة
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    
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
    
    // ---- القائمة الجانبية ----
    $('#sidebar-toggle').addEventListener('click', toggleSidebar);
    $('#header-avatar').addEventListener('click', toggleSidebar);
    $('.sidebar-overlay').addEventListener('click', closeSidebar);
    
    // إغلاق القائمة بضغط Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebarOpen) {
            closeSidebar();
        }
    });
    
    // ---- أزرار التنقل ----
    $$('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            navigateTo(btn.dataset.page);
        });
    });
    
    // ---- تسجيل الخروج ----
    $('#logout-btn').addEventListener('click', handleLogout);
    
    // ---- الإعداد الأولي (Onboarding) ----
    $('#upload-avatar-btn').addEventListener('click', () => {
        $('#avatar-upload').click();
    });
    
    $('#avatar-upload').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        if (!file.type.startsWith('image/')) {
            return showToast('يرجى اختيار ملف صورة صالح', 'error');
        }
        
        const reader = new FileReader();
        reader.onload = (ev) => {
            $('#onboarding-avatar-img').src = ev.target.result;
            // حفظ الصورة مباشرة
            completeOnboarding(ev.target.result);
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
    
    // إغلاق الحاسبة بضغط Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && calculatorOpen) {
            toggleCalculator();
        }
    });
    
    // ---- مراقب حالة المصادقة ----
    onAuthStateChanged(auth, async (user) => {
        hideLoading();
        
        if (user) {
            currentUser = user;
            const exists = await loadUserData();
            
            if (exists && userData.onboardingCompleted) {
                // مستخدم مكتمل الإعداد
                $('#auth-screen').classList.add('hidden');
                $('#onboarding-screen').classList.add('hidden');
                $('#app').classList.remove('hidden');
                updateUIWithUserData();
                navigateTo('dashboard');
            } else if (exists && !userData.onboardingCompleted) {
                // يحتاج إكمال الإعداد
                showOnboarding();
            } else {
                // مستخدم جديد بدون وثيقة (حالة نادرة)
                showOnboarding();
            }
        } else {
            // غير مسجل دخول
            currentUser = null;
            userData = null;
            isAdmin = false;
            $('#app').classList.add('hidden');
            $('#onboarding-screen').classList.add('hidden');
            $('#auth-screen').classList.remove('hidden');
        }
    });
});

// =============================================
// تصدير الدوال للاستخدام العام (اختياري)
// =============================================
export {
    navigateTo,
    showToast,
    showConfirm,
    formatCurrency,
    getTypeLabel
};
