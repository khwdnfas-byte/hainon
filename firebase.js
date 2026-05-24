// firebase.js - إعدادات Firebase لمشروع HAINON
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// =============================================
// المفاتيح الحقيقية لمشروع HAINON
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

// تهيئة Firebase
const app = initializeApp(firebaseConfig);

// تصدير خدمات المصادقة وقاعدة البيانات
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
