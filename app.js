'use strict';
const $=id=>document.getElementById(id);
const DB_NAME='asistencia-qr-v1';
// Pegar aquí la URL /exec después de publicar Apps Script
const SYNC_URL='';
let syncing=false,ackCounter=0;
let db,scanner,reading=false,busy=false,previousPayload='',previousAt=0,feedbackTimer=0;
function message(msg,kind=''){const el=$('result');el.className=kind;el.textContent=msg;clearTimeout(feedbackTimer);feedbackTimer=setTimeout(()=>{el.className='';el.textContent='Listo para el siguiente código.'},6500)}
function status(msg){$('status').textContent=msg}
function openDB(){return new Promise((resolve,reject)=>{const q=indexedDB.open(DB_NAME,1);q.onupgradeneeded=()=>{const d=q.result;if(!d.objectStoreNames.contains('employees'))d.createObjectStore('employees',{keyPath:'token'});if(!d.objectStoreNames.contains('records'))d.createObjectStore('records',{keyPath:'id'});if(!d.objectStoreNames.contains('config'))d.createObjectStore('config',{keyPath:'key'})};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)})}
function readAll(store){return new Promise((resolve,reject)=>{const t=db.transaction(store,'readonly'),r=t.objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function get(store,key){return new Promise((resolve,reject)=>{const r=db.transaction(store,'readonly').objectStore(store).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function save(store,value){return new Promise((resolve,reject)=>{const t=db.transaction(store,'readwrite');t.objectStore(store).put(value);t.oncomplete=resolve;t.onerror=()=>reject(t.error)})}
function parsePayload(value){
 const raw=String(value||'').trim();if(!raw)throw Error('QR vacío');
 if(raw.startsWith('{')){
  let d;try{d=JSON.parse(raw)}catch{throw Error('Contenido QR no válido')}
  const number=String(d.numeroEmpleado??d.numero_empleado??d.numero??d.number??'').trim();
  const name=String(d.nombreCompleto??d.nombre_completo??d.nombre??d.name??'').trim();
  const area=String(d.area??'').trim(),role=String(d.puesto??d.role??'').trim();
  if(!number||!name||!area||!role)throw Error('El QR debe contener número, nombre, área y puesto');
  if([number,name,area,role].some(x=>x.length>150))throw Error('Los datos del QR son demasiado largos');
  return {number,name,area,role};
 }
 throw Error('Código leído, pero no contiene número, nombre, área y puesto. Debe ser un QR JSON, no solo un número de barras.');
}
async function record(raw){
 if(busy)return;
 const now=Date.now();
 if(raw===previousPayload&&now-previousAt<4000)return;
 busy=true;previousPayload=raw;previousAt=now;
 try{
  const employee=parsePayload(raw);
  const records=await readAll('records');
  const prior=records.filter(r=>String(r.number)===employee.number).sort((a,b)=>b.timestamp-a.timestamp)[0];
  if(prior&&now-prior.timestamp<8000){message('⚠ YA REGISTRADO\n'+employee.name+'\nEvita pasar el QR nuevamente.','bad');status('Lectura repetida; sin nuevo registro');return}
  const device=(await get('config','device'))?.value||{id:'TAB-001',area:'SIN ASIGNAR'};
  const movement=!prior||prior.movement==='SALIDA'?'ENTRADA':'SALIDA';
  const dt=new Date(now);
  const row={id:crypto.randomUUID(),timestamp:now,iso:dt.toISOString(),localTime:dt.toLocaleString('es-MX'),number:employee.number,name:employee.name,administrativeArea:employee.area,role:employee.role,deviceId:device.id,physicalArea:device.area,movement,sync:'PENDIENTE'};
  await save('records',row);await renderToday();void syncPending();
  message('✅ REGISTRO CORRECTO\n'+employee.name+'\n'+employee.number+' · '+movement+'\n'+row.localTime,'ok');
  status('Guardado en este teléfono');
 }catch(err){message('❌ NO REGISTRADO\n'+err.message,'bad');status('Presenta un QR válido')}
 finally{busy=false}
}

function localDay(timestamp){const d=new Date(timestamp);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function safe(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function renderToday(){
 const day=localDay(Date.now()),records=(await readAll('records')).filter(r=>localDay(r.timestamp)===day).sort((a,b)=>b.timestamp-a.timestamp);
 $('todayList').innerHTML=records.length?records.map(r=>'<div class="entry"><b>'+safe(r.name)+'</b> · '+safe(r.number)+'<br><span>'+safe(r.movement)+' · '+new Date(r.timestamp).toLocaleTimeString('es-MX')+' · '+(r.sync==='SINCRONIZADO'?'✓ Sincronizado':'⏳ Pendiente')+'</span></div>').join(''):'Sin registros todavía';
}
function jsonpAck(ids){
 return new Promise((resolve,reject)=>{
  const name='qrAck_'+(++ackCounter)+'_'+Date.now();
  let script=document.createElement('script');
  const timeout=setTimeout(()=>finish(new Error('Sin respuesta del servidor')),12000);
  function finish(error,result){clearTimeout(timeout);delete window[name];script.remove();error?reject(error):resolve(result)}
  window[name]=obj=>finish(null,obj);
  script.onerror=()=>finish(new Error('No se pudo confirmar la sincronización'));
  script.src=SYNC_URL+'?callback='+name+'&ids='+encodeURIComponent(ids.join(','));
  document.head.appendChild(script);
 });
}
async function syncPending(){
 if(syncing)return;
 const pending=(await readAll('records')).filter(x=>x.sync!=='SINCRONIZADO');
 if(!SYNC_URL){$('syncStatus').textContent='Sincronización pendiente de configuración · '+pending.length+' registros locales';return}
 if(!navigator.onLine){$('syncStatus').textContent='Sin internet · '+pending.length+' registros pendientes';return}
 syncing=true;
 try{
  for(let n=0;n<pending.length;n+=20){
   const batch=pending.slice(n,n+20);
   $('syncStatus').textContent='Enviando registros pendientes…';
   await fetch(SYNC_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({records:batch})});
   const ack=await jsonpAck(batch.map(x=>x.id));
   const ids=new Set(ack.ids||[]);
   for(const row of batch)if(ids.has(row.id)){row.sync='SINCRONIZADO';await save('records',row)}
  }
  const left=(await readAll('records')).filter(x=>x.sync!=='SINCRONIZADO').length;
  $('syncStatus').textContent=left?'⏳ Pendientes de sincronizar: '+left:'✓ Todos los registros sincronizados';
  await renderToday();
 }catch(e){$('syncStatus').textContent='⏳ Sincronización pendiente · '+e.message}
 finally{syncing=false}
}

async function start(){
 if(reading)return;status('Iniciando lector de QR y barras…');
 if(!window.Html5Qrcode){status('Error: no cargó el lector de cámara. Se requiere internet para la primera instalación.');message('❌ LECTOR NO DISPONIBLE','bad');$('retry').hidden=false;return}
 try{
  scanner=scanner||new Html5Qrcode('reader',{verbose:false,formatsToSupport:[Html5QrcodeSupportedFormats.QR_CODE,Html5QrcodeSupportedFormats.CODE_128,Html5QrcodeSupportedFormats.CODE_39,Html5QrcodeSupportedFormats.EAN_13,Html5QrcodeSupportedFormats.EAN_8,Html5QrcodeSupportedFormats.UPC_A,Html5QrcodeSupportedFormats.PDF_417],useBarCodeDetectorIfSupported:false});
  await scanner.start({facingMode:'environment'},{fps:12,aspectRatio:1.3333,disableFlip:false},value=>{status('Código detectado · validando datos…');void record(value)},()=>{});
  reading=true;status('Cámara activa · acerca el código QR');$('retry').hidden=true;
 }catch(e){status('No se pudo activar la cámara: '+(e?.message||e));message('❌ ERROR DE CÁMARA\n'+(e?.message||e),'bad');$('retry').hidden=false}
}
(async()=>{
 try{
  db=await openDB();
  if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});
  $('retry').onclick=()=>start();
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').then(r=>r.update()).catch(()=>{});
  await renderToday();await syncPending();window.addEventListener('online',()=>{void syncPending()});document.addEventListener('visibilitychange',()=>{if(!document.hidden){void renderToday();void syncPending()}});setInterval(()=>{void syncPending()},30000);await start();
 }catch(e){status('No se pudo abrir el almacenamiento local');message('❌ '+e.message,'bad')}
})();
