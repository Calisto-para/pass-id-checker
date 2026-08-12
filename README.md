# pass-id-checker

ID verification app with admin record entry, QR generation, and client lookup.

## Deploy to Render

1. Push this repo to GitHub.
2. In Render, create a new Blueprint and select this repository.
3. Render will use `render.yaml` to create:
   - a Node web service
   - a Postgres database
4. Set `ADMIN_PASSWORD` when Render prompts for the secret value.
5. Deploy the blueprint.

Render injects `DATABASE_URL` from the provisioned database automatically.

## Local run

1. Set `DATABASE_URL` to your Postgres connection string.
2. Optionally set `ADMIN_PASSWORD`.
3. Run `npm start`.
# pass-id-checker
