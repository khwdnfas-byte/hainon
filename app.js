let data = JSON.parse(localStorage.getItem("data")) || []

function save(){
localStorage.setItem("data",JSON.stringify(data))
}

function add(){

let title = document.getElementById("title").value
let amount = document.getElementById("amount").value
let type = document.getElementById("type").value

if(!title || !amount) return

data.unshift({
title,
amount,
type,
date:new Date().toLocaleString()
})

save()
render()

document.getElementById("title").value=""
document.getElementById("amount").value=""
}

function render(){

let list = document.getElementById("list")
list.innerHTML=""

data.forEach(d=>{
list.innerHTML += `
<div class="item">
<b>${d.title}</b><br>
${d.amount} - ${d.type}<br>
<small>${d.date}</small>
</div>
`
})
}

render()

function show(type){
alert("فلترة: " + type)
}
