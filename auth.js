// auth.js — المصادقة الكاملة وإدارة الحساب الشخصي
import { auth, db } from './firebase-config.js';
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  updateProfile, updateEmail, updatePassword,
  reauthenticateWithCredential, EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  doc, setDoc, getDoc, collection, query, where, serverTimestamp, updateDoc, getDocs
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  $, showToast, showLoading, hideLoading, showConfirm, validatePassword,
  generateCode, generateSerialId, sendEmailCode, escapeHtml
} from './utils.js';

// ---------- تخزين مؤقت للرموز ----------
const pendingCodes = {};

function storeEmailForResend(email) {
  if (email) localStorage.setItem('lastVerificationEmail', email);
}
function getStoredEmailForResend() {
  return localStorage.getItem('lastVerificationEmail') || '';
}

// ========== تسجيل مستخدم جديد ==========
export async function handleRegister(e) {
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
    const serialId = generateSerialId();
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=D4AF37&color=111&size=200&bold=true&format=svg`;

    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid, name, email, serialId,
      role: 'user', avatar: avatarUrl,
      onboardingCompleted: false, emailVerified: false,
      createdAt: serverTimestamp(), lastLogin: serverTimestamp(),
      bio: '',
      privacy: {
        whoCanSeeProfile: 'everyone',
        whoCanSendFriend: 'everyone',
        showStatus: false,
        showLastSeen: false
      }
    });

    await updateProfile(user, { displayName: name });

    const code = generateCode();
    pendingCodes[email] = { code, expires: Date.now() + 10 * 60 * 1000 };
    storeEmailForResend(email);
    const sent = await sendEmailCode(email, code);

    hideLoading();
    if (sent) {
      showToast('تم إنشاء الحساب. تم إرسال رمز تأكيد إلى بريدك', 'success');
    } else {
      showToast('تم إنشاء الحساب لكن فشل إرسال رمز التأكيد', 'error');
    }
    showVerifyEmailScreen();
  } catch (error) {
    hideLoading();
    let msg = error.message;
    if (error.code === 'auth/email-already-in-use') msg = 'البريد الإلكتروني مستخدم مسبقاً';
    else if (error.code === 'auth/weak-password') msg = 'كلمة المرور ضعيفة جداً';
    showToast(msg, 'error');
  }
}

// ========== تسجيل الدخول ==========
export async function handleLogin(e) {
  e.preventDefault();
  const email = $('#login-email').value.trim();
  const password = $('#login-password').value;

  if (!email || !password) return showToast('جميع الحقول مطلوبة', 'error');

  try {
    showLoading();
    await signInWithEmailAndPassword(auth, email, password);
    hideLoading();
    showToast('تم تسجيل الدخول', 'success');
  } catch (error) {
    hideLoading();
    let msg = 'بيانات الدخول غير صحيحة';
    if (error.code === 'auth/user-not-found') msg = 'المستخدم غير موجود';
    else if (error.code === 'auth/wrong-password') msg = 'كلمة المرور خاطئة';
    else if (error.code === 'auth/too-many-requests') msg = 'محاولات كثيرة، حاول لاحقاً';
    showToast(msg, 'error');
  }
}

// ========== تسجيل الخروج ==========
export async function handleLogout() {
  const confirmed = await showConfirm('هل أنت متأكد من تسجيل الخروج؟');
  if (confirmed) {
    await signOut(auth);
    showToast('تم تسجيل الخروج', 'info');
  }
}

// ========== تأكيد البريد الإلكتروني ==========
function showVerifyEmailScreen() {
  $('#auth-screen').classList.add('hidden');
  $('#app').classList.add('hidden');
  $('#onboarding-screen').classList.add('hidden');
  $('#verify-email-screen').classList.remove('hidden');
}

export async function verifyEmailCode() {
  const code = $('#verify-code-input').value.trim();
  if (code.length !== 6) return showToast('أدخل رمزاً مكوناً من 6 أرقام', 'error');
  const email = auth.currentUser?.email;
  if (!email) return;
  const pending = pendingCodes[email];
  if (!pending || Date.now() > pending.expires) return showToast('انتهت صلاحية الرمز', 'error');
  if (pending.code !== code) return showToast('الرمز غير صحيح', 'error');
  delete pendingCodes[email];
  try {
    await updateDoc(doc(db, 'users', auth.currentUser.uid), { emailVerified: true });
    showToast('تم تأكيد البريد بنجاح', 'success');
    $('#verify-email-screen').classList.add('hidden');
    document.dispatchEvent(new CustomEvent('email-verified'));
  } catch (e) {
    showToast('فشل في تحديث الحالة', 'error');
  }
}

export async function resendVerificationCode() {
  const email = getStoredEmailForResend() || auth.currentUser?.email || '';
  if (!email) return showToast('البريد غير متوفر', 'error');
  const code = generateCode();
  pendingCodes[email] = { code, expires: Date.now() + 10 * 60 * 1000 };
  const sent = await sendEmailCode(email, code);
  if (sent) showToast('تم إعادة إرسال الرمز', 'success');
}

// ========== نسيت كلمة المرور ==========
export async function handleForgotPassword() {
  const email = $('#forgot-email').value.trim();
  if (!email) return showToast('أدخل بريدك الإلكتروني', 'error');
  const usersSnapshot = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
  if (usersSnapshot.empty) return showToast('البريد غير مسجل', 'error');
  const code = generateCode();
  pendingCodes[email] = { code, expires: Date.now() + 10 * 60 * 1000, type: 'reset' };
  storeEmailForResend(email);
  const sent = await sendEmailCode(email, code);
  if (sent) {
    showToast('تم إرسال رمز التحقق إلى بريدك', 'success');
    $('#forgot-password-modal').classList.add('hidden');
    $('#reset-password-modal').classList.remove('hidden');
    $('#reset-password-modal').dataset.email = email;
  }
}

export async function handleResetPassword() {
  const email = $('#reset-password-modal').dataset.email;
  const enteredCode = $('#reset-code-input').value.trim();
  const newPass = $('#reset-new-password').value;
  const confirmPass = $('#reset-confirm-password').value;
  if (!email || !enteredCode || !newPass || !confirmPass) return showToast('جميع الحقول مطلوبة', 'error');
  if (newPass !== confirmPass) return showToast('كلمتا المرور غير متطابقتين', 'error');
  if (!validatePassword(newPass)) return showToast('كلمة المرور ضعيفة', 'error');
  const pending = pendingCodes[email];
  if (!pending || pending.type !== 'reset' || Date.now() > pending.expires) return showToast('انتهت صلاحية الرمز', 'error');
  if (pending.code !== enteredCode) return showToast('الرمز غير صحيح', 'error');
  delete pendingCodes[email];
  const tempPass = 'Hainon' + Math.random().toString(36).slice(-6) + '!';
  const sent = await sendEmailCode(email, `كلمة المرور المؤقتة: ${tempPass}\nاستخدمها لتسجيل الدخول ثم قم بتغيير كلمة مرورك فوراً.`);
  if (sent) showToast('تم إرسال كلمة مرور مؤقتة إلى بريدك', 'success');
  else showToast('فشل إرسال كلمة المرور المؤقتة', 'error');
  $('#reset-password-modal').classList.add('hidden');
}

// ========== Onboarding ==========
export function showOnboarding() {
  $('#auth-screen').classList.add('hidden');
  $('#app').classList.add('hidden');
  $('#verify-email-screen').classList.add('hidden');
  $('#onboarding-screen').classList.remove('hidden');
}

export async function completeOnboarding(avatarUrl = null) {
  const user = auth.currentUser;
  if (!user) return;
  const userRef = doc(db, 'users', user.uid);
  const updateData = { onboardingCompleted: true };
  if (avatarUrl) updateData.avatar = avatarUrl;
  await updateDoc(userRef, updateData);
  $('#onboarding-screen').classList.add('hidden');
  $('#app').classList.remove('hidden');
  document.dispatchEvent(new CustomEvent('onboarding-completed'));
}

// ========== إدارة الحساب (الإعدادات) ==========
export async function saveProfile(name, bio, serialId, isAdmin, isSuperMod) {
  const updates = { name, bio };
  if ((isAdmin || isSuperMod) && serialId) updates.serialId = serialId;
  await updateDoc(doc(db, 'users', auth.currentUser.uid), updates);
}

export async function changePassword(currentPass, newPass) {
  const cred = EmailAuthProvider.credential(auth.currentUser.email, currentPass);
  await reauthenticateWithCredential(auth.currentUser, cred);
  await updatePassword(auth.currentUser, newPass);
}

export async function changeEmail(newEmail, password) {
  const cred = EmailAuthProvider.credential(auth.currentUser.email, password);
  await reauthenticateWithCredential(auth.currentUser, cred);
  await updateEmail(auth.currentUser, newEmail);
  await updateDoc(doc(db, 'users', auth.currentUser.uid), { email: newEmail });
}

export async function updateAvatar(dataUrl) {
  await updateDoc(doc(db, 'users', auth.currentUser.uid), { avatar: dataUrl });
}

export async function updateCover(dataUrl) {
  await updateDoc(doc(db, 'users', auth.currentUser.uid), { coverPhoto: dataUrl });
}

export async function updatePrivacy(privacySettings) {
  await updateDoc(doc(db, 'users', auth.currentUser.uid), { privacy: privacySettings });
}