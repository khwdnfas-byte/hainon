<script type="module">
  // Import the functions you need from the SDKs you need
  import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
  import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-analytics.js";
  // TODO: Add SDKs for Firebase products that you want to use
  // https://firebase.google.com/docs/web/setup#available-libraries

  // Your web app's Firebase configuration
  // For Firebase JS SDK v7.20.0 and later, measurementId is optional
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

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const analytics = getAnalytics(app);
</script>
