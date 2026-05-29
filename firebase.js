// =============================================
// HAINON - إعدادات Firebase
// نظام المحاسبة والإدارة المالية
// =============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// ---------- مفاتيح مشروع HAINON الجديد ----------
const firebaseConfig = {
  apiKey: "AIzaSyB8qhLL9i-HXre2DpbJymf69GXAhs-J0cA",
  authDomain: "hainon-app-266f1.firebaseapp.com",
  projectId: "hainon-app-266f1",
  storageBucket: "hainon-app-266f1.firebasestorage.app",
  messagingSenderId: "154652777949",
  appId: "1:154652777949:web:2c716489ad05bae12faa34",
  measurementId: "G-CJS2Y1MX84"
};

// تهيئة التطبيق
const app = initializeApp(firebaseConfig);

// تصدير الخدمات المطلوبة
export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export default app;
