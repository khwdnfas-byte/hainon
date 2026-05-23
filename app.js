import { db } from './firebase.js';

import {
collection,
addDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const accordionBtn = document.querySelector('.accordion-btn');
const accordionContent = document.querySelector('.accordion-content');

accordionBtn.onclick = () => {

if(accordionContent.style.display === 'grid'){
accordionContent.style.display = 'none';
}else{
accordionContent.style.display = 'grid';
}

};

let selectedType = null;

document.querySelectorAll('.operation-card').forEach(card => {

card.onclick = () => {

selectedType = card.dataset.type;

document.querySelectorAll('.operation-card').forEach(c=>{
c.style.border = 'none';
});

card.style.border = '2px solid #d4af37';

};

});

const form = document.getElementById('operationForm');

form.addEventListener('submit', async(e)=>{

e.preventDefault();

if(!selectedType){
alert('اختر نوع العملية أولاً');
return;
}

const title = document.getElementById('title').value;
const amount = Number(document.getElementById('amount').value);
const currency = document.getElementById('currency').value;

await addDoc(collection(db,'operations'),{
title,
amount,
currency,
type:selectedType,
createdAt:new Date().toISOString()
});

alert('تم حفظ العملية');

form.reset();

});

const notificationBtn = document.getElementById('notificationToggle');

notificationBtn.onclick = async()=>{

if(!('Notification' in window)){
alert('المتصفح لا يدعم الإشعارات');
return;
}

const permission = await Notification.requestPermission();

if(permission === 'granted'){
localStorage.setItem('notifications','enabled');
notificationBtn.innerHTML='🔔 الإشعارات مفعلة';

new Notification('تم تفعيل إشعارات HAINON');
}else{
notificationBtn.innerHTML='🔕 الإشعارات متوقفة';
}

};