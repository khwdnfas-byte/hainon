/*
 | HAINON © 2026 جميع الحقوق محفوظة
 | لا يُسمح بنسخ أو توزيع أو استخدام هذا الملف أو أي جزء من الكود دون إذن كتابي صريح.
 | هذا الملف جزء من نظام HAINON المحاسبي.
*/
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

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

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);

export const EMAILJS_PUBLIC_KEY = "ILfMM-EFqQXbiBmeZ";
export const EMAILJS_SERVICE_ID = "service_91tlpl2";
export const EMAILJS_TEMPLATE_ID = "template_f7rs16k";