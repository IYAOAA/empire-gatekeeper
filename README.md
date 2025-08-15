
# Empire Gatekeeper (Secure Backend)

This is a secure Node.js API that updates `content/products/products.json` in your GitHub repo.

## Deploy on Render.com (Free)
1. Create a new GitHub repo (e.g., `empire-gatekeeper`) and push these files.
2. On Render → New → Web Service → Connect your repo.
3. Build Command: `npm install`
4. Start Command: `node server.js`
5. Environment Variables:
   - `GITHUB_TOKEN`  → your GitHub PAT (repo scope)
   - `REPO_OWNER`    → IYAOAA
   - `REPO_NAME`     → 1000HomeVibes
   - `FILE_PATH`     → content/products/products.json
   - `BRANCH`        → main
   - `ADMIN_SECRET`  → your secret passphrase
6. Deploy → copy your API URL

## Endpoints
- `GET /products` → returns current products.json
- `POST /update-products` → updates products.json (requires `x-admin-secret` header)
