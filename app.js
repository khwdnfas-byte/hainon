// app.js - النسخة الجديدة والنظيفة
import { auth, db } from './firebase.js';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const $ = (sel) => document.querySelector(sel);

// ربط تسجيل الدخول
$('#login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#login-email').value;
    const pass = $('#login-password').value;
    try {
        await signInWithEmailAndPassword(auth, email, pass);
        alert('تم الدخول بنجاح');
        location.reload(); // تحديث الصفحة بعد الدخول
    } catch (err) { alert('خطأ دخول: ' + err.message); }
});

// ربط إضافة العملية (هنا الحل النهائي للإضافة)
$('#transaction-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        await addDoc(collection(db, 'transactions'), {
            uid: auth.currentUser.uid,
            type: $('#trans-type').value,
            amount: parseFloat($('#trans-amount').value),
            currency: $('#trans-currency').value,
            createdAt: serverTimestamp()
        });
        alert('✅ تمت إضافة العملية!');
        $('#transaction-form').reset();
    } catch (err) { alert('خطأ في الإضافة: ' + err.message); }
});
