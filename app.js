import { db } from './firebase.js';
import { collection, addDoc, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');

// التحقق من الدخول
document.getElementById('enter-btn').onclick = async () => {
    const input = document.getElementById('access-key').value;
    const hash = await hashPassword(input);
    
    if (!localStorage.getItem('admin_hash')) {
        localStorage.setItem('admin_hash', hash);
        alert("تم تعيين كلمة السر بنجاح!");
    }

    if (localStorage.getItem('admin_hash') === hash) {
        localStorage.setItem('is_auth', 'true');
        location.reload();
    } else {
        alert("خطأ في كلمة السر");
    }
};

if (localStorage.getItem('is_auth') === 'true') {
    authScreen.classList.add('hidden');
    appScreen.classList.remove('hidden');
}

document.getElementById('logout-btn').onclick = () => {
    localStorage.removeItem('is_auth');
    location.reload();
};

// --- 2. نظام العمليات المالية (الأكورديون) ---
const accHeader = document.querySelector('.accordion-header');
const accContent = document.querySelector('.accordion-content');

accHeader.onclick = () => {
    accContent.style.display = (accContent.style.display === 'block') ? 'none' : 'block';
};

// زر حفظ العملية (النسخة المربوطة بـ Firebase)
document.getElementById('add-op-btn').onclick = async () => {
    const type = document.getElementById('op-type').value;
    const amount = document.getElementById('op-amount').value;
    const desc = document.getElementById('op-desc').value;

    if (!amount) {
        alert("يرجى إدخال المبلغ!");
        return;
    }

    try {
        await addDoc(collection(db, "transactions"), {
            type: type,
            amount: parseFloat(amount),
            desc: desc,
            timestamp: new Date()
        });
        alert("تم حفظ العملية في قاعدة البيانات بنجاح!");
        document.getElementById('op-amount').value = '';
        document.getElementById('op-desc').value = '';
    } catch (e) {
        console.error("خطأ أثناء الإرسال: ", e);
        alert("حدث خطأ أثناء الاتصال بقاعدة البيانات");
    }
};
// جلب وعرض العمليات من Firebase تلقائياً
const q = query(collection(db, "transactions"), orderBy("timestamp", "desc"));

onSnapshot(q, (snapshot) => {
    const tbody = document.getElementById('transactions-body');
    tbody.innerHTML = ''; // تفريغ الجدول لتحديثه بالبيانات الجديدة
    
    snapshot.forEach((doc) => {
        const data = doc.data();
        tbody.innerHTML += `
            <tr>
                <td>${data.type}</td>
                <td>${data.amount}</td>
                <td>${data.desc || '-'}</td>
            </tr>
        `;
    });
});
