// CONFIGURATION: تهيئة إعدادات الاتصال بقاعدة بيانات جيت هاب السحابية فايبربيس
const firebaseConfig = {
    apiKey: "AIzaSyBq44Imnsa8wqenolMJ8wkK92VqYl5eAlM",
    authDomain: "hainon-app.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
    projectId: "hainon-app",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// تشغيل Firebase المباشر
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

// متغيرات جلوبال لإدارة حالة التطبيق الحالية
let currentUser = null;
let userData = null;
let isSignUpMode = false;
let allTransactions = {};

// دالة فحص وتأمين شاشة الحسابات والتأكد من تسجيل الدخول
auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        db.ref('users/' + user.uid).on('value', snapshot => {
            userData = snapshot.val();
            if (!userData) {
                db.ref('users').once('value', usersSnapshot => {
                    let count = usersSnapshot.numChildren() || 0;
                    let isFirst = (count === 0);
                    
                    userData = {
                        username: document.getElementById('auth-username').value || user.email.split('@')[0],
                        email: user.email,
                        uid: user.uid,
                        registrationOrder: count + 1,
                        customId: isFirst ? "0000" : generateRandomId(),
                        isAdmin: isFirst,
                        avatar: "https://via.placeholder.com/100/1a1a1a/d4af37?text=H"
                    };
                    db.ref('users/' + user.uid).set(userData);
                });
            } else {
                updateUIForUser();
            }
        });
    } else {
        document.getElementById('auth-screen').classList.remove('hidden');
        document.getElementById('app-screen').classList.add('hidden');
    }
});

function generateRandomId() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

function toggleAuthMode() {
    isSignUpMode = !isSignUpMode;
    const nameField = document.getElementById('name-field-group');
    const authTitle = document.getElementById('btn-primary-auth');
    const toggleText = document.getElementById('auth-toggle-text');
    
    if (isSignUpMode) {
        nameField.classList.remove('hidden');
        authTitle.innerText = "إنشاء حساب وموافاة التحقق";
        toggleText.innerText = "لديك حساب بالفعل؟ سجل دخولك";
    } else {
        nameField.classList.add('hidden');
        authTitle.innerText = "تسجيل الدخول";
        toggleText.innerText = "ليس لديك حساب؟ سجل الآن";
    }
}

function handleAuthAction() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    
    if (!email || !password) return alert("الرجاء ملء الحقول المطلوبة!");

    if (isSignUpMode) {
        auth.createUserWithEmailAndPassword(email, password)
            .then(result => {
                result.user.sendEmailVerification().then(() => {
                    alert("تم إرسال رابط التحقق بنجاح إلى بريدك الإلكتروني! يرجى تفعيل الحساب قبل تسجيل الدخول.");
                    auth.signOut();
                    toggleAuthMode();
                });
            }).catch(err => alert("خطأ في الإنشاء: " + err.message));
    } else {
        auth.signInWithEmailAndPassword(email, password)
            .then(result => {
                if (!result.user.emailVerified) {
                    alert("لم يتم تفعيل الحساب! يرجى مراجعة بريدك الإلكتروني والضغط على رابط التحقق أولاً.");
                    auth.signOut();
                }
            }).catch(err => alert("خطأ في تسجيل الدخول: " + err.message));
    }
}

function handleForgotPassword() {
    const email = document.getElementById('auth-email').value;
    if (!email) return alert("اكتب بريدك الإلكتروني أولاً في حقل الإدخال ليتم إرسال رابط الاستعادة إليه.");
    auth.sendPasswordResetEmail(email)
        .then(() => alert("تم إرسال رابط استعادة كلمة المرور لبريدك، تفقد صندوق الوارد."))
        .catch(err => alert("حدث خطأ: " + err.message));
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('active');
}

function switchSection(sectionId) {
    document.querySelectorAll('.app-section').forEach(sec => sec.classList.add('hidden'));
    document.getElementById('section-' + sectionId).classList.remove('hidden');
    toggleSidebar();
}

function updateUIForUser() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');
    
    document.getElementById('sidebar-username').innerText = userData.username;
    document.getElementById('sidebar-uid').innerText = "ID: " + userData.customId;
    document.getElementById('user-avatar').src = userData.avatar;
    
    if (userData.isAdmin && userData.customId === "0000") {
        document.getElementById('menu-admin-panel').classList.remove('hidden');
        loadAdminUsersList();
    } else {
        document.getElementById('menu-admin-panel').classList.add('hidden');
    }

    loadTransactions();
    loadCustomersAndMerchants('customers');
    loadCustomersAndMerchants('merchants');
}

function triggerEditName() {
    document.getElementById('modal-edit-name').classList.remove('hidden');
    document.getElementById('new-username-input').value = userData.username;
}
function closeModal() { document.getElementById('modal-edit-name').classList.add('hidden'); }
function saveNewUsername() {
    const newName = document.getElementById('new-username-input').value;
    if (!newName) return;
    db.ref('users/' + currentUser.uid + '/username').set(newName).then(() => {
        closeModal();
    });
}

function uploadAvatar(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const base64Image = e.target.result;
            db.ref('users/' + currentUser.uid + '/avatar').set(base64Image);
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function loadTransactions() {
    db.ref('transactions/' + currentUser.uid).on('value', snapshot => {
        allTransactions = snapshot.val() || {};
        renderMainDashboard();
        renderRecordsArchive();
    });
}

function renderMainDashboard() {
    const todayStr = getTodayDateString();
    const todayTableBody = document.getElementById('today-tx-table');
    todayTableBody.innerHTML = '';
    
    let totalIn = 0, totalOut = 0, totalProfit = 0, totalLoss = 0;
    
    Object.keys(allTransactions).forEach(id => {
        const tx = allTransactions[id];
        
        if (tx.type === 'in') totalIn += parseFloat(tx.amount);
        if (tx.type === 'out') totalOut += parseFloat(tx.amount);
        if (tx.type === 'profit') totalProfit += parseFloat(tx.amount);
        if (tx.type === 'loss') totalLoss += parseFloat(tx.amount);
        
        if (tx.systemDate === todayStr) {
            let row = `<tr>
                <td>${tx.title}</td>
                <td>${parseFloat(tx.amount).toFixed(2)}</td>
                <td>${getTransactionTypeBadge(tx.type)}</td>
                <td>${tx.systemTime} ${tx.modifiedAt ? `<span class="badge-modified">(تم التعديل: ${tx.modifiedAt})</span>` : ''}</td>
                <td class="actions-btns">
                    <button onclick="editTransaction('${id}')">✏️</button>
                    <button onclick="deleteTransaction('${id}')">🗑️</button>
                </td>
            </tr>`;
            todayTableBody.innerHTML += row;
        }
    });
    
    document.getElementById('stat-total-in').innerText = totalIn.toFixed(2);
    document.getElementById('stat-total-out').innerText = totalOut.toFixed(2);
    document.getElementById('stat-total-profit').innerText = (totalProfit + (totalIn - totalOut)).toFixed(2);
    document.getElementById('stat-total-loss').innerText = totalLoss.toFixed(2);
}

function saveTransaction() {
    const title = document.getElementById('tx-title').value;
    const amount = document.getElementById('tx-amount').value;
    const type = document.getElementById('tx-type').value;
    const customDate = document.getElementById('tx-custom-date').value;
    const notes = document.getElementById('tx-notes').value;
    const editingId = document.getElementById('editing-tx-id').value;
    
    if (!title || !amount) return alert("الرجاء ملء اسم العملية والمبلغ!");
    
    const now = new Date();
    const todayStr = getTodayDateString();
    const time
