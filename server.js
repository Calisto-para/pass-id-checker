const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { initDb, listRecords, findRecordById, upsertRecord, deleteRecord } = require("./db");

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === "production" ? "" : "admin123");
if (process.env.NODE_ENV === "production" && !ADMIN_PASSWORD) {
  throw new Error("ADMIN_PASSWORD must be configured in production");
}
const SESSION_COOKIE = "idv_session";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".svg": "image/svg+xml"
};

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

let sessionToken = null;

function normalizeId(value) {
  return String(value || "").trim().toUpperCase();
}

function parseBody(req) {
  return new Promise(resolve => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
  });
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders
  });
  res.end(JSON.stringify(payload));
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = mimeTypes[ext] || "application/octet-stream";
  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
}

function getCookie(req, name) {
  const header = req.headers.cookie || "";
  const parts = header.split(";").map(part => part.trim());
  for (const part of parts) {
    const [key, ...rest] = part.split("=");
    if (key === name) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

function isAuthenticated(req) {
  return getCookie(req, SESSION_COOKIE) === sessionToken && sessionToken !== null;
}

function gfTables() {
  const exp = new Array(512);
  const log = new Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) {
    exp[i] = x;
    log[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i++) {
    exp[i] = exp[i - 255];
  }
  return { exp, log };
}

const gf = gfTables();

function gfMul(a, b) {
  if (!a || !b) {
    return 0;
  }
  return gf.exp[gf.log[a] + gf.log[b]];
}

function polyMul(p, q) {
  const result = new Array(p.length + q.length - 1).fill(0);
  for (let i = 0; i < p.length; i++) {
    for (let j = 0; j < q.length; j++) {
      result[i + j] ^= gfMul(p[i], q[j]);
    }
  }
  return result;
}

function rsGenerator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    poly = polyMul(poly, [1, gf.exp[i]]);
  }
  return poly;
}

function rsRemainder(data, degree) {
  const generator = rsGenerator(degree);
  const work = data.slice();
  for (let i = 0; i < degree; i++) {
    work.push(0);
  }
  for (let i = 0; i < data.length; i++) {
    const factor = work[i];
    if (factor !== 0) {
      for (let j = 1; j < generator.length; j++) {
        work[i + j] ^= gfMul(generator[j], factor);
      }
    }
  }
  return work.slice(work.length - degree);
}

function appendBits(bits, value, length) {
  for (let i = length - 1; i >= 0; i--) {
    bits.push((value >>> i) & 1);
  }
}

function bitsToBytes(bits) {
  const bytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | (bits[i + j] || 0);
    }
    bytes.push(byte);
  }
  return bytes;
}

function drawFinder(matrix, reserved, x, y) {
  for (let dy = -1; dy <= 7; dy++) {
    for (let dx = -1; dx <= 7; dx++) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= matrix.length || yy >= matrix.length) {
        continue;
      }
      reserved[yy][xx] = true;
      const inPattern = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
      if (!inPattern) {
        matrix[yy][xx] = 0;
        continue;
      }
      const edge = dx === 0 || dx === 6 || dy === 0 || dy === 6;
      const center = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
      matrix[yy][xx] = edge || center ? 1 : 0;
    }
  }
}

function setFormatInfo(matrix, reserved, bits) {
  const size = matrix.length;
  const coordsA = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
  ];
  const coordsB = [
    [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8], [size - 5, 8],
    [size - 6, 8], [size - 7, 8], [8, size - 8], [8, size - 7], [8, size - 6],
    [8, size - 5], [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1]
  ];
  coordsA.forEach(([y, x], index) => {
    matrix[y][x] = bits[index];
    reserved[y][x] = true;
  });
  coordsB.forEach(([y, x], index) => {
    matrix[y][x] = bits[index];
    reserved[y][x] = true;
  });
}

function formatBitsLMask0() {
  return "111011111000100".split("").map(bit => Number(bit));
}

function createQrMatrix(text) {
  const value = String(text || "").trim().toUpperCase();
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length > 17) {
    throw new Error("QR content is too long for this simple generator");
  }

  const dataBits = [];
  appendBits(dataBits, 0b0100, 4);
  appendBits(dataBits, bytes.length, 8);
  bytes.forEach(byte => appendBits(dataBits, byte, 8));
  appendBits(dataBits, 0, Math.min(4, 152 - dataBits.length));
  while (dataBits.length % 8 !== 0) {
    dataBits.push(0);
  }
  let dataBytes = bitsToBytes(dataBits);
  while (dataBytes.length < 19) {
    dataBytes.push(dataBytes.length % 2 === 0 ? 0xec : 0x11);
  }
  dataBytes = dataBytes.slice(0, 19);
  const ecc = rsRemainder(dataBytes, 7);
  const codewords = [...dataBytes, ...ecc];

  const size = 21;
  const matrix = Array.from({ length: size }, () => Array(size).fill(null));
  const reserved = Array.from({ length: size }, () => Array(size).fill(false));

  drawFinder(matrix, reserved, 0, 0);
  drawFinder(matrix, reserved, size - 7, 0);
  drawFinder(matrix, reserved, 0, size - 7);

  for (let i = 0; i < size; i++) {
    if (!reserved[6][i]) {
      matrix[6][i] = i % 2 === 0 ? 1 : 0;
      reserved[6][i] = true;
    }
    if (!reserved[i][6]) {
      matrix[i][6] = i % 2 === 0 ? 1 : 0;
      reserved[i][6] = true;
    }
  }

  matrix[size - 8][8] = 1;
  reserved[size - 8][8] = true;

  setFormatInfo(matrix, reserved, formatBitsLMask0());

  const dataBitsStream = [];
  codewords.forEach(byte => appendBits(dataBitsStream, byte, 8));
  let bitIndex = 0;
  let upward = true;

  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) {
      col--;
    }
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (let offset = 0; offset < 2; offset++) {
        const x = col - offset;
        if (reserved[row][x]) {
          continue;
        }
        const bit = dataBitsStream[bitIndex++] || 0;
        matrix[row][x] = ((row + x) % 2 === 0) ? (bit ^ 1) : bit;
        reserved[row][x] = true;
      }
    }
    upward = !upward;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (matrix[y][x] === null) {
        matrix[y][x] = 0;
      }
    }
  }

  return matrix;
}

function qrSvg(text) {
  const matrix = createQrMatrix(text);
  const quiet = 4;
  const size = matrix.length + quiet * 2;
  let modules = "";
  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < matrix.length; x++) {
      if (matrix[y][x]) {
        modules += `<rect x="${x + quiet}" y="${y + quiet}" width="1" height="1"/>`;
      }
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR code">
  <rect width="100%" height="100%" fill="#fff"/>
  <g fill="#000">${modules}</g>
</svg>`;
}

const code39Patterns = {
  "0": "nnnwwnwnn",
  "1": "wnnwnnnnw",
  "2": "nnwwnnnnw",
  "3": "wnwwnnnnn",
  "4": "nnnwwnnnw",
  "5": "wnnwwnnnn",
  "6": "nnwwwnnnn",
  "7": "nnnwnnwnw",
  "8": "wnnwnnwnn",
  "9": "nnwwnnwnn",
  "A": "wnnnnwnnw",
  "B": "nnwnnwnnw",
  "C": "wnwnnwnnn",
  "D": "nnnnwwnnw",
  "E": "wnnnwwnnn",
  "F": "nnwnwwnnn",
  "G": "nnnnnwwnw",
  "H": "wnnnnwwnn",
  "I": "nnwnnwwnn",
  "J": "nnnnwwwnn",
  "K": "wnnnnnnww",
  "L": "nnwnnnnww",
  "M": "wnwnnnnwn",
  "N": "nnnnwnnww",
  "O": "wnnnwnnwn",
  "P": "nnwnwnnwn",
  "Q": "nnnnnnwww",
  "R": "wnnnnnwwn",
  "S": "nnwnnnwwn",
  "T": "nnnnwnwwn",
  "U": "wwnnnnnnw",
  "V": "nwwnnnnnw",
  "W": "wwwnnnnnn",
  "X": "nwnnwnnnw",
  "Y": "wwnnwnnnn",
  "Z": "nwwnwnnnn",
  "-": "nwnnnnwnw",
  ".": "wwnnnnwnn",
  " ": "nwwnnnwnn",
  "*": "nwnnwnwnn",
  "$": "nwnwnwnnn",
  "/": "nwnwnnnwn",
  "+": "nwnnnwnwn",
  "%": "nnnwnwnwn"
};

function code39Svg(text) {
  const content = String(text || "").trim().toUpperCase();
  const allowed = /^[0-9A-Z\-\. \$\/\+%]*$/;
  if (!allowed.test(content)) {
    throw new Error("Barcode content contains unsupported characters");
  }

  const encoded = `*${content}*`;
  const narrow = 2;
  const wide = 6;
  const gap = narrow;
  const quiet = 10;
  const height = 72;

  const widths = [];
  for (let i = 0; i < encoded.length; i++) {
    const pattern = code39Patterns[encoded[i]];
    if (!pattern) {
      throw new Error(`Invalid barcode character: ${encoded[i]}`);
    }
    for (const ch of pattern) {
      widths.push(ch === "n" ? narrow : wide);
    }
    if (i < encoded.length - 1) {
      widths.push(gap);
    }
  }

  const totalWidth = quiet * 2 + widths.reduce((sum, width) => sum + width, 0);
  let cursor = quiet;
  let barIndex = 0;
  let shapes = "";
  for (let i = 0; i < encoded.length; i++) {
    const pattern = code39Patterns[encoded[i]];
    for (let j = 0; j < pattern.length; j++) {
      const width = pattern[j] === "n" ? narrow : wide;
      if (j % 2 === 0) {
        shapes += `<rect x="${cursor}" y="0" width="${width}" height="${height}" />`;
      }
      cursor += width;
      barIndex++;
    }
    if (i < encoded.length - 1) {
      cursor += gap;
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${height}" shape-rendering="crispEdges">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <g fill="#000000">${shapes}</g>
</svg>`;
}

const CODE128_B = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
  "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
  "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
  "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
  "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
  "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
  "114131","311141","411131","211412","211214","211232","2331112"
];
function code128Svg(text) {
  const content=String(text||"").trim();
  if(!content) throw new Error("Barcode content is empty");
  // Code 128-B supports the printable ASCII range used by a normal HTTPS URL.
  for(const ch of content){ const n=ch.charCodeAt(0); if(n<32 || n>126) throw new Error("Barcode content contains unsupported characters"); }
  const values=[104];
  for(const ch of content) values.push(ch.charCodeAt(0)-32);
  let checksum=104;
  for(let i=1;i<values.length;i++) checksum += values[i]*i;
  checksum%=103; values.push(checksum,106);
  const quiet=12, scale=2, height=72;
  let x=quiet, shapes="";
  for(const value of values){
    const pattern=CODE128_B[value];
    let cursor=x;
    for(let i=0;i<pattern.length;i++){
      const width=Number(pattern[i])*scale;
      if(i%2===0) shapes += `<rect x="${cursor}" y="0" width="${width}" height="${height}"/>`;
      cursor+=width;
    }
    x=cursor;
  }
  const totalWidth=x+quiet;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${height}" shape-rendering="crispEdges" role="img" aria-label="Verification barcode">\n  <rect width="100%" height="100%" fill="#ffffff"/>\n  <g fill="#000000">${shapes}</g>\n</svg>`;
}

function createRecord(input) {
  return {
    fullName: String(input.fullName || "").trim(),
    idNumber: normalizeId(input.idNumber),
    documentType: String(input.documentType || "").trim(),
    country: String(input.country || "").trim(),
    nationality: String(input.nationality || "").trim(),
    sex: String(input.sex || "").trim(),
    dob: String(input.dob || "").trim(),
    placeOfBirth: String(input.placeOfBirth || "").trim(),
    issueDate: String(input.issueDate || "").trim(),
    expiry: String(input.expiry || "").trim(),
    issuingAuthority: String(input.issuingAuthority || "").trim(),
    address: String(input.address || "").trim(),
    verificationNotes: String(input.verificationNotes || "").trim(),
    photoUrl: String(input.photoUrl || "").trim(),
    status: "Approved"
  };
}

function validRecord(record) {
  return Boolean(
    record.fullName &&
    record.idNumber &&
    record.documentType &&
    record.country &&
    record.nationality &&
    record.sex &&
    record.dob &&
    record.placeOfBirth &&
    record.issueDate &&
    record.expiry &&
    record.issuingAuthority &&
    record.address
  );
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (req.method === "GET" && (pathname === "/healthz" || pathname === "/api/healthz")) {
    sendJson(res, 200, { ok: true, service: "pass-id-checker" });
    return;
  }

  if (req.method === "GET" && pathname === "/") {
    sendFile(res, path.join(__dirname, "index.html"));
    return;
  }

  if (req.method === "GET" && pathname === "/admin.html") {
    res.setHeader("Cache-Control", "no-store");
    sendFile(res, path.join(__dirname, "admin.html"));
    return;
  }

  // The authenticated management workspace is a separate page from the
  // sign-in screen. Keeping an explicit route here prevents Render from
  // falling through to the JSON 404 handler after a successful login.
  if (req.method === "GET" && pathname === "/admin-dashboard.html") {
    res.setHeader("Cache-Control", "no-store");
    sendFile(res, path.join(__dirname, "admin-dashboard.html"));
    return;
  }

  if (req.method === "GET" && pathname === "/index.html") {
    sendFile(res, path.join(__dirname, "index.html"));
    return;
  }

  if (req.method === "GET" && pathname === "/styles.css") {
    sendFile(res, path.join(__dirname, "styles.css"));
    return;
  }

  if (req.method === "GET" && pathname === "/templatemo-622-clearwave.css") {
    sendFile(res, path.join(__dirname, "templatemo-622-clearwave.css"));
    return;
  }

  if (req.method === "GET" && pathname === "/client.js") {
    sendFile(res, path.join(__dirname, "client.js"));
    return;
  }

  if (req.method === "GET" && pathname === "/templatemo-622-clearwave.js") {
    sendFile(res, path.join(__dirname, "templatemo-622-clearwave.js"));
    return;
  }

  if (req.method === "GET" && pathname.startsWith("/images/")) {
    const imageRoot = path.join(__dirname, "images");
    const imagePath = path.resolve(__dirname, "." + pathname);
    if (!imagePath.startsWith(imageRoot + path.sep)) {
      sendJson(res, 403, { error: "Forbidden" });
      return;
    }
    sendFile(res, imagePath);
    return;
  }

  if (req.method === "GET" && pathname === "/api/session") {
    sendJson(res, 200, { authenticated: isAuthenticated(req) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/login") {
    const body = await parseBody(req);
    if (String(body.password || "") !== ADMIN_PASSWORD) {
      sendJson(res, 401, { error: "Invalid admin password" });
      return;
    }

    sessionToken = crypto.randomBytes(24).toString("hex");
    sendJson(res, 200, { authenticated: true }, {
      "Set-Cookie": `${SESSION_COOKIE}=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/logout") {
    sessionToken = null;
    sendJson(res, 200, { authenticated: false }, {
      "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/records") {
    if (!isAuthenticated(req)) {
      sendJson(res, 401, { error: "Admin login required" });
      return;
    }
    sendJson(res, 200, { records: await listRecords() });
    return;
  }

  if (req.method === "POST" && pathname === "/api/records") {
    if (!isAuthenticated(req)) {
      sendJson(res, 401, { error: "Admin login required" });
      return;
    }

    const body = await parseBody(req);
    const record = createRecord(body);
    if (!validRecord(record)) {
      sendJson(res, 400, { error: "Missing required fields" });
      return;
    }

    const saved = await upsertRecord(record);
    const records = await listRecords();
    sendJson(res, 200, { record: saved, records });
    return;
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/records/")) {
    if (!isAuthenticated(req)) {
      sendJson(res, 401, { error: "Management access is required" });
      return;
    }

    const id = decodeURIComponent(pathname.replace("/api/records/", ""));
    if (!id) {
      sendJson(res, 400, { error: "A record reference is required" });
      return;
    }

    const deleted = await deleteRecord(id);
    if (!deleted) {
      sendJson(res, 404, { error: "Record not found" });
      return;
    }

    sendJson(res, 200, { deleted: true, records: await listRecords() });
    return;
  }

  if (req.method === "GET" && pathname.startsWith("/api/records/")) {
    const id = decodeURIComponent(pathname.replace("/api/records/", ""));
    const record = await findRecordById(id);
    if (!record) {
      sendJson(res, 404, { error: "Record not found" });
      return;
    }
    sendJson(res, 200, { record });
    return;
  }

  if (req.method === "GET" && pathname.startsWith("/api/qr/") && pathname.endsWith(".svg")) {
    const id = decodeURIComponent(pathname.replace("/api/qr/", "").replace(".svg", ""));
    const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
    const protocol = forwardedProto || (req.socket.encrypted ? "https" : "http");
    const host = req.headers.host;
    const verificationUrl = `${protocol}://${host}/?id=${encodeURIComponent(id)}`;

    // Generate a standards-compliant QR code using a hosted QR renderer.
    // The QR itself contains the complete verification URL, so scanning it
    // opens this site's verification page immediately.
    const qrServiceUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(verificationUrl)}`;
    res.writeHead(302, {
      "Location": qrServiceUrl,
      "Cache-Control": "public, max-age=300"
    });
    res.end();
    return;
  }

  if (req.method === "GET" && pathname.startsWith("/api/barcode/") && pathname.endsWith(".svg")) {
    const id = decodeURIComponent(pathname.replace("/api/barcode/", "").replace(".svg", ""));
    try {
      const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
      const protocol = forwardedProto || (req.socket.encrypted ? "https" : "http");
      const host = req.headers.host;
      const verificationUrl = `${protocol}://${host}/?id=${encodeURIComponent(id)}`;
      const svg = code128Svg(verificationUrl);
      res.writeHead(200, { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=300" });
      res.end(svg);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

initDb(seedRecord)
  .then(() => {
    const server = http.createServer((req, res) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
      res.setHeader("Permissions-Policy", "camera=(self)");
      handleRequest(req, res).catch(error => {
        sendJson(res, 500, { error: error.message || "Internal server error" });
      });
    });

    server.listen(PORT, () => {
      console.log(`ID verification server running at http://localhost:${PORT}`);
    });
  })
  .catch(error => {
    console.error("Failed to initialize PostgreSQL storage:", error.message);
    process.exit(1);
  });
