// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyD4mmns8wqenoLMJ8wwk92Vqy15eALM",
    authDomain: "hainon-app.firebaseapp.com",
    databaseURL: "https://hainon-app-default-rtdb.firebaseio.com",
    projectId: "hainon-app",
    storageBucket: "hainon-app.appspot.com",
    messagingSenderId: "50594865852",
    appId: "1:50594865852:web:dc652c1f6d40c194b666b9"
};

// تهيئة التطبيق
const app = initializeApp(firebaseConfig);

// تصدير الخدمات للعمل في باقي الملفات
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
