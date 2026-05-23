// 1. إعدادات الاتصال بفايبربيس السحابية (مفاتيحك الصحيحة 100%)
const firebaseConfig = {
    apiKey: "AIzaSyBq44Imnsa8wqenolMJ8wkK92VqYl5eAlM", 
    authDomain: "hainon-app.firebaseapp.com",
    projectId: "hainon-app",
    databaseURL: "https://hainon-app-default-rtdb.firebaseio.com/"
};

// تشغيل وتفعيل الخدمات السحابية
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

// متغيرات عامة لإدارة النظام
let currentUser = null;
let isLoginMode = true;

// 2. التحويل السلس بين واجهة تسجيل الدخول وإنشاء حساب جديد
function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    const btnAction = document.getElementById('btn-primary-auth');
    const toggleText = document.getElementById('auth-toggle-text');
    const nameField = document.getElementById('name-field-group');

    if (!isLoginMode) {
        btnAction.innerText = "إنشاء الحساب الفخم";
        toggleText.innerText = "لديك حساب بالفعل؟ سجل دخولك";
        if (nameField) nameField.style.display = "block";
    } else {
        btnAction.innerText = "تسجيل الدخول";
        toggleText.innerText = "ليس لديك حساب؟ سجل الآن";
        if (nameField) nameField.style.display = "none";
    }
}

// 3. معالجة الضغط على زر الدخول أو التسجيل
function handleAuthAction() {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const usernameField = document.getElementById('auth-username');
    const username = usernameField ? usernameField.value.trim() : "";

    if (!email || !password) {
        alert("يرجى ملء كافة الحقول الأساسية!");
        return;
    }

    if (isLoginMode) {
        // عملية تسجيل الدخول لحساب موجود
        auth.signInWithEmailAndPassword(email, password)
            .catch(error => alert("خطأ في الدخول: " + error.message));
    } else {
        // عملية إنشاء حساب جديد لأول مرة
        if (!username) { 
            alert("يرجى كتابة اسم المستخدم أولاً!"); 
            return; 
        }
        
        auth.createUserWithEmailAndPassword(email, password)
            .then(cred => {
                // تخزين اسم المستخدم الجديد سحابياً في قاعدة البيانات
                return db.ref('users/' + cred.user.uid).set({
                    username: username,
                    email: email,
                    role: "user",
                    status: "pending",
                    uid: cred.user.uid
                });
            })
            .then(() => {
                alert("تم إنشاء حسابك بنجاح! انتظر تفعيل المسؤول الأعلى للنظام.");
                auth.signOut();
                location.reload();
            })
            .catch(error => alert("خطأ في التسجيل: " + error.message));
    }
}

// 4. مراقبة الجلسة وحالة المستخدم (هل هو داخل النظام أم خارجه؟)
auth.onAuthStateChanged(user => {
    const authScreen = document.getElementById('auth-screen');
    const appScreen = document.getElementById('app-screen');

    if (user) {
        currentUser = user;
        db.ref('users/' + user.uid).once('value', snapshot => {
            const userData = snapshot.val();
            if (userData) {
                // عرض اسم المستخدم والمعرف الشخصي في القائمة الجانبية
                document.getElementById('sidebar-username').innerText = userData.username;
                document.getElementById('sidebar-uid').innerText = "ID: " + user.uid.substring(0, 6).toUpperCase();
                
                // الانتقال الفوري للوحة التحكم وإخفاء شاشة الدخول
                if (authScreen) authScreen.style.display = "none";
                if (appScreen) appScreen.style.display = "block";
                
                // بدء تحميل البيانات والعمليات المالية مباشرة
                loadFinancialData();
            }
        });
    } else {
        // في حال الخروج، يتم قفل الشاشة وإظهار واجهة الدخول فقط
        if (authScreen) authScreen.style.display = "block";
        if (appScreen) appScreen.style.display = "none";
    }
});

// 5. دالة التنقل المرنة بين الأقسام (الرئيسية، السجلات، الزبائن، التقارير)
function switchSection(sectionId) {
    const sections = document.querySelectorAll('.app-section');
    sections.forEach(sec => sec.style.display = "none");
    
    const targetSection = document.getElementById('section-' + sectionId);
    if (targetSection) targetSection.style.display = "block";
}

// 6. استرجاع وتحديث البيانات المالية السحابية بشكل حي ومباشر
function loadFinancialData() {
    db.ref('transactions').on('value', snapshot => {
        let totalIn = 0, totalOut = 0, totalProfit = 0, totalLoss = 0;
        const tbody = document.querySelector('#table-records tbody');
        if (tbody) tbody.innerHTML = "";

        snapshot.forEach(child => {
            const tx = child.val();
            if (tx.type === 'in') totalIn += parseFloat(tx.amount);
            if (tx.type === 'out') totalOut += parseFloat(tx.amount);
            if (tx.type === 'profit') totalProfit += parseFloat(tx.amount);
            if (tx.type === 'loss') totalLoss += parseFloat(tx.amount);

            // بناء أسطر جدول الأرشيف
            if (tbody) {
                const row = `<tr>
                    <td>${tx.title}</td>
                    <td>${parseFloat(tx.amount).toFixed(2)}</td>
                    <td>${tx.type === 'in' ? 'وارد' : tx.type === 'out' ? 'صادر' : tx.type === 'profit' ? 'ربح' : 'خسارة'}</td>
                    <td>${tx.date}</td>
                    <td>${tx.user}</td>
                    <td><button onclick="deleteTx('${child.key}')" style="color:#ff4444; background:none; border:none; cursor:pointer; font-size:16px;">❌</button></td>
                </tr>`;
                tbody.innerHTML += row;
            }
        });

        // تحديث أرقام الكروت الإحصائية الفخمة في الواجهة
        if (document.getElementById('stat-total-in')) document.getElementById('stat-total-in').innerText = totalIn.toFixed(2);
        if (document.getElementById('stat-total-out')) document.getElementById('stat-total-out').innerText = totalOut.toFixed(2);
        if (document.getElementById('stat-total-profit')) document.getElementById('stat-total-profit').innerText = (totalIn - totalOut + totalProfit - totalLoss).toFixed(2);
        if (document.getElementById('stat-total-loss')) document.getElementById('stat-total-loss').innerText = totalLoss.toFixed(2);
    });
}

// 7. إضافة معاملة مالية جديدة وحفظها في السحاب فوراً
function addNewTransaction() {
    const title = document.getElementById('tx-title').value.trim();
    const amount = document.getElementById('tx-amount').value;
    const type = document.getElementById('tx-type').value;
    const customDate = document.getElementById('tx-custom-date').value;
    const username = document.getElementById('sidebar-username').innerText;

    if (!title || !amount) { 
        alert("يرجى إدخال البيان والمبلغ للعملية!"); 
        return; 
    }

    const txDate = customDate || new Date().toISOString().split('T')[0];

    db.ref('transactions').push({
        title: title,
        amount: amount,
        type: type,
        date: txDate,
        user: username
    }).then(() => {
        // تفريغ الخانات بعد الحفظ السحابي الناجح
        document.getElementById('tx-title').value = "";
        document.getElementById('tx-amount').value = "";
    }).catch(err => alert("فشل الحفظ: " + err.message));
}

// 8. حذف معاملة مالية معينة من قاعدة البيانات السحابية
function deleteTx(key) {
    if (confirm("هل أنت متأكد تماماً من حذف هذه المعاملة نهائياً من السحاب؟")) {
        db.ref('transactions/' + key).remove()
            .catch(err => alert("فشل الحذف: " + err.message));
    }
}

// 9. دالة استعادة كلمة المرور وإرسال بريد إلكتروني تلقائي
function handleForgotPassword() {
    const email = document.getElementById('auth-email').value.trim();
    if (!email) { 
        alert("يرجى كتابة بريدك الإلكتروني أولاً في خانة الإدخال!"); 
        return; 
    }
    auth.sendPasswordResetEmail(email)
        .then(() => alert("تم إرسال رابط آمن لإعادة تعيين كلمة المرور إلى بريدك بنجاح!"))
        .catch(err => alert("خطأ: " + err.message));
}

// 10. دالة تسجيل الخروج والعودة لشاشة الدخول الفخمة
function logoutUser() {
    auth.signOut().then(() => {
        location.reload();
    });
                          }
