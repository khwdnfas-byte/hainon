// =============================================
// HAINON - إعدادات Firebase
// نظام المحاسبة والإدارة المالية
// =============================================

// استيراد خدمات Firebase من CDN (الإصدار 10.8.0)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getDatabase, ref, onDisconnect, set, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// =============================================
// إعدادات مشروع HAINON - المفاتيح الحقيقية
// =============================================
const firebaseConfig = {
  apiKey: "AIzaSyB5VEhL-h84y4vzGuQRTTZra93DWLTyap4",
  authDomain: "hainon-7c27d.firebaseapp.com",
  databaseURL: "https://hainon-7c27d-default-rtdb.firebaseio.com",
  projectId: "hainon-7c27d",
  storageBucket: "hainon-7c27d.firebasestorage.app",
  messagingSenderId: "240531479138",
  appId: "1:240531479138:web:7e7a7d2788440728fd0f3b",
  measurementId: "G-RYFVGRCYWP"
};

// =============================================
// تهيئة Firebase
// =============================================
const app = initializeApp(firebaseConfig);

// =============================================
// تصدير الخدمات الرئيسية
// =============================================

// خدمة المصادقة (تسجيل الدخول، إنشاء حساب، استعادة كلمة مرور)
export const auth = getAuth(app);

// قاعدة البيانات الرئيسية Firestore (العمليات المالية، المستخدمين، الرسائل)
export const db = getFirestore(app);

// قاعدة البيانات اللحظية Realtime Database (حالة الاتصال، المراقبة المباشرة)
export const rtdb = getDatabase(app);

// دوال مساعدة لحالة الاتصال
export const presenceRef = (uid) => ref(rtdb, `presence/${uid}`);

// تصدير التطبيق الأساسي
export default app;
