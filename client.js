const API_BASE = "";
const isAdminPage = document.body.classList.contains("admin-page");

const seedRecord = {
  fullName: "Olena Shevchenko",
  idNumber: "ID-0001",
  documentType: "Passport",
  country: "Ukraine",
  dob: "1998-01-14",
  expiry: "2028-08-12",
  address: "Kyiv, Ukraine",
  photoUrl: "",
  status: "Approved"
};

const els = {
  previewAvatar: document.getElementById("previewAvatar"),
  previewPhoto: document.getElementById("previewPhoto"),
  previewName: document.getElementById("previewName"),
  previewRole: document.getElementById("previewRole"),
  previewId: document.getElementById("previewId"),
  previewStatus: document.getElementById("previewStatus"),
  previewCountry: document.getElementById("previewCountry"),
  previewExpiry: document.getElementById("previewExpiry"),
  barcodePreview: document.getElementById("barcodePreview"),
  shareQr: document.getElementById("shareQr"),
  shareLink: document.getElementById("shareLink"),
  loginForm: document.getElementById("loginForm"),
  adminPassword: document.getElementById("adminPassword"),
  loginBtn: document.getElementById("loginBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  authNote: document.getElementById("authNote"),
  adminForm: document.getElementById("adminForm"),
  fullName: document.getElementById("fullName"),
  idNumber: document.getElementById("idNumber"),
  documentType: document.getElementById("documentType"),
  country: document.getElementById("country"),
  dob: document.getElementById("dob"),
  expiry: document.getElementById("expiry"),
  address: document.getElementById("address"),
  photoUrl: document.getElementById("photoUrl"),
  photoFile: document.getElementById("photoFile"),
  seedDemo: document.getElementById("seedDemo"),
  recordsTable: document.getElementById("recordsTable"),
  scanInput: document.getElementById("scanInput"),
  lookupBtn: document.getElementById("lookupBtn"),
  cameraBtn: document.getElementById("cameraBtn"),
  cameraNote: document.getElementById("cameraNote"),
  resultBody: document.getElementById("resultBody"),
  emptyState: document.getElementById("emptyState"),
  resultAvatar: document.getElementById("resultAvatar"),
  resultPhoto: document.getElementById("resultPhoto"),
  resultName: document.getElementById("resultName"),
  resultDocument: document.getElementById("resultDocument"),
  resultStatus: document.getElementById("resultStatus"),
  resultBarcode: document.getElementById("resultBarcode"),
  resultId: document.getElementById("resultId"),
  resultCountry: document.getElementById("resultCountry"),
  resultDob: document.getElementById("resultDob"),
  resultExpiry: document.getElementById("resultExpiry"),
  resultAddress: document.getElementById("resultAddress"),
  startCameraBtn: document.getElementById("startCameraBtn"),
  stopCameraBtn: document.getElementById("stopCameraBtn"),
  cameraFeed: document.getElementById("cameraFeed"),
  cameraState: document.getElementById("cameraState")
};

let records = [];
let session = { authenticated: false };
let stream = null;
let detector = null;
let cameraLoop = null;
const origin = window.location.origin === "null"
  ? `${window.location.protocol}//${window.location.host}`
  : window.location.origin;

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});

function normalizeId(value) {
  return String(value || "").trim().toUpperCase();
}

function formatDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value || "");
  }
  return dateFormatter.format(parsed);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function barcodePattern(value) {
  const chars = normalizeId(value).replace(/[^A-Z0-9]/g, "");
  return Array.from(chars).map((char, index) => {
    const barWidth = 2 + ((char.charCodeAt(0) + index) % 4);
    return `<span style="width:${barWidth}px"></span>`;
  }).join("");
}

function renderBarcode(target, value) {
  if (!target) return;
  target.innerHTML = barcodePattern(value);
}

function renderPhoto(target, fallbackAvatar, value, name) {
  if (!target || !fallbackAvatar) return;
  const src = String(value || "").trim();
  const initials = String(name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || "")
    .join("")
    .slice(0, 2) || "ID";

  fallbackAvatar.textContent = initials;
  if (src) {
    target.src = src;
    target.classList.remove("hidden");
    fallbackAvatar.classList.add("hidden");
  } else {
    target.removeAttribute("src");
    target.classList.add("hidden");
    fallbackAvatar.classList.remove("hidden");
  }
}

function renderQr(idNumber) {
  if (!els.shareQr || !els.shareLink) return;
  const link = `${origin}/?id=${encodeURIComponent(idNumber)}`;
  els.shareLink.textContent = link;
  els.shareLink.href = link;
  els.shareQr.src = `/api/qr/${encodeURIComponent(idNumber)}.svg`;
}

function renderRecord(record) {
  if (!record) return;
  if (els.previewName) els.previewName.textContent = record.fullName;
  if (els.previewRole) els.previewRole.textContent = record.documentType;
  if (els.previewId) els.previewId.textContent = record.idNumber;
  if (els.previewStatus) els.previewStatus.textContent = record.status;
  if (els.previewCountry) els.previewCountry.textContent = record.country;
  if (els.previewExpiry) els.previewExpiry.textContent = formatDate(record.expiry);
  renderPhoto(els.previewPhoto, els.previewAvatar, record.photoUrl, record.fullName);
  renderBarcode(els.barcodePreview, record.idNumber);
  renderQr(record.idNumber);
}

function showResult(record) {
  if (!els.resultBody || !els.emptyState) return;
  if (!record) {
    els.emptyState.classList.remove("hidden");
    els.resultBody.classList.add("hidden");
    return;
  }
  els.emptyState.classList.add("hidden");
  els.resultBody.classList.remove("hidden");
  els.resultAvatar.textContent = record.fullName.split(" ").filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase() || "").join("").slice(0, 2);
  els.resultName.textContent = record.fullName;
  els.resultDocument.textContent = record.documentType;
  els.resultStatus.textContent = record.status;
  els.resultId.textContent = record.idNumber;
  els.resultCountry.textContent = record.country;
  els.resultDob.textContent = formatDate(record.dob);
  els.resultExpiry.textContent = formatDate(record.expiry);
  els.resultAddress.textContent = record.address;
  renderPhoto(els.resultPhoto, els.resultAvatar, record.photoUrl, record.fullName);
  renderBarcode(els.resultBarcode, record.idNumber);
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function loadState() {
  const [recordsResponse, sessionResponse] = await Promise.all([
    fetchJson("/api/records"),
    fetchJson("/api/session")
  ]);
  records = recordsResponse.records || [];
  session = sessionResponse;
  const initial = records[0] || seedRecord;

  if (isAdminPage) {
    renderTable();
    renderRecord(initial);
    setAuthState(Boolean(session.authenticated));
  } else {
    renderRecord(initial);
    showResult(initial);
    initClientLookup();
    syncRequestedId();
  }
}

function setAuthState(authenticated) {
  if (!isAdminPage) return;
  session.authenticated = authenticated;
  els.authNote.textContent = authenticated
    ? "Admin access granted. You can save and edit approved records."
    : "Log in to access the approved record form.";
  if (els.adminForm) {
    els.adminForm.querySelectorAll("input, textarea, button[type='submit']").forEach(el => {
      el.disabled = !authenticated;
    });
    els.adminForm.style.opacity = authenticated ? "1" : "0.7";
    els.adminForm.style.pointerEvents = authenticated ? "auto" : "none";
  }
  if (els.adminPassword) els.adminPassword.disabled = authenticated;
  if (els.loginBtn) els.loginBtn.disabled = authenticated;
  if (els.logoutBtn) els.logoutBtn.disabled = !authenticated;
}

function renderTable() {
  if (!els.recordsTable) return;
  els.recordsTable.innerHTML = records.map(record => `
    <tr>
      <td>${escapeHtml(record.fullName)}</td>
      <td>${escapeHtml(record.idNumber)}</td>
      <td>${escapeHtml(record.country)}</td>
      <td>${escapeHtml(record.status)}</td>
    </tr>
  `).join("");
}

function fillAdminForm(record) {
  if (!isAdminPage) return;
  els.fullName.value = record.fullName;
  els.idNumber.value = record.idNumber;
  els.documentType.value = record.documentType;
  els.country.value = record.country;
  els.dob.value = record.dob;
  els.expiry.value = record.expiry;
  els.address.value = record.address;
  els.photoUrl.value = record.photoUrl || "";
  if (els.photoFile) els.photoFile.value = "";
}

function findRecord(query) {
  const normalized = normalizeId(query);
  return records.find(record => normalizeId(record.idNumber) === normalized) || null;
}

async function saveRecord(record) {
  const result = await fetchJson("/api/records", {
    method: "POST",
    body: JSON.stringify(record)
  });
  records = result.records || records;
  renderTable();
  renderRecord(result.record);
  return result.record;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read the selected image."));
    reader.readAsDataURL(file);
  });
}

async function login(event) {
  event.preventDefault();
  try {
    const result = await fetchJson("/api/login", {
      method: "POST",
      body: JSON.stringify({ password: els.adminPassword.value.trim() })
    });
    session = result;
    setAuthState(true);
    els.adminPassword.value = "";
    els.authNote.textContent = "Admin login successful.";
  } catch (error) {
    els.authNote.textContent = error.message;
  }
}

async function logout() {
  try {
    await fetchJson("/api/logout", { method: "POST", body: "{}" });
  } catch {}
  setAuthState(false);
  els.authNote.textContent = "Logged out.";
}

function initClientLookup() {
  const lookup = () => {
    const record = findRecord(els.scanInput.value);
    showResult(record);
    els.cameraNote.textContent = record ? "Approved record loaded." : "No matching approved record found.";
  };
  els.lookupBtn.addEventListener("click", lookup);
  els.scanInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      lookup();
    }
  });
  els.cameraBtn.addEventListener("click", startCamera);
  els.startCameraBtn?.addEventListener("click", startCamera);
  els.stopCameraBtn?.addEventListener("click", stopCamera);
}

function stopCamera() {
  if (cameraLoop) clearTimeout(cameraLoop);
  cameraLoop = null;
  detector = null;
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  if (els.cameraFeed) els.cameraFeed.srcObject = null;
  if (els.cameraState) els.cameraState.textContent = "Camera off";
}

async function startCamera() {
  if (!els.cameraFeed) return;
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera access is not available in this browser.");
    }
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    els.cameraFeed.srcObject = stream;
    await els.cameraFeed.play();
    els.cameraState.textContent = "Camera on";

    if ("BarcodeDetector" in window) {
      detector = new BarcodeDetector({
        formats: ["code_128", "code_39", "code_93", "ean_13", "ean_8", "upc_a", "upc_e", "qr_code"]
      });
      scanLoop();
    } else {
      els.cameraNote.textContent = "This browser does not support barcode detection. Use manual lookup instead.";
    }
  } catch (error) {
    stopCamera();
    els.cameraNote.textContent = error.message;
  }
}

async function scanLoop() {
  if (!detector || !stream) return;
  try {
    const results = await detector.detect(els.cameraFeed);
    if (results.length > 0) {
      const code = results[0].rawValue || "";
      if (code) {
        els.scanInput.value = code;
        const record = findRecord(code);
        showResult(record);
        els.cameraNote.textContent = record ? `Detected ${code}.` : `Detected ${code}, but no approved record exists.`;
      }
    }
  } catch {}
  cameraLoop = setTimeout(scanLoop, 250);
}

function syncRequestedId() {
  const requestedId = new URL(window.location.href).searchParams.get("id");
  if (!requestedId) return;
  const record = findRecord(requestedId);
  if (record) {
    els.scanInput.value = record.idNumber;
    showResult(record);
    renderRecord(record);
  }
}

function renderAdminActions() {
  if (!isAdminPage) return;
  els.loginForm.addEventListener("submit", login);
  els.logoutBtn.addEventListener("click", logout);
  els.adminForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!session.authenticated) {
      els.authNote.textContent = "Please log in first.";
      return;
    }

    const record = {
      fullName: els.fullName.value.trim(),
      idNumber: normalizeId(els.idNumber.value),
      documentType: els.documentType.value.trim(),
      country: els.country.value.trim(),
      dob: els.dob.value,
      expiry: els.expiry.value,
      address: els.address.value.trim(),
      photoUrl: els.photoUrl.value.trim(),
      status: "Approved"
    };

    if (!record.fullName || !record.idNumber || !record.documentType || !record.country || !record.dob || !record.expiry || !record.address) {
      return;
    }

    try {
      const saved = await saveRecord(record);
      fillAdminForm(saved);
      renderRecord(saved);
      renderTable();
      els.authNote.textContent = "Record saved and approved.";
    } catch (error) {
      els.authNote.textContent = error.message;
    }
  });

  els.photoFile?.addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      els.photoUrl.value = dataUrl;
      const preview = {
        fullName: els.fullName.value.trim() || seedRecord.fullName,
        photoUrl: dataUrl,
        documentType: els.documentType.value.trim() || seedRecord.documentType,
        idNumber: normalizeId(els.idNumber.value) || seedRecord.idNumber,
        status: "Approved",
        country: els.country.value.trim() || seedRecord.country,
        expiry: els.expiry.value || seedRecord.expiry
      };
      renderRecord(preview);
      els.authNote.textContent = "Photo loaded. Save the record to store it.";
    } catch (error) {
      els.authNote.textContent = error.message;
    }
  });

  els.seedDemo.addEventListener("click", () => {
    fillAdminForm(seedRecord);
    renderRecord(seedRecord);
  });
}

loadState().catch(error => {
  if (isAdminPage) {
    setAuthState(false);
    els.authNote.textContent = error.message;
  }
  if (els.cameraNote) {
    els.cameraNote.textContent = "Backend unavailable. Start the server to enable saving and login.";
  }
  renderRecord(seedRecord);
  showResult(seedRecord);
});

renderAdminActions();
