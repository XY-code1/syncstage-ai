import {spawn} from 'node:child_process'
import {mkdtempSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--remote-debugging-port=9355','--user-data-dir='+mkdtempSync(join(tmpdir(),'sync-layout-')),'about:blank'],{stdio:'ignore'})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
let socket
try {
 let pages;for(let i=0;i<40;i++){try{pages=await(await fetch('http://127.0.0.1:9355/json')).json();break}catch{await sleep(250)}}
 socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl)
 await new Promise(r=>socket.addEventListener('open',r))
 const pending=new Map();let id=0
 socket.addEventListener('message',e=>{const p=JSON.parse(e.data);if(p.id)pending.get(p.id)?.(p.error ? {protocolError:p.error} : p.result)})
 const send=(method,params={})=>new Promise(r=>{const n=++id;pending.set(n,r);socket.send(JSON.stringify({id:n,method,params}))})
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true});if(!r?.result)throw Error(JSON.stringify(r));return r.result.value}
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
 const navigate=async path=>{await send('Page.navigate',{url:'http://127.0.0.1:5173/#'+path});await sleep(1000)}
 const check=async(expression,label)=>{if(!await evaluate(`Boolean(${expression})`))throw Error(label);console.log('PASS '+label)}
 const shot=async name=>{const s=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(join(process.cwd(),'../docs/screenshots/phase2-'+name+'.png'),Buffer.from(s.data,'base64'))}
 const click=async text=>{await evaluate(`[...document.querySelectorAll('button,a')].find(b=>b.innerText.includes(${JSON.stringify(text)})).click()`);await sleep(700)}

 await navigate('/messages')
 await check('document.body.innerText.includes("今晚，有人正在回应你的同频") && document.querySelectorAll("nav").length===1','messages main layout')
 await check('document.documentElement.scrollWidth<=390','messages no overflow')
 await shot('messages')
 await click('查看邀请示例')
 await check('!document.querySelector("nav")','agent conversation immersive')
 await navigate('/profile')
 await check('document.body.innerText.includes("晚风、海边和可以一起唱歌的人") && document.querySelectorAll("nav").length===1','profile main layout')
 await check('document.documentElement.scrollWidth<=390','profile no overflow')
 await check('document.querySelector(".identity-portrait").naturalWidth>0','portrait loaded')
 await shot('profile')
 await evaluate('document.querySelector("details summary").click()');await sleep(200)
 await check('document.querySelector("details").open','settings expands')
 console.log('Messages/profile E2E passed')
}catch(error){console.error(error);process.exitCode=1}finally{socket?.close();chrome.kill()}
