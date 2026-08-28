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
    dob: String(record.dob || "").trim(),
    expiry: String(record.expiry || "").trim(),
    address: String(record.address || "").trim(),
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
    dob: row.dob,
    expiry: row.expiry,
    address: row.address,
    photoUrl: row.photo_url || "",
    status: row.status || "Approved"
  };
}

async function initDb(seedRecord) {
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

  // Records are intentionally not seeded. The public site should only show
  // records that an authorised staff member has actually created.


async function listRecords() {
  const { rows } = await pool.query(`
    SELECT full_name, id_number, document_type, country, dob, expiry, address, photo_url, status
    FROM records
    ORDER BY created_at ASC, id ASC
  `);
  return rows.map(mapRecord);
}

async function findRecordById(idNumber) {
  const { rows } = await pool.query(
    `
      SELECT full_name, id_number, document_type, country, dob, expiry, address, photo_url, status
      FROM records
      WHERE UPPER(id_number) = $1
      LIMIT 1
    `,
    [normalizeId(idNumber)]
  );
  return rows[0] ? mapRecord(rows[0]) : null;
}

async function upsertRecord(record) {
  const normalized = normalizeRecord(record);
  const { rows } = await pool.query(
    `
      INSERT INTO records (
        full_name, id_number, document_type, country, dob, expiry, address, photo_url, status, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (id_number)
      DO UPDATE SET
        full_name = EXCLUDED.full_name,
        document_type = EXCLUDED.document_type,
        country = EXCLUDED.country,
        dob = EXCLUDED.dob,
        expiry = EXCLUDED.expiry,
        address = EXCLUDED.address,
        photo_url = EXCLUDED.photo_url,
        status = EXCLUDED.status,
        updated_at = NOW()
      RETURNING full_name, id_number, document_type, country, dob, expiry, address, photo_url, status
    `,
    [
      normalized.fullName,
      normalized.idNumber,
      normalized.documentType,
      normalized.country,
      normalized.dob,
      normalized.expiry,
      normalized.address,
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
  upsertRecord
};
