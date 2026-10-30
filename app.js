'use strict';
const $=id=>document.getElementById(id);
const DB_NAME='asistencia-qr-v1';
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
  const device=(await get('config','device'))?.value;\n  if(!device?.chiefName||!device?.chiefNumber||!device?.area)throw Error('Falta configurar el responsable y el área');
  const movement=!prior||prior.movement==='SALIDA'?'ENTRADA':'SALIDA';
  const dt=new Date(now);
  const row={id:crypto.randomUUID(),timestamp:now,iso:dt.toISOString(),localTime:dt.toLocaleString('es-MX'),number:employee.number,name:employee.name,administrativeArea:employee.area,role:employee.role,deviceId:device.id||'ANDROID',physicalArea:device.area,chiefName:device.chiefName,chiefNumber:device.chiefNumber,movement,sync:'LOCAL'};
  await save('records',row);await renderToday();
  message('✅ REGISTRO CORRECTO\n'+employee.name+'\n'+employee.number+' · '+movement+'\n'+row.localTime,'ok');
  status('Guardado en este teléfono');
 }catch(err){message('❌ NO REGISTRADO\n'+err.message,'bad');status('Presenta un QR válido')}
 finally{busy=false}
}

function localDay(timestamp){const d=new Date(timestamp);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function safe(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function renderToday(){
 const day=localDay(Date.now()),records=(await readAll('records')).filter(r=>localDay(r.timestamp)===day).sort((a,b)=>b.timestamp-a.timestamp);
 $('todayList').innerHTML=records.length?records.map(r=>'<div class="entry"><b>'+safe(r.name)+'</b> · '+safe(r.number)+'<br><span>'+safe(r.movement)+' · '+new Date(r.timestamp).toLocaleTimeString('es-MX')+' · ✓ Guardado localmente'+'</span></div>').join(''):'Sin registros todavía';
}
function xml(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'')}
function zipXlsx(rows){
 const files={};
 const sheetRows=rows.map((row,i)=>'<row r="'+(i+1)+'">'+row.map((value,j)=>{let n=j+1,letters='';while(n){n--;letters=String.fromCharCode(65+n%26)+letters;n=Math.floor(n/26)}return '<c r="'+letters+(i+1)+'" t="inlineStr"><is><t>'+xml(value)+'</t></is></c>'}).join('')+'</row>').join('');
 files['[Content_Types].xml']='<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>';
 files['_rels/.rels']='<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
 files['xl/workbook.xml']='<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Asistencias" sheetId="1" r:id="rId1"/></sheets></workbook>';
 files['xl/_rels/workbook.xml.rels']='<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>';
 files['xl/worksheets/sheet1.xml']='<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetData>'+sheetRows+'</sheetData></worksheet>';
 // ZIP sin compresión: XLSX Office Open XML sin dependencias externas, disponible offline.
 const encoder=new TextEncoder(),chunks=[],directory=[];let offset=0;
 const u16=x=>[x&255,(x>>>8)&255],u32=x=>[x&255,(x>>>8)&255,(x>>>16)&255,(x>>>24)&255];
 const add=a=>{chunks.push(new Uint8Array(a));offset+=a.length};
 const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});
 function crc(bytes){let c=0xffffffff;for(let b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0}
 for(const [path,content] of Object.entries(files)){
  const name=encoder.encode(path),data=encoder.encode(content),checksum=crc(data),start=offset;
  add([...u32(0x04034b50),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(checksum),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...name]);add(data);
  directory.push([...u32(0x02014b50),...u16(20),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(checksum),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(start),...name]);
 }
 const dirStart=offset;directory.forEach(add);const dirSize=offset-dirStart;
 add([...u32(0x06054b50),...u16(0),...u16(0),...u16(directory.length),...u16(directory.length),...u32(dirSize),...u32(dirStart),...u16(0)]);
 return new Blob(chunks,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
async function createExcel(){
 const records=(await readAll('records')).sort((a,b)=>a.timestamp-b.timestamp),config=(await get('config','device'))?.value;
 const headers=['Número de empleado','Fecha','Hora','Área','Jefe directo','Número de empleado del jefe'];
 const rows=[headers,...records.map(r=>{const date=new Date(r.timestamp),d=String(date.getDate()).padStart(2,'0'),m=String(date.getMonth()+1).padStart(2,'0');return [r.number,d+'/'+m+'/'+date.getFullYear(),date.toLocaleTimeString('es-MX',{hour12:false}),r.physicalArea||config?.area||'',r.chiefName||config?.chiefName||'',r.chiefNumber||config?.chiefNumber||'']})];
 const area=(config?.area||'Area').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,50);
 return {blob:zipXlsx(rows),name:'Asistencias_'+area+'_'+localDay(Date.now())+'.xlsx',count:records.length};
}
async function exportExcel(share){
 try{
  const {blob,name,count}=await createExcel();
  if(share){
   const file=new File([blob],name,{type:blob.type});
   if(!navigator.share||!navigator.canShare?.({files:[file]}))throw Error('Android no permite compartir archivos desde este navegador. Utiliza Descargar Excel y compártelo desde Descargas.');
   await navigator.share({files:[file],title:name});
   status('Menú para compartir abierto · '+count+' registros conservados');
  }else{
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
   status('Descarga solicitada: '+name+'. Comprueba la carpeta Descargas.');
  }
 }catch(e){status('No se completó la exportación: '+(e?.message||e))}
}
async function showConfiguration(){
 await stopCamera();
 $('scanPanel').hidden=true;$('configPanel').hidden=false;
 const c=(await get('config','device'))?.value||{};
 $('chiefName').value=c.chiefName||'';$('chiefNumber').value=c.chiefNumber||'';$('chiefArea').value=c.area||'';
}
async function saveConfiguration(e){
 e.preventDefault();
 const chiefName=$('chiefName').value.trim(),chiefNumber=$('chiefNumber').value.trim(),area=$('chiefArea').value.trim();
 if(!chiefName||!chiefNumber||!area){$('configError').textContent='Los tres campos son obligatorios';return}
 const old=(await get('config','device'))?.value||{};
 await save('config',{key:'device',value:{...old,id:old.id||'ANDROID',chiefName,chiefNumber,area}});
 $('configError').textContent='';$('configPanel').hidden=true;$('scanPanel').hidden=false;
 $('responsibleInfo').textContent='Área: '+area+' · Responsable: '+chiefName+' ('+chiefNumber+')';
 await renderToday();await start();
}
async function stopCamera(){if(scanner&&reading){try{await scanner.stop()}catch(e){console.warn(e)}reading=false}}
async function start(){
 if(reading)return;status('Iniciando lector de QR y barras…');
 if(!window.Html5Qrcode){status('Error: no cargó el lector de cámara. Se requiere internet para la primera instalación.');message('❌ LECTOR NO DISPONIBLE','bad');$('retry').hidden=false;return}
 try{
  scanner=scanner||new Html5Qrcode('reader',{verbose:false,formatsToSupport:[Html5QrcodeSupportedFormats.QR_CODE,Html5QrcodeSupportedFormats.CODE_128,Html5QrcodeSupportedFormats.CODE_39,Html5QrcodeSupportedFormats.EAN_13,Html5QrcodeSupportedFormats.EAN_8,Html5QrcodeSupportedFormats.UPC_A,Html5QrcodeSupportedFormats.PDF_417],useBarCodeDetectorIfSupported:false});
  await scanner.start({facingMode:'environment'},{fps:12,aspectRatio:1.3333,disableFlip:false},value=>{if(!busy){status('Código detectado · validando datos…');void record(value)}},()=>{});
  reading=true;status('Cámara activa · acerca el código QR');$('retry').hidden=true;
 }catch(e){status('No se pudo activar la cámara: '+(e?.message||e));message('❌ ERROR DE CÁMARA\n'+(e?.message||e),'bad');$('retry').hidden=false}
}
(async()=>{
 try{
  db=await openDB();
  if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});
  $('retry').onclick=()=>start();
  if('serviceWorker'in navigator){navigator.serviceWorker.register('./sw.js').then(r=>r.update()).catch(()=>{});}
  $('configForm').addEventListener('submit',e=>{void saveConfiguration(e)});
  $('editConfig').onclick=()=>{void showConfiguration()};
  $('downloadXlsx').onclick=()=>{void exportExcel(false)};
  $('shareXlsx').onclick=()=>{void exportExcel(true)};
  await renderToday();
  const c=(await get('config','device'))?.value;
  if(!c?.chiefName||!c?.chiefNumber||!c?.area)await showConfiguration();
  else{$('responsibleInfo').textContent='Área: '+c.area+' · Responsable: '+c.chiefName+' ('+c.chiefNumber+')';await start()}
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void renderToday()});
 }catch(e){status('No se pudo abrir el almacenamiento local');message('❌ '+e.message,'bad')}
})();
