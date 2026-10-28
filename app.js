'use strict';
const $=id=>document.getElementById(id);
const DB_NAME='asistencia-qr-v1';let db,stream,scanning=false,lastScan='',lastScanAt=0,processing=false;
const status=message=>$('status').textContent=message;
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{let d=r.result;d.createObjectStore('employees',{keyPath:'token'});d.createObjectStore('records',{keyPath:'id'});d.createObjectStore('config',{keyPath:'key'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function put(store,item){return new Promise((resolve,reject)=>{const t=db.transaction(store,'readwrite');t.objectStore(store).put(item);t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error)})}
function all(store){return new Promise((resolve,reject)=>{const t=db.transaction(store,'readonly');const r=t.objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function get(store,key){return new Promise((resolve,reject)=>{const r=db.transaction(store,'readonly').objectStore(store).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function token(){const bytes=new Uint8Array(20);crypto.getRandomValues(bytes);return 'AG-'+Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('').toUpperCase()}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function config(){return (await get('config','device'))?.value||{id:'TAB-001',area:'ÁREA DE PRUEBA'}}
async function showConfig(){const x=await config();$('deviceId').value=x.id;$('deviceArea').value=x.area;$('deviceLabel').textContent=`${x.id} · ${x.area}`}
async function addEmployee(){const number=$('empNumber').value.trim(),name=$('empName').value.trim(),area=$('empArea').value.trim(),role=$('empRole').value.trim();if(!number||!name){alert('Captura número y nombre');return}if((await all('employees')).some(e=>e.number===number)){alert('Número de empleado duplicado');return}let e={token:token(),number,name,area,role,active:true};await put('employees',e);['empNumber','empName','empArea','empRole'].forEach(x=>$(x).value='');await showEmployees();status('Empleado creado; conserva su token para generar la credencial')}
async function showEmployees(){let a=await all('employees');$('employeeList').innerHTML=a.map(e=>`<div class="card"><b>${esc(e.name)}</b> · ${esc(e.number)}<br><small>${esc(e.area)} · ${esc(e.role)}</small><p>Token: <code>${esc(e.token)}</code></p><button class="secondary" data-token="${esc(e.token)}">Copiar token</button></div>`).join('')||'<p>Sin empleados. Agrega uno.</p>';document.querySelectorAll('[data-token]').forEach(b=>b.onclick=()=>navigator.clipboard.writeText(b.dataset.token).then(()=>status('Token copiado')).catch(()=>status('Selecciona y copia el token manualmente')))}
function parseQR(raw){
 const v=String(raw||'').trim();if(!v)throw Error('QR vacío');
 if(v.startsWith('{')){
  let d;try{d=JSON.parse(v)}catch{throw Error('QR JSON inválido')}
  const number=String(d.numeroEmpleado??d.numero_empleado??d.numero??d.number??'').trim();
  const name=String(d.nombreCompleto??d.nombre_completo??d.nombre??d.name??'').trim();
  const area=String(d.area??'').trim(),role=String(d.puesto??d.role??'').trim();
  if(!number||!name||!area||!role)throw Error('QR requiere numeroEmpleado, nombreCompleto, area y puesto');
  if([number,name,area,role].some(x=>x.length>150))throw Error('Datos demasiado largos');
  return {number,name,area,role,source:'QR_DATOS',token:v};
 }
 return {source:'TOKEN',token:v};
}
function feedback(message,success){let el=$('result');el.textContent=message;el.style.cssText='padding:18px;margin-top:12px;border-radius:10px;font-size:20px;font-weight:700;background:'+(success?'#dcfce7;color:#166534':'#fee2e2;color:#991b1b')}
async function register(raw){
 if(processing)return;processing=true;
 try{
  const d=parseQR(raw),now=Date.now();
  if(d.token===lastScan&&now-lastScanAt<2500)return;
  lastScan=d.token;lastScanAt=now;
  const e=d.source==='TOKEN'?await get('employees',d.token):d;
  if(!e||e.active===false)throw Error('QR no reconocido o empleado inactivo');
  const previous=(await all('records')).filter(r=>r.number===e.number).sort((a,b)=>b.timestamp-a.timestamp)[0];
  if(previous&&now-previous.timestamp<60000){feedback('⚠ Registro reciente: '+e.name+'. Sin duplicado.',false);return}
  const settings=await config(),movement=!previous||previous.movement==='SALIDA'?'ENTRADA':'SALIDA';
  const row={id:crypto.randomUUID(),timestamp:now,iso:new Date(now).toISOString(),localTime:new Date(now).toLocaleString('es-MX'),number:e.number,name:e.name,administrativeArea:e.area,role:e.role,deviceId:settings.id,physicalArea:settings.area,movement,sync:'PENDIENTE'};
  await put('records',row);
  feedback('✅ REGISTRO GUARDADO · '+movement+' · '+e.name+' · '+row.localTime+' · '+settings.area,true);
  status('Registro local guardado · sincronización con Sheets pendiente');
  $('manual').value='';await showRecords();
 }catch(err){feedback('❌ '+err.message,false);status('Registro rechazado')}
 finally{processing=false}
}
async function showRecords(){const a=(await all('records')).sort((x,y)=>y.timestamp-x.timestamp);$('recordCount').textContent=`${a.length} registros guardados · ${a.filter(x=>x.sync==='PENDIENTE').length} pendientes de sincronización`;$('recordRows').innerHTML=a.slice(0,100).map(x=>`<tr><td>${esc(x.localTime)}</td><td>${esc(x.name)} (${esc(x.number)})</td><td>${esc(x.movement)}</td><td>${esc(x.physicalArea)}</td><td>${esc(x.sync)}</td></tr>`).join('')}
function csvQuote(s){return '"'+String(s??'').replace(/"/g,'""')+'"'}
async function exportCSV(){const a=await all('records');let cols=['id','iso','localTime','number','name','administrativeArea','role','deviceId','physicalArea','movement','sync'];let lines=[cols.join(','),...a.map(x=>cols.map(c=>csvQuote(x[c])).join(','))];const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='asistencias_'+new Date().toISOString().slice(0,10)+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),2000)}
async function startCamera(){if(!navigator.mediaDevices?.getUserMedia){status('La cámara exige HTTPS y permiso del navegador');return}if(!('BarcodeDetector' in window)){status('Este navegador no ofrece BarcodeDetector: usa entrada manual o elige Chrome Android compatible');return}try{const formats=await BarcodeDetector.getSupportedFormats();if(!formats.includes('qr_code')){status('El lector nativo no admite QR; usa entrada manual');return}const detector=new BarcodeDetector({formats:['qr_code']});stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'}}});$('camera').srcObject=stream;await $('camera').play();scanning=true;status('Cámara activa');const loop=async()=>{if(!scanning)return;try{const found=await detector.detect($('camera'));if(found.length)await register(found[0].rawValue)}catch(e){console.warn('Lectura',e)}if(scanning)setTimeout(loop,250)};loop()}catch(e){status('No se pudo activar cámara: '+e.message)}}
function stopCamera(){scanning=false;if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}$('camera').srcObject=null}
async function main(){try{db=await openDB();status('Listo: registros guardados en este dispositivo');await showConfig();await showEmployees();await showRecords();document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('main section').forEach(s=>s.hidden=s.id!==b.dataset.tab);if(b.dataset.tab!=='scan')stopCamera();else startCamera()});$('addEmployee').onclick=addEmployee;$('saveSettings').onclick=async()=>{const id=$('deviceId').value.trim(),area=$('deviceArea').value.trim();if(!id||!area)return alert('Identificador y área obligatorios');await put('config',{key:'device',value:{id,area}});await showConfig();status('Equipo configurado')};$('register').onclick=()=>register($('manual').value);$('start').onclick=startCamera;$('stop').onclick=stopCamera;$('csv').onclick=exportCSV;if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').then(r=>r.update()).catch(console.warn);await startCamera()}catch(e){status('Error inicializando almacenamiento: '+e.message)}}main();