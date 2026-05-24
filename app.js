// دالة تشفير كلمة السر (SHA-256)
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');
const enterBtn = document.getElementById('enter-btn');
const keyInput = document.getElementById('access-key');

// التحقق من الدخول
enterBtn.onclick = async () => {
    const userInput = keyInput.value;
    const hashedInput = await hashPassword(userInput);
    
    // حفظ البصمة في المتصفح لأول مرة (نظام الأدمن)
    if (!localStorage.getItem('admin_hash')) {
        localStorage.setItem('admin_hash', hashedInput);
        alert("تم تعيين مفتاح الدخول بنجاح!");
    }

    // مطابقة البصمة
    if (localStorage.getItem('admin_hash') === hashedInput) {
        localStorage.setItem('is_auth', 'true');
        location.reload();
    } else {
        alert("مفتاح خاطئ!");
    }
};

// حماية الشاشة
if (localStorage.getItem('is_auth') === 'true') {
    authScreen.classList.add('hidden');
    appScreen.classList.remove('hidden');
}

// زر الخروج
document.getElementById('logout-btn').onclick = () => {
    localStorage.removeItem('is_auth');
    location.reload();
};
