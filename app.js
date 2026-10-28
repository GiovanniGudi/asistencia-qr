'use strict';
const $=id=>document.getElementById(id);
const DB_NAME='asistencia-qr-v1';
let db,scanner,reading=false,busy=false,previousPayload='',previousAt=0;
function message(msg,kind=''){const el=$('result');el.className=kind;el.textContent=msg}
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
 throw Error('Este QR no contiene los datos del trabajador');
}
async function record(raw){
 if(busy)return;
 const now=Date.now();
 if(raw===previousPayload&&now-previousAt<2500)return;
 busy=true;previousPayload=raw;previousAt=now;
 try{
  const employee=parsePayload(raw);
  const records=await readAll('records');
  const prior=records.filter(r=>String(r.number)===employee.number).sort((a,b)=>b.timestamp-a.timestamp)[0];
  if(prior&&now-prior.timestamp<60000){message('⚠ YA REGISTRADO\n'+employee.name+'\nEvita pasar el QR nuevamente.','bad');status('Lectura repetida; sin nuevo registro');return}
  const device=(await get('config','device'))?.value||{id:'TAB-001',area:'SIN ASIGNAR'};
  const movement=!prior||prior.movement==='SALIDA'?'ENTRADA':'SALIDA';
  const dt=new Date(now);
  const row={id:crypto.randomUUID(),timestamp:now,iso:dt.toISOString(),localTime:dt.toLocaleString('es-MX'),number:employee.number,name:employee.name,administrativeArea:employee.area,role:employee.role,deviceId:device.id,physicalArea:device.area,movement,sync:'PENDIENTE'};
  await save('records',row);
  message('✅ REGISTRO CORRECTO\n'+employee.name+'\n'+employee.number+' · '+movement+'\n'+row.localTime,'ok');
  status('Guardado en este teléfono');
 }catch(err){message('❌ NO REGISTRADO\n'+err.message,'bad');status('Presenta un QR válido')}
 finally{busy=false}
}
async function start(){
 if(reading)return;
 if(!window.Html5Qrcode){status('No cargó el lector. Revisa la conexión inicial.');$('retry').hidden=false;return}
 try{
  scanner=scanner||new Html5Qrcode('reader',{verbose:false});
  await scanner.start({facingMode:'environment'},{fps:8,qrbox:(w,h)=>({width:Math.min(w,260),height:Math.min(h,260)}),aspectRatio:1.3333},value=>{void record(value)},()=>{});
  reading=true;status('Cámara activa · acerca el código QR');$('retry').hidden=true;
 }catch(e){status('No se pudo activar la cámara: '+(e?.message||e));$('retry').hidden=false}
}
(async()=>{
 try{
  db=await openDB();
  if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});
  $('retry').onclick=()=>start();
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').then(r=>r.update()).catch(()=>{});
  await start();
 }catch(e){status('No se pudo abrir el almacenamiento local');message('❌ '+e.message,'bad')}
})();
