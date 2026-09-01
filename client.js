const API_BASE = "";
const isAdminPage = document.body.classList.contains("admin-page");
const isAdminDashboard = document.body.classList.contains("admin-dashboard-page");

const els = Object.fromEntries([
  "previewAvatar","previewPhoto","previewName","previewRole","previewId","previewStatus","previewCountry","previewExpiry",
  "barcodePreview","shareQr","shareLink","loginForm","adminPassword","loginBtn","logoutBtn","authNote","adminForm",
  "fullName","idNumber","documentType","country","nationality","sex","dob","placeOfBirth","issueDate","expiry","issuingAuthority","address","verificationNotes","photoUrl","photoFile","photoFormPreview",
  "clearForm","recordsTable","recordCount","tableEmpty","scanInput","clearInput","lookupBtn","cameraBtn","cameraNote",
  "resultBody","emptyState","resultAvatar","resultPhoto","resultName","resultDocument","resultStatus","resultBarcode",
  "resultId","resultCountry","resultNationality","resultSex","resultDob","resultPlaceOfBirth","resultIssueDate","resultExpiry","resultIssuingAuthority","resultAddress","resultOutcome","resultCheckedId","verificationBanner","verificationIcon","verificationTitle","verificationMessage","emptyTitle","emptyMessage","startCameraBtn","stopCameraBtn","cameraFeed",
  "cameraState","cameraPlaceholder","downloadVerificationBtn"
].map(id => [id, document.getElementById(id)]));

let records = [];
let session = { authenticated: false };
// Holds the database reference being edited. This lets an edit safely change
// the reference number without accidentally creating a second record.
let editingRecordId = null;
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
  els.shareQr.src=`/api/qr/${encodeURIComponent(idNumber)}.svg`; els.shareQr.onerror=()=>{ els.shareQr.alt="QR code temporarily unavailable"; els.shareQr.removeAttribute("src"); };
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
function setText(el, value){ if(el) el.textContent = value == null ? "—" : String(value); }
function setEmptyState(title, message){
  setText(els.emptyTitle, title);
  setText(els.emptyMessage, message);
}
function getRecordOutcome(record){
  const expiry = record?.expiry ? new Date(record.expiry) : null;
  if (expiry && !Number.isNaN(expiry.getTime())) {
    expiry.setHours(23,59,59,999);
    if (expiry < new Date()) return { label:"Expired", tone:"expired", title:"Record expired", message:"This record was found, but its stated validity period has ended." };
  }
  if (String(record?.status || "").toLowerCase() !== "approved") return { label:"Not approved", tone:"invalid", title:"Record not approved", message:"A matching record was found, but it is not currently approved for verification." };
  return { label: String(record?.documentType || "Passport").toLowerCase().includes("passport") ? "Valid passport" : "Valid", tone:"valid", title:"Record verified", message:"This reference matches an approved record and is currently within its stated validity period." };
}
function showResult(record){
  if(!els.resultBody || !els.emptyState) return;
  if(!record){
    els.emptyState.classList.remove("hidden"); els.resultBody.classList.add("hidden");
    setEmptyState("No matching record", "No approved record was found for that reference. Check the number and try again.");
    els.downloadVerificationBtn?.classList.add("hidden");
    return;
  }
  els.emptyState.classList.add("hidden"); els.resultBody.classList.remove("hidden");
  const outcome=getRecordOutcome(record);
  setText(els.resultAvatar, initials(record.fullName)); setText(els.resultName, record.fullName);
  setText(els.resultDocument, record.documentType); setText(els.resultStatus, outcome.label);
  setText(els.resultId, record.idNumber); setText(els.resultCountry, record.country);
  setText(els.resultNationality, record.nationality); setText(els.resultSex, record.sex);
  setText(els.resultDob, formatDate(record.dob)); setText(els.resultPlaceOfBirth, record.placeOfBirth);
  setText(els.resultIssueDate, formatDate(record.issueDate)); setText(els.resultExpiry, formatDate(record.expiry));
  setText(els.resultIssuingAuthority, record.issuingAuthority);
  setText(els.resultAddress, record.address); renderPhoto(els.resultPhoto,els.resultAvatar,record.photoUrl,record.fullName);
  setText(els.resultOutcome, outcome.label); setText(els.resultCheckedId, record.idNumber);
  setText(els.verificationTitle, outcome.title); setText(els.verificationMessage, outcome.message);
  els.verificationBanner?.classList.remove("is-valid","is-expired","is-invalid");
  els.verificationBanner?.classList.add(`is-${outcome.tone}`);
  if(els.verificationIcon) els.verificationIcon.textContent = outcome.tone === "valid" ? "✓" : "!";
  els.resultStatus?.classList.remove("badge-valid","badge-expired","badge-invalid");
  els.resultStatus?.classList.add(`badge-${outcome.tone}`);
  renderBarcode(els.resultBarcode,record.idNumber);
  els.downloadVerificationBtn?.classList.remove("hidden");
}
function downloadVerificationSummary(record){
  if(!record) return;
  const outcome=getRecordOutcome(record);
  const safe=v=>escapeHtml(v == null || v === "" ? "—" : v);
  const date=v=>safe(formatDate(v));
  const photo=String(record.photoUrl||"").trim();
  const id=normalizeId(record.idNumber);
  const origin=window.location.origin;
  const verificationUrl=`${origin}/?id=${encodeURIComponent(id)}`;
  const qrUrl=`${origin}/api/qr/${encodeURIComponent(id)}.svg`;
  const photoHtml=photo
    ? `<img class="photo" src="${safe(photo)}" alt="Verification photo">`
    : `<div class="photo placeholder">${safe(initials(record.fullName))}</div>`;
  const tone=outcome.tone;
  const cardHtml=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verification Credential — ${safe(id)}</title><style>
  *{box-sizing:border-box}html,body{margin:0;min-height:100%;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#10233d}body{background:#edf2f6;padding:24px;display:grid;place-items:center}.sheet{width:min(920px,100%)}.toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:0 0 16px}.toolbar h1{font-size:16px;margin:0}.toolbar button{border:0;border-radius:10px;padding:10px 14px;background:#12304d;color:#fff;font-weight:800;cursor:pointer}.card{width:100%;max-width:856px;aspect-ratio:85.6/54;min-height:340px;margin:auto;border:1px solid #cbd7e1;border-radius:22px;background:#fff;overflow:hidden;box-shadow:0 18px 50px rgba(16,35,61,.14);position:relative}.head{height:22%;background:linear-gradient(135deg,#102c48,#174c63);color:#fff;padding:18px 24px;display:flex;justify-content:space-between;align-items:center}.brand{font-size:12px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.credential{font-size:10px;opacity:.78;margin-top:4px}.status{padding:7px 11px;border-radius:999px;background:#eaf8f0;color:#176f47;font-size:10px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.status.expired{background:#fff4e8;color:#9a5c00}.status.invalid{background:#fdecec;color:#a12b2b}.body{display:grid;grid-template-columns:112px 1fr 116px;gap:18px;padding:20px 24px;height:78%;align-items:start}.photo{width:104px;height:128px;border-radius:14px;object-fit:cover;border:1px solid #cad6df;background:#eef3f7}.placeholder{display:grid;place-items:center;font-size:28px;font-weight:900;color:#597087}.name{font-size:23px;font-weight:900;line-height:1.1;margin-bottom:5px}.type{font-size:11px;color:#68798b;font-weight:700;margin-bottom:15px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 18px}.field{min-width:0}.label{font-size:8px;font-weight:900;color:#758699;letter-spacing:.08em;text-transform:uppercase}.value{font-size:11px;font-weight:800;margin-top:3px;overflow-wrap:anywhere}.qr{width:104px;height:104px;border:1px solid #d6e0e7;border-radius:10px;padding:7px;background:#fff}.qr-label{font-size:8px;color:#718194;text-align:center;margin-top:6px;font-weight:800}.ref{position:absolute;right:24px;bottom:14px;font-size:9px;color:#738396;font-weight:800;letter-spacing:.05em}.notice{margin-top:14px;padding:10px 12px;border:1px solid #e0b56a;background:#fff8e9;border-radius:10px;color:#725000;font-size:9px;font-weight:900;text-align:center;letter-spacing:.03em}.print-note{margin-top:14px;text-align:center;color:#68798b;font-size:11px}.card-link{display:block;color:inherit;text-decoration:none}@media(max-width:650px){body{padding:12px}.toolbar{align-items:flex-start}.card{aspect-ratio:auto;min-height:0}.head{height:auto;padding:16px 18px}.body{height:auto;grid-template-columns:82px 1fr;gap:14px;padding:16px 18px}.photo{width:78px;height:98px}.name{font-size:17px}.grid{grid-template-columns:1fr}.qr-wrap{grid-column:1/-1;display:flex;align-items:center;gap:10px;margin-top:4px}.qr{width:78px;height:78px}.ref{position:static;grid-column:1/-1}.notice{margin:0 18px 16px}.print-note{font-size:10px}}@media print{body{background:#fff;padding:0}.toolbar,.print-note{display:none}.sheet{width:100%}.card{max-width:none;box-shadow:none;border:1px solid #aebbc6;break-inside:avoid}.notice{margin:10px 18px}.card:after{content:"";position:absolute;inset:0;border:1px solid rgba(255,255,255,.35);pointer-events:none}}@page{size:auto;margin:10mm}
  </style></head><body><main class="sheet"><div class="toolbar"><h1>Verification credential</h1><button type="button" onclick="window.print()">Print / Save as PDF</button></div><section class="card"><header class="head"><div><div class="brand">Private verification service</div><div class="credential">Passport verification record</div></div><div class="status ${tone==='expired'?'expired':tone==='invalid'?'invalid':''}">${safe(outcome.label)}</div></header><div class="body">${photoHtml}<div><div class="name">${safe(record.fullName)}</div><div class="type">${safe(record.documentType)}</div><div class="grid"><div class="field"><div class="label">Document number</div><div class="value">${safe(record.idNumber)}</div></div><div class="field"><div class="label">Issuing country</div><div class="value">${safe(record.country)}</div></div><div class="field"><div class="label">Nationality</div><div class="value">${safe(record.nationality)}</div></div><div class="field"><div class="label">Date of birth</div><div class="value">${date(record.dob)}</div></div><div class="field"><div class="label">Issue date</div><div class="value">${date(record.issueDate)}</div></div><div class="field"><div class="label">Expiry date</div><div class="value">${date(record.expiry)}</div></div><div class="field"><div class="label">Place of birth</div><div class="value">${safe(record.placeOfBirth)}</div></div><div class="field"><div class="label">Issuing authority</div><div class="value">${safe(record.issuingAuthority)}</div></div></div></div><div class="qr-wrap"><div><img class="qr" src="${safe(qrUrl)}" alt="Verification QR code"><div class="qr-label">Scan to verify</div></div></div><div class="ref">REF ${safe(id)}</div></div><div class="notice">FOR PASSPORT VERIFICATION REFERENCE ONLY</div></section><div class="print-note">This credential links back to the live verification record at <a class="card-link" href="${safe(verificationUrl)}">${safe(verificationUrl)}</a>.</div></main></body></html>`;
  const blob=new Blob([cardHtml],{type:"text/html;charset=utf-8"});
  const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`verification-credential-${id||"record"}.html`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
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
  if(!code){ setText(els.cameraNote,"Enter a reference number first."); els.scanInput.focus(); return; }
  if(els.lookupBtn) els.lookupBtn.disabled=true; setText(els.cameraNote,"Checking record…");
  try{
    const record=await fetchRecord(code);
    showResult(record);
    setText(els.cameraNote, record ? "Record verified successfully." : "No approved record was found for that reference.");
  }catch(error){ showResult(null); setText(els.cameraNote,error.message); }
  finally{ if(els.lookupBtn) els.lookupBtn.disabled=false; }
}
async function loadClient(){
  showResult(null);
  setEmptyState("Ready to verify", "Enter a reference number above to retrieve an approved record.");
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
  els.clearInput?.addEventListener("click",()=>{els.scanInput.value="";updateClear();els.scanInput.focus();showResult(null);setText(els.cameraNote,"Enter a reference to begin.");});
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
      try {
        const scannedUrl = new URL(code, window.location.origin);
        if (scannedUrl.origin === window.location.origin && scannedUrl.searchParams.get("id")) {
          stopCamera();
          window.location.href = scannedUrl.href;
          return;
        }
      } catch {}
      els.scanInput.value=code; updateClear();
      const record=await fetchRecord(code); showResult(record);
      els.cameraNote.textContent=record ? "Code detected and record verified." : "Code detected, but no approved record exists.";
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
  const isEditing = Boolean(editingRecordId);
  const path = isEditing
    ? `/api/records/${encodeURIComponent(editingRecordId)}`
    : "/api/records";
  const result=await fetchJson(path,{
    method:isEditing ? "PUT" : "POST",
    body:JSON.stringify(record)
  });
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
  editingRecordId = null;
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
    try{const saved=await saveRecord(record);editingRecordId=saved.idNumber;fillAdminForm(saved);els.authNote.textContent="Record saved successfully.";}catch(error){els.authNote.textContent=error.message;}
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
      if(record){editingRecordId=record.idNumber;fillAdminForm(record);renderRecord(record);els.authNote.textContent=`Editing ${record.fullName}.`;els.fullName?.focus();}
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
      if(initial){ editingRecordId=initial.idNumber; renderRecord(initial); fillAdminForm(initial); }
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

if(els.downloadVerificationBtn){ els.downloadVerificationBtn.addEventListener("click",()=>{ const id=normalizeId(els.resultCheckedId?.textContent||""); const record=records.find(r=>normalizeId(r.idNumber)===id); if(record) downloadVerificationSummary(record); else fetchRecord(id).then(downloadVerificationSummary).catch(()=>{}); }); }
