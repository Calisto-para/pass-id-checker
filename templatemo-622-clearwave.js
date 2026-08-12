const API_BASE = "";

const seedRecord = {
  fullName: "Ada Okafor",
  idNumber: "ID-0001",
  documentType: "Passport",
  country: "Nigeria",
  dob: "1998-01-14",
  expiry: "2028-08-12",
  address: "Lagos, Nigeria",
  photoUrl: "",
  status: "Verified"
};

const elements = {
  previewName: document.getElementById("previewName"),
  previewRole: document.getElementById("previewRole"),
  previewId: document.getElementById("previewId"),
  previewStatus: document.getElementById("previewStatus"),
  previewCountry: document.getElementById("previewCountry"),
  previewExpiry: document.getElementById("previewExpiry"),
  barcodePreview: document.getElementById("barcodePreview"),
  shareQr: document.getElementById("shareQr"),
  shareLink: document.getElementById("shareLink"),
  adminForm: document.getElementById("adminForm"),
  loginForm: document.getElementById("loginForm"),
  adminPassword: document.getElementById("adminPassword"),
  loginBtn: document.getElementById("loginBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  authNote: document.getElementById("authNote"),
  fullName: document.getElementById("fullName"),
  idNumber: document.getElementById("idNumber"),
  documentType: document.getElementById("documentType"),
  country: document.getElementById("country"),
  dob: document.getElementById("dob"),
  expiry: document.getElementById("expiry"),
  address: document.getElementById("address"),
  photoUrl: document.getElementById("photoUrl"),
  seedDemo: document.getElementById("seedDemo"),
  scanInput: document.getElementById("scanInput"),
  lookupBtn: document.getElementById("lookupBtn"),
  clearBtn: document.getElementById("clearBtn"),
  emptyState: document.getElementById("emptyState"),
  resultBody: document.getElementById("resultBody"),
  resultAvatar: document.getElementById("resultAvatar"),
  resultName: document.getElementById("resultName"),
  resultDocument: document.getElementById("resultDocument"),
  resultStatus: document.getElementById("resultStatus"),
  resultBarcode: document.getElementById("resultBarcode"),
  resultId: document.getElementById("resultId"),
  resultCountry: document.getElementById("resultCountry"),
  resultDob: document.getElementById("resultDob"),
  resultExpiry: document.getElementById("resultExpiry"),
  resultAddress: document.getElementById("resultAddress"),
  recordsTable: document.getElementById("recordsTable"),
  cameraFeed: document.getElementById("cameraFeed"),
  cameraState: document.getElementById("cameraState"),
  cameraNote: document.getElementById("cameraNote"),
  startCameraBtn: document.getElementById("startCameraBtn"),
  stopCameraBtn: document.getElementById("stopCameraBtn")
};

let records = [];
let session = { authenticated: false };
let mediaStream = null;
let scanner = null;
let scanning = false;
let scanLoopHandle = null;
const appOrigin = window.location.origin === "null"
  ? `${window.location.protocol}//${window.location.host}`
  : window.location.origin;

function normalizeId(value) {
  return String(value || "").trim().toUpperCase();
}

function barcodePattern(value) {
  const chars = normalizeId(value).replace(/[^A-Z0-9]/g, "");
  if (!chars) {
    return "";
  }

  return Array.from(chars)
    .map((char, index) => {
      const code = char.charCodeAt(0);
      const barWidth = 2 + ((code + index) % 4);
      return `<span style="width:${barWidth}px"></span>`;
    })
    .join("");
}

function renderBarcode(target, value) {
  target.innerHTML = barcodePattern(value);
}

function setAuthState(authenticated) {
  session.authenticated = authenticated;
  elements.adminForm.querySelectorAll("input, textarea, button[type='submit']").forEach(el => {
    el.disabled = !authenticated;
  });
  elements.adminPassword.disabled = authenticated;
  elements.loginBtn.disabled = authenticated;
  elements.logoutBtn.disabled = !authenticated;
  elements.authNote.textContent = authenticated
    ? "Admin access granted. You can save and edit records."
    : "Log in to save or edit records.";
  elements.adminForm.style.opacity = authenticated ? "1" : "0.7";
  elements.adminForm.style.pointerEvents = authenticated ? "auto" : "none";
}

function renderPreview(record) {
  if (!record) {
    return;
  }
  elements.previewName.textContent = record.fullName;
  elements.previewRole.textContent = record.documentType;
  elements.previewId.textContent = record.idNumber;
  elements.previewStatus.textContent = record.status;
  elements.previewCountry.textContent = record.country;
  elements.previewExpiry.textContent = record.expiry;
  renderBarcode(elements.barcodePreview, record.idNumber);
  renderClientQr(record.idNumber);
}

function renderClientQr(idNumber) {
  const link = `${appOrigin}/?id=${encodeURIComponent(idNumber)}`;
  elements.shareLink.textContent = link;
  elements.shareLink.href = link;
  elements.shareQr.src = `/api/qr/${encodeURIComponent(idNumber)}.svg`;
}

function renderTable() {
  elements.recordsTable.innerHTML = records
    .map(record => `
      <tr>
        <td>${escapeHtml(record.fullName)}</td>
        <td>${escapeHtml(record.idNumber)}</td>
        <td>${escapeHtml(record.country)}</td>
        <td>${escapeHtml(record.status)}</td>
      </tr>
    `)
    .join("");
}

function showResult(record) {
  if (!record) {
    elements.emptyState.classList.remove("hidden");
    elements.resultBody.classList.add("hidden");
    return;
  }

  elements.emptyState.classList.add("hidden");
  elements.resultBody.classList.remove("hidden");
  elements.resultAvatar.textContent = record.fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || "")
    .join("")
    .slice(0, 2);
  elements.resultName.textContent = record.fullName;
  elements.resultDocument.textContent = record.documentType;
  elements.resultStatus.textContent = record.status;
  elements.resultId.textContent = record.idNumber;
  elements.resultCountry.textContent = record.country;
  elements.resultDob.textContent = record.dob;
  elements.resultExpiry.textContent = record.expiry;
  elements.resultAddress.textContent = record.address;
  renderBarcode(elements.resultBarcode, record.idNumber);
}

function fillAdminForm(record) {
  elements.fullName.value = record.fullName;
  elements.idNumber.value = record.idNumber;
  elements.documentType.value = record.documentType;
  elements.country.value = record.country;
  elements.dob.value = record.dob;
  elements.expiry.value = record.expiry;
  elements.address.value = record.address;
  elements.photoUrl.value = record.photoUrl || "";
}

function findRecord(query) {
  const normalized = normalizeId(query);
  return records.find(record => normalizeId(record.idNumber) === normalized) || null;
}

function upsertLocalRecord(record) {
  const index = records.findIndex(item => normalizeId(item.idNumber) === normalizeId(record.idNumber));
  if (index >= 0) {
    records[index] = record;
  } else {
    records = [record, ...records];
  }
  renderTable();
  renderPreview(records[0]);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

async function loadState() {
  const [recordsResponse, sessionResponse] = await Promise.all([
    fetchJson("/api/records"),
    fetchJson("/api/session")
  ]);
  records = recordsResponse.records || [];
  session = sessionResponse;
  if (records.length === 0) {
    records = [seedRecord];
  }
  renderTable();
  renderPreview(records[0] || seedRecord);
  showResult(records[0] || seedRecord);
  setAuthState(Boolean(session.authenticated));

  const requestedId = new URL(window.location.href).searchParams.get("id");
  if (requestedId) {
    const directRecord = records.find(record => normalizeId(record.idNumber) === normalizeId(requestedId));
    if (directRecord) {
      elements.scanInput.value = directRecord.idNumber;
      showResult(directRecord);
      renderPreview(directRecord);
      elements.cameraNote.textContent = `Loaded record for ${directRecord.idNumber}.`;
    } else {
      elements.cameraNote.textContent = "No record matched the scanned ID.";
    }
  }
}

async function login(event) {
  event.preventDefault();
  const password = elements.adminPassword.value.trim();
  if (!password) {
    elements.authNote.textContent = "Enter the admin password first.";
    return;
  }

  try {
    const result = await fetchJson("/api/login", {
      method: "POST",
      body: JSON.stringify({ password })
    });
    session = result;
    setAuthState(true);
    elements.adminPassword.value = "";
    elements.authNote.textContent = "Admin login successful.";
  } catch (error) {
    elements.authNote.textContent = error.message;
  }
}

async function logout() {
  try {
    await fetchJson("/api/logout", { method: "POST", body: "{}" });
  } catch {}
  session = { authenticated: false };
  setAuthState(false);
  elements.authNote.textContent = "Logged out.";
}

async function saveRecord(record) {
  const result = await fetchJson("/api/records", {
    method: "POST",
    body: JSON.stringify(record)
  });
  records = result.records || records;
  renderTable();
  renderPreview(records[0] || record);
  renderClientQr(result.record.idNumber);
  return result.record;
}

elements.loginForm.addEventListener("submit", login);
elements.logoutBtn.addEventListener("click", logout);

elements.adminForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!session.authenticated) {
    elements.authNote.textContent = "Please log in first.";
    return;
  }

  const record = {
    fullName: elements.fullName.value.trim(),
    idNumber: normalizeId(elements.idNumber.value),
    documentType: elements.documentType.value.trim(),
    country: elements.country.value.trim(),
    dob: elements.dob.value,
    expiry: elements.expiry.value,
    address: elements.address.value.trim(),
    photoUrl: elements.photoUrl.value.trim(),
    status: "Verified"
  };

  if (!record.fullName || !record.idNumber || !record.documentType || !record.country || !record.dob || !record.expiry || !record.address) {
    return;
  }

  try {
    const saved = await saveRecord(record);
    fillAdminForm(saved);
    elements.scanInput.value = saved.idNumber;
    showResult(saved);
    elements.authNote.textContent = "Record saved.";
  } catch (error) {
    elements.authNote.textContent = error.message;
  }
});

elements.lookupBtn.addEventListener("click", () => {
  const record = findRecord(elements.scanInput.value);
  showResult(record);
  if (!record) {
    elements.cameraNote.textContent = "No matching record found.";
  }
});

elements.scanInput.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    elements.lookupBtn.click();
  }
});

elements.clearBtn.addEventListener("click", () => {
  elements.scanInput.value = "";
  showResult(null);
  elements.cameraNote.textContent = "Use a supported browser to scan a barcode or QR code with your camera.";
});

elements.seedDemo.addEventListener("click", () => {
  fillAdminForm(seedRecord);
  elements.scanInput.value = seedRecord.idNumber;
  showResult(seedRecord);
});

function stopCamera() {
  scanning = false;
  if (scanLoopHandle) {
    clearTimeout(scanLoopHandle);
    scanLoopHandle = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  if (elements.cameraFeed.srcObject) {
    elements.cameraFeed.srcObject = null;
  }
  elements.cameraState.textContent = "Camera off";
}

async function scanFrame() {
  if (!scanning || !scanner || !mediaStream) {
    return;
  }

  const video = elements.cameraFeed;
  if (video.readyState >= 2) {
    try {
      const barcodes = await scanner.detect(video);
      if (barcodes.length > 0) {
        const code = barcodes[0].rawValue || "";
        if (code) {
          elements.scanInput.value = code;
          elements.lookupBtn.click();
          elements.cameraNote.textContent = `Detected ${code}.`;
        }
      }
    } catch {
      // ignore per-frame scanner errors
    }
  }

  scanLoopHandle = setTimeout(scanFrame, 250);
}

async function startCamera() {
  try {
    if (!("mediaDevices" in navigator) || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Camera access is not available in this browser.");
    }

    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });

    elements.cameraFeed.srcObject = mediaStream;
    await elements.cameraFeed.play();
    elements.cameraState.textContent = "Camera on";
    elements.cameraNote.textContent = "Point the camera at a barcode or QR code.";
    scanning = true;

    if ("BarcodeDetector" in window) {
      scanner = new BarcodeDetector({
        formats: [
          "code_128",
          "code_39",
          "code_93",
          "ean_13",
          "ean_8",
          "upc_a",
          "upc_e",
          "qr_code"
        ]
      });
      scanFrame();
    } else {
      scanner = null;
      elements.cameraNote.textContent = "This browser does not support barcode detection. Use manual lookup instead.";
    }
  } catch (error) {
    stopCamera();
    elements.cameraNote.textContent = error.message;
  }
}

elements.startCameraBtn.addEventListener("click", startCamera);
elements.stopCameraBtn.addEventListener("click", stopCamera);

loadState().catch(error => {
  records = [seedRecord];
  renderTable();
  renderPreview(seedRecord);
  showResult(seedRecord);
  setAuthState(false);
  elements.authNote.textContent = error.message;
  elements.cameraNote.textContent = "Backend unavailable. Start the server to enable saving and login.";
});
