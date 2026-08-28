# VerifyID — secure record verification

A small Node.js/PostgreSQL application for creating approved identity records and letting clients verify a record by reference number, barcode, or QR code.

## What was improved

- Reworked the public page into a clean, responsive production-style interface.
- Added a dedicated staff portal with a clearer record-management workflow.
- Public visitors can only retrieve a specific record when they know its reference; the full records list is now staff-only.
- Public verification links such as `/?id=ID-1002` automatically open and verify the referenced record.
- Added a real QR-code endpoint for shareable verification links; barcode and QR labels are no longer mixed up.
- Improved mobile layouts, form states, empty states, camera controls, status messaging and accessibility.
- Added safer production session-cookie settings and basic security response headers.
- Removed automatic database seeding so a fresh production database does not expose a fake demo identity.
- Uploaded photos are limited to 2 MB in the staff UI.

## Deploy to Render

1. Push the repository to GitHub.
2. Create a Render Blueprint from the repository.
3. Render uses `render.yaml` to create the Node web service and PostgreSQL database.
4. Set a strong `ADMIN_PASSWORD` secret in Render.
5. Deploy.

`DATABASE_URL` is supplied by the Render database.

## Local run

Set `DATABASE_URL` to your PostgreSQL connection string and optionally `ADMIN_PASSWORD`, then run:

```bash
npm install
npm start
```

The local default admin password remains `admin123` only when `NODE_ENV` is not `production`. Always set `ADMIN_PASSWORD` in production.
