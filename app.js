import { auth, db, storage } from './firebase.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, query, where, getDocs, addDoc, updateDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// التحقق من كلمة المرور: 6 خانات + حرف إنجليزي على الأقل
const validatePassword = (pass) => {
    const hasEnglishLetter = /[a-zA-Z]/.test(pass);
    return pass.length >= 6 && hasEnglishLetter;
};

// إدارة تسجيل الدخول
document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-password').value;
    
    if (!validatePassword(pass)) {
        alert("كلمة المرور يجب أن تكون 6 خانات على الأقل وتحتوي حرفاً إنجليزياً.");
        return;
    }

    try {
        await signInWithEmailAndPassword(auth, email, pass);
    } catch {
        // إذا فشل الدخول، حاول إنشاء حساب جديد (تجربة)
        try {
            await createUserWithEmailAndPassword(auth, email, pass);
        } catch (e) { alert("خطأ: " + e.message); }
    }
});

// التعامل مع حالة المستخدم
onAuthStateChanged(auth, async (user) => {
    if (user) {
        document.getElementById('auth-screen').classList.add('hidden');
        
        // جلب بيانات المستخدم
        const q = query(collection(db, "users"), where("uid", "==", user.uid));
        const snap = await getDocs(q);
        
        if (snap.empty) {
            // مستخدم جديد: عرض صفحة الصورة
            document.getElementById('profile-setup-screen').classList.remove('hidden');
        } else {
            showApp(snap.docs[0].data());
        }
    }
});

// حفظ الصورة
document.getElementById('save-pic-btn').addEventListener('click', async () => {
    const file = document.getElementById('profile-pic-input').files[0];
    let photoURL = "";
    
    if (file) {
        const storageRef = ref(storage, 'avatars/' + auth.currentUser.uid);
        await uploadBytes(storageRef, file);
        photoURL = await getDownloadURL(storageRef);
    }

    // تسجيل المستخدم في Firestore
    const userData = {
        uid: auth.currentUser.uid,
        email: auth.currentUser.email,
        name: auth.currentUser.email.split('@')[0],
        photoURL: photoURL,
        role: (await getDocs(collection(db, "users"))).size === 0 ? 'admin' : 'user',
        serial: (await getDocs(collection(db, "users"))).size === 0 ? 11110 : Math.floor(Math.random() * 90000)
    };
    
    await addDoc(collection(db, "users"), userData);
    document.getElementById('profile-setup-screen').classList.add('hidden');
    showApp(userData);
});

// عرض التطبيق وتوزيع الصورة
function showApp(userData) {
    document.getElementById('app-screen').classList.remove('hidden');
    
    // وضع الصورة في المكانين
    const imgHTML = userData.photoURL ? `<img src="${userData.photoURL}" style="width:100%; height:100%; border-radius:50%">` : "👤";
    document.getElementById('top-avatar').innerHTML = imgHTML;
    document.getElementById('sidebar-avatar').innerHTML = imgHTML;
    
    document.getElementById('sidebar-name').innerText = userData.name;
    document.getElementById('sidebar-id').innerText = "ID: " + userData.serial;
}

// القائمة الجانبية
document.getElementById('menu-btn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('active');
});

document.getElementById('logout-btn').addEventListener('click', () => signOut(auth).then(() => location.reload()));
