import { auth, db } from './firebase.js';

import {
createUserWithEmailAndPassword,
signInWithEmailAndPassword,
signOut,
onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

import {
collection,
addDoc,
onSnapshot,
query,
orderBy
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

registerBtn.onclick = async()=>{
await createUserWithEmailAndPassword(auth,email.value,password.value);
alert('تم إنشاء الحساب');
};

loginBtn.onclick = async()=>{
await signInWithEmailAndPassword(auth,email.value,password.value);
};

logoutBtn.onclick = async()=>{
await signOut(auth);
};

onAuthStateChanged(auth,(user)=>{
if(user){
authBox.classList.add('hidden');
app.classList.remove('hidden');
loadOperations();
}else{
authBox.classList.remove('hidden');
app.classList.add('hidden');
}
});

document.querySelector('.accordion-btn').onclick=()=>{
const box=document.querySelector('.accordion-content');
box.style.display=box.style.display==='grid'?'none':'grid';
};

let selectedType='income';

document.querySelectorAll('.operation-card').forEach(card=>{
card.onclick=()=>{
selectedType=card.dataset.type;
};
});

operationForm.addEventListener('submit',async(e)=>{
e.preventDefault();

await addDoc(collection(db,'operations'),{
title:title.value,
amount:Number(amount.value),
currency:currency.value,
type:selectedType,
createdAt:new Date().toISOString()
});

operationForm.reset();
});

function loadOperations(){

const q=query(collection(db,'operations'),orderBy('createdAt','desc'));

onSnapshot(q,(snapshot)=>{

operationsList.innerHTML='';

let income=0;
let expense=0;
let profit=0;

snapshot.forEach(doc=>{

const data=doc.data();

operationsList.innerHTML += `
<div class="operation-item">
<b>${data.title}</b><br>
${data.amount} ${data.currency}<br>
${data.type}
</div>
`;

if(data.type==='income') income += data.amount;
if(data.type==='expense') expense += data.amount;
if(data.type==='sale') profit += data.amount;
if(data.type==='purchase') profit -= data.amount;

});

incomeCard.innerText=income;
expenseCard.innerText=expense;
profitCard.innerText=profit;
netCard.innerText=income-expense;

});

}

notificationToggle.onclick = async()=>{

const permission = await Notification.requestPermission();

if(permission==='granted'){
new Notification('تم تفعيل إشعارات HAINON');
}

};
