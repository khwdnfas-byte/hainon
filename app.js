import { auth, db } from './firebase.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, addDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

document.querySelector('.accordion-btn').onclick=()=>{
const box=document.querySelector('.accordion-content');
box.style.display=box.style.display==='block'?'none':'block';
};

document.getElementById('registerBtn').onclick=async()=>{
await createUserWithEmailAndPassword(auth,email.value,password.value);
alert('تم إنشاء الحساب');
};

document.getElementById('loginBtn').onclick=async()=>{
await signInWithEmailAndPassword(auth,email.value,password.value);
};

document.getElementById('logoutBtn').onclick=async()=>{
await signOut(auth);
};

onAuthStateChanged(auth,(user)=>{
if(user){
document.getElementById('authBox').classList.add('hidden');
document.getElementById('app').classList.remove('hidden');
}else{
document.getElementById('authBox').classList.remove('hidden');
document.getElementById('app').classList.add('hidden');
}
});

let selectedType='income';

document.querySelectorAll('.operation-card').forEach(card=>{
card.onclick=()=>{
selectedType=card.dataset.type;
};
});

document.getElementById('operationForm').addEventListener('submit',async(e)=>{
e.preventDefault();

await addDoc(collection(db,'operations'),{
title:title.value,
amount:Number(amount.value),
currency:currency.value,
type:selectedType,
createdAt:new Date().toISOString()
});

alert('تم حفظ العملية');
});

document.getElementById('notificationToggle').onclick=async()=>{
const permission=await Notification.requestPermission();

if(permission==='granted'){
new Notification('تم تفعيل الإشعارات');
}
};
