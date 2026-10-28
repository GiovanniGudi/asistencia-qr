/** Apps Script - vincular a la hoja Reporteo. Desplegar como Web App. */
const SPREADSHEET_ID='1YLsje8Cw5apYCW7cADihdkJAePq1OkYTQIIQocmNwGA';
const SHEET_NAME='Hoja 1';
function sheet_(){return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME)}
function doPost(e){
  // El navegador envía text/plain (simple request), no JSON con cabeceras CORS.
  const lock=LockService.getScriptLock();lock.waitLock(25000);
  try{
    const data=JSON.parse(e.postData.contents),items=Array.isArray(data.records)?data.records:[];
    if(items.length<1||items.length>20)throw Error('Lote inválido');
    const sh=sheet_(),last=sh.getLastRow(),ids=new Set(last>1?sh.getRange(2,1,last-1,1).getDisplayValues().flat():[]);
    const rows=[];
    for(const r of items){
      if(!/^[0-9a-f-]{36}$/i.test(String(r.id||'')))continue;
      if(ids.has(r.id))continue;ids.add(r.id);
      const safe=v=>String(v??'').slice(0,180).replace(/^([=+@\-])/,"'$1");
      const dt=new Date(Number(r.timestamp));
      if(isNaN(dt.getTime()))continue;
      const zone='America/Mexico_City';
      rows.push([r.id,safe(r.number),safe(r.name),safe(r.administrativeArea),safe(r.role),
        Utilities.formatDate(dt,zone,'yyyy-MM-dd'),Utilities.formatDate(dt,zone,'HH:mm:ss'),
        safe(r.movement),safe(r.deviceId),safe(r.physicalArea),
        Utilities.formatDate(new Date(),zone,'yyyy-MM-dd HH:mm:ss')]);
    }
    if(rows.length)sh.getRange(sh.getLastRow()+1,1,rows.length,11).setValues(rows);
    SpreadsheetApp.flush();
    return ContentService.createTextOutput('ok');
  }finally{lock.releaseLock()}
}
function doGet(e){
  // Consulta SOLO IDs de registro. JSONP evita CORS en respuestas Apps Script.
  const callback=String(e.parameter.callback||'');
  if(!/^qrAck_[a-zA-Z0-9_]{1,48}$/.test(callback))return ContentService.createTextOutput('invalid callback');
  const ids=String(e.parameter.ids||'').split(',').filter(s=>/^[0-9a-f-]{36}$/i.test(s)).slice(0,20);
  const sh=sheet_(),last=sh.getLastRow(),found=new Set();
  if(last>1){const stored=new Set(sh.getRange(2,1,last-1,1).getDisplayValues().flat());ids.forEach(id=>{if(stored.has(id))found.add(id)})}
  const payload=JSON.stringify({ok:true,ids:[...found]});
  return ContentService.createTextOutput(callback+'('+payload+');').setMimeType(ContentService.MimeType.JAVASCRIPT);
}
