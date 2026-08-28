const API_BASE = "";
const isAdminPage = document.body.classList.contains("admin-page");

const seedRecord = {
  fullName: "Olena Shevchenko", idNumber: "ID-0001", documentType: "Passport",
  country: "Ukraine", dob: "1998-01-14", expiry: "2028-08-12",
  address: "Kyiv, Ukraine", photoUrl: "", status: "Approved"
};

const els = Object.fromEntries([
  "previewAvatar","previewPhoto","previewName","previewRole","previewId","previewStatus","previewCountry","previewExpiry",
  "barcodePreview","shareQr","shareLink","loginForm","adminPassword","loginBtn","logoutBtn","authNote","adminForm",
  "fullName","idNumber","documentType","country","dob","expiry","address","photoUrl","photoFile","photoFormPreview",
  "seedDemo","recordsTable","recordCount","tableEmpty","scanInput","clearInput","lookupBtn","cameraBtn","cameraNote",
  "resultBody","emptyState","resultAvatar","resultPhoto","resultName","resultDocument","resultStatus","resultBarcode",
  "resultId","resultCountry","resultDob","resultExpiry","resultAddress","startCameraBtn","stopCameraBtn","cameraFeed",
  "cameraState","cameraPlaceholder"
].map(id => [id, document.getElementById(id)]));

let records = [];
let session = { authenticated: false };
let stream = null, detector = null, cameraLoop = null;
const origin = window.location.origin;

const dateFormatter = new Intl.DateTimeFormat("en-GB", { day:"2-digit", month:"2-digit", year:"numeric" });
function normalizeId(value){ return String(value || "").trim().toUpperCase(); }
function formatDate(value){ const d = new Date(value); return Number.isNaN(d.getTime()) ? String(value || "") : dateFormatter.format(d); }
function escapeHtml(value){ return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function initials(name){
  return String(name||"").split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0].toUpperCase()).join("") || "ID";
}
function renderPhoto(target, fallback, value, name){
  if(!target || !fallback) return;
  const src = String(value||"").trim();
  fallback.textContent = initials(name);
  if(src){ target.src=src; target.classList.remove("hidden"); fallback.classList.add("hidden"); }
  else { target.removeAttribute("src"); target.classList.add("hidden"); fallback.classList.remove("hidden"); }
}
function renderBarcode(target, value){
  if(!target) return;
  const id=normalizeId(value);
  target.innerHTML = `<img class="scan-code" src="/api/barcode/${encodeURIComponent(id)}.svg" alt="Barcode for ${escapeHtml(id)}"><div class="scan-code-label">${escapeHtml(id)}</div>`;
}
function renderQr(idNumber){
  if(!els.shareQr || !els.shareLink) return;
  const link=`${origin}/?id=${encodeURIComponent(idNumber)}`;
  els.shareLink.href=link; els.shareLink.textContent=link;
  els.shareQr.src=`/api/qr/${encodeURIComponent(idNumber)}.svg`;
}
function renderRecord(record){
  if(!record) return;
  if(els.previewName){
    els.previewName.textContent=record.fullName; els.previewRole.textContent=record.documentType;
    els.previewId.textContent=record.idNumber; els.previewStatus.textContent=record.status;
    els.previewCountry.textContent=record.country; els.previewExpiry.textContent=formatDate(record.expiry);
    renderPhoto(els.previewPhoto,els.previewAvatar,record.photoUrl,record.fullName);
    renderBarcode(els.barcodePreview,record.idNumber); renderQr(record.idNumber);
  }
}
function showResult(record){
  if(!els.resultBody || !els.emptyState) return;
  if(!record){ els.emptyState.classList.remove("hidden"); els.resultBody.classList.add("hidden"); return; }
  els.emptyState.classList.add("hidden"); els.resultBody.classList.remove("hidden");
  els.resultAvatar.textContent=initials(record.fullName); els.resultName.textContent=record.fullName;
  els.resultDocument.textContent=record.documentType; els.resultStatus.textContent=record.status;
  els.resultId.textContent=record.idNumber; els.resultCountry.textContent=record.country;
  els.resultDob.textContent=formatDate(record.dob); els.resultExpiry.textContent=formatDate(record.expiry);
  els.resultAddress.textContent=record.address; renderPhoto(els.resultPhoto,els.resultAvatar,record.photoUrl,record.fullName);
  renderBarcode(els.resultBarcode,record.idNumber);
}
async function fetchJson(path, options={}){
  const response=await fetch(`${API_BASE}${path}`,{credentials:"include",headers:{"Content-Type":"application/json",...(options.headers||{})},...options});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.error||"Something went wrong. Please try again.");
  return data;
}
async function fetchRecord(query){
  const id=normalizeId(query); if(!id) return null;
  try { const response=await fetchJson(`/api/records/${encodeURIComponent(id)}`); return response.record||null; }
  catch(error){ if(error.message==="Record not found") return null; throw error; }
}
async function lookup(){
  if(!els.scanInput) return;
  const code=normalizeId(els.scanInput.value);
  if(!code){ els.cameraNote.textContent="Enter a reference number first."; els.scanInput.focus(); return; }
  els.lookupBtn.disabled=true; els.cameraNote.textContent="Checking record…";
  try{
    const record=await fetchRecord(code);
    showResult(record);
    els.cameraNote.textContent=record ? "Record verified successfully." : "No approved record was found for that reference.";
  }catch(error){ showResult(null); els.cameraNote.textContent=error.message; }
  finally{ els.lookupBtn.disabled=false; }
}
async function loadClient(){
  showResult(null);
  const id=new URLSearchParams(location.search).get("id");
  if(els.scanInput && id){ els.scanInput.value=normalizeId(id); updateClear(); await lookup(); }
  initClientLookup();
}
function updateClear(){ if(els.clearInput && els.scanInput) els.clearInput.classList.toggle("hidden",!els.scanInput.value); }
function initClientLookup(){
  if(!els.scanInput) return;
  els.lookupBtn?.addEventListener("click",lookup);
  els.scanInput.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();lookup();}});
  els.scanInput.addEventListener("input",updateClear);
  els.clearInput?.addEventListener("click",()=>{els.scanInput.value="";updateClear();els.scanInput.focus();showResult(null);els.cameraNote.textContent="Enter a reference to begin.";});
  els.cameraBtn?.addEventListener("click",()=>{document.querySelector(".scanner-panel")?.scrollIntoView({behavior:"smooth",block:"center"});startCamera();});
  els.startCameraBtn?.addEventListener("click",startCamera); els.stopCameraBtn?.addEventListener("click",stopCamera);
}
function stopCamera(){
  if(cameraLoop) clearTimeout(cameraLoop); cameraLoop=null; detector=null;
  if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
  if(els.cameraFeed) els.cameraFeed.srcObject=null;
  els.cameraState&&(els.cameraState.textContent="Off");
  els.cameraPlaceholder?.classList.remove("hidden");
}
async function startCamera(){
  if(!els.cameraFeed) return;
  try{
    if(!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access is not available in this browser.");
    stopCamera();
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});
    els.cameraFeed.srcObject=stream; await els.cameraFeed.play();
    els.cameraState.textContent="On"; els.cameraPlaceholder.classList.add("hidden");
    if("BarcodeDetector" in window){
      detector=new BarcodeDetector({formats:["code_128","code_39","code_93","ean_13","ean_8","upc_a","upc_e","qr_code"]});
      els.cameraNote.textContent="Point the camera at a barcode or QR code.";
      scanLoop();
    }else els.cameraNote.textContent="Your browser does not support automatic barcode detection. Use manual lookup.";
  }catch(error){ stopCamera(); els.cameraNote.textContent=error.message; }
}
async function scanLoop(){
  if(!detector || !stream) return;
  try{
    const results=await detector.detect(els.cameraFeed);
    const code=results[0]?.rawValue||"";
    if(code){
      els.scanInput.value=code; updateClear();
      const record=await fetchRecord(code); showResult(record);
      els.cameraNote.textContent=record ? "Barcode detected and record verified." : "Barcode detected, but no approved record exists.";
      if(record) stopCamera();
    }
  }catch{}
  if(detector && stream) cameraLoop=setTimeout(scanLoop,350);
}

function renderTable(){
  if(!els.recordsTable) return;
  els.recordsTable.innerHTML=records.map(r=>`<tr><td><strong>${escapeHtml(r.fullName)}</strong></td><td>${escapeHtml(r.idNumber)}</td><td>${escapeHtml(r.country)}</td><td><span class="badge">${escapeHtml(r.status)}</span></td></tr>`).join("");
  els.tableEmpty?.classList.toggle("hidden",records.length>0);
  if(els.recordCount) els.recordCount.textContent=`${records.length} ${records.length===1?"record":"records"}`;
}
function fillAdminForm(record){
  if(!isAdminPage || !record) return;
  els.fullName.value=record.fullName; els.idNumber.value=record.idNumber; els.documentType.value=record.documentType;
  els.country.value=record.country; els.dob.value=record.dob; els.expiry.value=record.expiry; els.address.value=record.address;
  els.photoUrl.value=record.photoUrl||""; if(els.photoFile) els.photoFile.value="";
  if(els.photoFormPreview){
    if(record.photoUrl){els.photoFormPreview.src=record.photoUrl;els.photoFormPreview.classList.remove("hidden");}
    else{els.photoFormPreview.removeAttribute("src");els.photoFormPreview.classList.add("hidden");}
  }
}
function setAuthState(authenticated){
  if(!isAdminPage) return;
  session.authenticated=authenticated;
  document.querySelectorAll(".admin-only").forEach(s=>s.classList.toggle("hidden",!authenticated));
  if(els.authNote) els.authNote.textContent=authenticated ? "Signed in. Your staff workspace is ready." : "Sign in to access the staff workspace.";
  if(els.adminForm) els.adminForm.querySelectorAll("input,textarea,button").forEach(el=>el.disabled=!authenticated);
  if(els.adminPassword) els.adminPassword.disabled=authenticated;
  if(els.loginBtn) els.loginBtn.disabled=authenticated;
  if(els.logoutBtn) els.logoutBtn.disabled=!authenticated;
}
async function saveRecord(record){
  const result=await fetchJson("/api/records",{method:"POST",body:JSON.stringify(record)});
  records=result.records||records; renderTable(); renderRecord(result.record); return result.record;
}
function readFileAsDataUrl(file){
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||""));reader.onerror=()=>reject(new Error("Unable to read the selected image."));reader.readAsDataURL(file);});
}
async function login(event){
  event.preventDefault(); els.loginBtn.disabled=true; els.authNote.textContent="Signing in…";
  try{
    await fetchJson("/api/login",{method:"POST",body:JSON.stringify({password:els.adminPassword.value})});
    els.adminPassword.value=""; setAuthState(true);
    const response=await fetchJson("/api/records");
    records=response.records||[]; renderTable();
    const initial=records[0]||seedRecord; renderRecord(initial); fillAdminForm(initial);
    els.authNote.textContent="Signed in. Your staff workspace is ready.";
  }catch(error){els.authNote.textContent=error.message;els.loginBtn.disabled=false;}
}
async function logout(){
  try{await fetchJson("/api/logout",{method:"POST",body:"{}"});}catch{}
  setAuthState(false);
}
function renderAdminActions(){
  if(!isAdminPage) return;
  els.loginForm?.addEventListener("submit",login); els.logoutBtn?.addEventListener("click",logout);
  els.adminForm?.addEventListener("submit",async e=>{
    e.preventDefault(); if(!session.authenticated) return;
    const record={fullName:els.fullName.value.trim(),idNumber:normalizeId(els.idNumber.value),documentType:els.documentType.value.trim(),country:els.country.value.trim(),dob:els.dob.value,expiry:els.expiry.value,address:els.address.value.trim(),photoUrl:els.photoUrl.value.trim(),status:"Approved"};
    if(Object.values(record).some(v=>!v) && !record.photoUrl){els.authNote.textContent="Please complete all required fields.";return;}
    try{const saved=await saveRecord(record);fillAdminForm(saved);els.authNote.textContent="Record saved successfully.";}catch(error){els.authNote.textContent=error.message;}
  });
  els.photoFile?.addEventListener("change",async e=>{
    const file=e.target.files?.[0]; if(!file) return;
    if(file.size>2*1024*1024){els.authNote.textContent="Please choose an image smaller than 2 MB.";e.target.value="";return;}
    try{const data=await readFileAsDataUrl(file);els.photoUrl.value=data;els.photoFormPreview.src=data;els.photoFormPreview.classList.remove("hidden");els.authNote.textContent="Photo loaded. Save the record to store it.";}
    catch(error){els.authNote.textContent=error.message;}
  });
  els.photoUrl?.addEventListener("input",()=>{const v=els.photoUrl.value.trim();if(v){els.photoFormPreview.src=v;els.photoFormPreview.classList.remove("hidden")}else els.photoFormPreview.classList.add("hidden")});
  els.seedDemo?.addEventListener("click",()=>{fillAdminForm(seedRecord);renderRecord(seedRecord);els.authNote.textContent="Demo record loaded. Save it only if you want to keep it.";});
}
async function loadAdmin(){
  try{
    session=await fetchJson("/api/session");
    setAuthState(Boolean(session.authenticated));
    if(session.authenticated){
      const response=await fetchJson("/api/records");
      records=response.records||[]; renderTable();
      const initial=records[0]||seedRecord; renderRecord(initial); fillAdminForm(initial);
    } else {
      renderRecord(seedRecord);
    }
  }catch(error){setAuthState(false);if(els.authNote)els.authNote.textContent=error.message;}
}
renderAdminActions();
if(isAdminPage) loadAdmin(); else loadClient();
