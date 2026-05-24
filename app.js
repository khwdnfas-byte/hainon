import { auth, db, storage } from './firebase.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref as dbRef, set, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { ref as storRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// الدخول وإنشاء الحساب
document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-password').value;
    if (pass.length < 6 || !/[a-zA-Z]/.test(pass)) return alert("كلمة المرور ضعيفة!");
    
    document.getElementById('login-btn').innerText = "جاري الدخول...";
    try { await signInWithEmailAndPassword(auth, email, pass); } 
    catch { await createUserWithEmailAndPassword(auth, email, pass); }
});

// معالجة "نسيت كلمة المرور"
document.getElementById('forgot-pass').addEventListener('click', (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    if (!email) return alert("يرجى كتابة بريدك الإلكتروني في الحقل أعلاه أولاً");
    
    sendPasswordResetEmail(auth, email)
        .then(() => alert("تم إرسال رابط إعادة التعيين إلى بريدك الإلكتروني!"))
        .catch((e) => alert("خطأ: " + e.message));
});

// التعامل مع حالة المستخدم
onAuthStateChanged(auth, async (user) => {
    if (user) {
        document.getElementById('auth-screen').classList.add('hidden');
        const snapshot = await get(dbRef(db, 'users/' + user.uid));
        if (!snapshot.exists()) document.getElementById('profile-setup-screen').classList.remove('hidden');
        else updateUI(snapshot.val());
    }
});

// حفظ البيانات
document.getElementById('save-pic-btn').addEventListener('click', async () => {
    const file = document.getElementById('profile-pic-input').files[0];
    let url = "";
    if (file) {
        const sRef = storRef(storage, 'avatars/' + auth.currentUser.uid);
        await uploadBytes(sRef, file);
        url = await getDownloadURL(sRef);
    }
    const userData = { 
        name: auth.currentUser.email.split('@')[0], 
        photoURL: url, 
        serial: 11110 + Math.floor(Math.random() * 900) 
    };
    await set(dbRef(db, 'users/' + auth.currentUser.uid), userData);
    document.getElementById('profile-setup-screen').classList.add('hidden');
    updateUI(userData);
});

function updateUI(data) {
    document.getElementById('app-screen').classList.remove('hidden');
    const html = data.photoURL ? `<img src="${data.photoURL}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">` : "👤";
    document.getElementById('top-avatar').innerHTML = html;
    document.getElementById('sidebar-avatar').innerHTML = html;
    document.getElementById('sidebar-name').innerText = data.name;
    document.getElementById('sidebar-id').innerText = "ID: " + data.serial;
}

document.getElementById('menu-btn').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('active'));
document.getElementById('logout-btn').addEventListener('click', () => signOut(auth).then(() => location.reload()));
