import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyB5VEhL-h84y4vzGuQRTTZra93DWLTyap4",
  authDomain: "hainon-7c27d.firebaseapp.com",
  databaseURL: "https://hainon-7c27d-default-rtdb.firebaseio.com/",
  projectId: "hainon-7c27d",
  storageBucket: "hainon-7c27d.appspot.com",
  messagingSenderId: "240531479138",
  appId: "1:240531479138:web:7e7a7d2788440728fd0f3b"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getDatabase(app);
export const storage = getStorage(app);
