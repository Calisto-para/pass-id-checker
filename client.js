const API_BASE = "";
const isAdminPage = document.body.classList.contains("admin-page");
const isAdminDashboard = document.body.classList.contains("admin-dashboard-page");

const els = Object.fromEntries([
  "previewAvatar","previewPhoto","previewName","previewRole","previewId","previewStatus","previewCountry","previewExpiry",
  "barcodePreview","shareQr","shareLink","loginForm","adminPassword","loginBtn","logoutBtn","authNote","adminForm",
  "fullName","idNumber","documentType","country","nationality","sex","dob","placeOfBirth","issueDate","expiry","issuingAuthority","address","verificationNotes","photoUrl","photoFile","photoFormPreview",
  "clearForm","recordsTable","recordCount","tableEmpty","scanInput","clearInput","lookupBtn","cameraBtn","cameraNote",
  "resultBody","emptyState","resultAvatar","resultPhoto","resultName","resultDocument","resultStatus","resultBarcode",
  "resultId","resultCountry","resultNationality","resultSex","resultDob","resultPlaceOfBirth","resultIssueDate","resultExpiry","resultIssuingAuthority","resultAddress","startCameraBtn","stopCameraBtn","cameraFeed",
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
  if(!record){
    if(els.previewName) els.previewName.textContent="—";
    if(els.previewRole) els.previewRole.textContent="—";
    if(els.previewId) els.previewId.textContent="—";
    if(els.previewStatus) els.previewStatus.textContent="Approved";
    if(els.previewCountry) els.previewCountry.textContent="—";
    if(els.previewExpiry) els.previewExpiry.textContent="—";
    if(els.previewAvatar){els.previewAvatar.textContent="ID";els.previewAvatar.classList.remove("hidden");}
    if(els.previewPhoto){els.previewPhoto.removeAttribute("src");els.previewPhoto.classList.add("hidden");}
    if(els.barcodePreview) els.barcodePreview.innerHTML="<span class=\"scan-code-label\">No record selected</span>";
    if(els.shareQr){els.shareQr.removeAttribute("src");}
    if(els.shareLink){els.shareLink.removeAttribute("href");els.shareLink.textContent="No record selected";}
    return;
  }
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
  els.resultNationality.textContent=record.nationality||"—"; els.resultSex.textContent=record.sex||"—";
  els.resultDob.textContent=formatDate(record.dob); els.resultPlaceOfBirth.textContent=record.placeOfBirth||"—";
  els.resultIssueDate.textContent=formatDate(record.issueDate); els.resultExpiry.textContent=formatDate(record.expiry);
  els.resultIssuingAuthority.textContent=record.issuingAuthority||"—";
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
  els.recordsTable.innerHTML=records.map(r=>`<tr><td><strong>${escapeHtml(r.fullName)}</strong></td><td>${escapeHtml(r.idNumber)}</td><td>${escapeHtml(r.country)}</td><td><span class="badge">${escapeHtml(r.status)}</span></td><td><button class="table-action table-edit" type="button" data-action="edit" data-id="${escapeHtml(r.idNumber)}">Edit</button><button class="table-action table-delete" type="button" data-action="delete" data-id="${escapeHtml(r.idNumber)}">Delete</button></td></tr>`).join("");
  els.tableEmpty?.classList.toggle("hidden",records.length>0);
  if(els.recordCount) els.recordCount.textContent=`${records.length} ${records.length===1?"record":"records"}`;
}
function fillAdminForm(record){
  if((!isAdminPage && !isAdminDashboard) || !record) return;
  els.fullName.value=record.fullName; els.idNumber.value=record.idNumber; els.documentType.value=record.documentType;
  els.country.value=record.country; els.nationality.value=record.nationality||""; els.sex.value=record.sex||"";
  els.dob.value=record.dob; els.placeOfBirth.value=record.placeOfBirth||""; els.issueDate.value=record.issueDate||"";
  els.expiry.value=record.expiry; els.issuingAuthority.value=record.issuingAuthority||""; els.address.value=record.address;
  els.verificationNotes.value=record.verificationNotes||"";
  els.photoUrl.value=record.photoUrl||""; if(els.photoFile) els.photoFile.value="";
  if(els.photoFormPreview){
    if(record.photoUrl){els.photoFormPreview.src=record.photoUrl;els.photoFormPreview.classList.remove("hidden");}
    else{els.photoFormPreview.removeAttribute("src");els.photoFormPreview.classList.add("hidden");}
  }
}
function setAuthState(authenticated){
  if(!isAdminPage && !isAdminDashboard) return;
  session.authenticated=authenticated;
  document.querySelectorAll(".admin-only").forEach(s=>s.classList.toggle("hidden",!authenticated));
  if(els.authNote) els.authNote.textContent=authenticated ? "Access granted. The management console is ready." : "Sign in to access the management console.";
  if(els.adminForm) els.adminForm.querySelectorAll("input,textarea,button").forEach(el=>el.disabled=!authenticated);
  if(els.adminPassword) els.adminPassword.disabled=authenticated;
  if(els.loginBtn) els.loginBtn.disabled=authenticated;
  if(els.logoutBtn) els.logoutBtn.disabled=!authenticated;
}
async function saveRecord(record){
  const result=await fetchJson("/api/records",{method:"POST",body:JSON.stringify(record)});
  records=result.records||records; renderTable(); renderRecord(result.record); return result.record;
}
async function removeRecord(id){
  const result=await fetchJson(`/api/records/${encodeURIComponent(id)}`,{method:"DELETE",body:"{}"});
  records=result.records||[]; renderTable();
  if(records.length){ fillAdminForm(records[0]); renderRecord(records[0]); }
  else { clearAdminForm(); renderRecord(null); }
  return result;
}
function clearAdminForm(){
  if((!isAdminPage && !isAdminDashboard) || !els.adminForm) return;
  els.adminForm.reset();
  if(els.photoUrl) els.photoUrl.value="";
  if(els.photoFile) els.photoFile.value="";
  if(els.photoFormPreview){ els.photoFormPreview.removeAttribute("src"); els.photoFormPreview.classList.add("hidden"); }
}
function readFileAsDataUrl(file){
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||""));reader.onerror=()=>reject(new Error("Unable to read the selected image."));reader.readAsDataURL(file);});
}
async function login(event){
  event.preventDefault(); els.loginBtn.disabled=true; els.authNote.textContent="Signing in…";
  try{
    await fetchJson("/api/login",{method:"POST",body:JSON.stringify({password:els.adminPassword.value})});
    els.adminPassword.value="";
    window.location.assign("/admin-dashboard.html");
  }catch(error){els.authNote.textContent=error.message;els.loginBtn.disabled=false;}
}
async function logout(){
  try{await fetchJson("/api/logout",{method:"POST",body:"{}"});}catch{}
  setAuthState(false);
  if(isAdminDashboard) window.location.assign("/admin.html");
}
function renderAdminActions(){
  if(!isAdminPage && !isAdminDashboard) return;
  els.loginForm?.addEventListener("submit",login); els.logoutBtn?.addEventListener("click",logout);
  els.adminForm?.addEventListener("submit",async e=>{
    e.preventDefault(); if(!session.authenticated) return;
    const record={fullName:els.fullName.value.trim(),idNumber:normalizeId(els.idNumber.value),documentType:els.documentType.value.trim(),country:els.country.value.trim(),nationality:els.nationality.value.trim(),sex:els.sex.value.trim(),dob:els.dob.value,placeOfBirth:els.placeOfBirth.value.trim(),issueDate:els.issueDate.value,expiry:els.expiry.value,issuingAuthority:els.issuingAuthority.value.trim(),address:els.address.value.trim(),verificationNotes:els.verificationNotes.value.trim(),photoUrl:els.photoUrl.value.trim(),status:"Approved"};
    const requiredFields=["fullName","idNumber","documentType","country","nationality","sex","dob","placeOfBirth","issueDate","expiry","issuingAuthority","address"];
    if(requiredFields.some(field=>!record[field])){els.authNote.textContent="Please complete all required fields before saving.";return;}
    try{const saved=await saveRecord(record);fillAdminForm(saved);els.authNote.textContent="Record saved successfully.";}catch(error){els.authNote.textContent=error.message;}
  });
  els.photoFile?.addEventListener("change",async e=>{
    const file=e.target.files?.[0]; if(!file) return;
    if(file.size>2*1024*1024){els.authNote.textContent="Please choose an image smaller than 2 MB.";e.target.value="";return;}
    try{const data=await readFileAsDataUrl(file);els.photoUrl.value=data;els.photoFormPreview.src=data;els.photoFormPreview.classList.remove("hidden");els.authNote.textContent="Photo loaded. Save the record to store it.";}
    catch(error){els.authNote.textContent=error.message;}
  });
  els.photoUrl?.addEventListener("input",()=>{const v=els.photoUrl.value.trim();if(v){els.photoFormPreview.src=v;els.photoFormPreview.classList.remove("hidden")}else els.photoFormPreview.classList.add("hidden")});
  els.clearForm?.addEventListener("click",()=>{clearAdminForm();els.authNote.textContent="Form cleared. Enter the details for a new record.";});
  els.recordsTable?.addEventListener("click",async e=>{
    const button=e.target.closest("button[data-action]");
    if(!button) return;
    const id=button.dataset.id||"";
    if(!id) return;
    if(button.dataset.action==="edit"){
      const record=records.find(r=>normalizeId(r.idNumber)===normalizeId(id));
      if(record){fillAdminForm(record);renderRecord(record);els.authNote.textContent=`Editing ${record.fullName}.`;els.fullName?.focus();}
      return;
    }
    if(button.dataset.action==="delete"){
      const record=records.find(r=>normalizeId(r.idNumber)===normalizeId(id));
      const name=record?.fullName||id;
      if(!window.confirm(`Delete the approved record for ${name}? This will immediately remove it from public verification.`)) return;
      button.disabled=true;
      try{await removeRecord(id);els.authNote.textContent="Record deleted successfully.";}
      catch(error){els.authNote.textContent=error.message;button.disabled=false;}
    }
  });
}
async function loadAdmin(){
  try{
    session=await fetchJson("/api/session");
    setAuthState(Boolean(session.authenticated));
    if(session.authenticated && isAdminPage && !isAdminDashboard){
      window.location.replace("/admin-dashboard.html");
      return;
    }
    if(session.authenticated){
      const response=await fetchJson("/api/records");
      records=response.records||[]; renderTable();
      const initial=records[0];
      if(initial){ renderRecord(initial); fillAdminForm(initial); }
      else { clearAdminForm(); renderRecord(null); }
    } else {
      clearAdminForm();
      if(isAdminDashboard){ window.location.replace("/admin.html"); return; }
    }
  }catch(error){
    setAuthState(false);
    if(isAdminDashboard){ window.location.replace("/admin.html"); return; }
    if(els.authNote)els.authNote.textContent=error.message;
  }
}
renderAdminActions();
if(isAdminPage || isAdminDashboard) loadAdmin(); else loadClient();
