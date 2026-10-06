import {spawn} from 'node:child_process'
import {mkdtempSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--remote-debugging-port=9344','--user-data-dir='+mkdtempSync(join(tmpdir(),'sync-visual-')),'about:blank'],{stdio:'ignore'})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
let socket
try {
 let pages;for(let i=0;i<40;i++){try{pages=await(await fetch('http://127.0.0.1:9344/json')).json();break}catch{await sleep(250)}}
 socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl)
 await new Promise(r=>socket.addEventListener('open',r))
 const pending=new Map();let id=0
 socket.addEventListener('message',e=>{const p=JSON.parse(e.data);if(p.id)pending.get(p.id)?.(p.result)})
 const send=(method,params={})=>new Promise(r=>{const n=++id;pending.set(n,r);socket.send(JSON.stringify({id:n,method,params}))})
 const evaluate=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true})).result.value
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
 const navigate=async path=>{await send('Page.navigate',{url:'http://127.0.0.1:5173/#'+path});await sleep(1200)}
 for(const state of ['sealed','opening-40','opening-80','revealed']){
  await navigate('/sync?capture='+state)
  const valid=await evaluate('innerWidth===390 && document.documentElement.scrollWidth<=390 && !document.querySelector("nav")')
  if(!valid)throw Error(state+' viewport/navigation check failed')
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
  writeFileSync(join(process.cwd(),'../docs/screenshots/phase1-1-sync-'+state+'.png'),Buffer.from(shot.data,'base64'))
  console.log('PASS '+state+' 390x844')
 }
 await navigate('/sync')
 await evaluate('document.querySelector("[data-signal-deck] [role=button]").click()')
 await sleep(1400)
 if(!await evaluate('document.querySelector("[data-deck-phase=revealed]")!==null'))throw Error('open failed')
 await evaluate('[...document.querySelectorAll("button")].find(b=>b.innerText.includes("换一张")).click()')
 await sleep(300)
 if(!await evaluate('document.body.innerText.includes("第 2 张")'))throw Error('swap failed')
 console.log('PASS open and swap; visual E2E passed')
}catch(error){console.error(error);process.exitCode=1}finally{socket?.close();chrome.kill()}
