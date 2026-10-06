import {spawn} from 'node:child_process'
import {mkdtempSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--remote-debugging-port=9360','--user-data-dir='+mkdtempSync(join(tmpdir(),'sync-continuity-')),'about:blank'],{stdio:'ignore'})
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let socket
try{let pages;for(let i=0;i<40;i++){try{pages=await(await fetch('http://127.0.0.1:9360/json')).json();break}catch{await sleep(250)}}
 socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r));const pending=new Map();let id=0
 socket.addEventListener('message',e=>{const p=JSON.parse(e.data);if(p.id)pending.get(p.id)?.(p.result)});const send=(method,params={})=>new Promise(r=>{const n=++id;pending.set(n,r);socket.send(JSON.stringify({id:n,method,params}))});const evaluate=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true})).result.value
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});const navigate=async path=>{await send('Page.navigate',{url:'http://127.0.0.1:5173/#'+path});await sleep(900)};const shot=async name=>{const s=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(join(process.cwd(),'../docs/screenshots/'+name+'.png'),Buffer.from(s.data,'base64'))};const check=async(x,label)=>{if(!await evaluate(`Boolean(${x})`))throw Error(label);console.log('PASS '+label)}
 await navigate('/concert/night-voyage/select-song');await check('document.body.innerText.includes("把一首歌，写进今晚的同频卡")','select uses paper-card narrative');await check('document.documentElement.scrollWidth<=390','select no horizontal overflow');await shot('signal-01-select-song')
 await evaluate('[...document.querySelectorAll("button")].find(x=>x.innerText.includes("把这首歌写进同频卡")).click()');await sleep(720);await check('location.hash.includes("/searching")','selected track enters searching');await check('document.body.innerText.includes("正在把你的音乐信号送向人群")','searching narrative visible');await shot('signal-02-searching')
 await navigate('/concert/night-voyage/reveal?capture=sealed');await check('document.querySelector("[data-deck-phase=sealed]")','reveal sealed card visible');await shot('signal-03-reveal-sealed');console.log('Signal continuity E2E passed')
}catch(e){console.error(e);process.exitCode=1}finally{socket?.close();chrome.kill()}
