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
 await navigate('/home')
 await check('document.body.innerText.includes("晚风一吹") && document.querySelectorAll("nav").length===1','home visible with one navigation')
 await check('document.documentElement.scrollWidth<=390','home no horizontal overflow')
 await check('document.querySelector("[data-home-music-bar]").getBoundingClientRect().bottom+8<=document.querySelector("nav").getBoundingClientRect().top','music/navigation 8px gap')
 await shot('home')
 await shot('music-and-navigation')
 await click('进入夜航现场')
 await check('location.hash.includes("night-voyage/select-song") && !document.querySelector("nav") && document.querySelector("[data-layout=immersive-sync]")','A home enters song selection, not reveal')
 await shot('enter-select-song')
 await evaluate('document.querySelector("[aria-label=返回首页]").click()');await sleep(700)
 await check('location.hash.includes("/home") && document.querySelectorAll("nav").length===1','immersive returns home')
 await shot('returned-home')
 await click('同频')
 await check('location.hash.endsWith("/sync") && !!document.querySelector("[data-signal-deck]") && !document.querySelector("nav")','B bottom sync enters immersive sync card')
 await evaluate('history.back()');await sleep(700)
 await check('location.hash.includes("/home")','browser back returns home')
 for(const tab of ['消息','我的']){await click(tab);await check('document.querySelectorAll("nav").length===1',tab+' one navigation');await click('首页');await check('location.hash.includes("/home")',tab+' returns home')}
 await navigate('/sync')
 await shot('sync-no-navigation')
 await check('!document.querySelector("nav") && !document.querySelector("[data-home-music-bar]")','sync excludes main UI')
 await navigate('/concert/night-flight/sync/select-song')
 await send('Page.reload');await sleep(800)
 await check('document.body.innerText.includes("把这首歌写进同频卡") && !document.querySelector("nav")','immersive refresh renders')
 await navigate('/concert/night-voyage/select-song')
 await evaluate('document.querySelector("button[aria-label=下一首]").click()');await sleep(200)
 const selected=await evaluate('sessionStorage.getItem("sfl.selectedTrack.v1")')
 await send('Page.reload');await sleep(700)
 await check(`sessionStorage.getItem("sfl.selectedTrack.v1")===${JSON.stringify(selected)}`,'selected song restored after refresh')
 await click('把这首歌写进同频卡')
 await check('location.hash.includes("/searching") && !document.querySelector("nav")','selection starts real searching before reveal')
 for(let i=0;i<40;i++){if(await evaluate('location.hash.includes("night-voyage/reveal")'))break;await sleep(500)}
 await check('location.hash.includes("night-voyage/reveal") && !!document.querySelector("[data-signal-deck]") && !document.querySelector("nav")','completed matching enters immersive card reveal')
 console.log('Phase 2 related E2E passed')
}catch(error){console.error(error);process.exitCode=1}finally{socket?.close();chrome.kill()}
