const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

function normalizeId(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeRecord(record) {
  return {
    fullName: String(record.fullName || "").trim(),
    idNumber: normalizeId(record.idNumber),
    documentType: String(record.documentType || "").trim(),
    country: String(record.country || "").trim(),
    nationality: String(record.nationality || "").trim(),
    sex: String(record.sex || "").trim(),
    dob: String(record.dob || "").trim(),
    placeOfBirth: String(record.placeOfBirth || "").trim(),
    issueDate: String(record.issueDate || "").trim(),
    expiry: String(record.expiry || "").trim(),
    issuingAuthority: String(record.issuingAuthority || "").trim(),
    address: String(record.address || "").trim(),
    verificationNotes: String(record.verificationNotes || "").trim(),
    photoUrl: String(record.photoUrl || "").trim(),
    status: String(record.status || "Approved").trim() || "Approved"
  };
}

function mapRecord(row) {
  return {
    fullName: row.full_name,
    idNumber: row.id_number,
    documentType: row.document_type,
    country: row.country,
    nationality: row.nationality || "",
    sex: row.sex || "",
    dob: row.dob,
    placeOfBirth: row.place_of_birth || "",
    issueDate: row.issue_date || "",
    expiry: row.expiry,
    issuingAuthority: row.issuing_authority || "",
    address: row.address,
    verificationNotes: row.verification_notes || "",
    photoUrl: row.photo_url || "",
    status: row.status || "Approved"
  };
}

// Public verification deliberately excludes internal verification notes.
function mapPublicRecord(row) {
  const record = mapRecord(row);
  delete record.verificationNotes;
  return record;
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS records (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      id_number TEXT NOT NULL UNIQUE,
      document_type TEXT NOT NULL,
      country TEXT NOT NULL,
      dob TEXT NOT NULL,
      expiry TEXT NOT NULL,
      address TEXT NOT NULL,
      photo_url TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Approved',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Backward-compatible additions for records created before the expanded
  // verification form was introduced.
  await pool.query(`ALTER TABLE records ADD COLUMN IF NOT EXISTS nationality TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE records ADD COLUMN IF NOT EXISTS sex TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE records ADD COLUMN IF NOT EXISTS place_of_birth TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE records ADD COLUMN IF NOT EXISTS issue_date TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE records ADD COLUMN IF NOT EXISTS issuing_authority TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE records ADD COLUMN IF NOT EXISTS verification_notes TEXT NOT NULL DEFAULT ''`);

  return true;
}

async function listRecords() {
  const { rows } = await pool.query(`
    SELECT full_name, id_number, document_type, country, nationality, sex,
           dob, place_of_birth, issue_date, expiry, issuing_authority, address,
           verification_notes, photo_url, status
    FROM records
    ORDER BY created_at ASC, id ASC
  `);
  return rows.map(mapRecord);
}

async function findRecordById(idNumber) {
  const { rows } = await pool.query(
    `
      SELECT full_name, id_number, document_type, country, nationality, sex,
             dob, place_of_birth, issue_date, expiry, issuing_authority, address,
             photo_url, status
      FROM records
      WHERE UPPER(id_number) = $1
      LIMIT 1
    `,
    [normalizeId(idNumber)]
  );
  return rows[0] ? mapPublicRecord(rows[0]) : null;
}

async function deleteRecord(idNumber) {
  const { rowCount } = await pool.query(
    `DELETE FROM records WHERE UPPER(id_number) = $1`,
    [normalizeId(idNumber)]
  );
  return rowCount > 0;
}

async function upsertRecord(record) {
  const normalized = normalizeRecord(record);
  const { rows } = await pool.query(
    `
      INSERT INTO records (
        full_name, id_number, document_type, country, nationality, sex,
        dob, place_of_birth, issue_date, expiry, issuing_authority, address,
        verification_notes, photo_url, status, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
      ON CONFLICT (id_number)
      DO UPDATE SET
        full_name = EXCLUDED.full_name,
        document_type = EXCLUDED.document_type,
        country = EXCLUDED.country,
        nationality = EXCLUDED.nationality,
        sex = EXCLUDED.sex,
        dob = EXCLUDED.dob,
        place_of_birth = EXCLUDED.place_of_birth,
        issue_date = EXCLUDED.issue_date,
        expiry = EXCLUDED.expiry,
        issuing_authority = EXCLUDED.issuing_authority,
        address = EXCLUDED.address,
        verification_notes = EXCLUDED.verification_notes,
        photo_url = EXCLUDED.photo_url,
        status = EXCLUDED.status,
        updated_at = NOW()
      RETURNING full_name, id_number, document_type, country, nationality, sex,
                dob, place_of_birth, issue_date, expiry, issuing_authority, address,
                verification_notes, photo_url, status
    `,
    [
      normalized.fullName,
      normalized.idNumber,
      normalized.documentType,
      normalized.country,
      normalized.nationality,
      normalized.sex,
      normalized.dob,
      normalized.placeOfBirth,
      normalized.issueDate,
      normalized.expiry,
      normalized.issuingAuthority,
      normalized.address,
      normalized.verificationNotes,
      normalized.photoUrl,
      normalized.status
    ]
  );
  return mapRecord(rows[0]);
}

module.exports = {
  initDb,
  listRecords,
  findRecordById,
  upsertRecord,
  deleteRecord
};
