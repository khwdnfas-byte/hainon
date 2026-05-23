import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB8qhLL9i-HXre2DpbJymf69GXAhs-J0cA",
  authDomain: "hainon-app-266f1.firebaseapp.com",
  projectId: "hainon-app-266f1",
  storageBucket: "hainon-app-266f1.firebasestorage.app",
  messagingSenderId: "154652777949",
  appId: "1:154652777949:web:2c716489ad05bae12faa34"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);