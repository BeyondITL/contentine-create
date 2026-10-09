# Deployment Guide

Contentine Create is a **static frontend** (Next.js export) plus an **optional PHP backend**. You can deploy it on almost anything: a shared host, a VPS, a container, or a static CDN (frontend) paired with any PHP host (backend). This guide is deliberately infra-agnostic — no vendor lock-in, no secrets, edit freely.

---

## 0. What you're deploying

```
frontend/out/     ← static site produced by `npm run build` (HTML/JS/CSS + model assets)
backend/          ← optional PHP 8 API (auth, credits, commerce). Lives OUTSIDE the webroot.
admin_config.php  ← your real secrets. Lives ONE directory ABOVE the webroot. Never in git.
database/*.sql    ← schema + migrations, applied in order.
```

The static frontend is fully functional on its own (all creation runs in the browser). The backend only adds sign-in, credits, sync, and commerce.

> **Cross-origin isolation is required.** The in-browser engines use `SharedArrayBuffer` / WebGPU, which need these response headers on the app:
> ```
> Cross-Origin-Opener-Policy: same-origin
> Cross-Origin-Embedder-Policy: require-corp
> ```
> If the app loads but rendering/engines silently fail, this is almost always the cause.

---

## 1. Build the frontend

Requires Node 18+.

```bash
cd frontend
npm ci                      # or: npm install
cd ..
bash scripts/setup-assets.sh   # downloads open model weights into frontend/public/
cd frontend
npm run build               # produces frontend/out/  (static export)
```

### Build-time configuration

Next.js bakes `NEXT_PUBLIC_*` values into the static bundle **at build time**, so set them before `npm run build`. Copy the template and edit:

```bash
cp frontend/.env.local.template frontend/.env.local
```

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend API base (e.g. `https://yourdomain.com/api`). Omit to use the relative `/api`. |
| `NEXT_PUBLIC_APP_URL` | Public app URL (no trailing slash). |
| `NEXT_PUBLIC_ADMIN_EMAIL` | Email that gets the admin UI (must match backend `ADMIN_EMAIL`). |
| `NEXT_PUBLIC_AUTH0_DOMAIN` / `_CLIENT_ID` / `_AUDIENCE` | Auth0 app (redirect flow only). Optional if you don't use auth. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe **publishable** key (test or live). Optional if you don't use billing. |
| `NEXT_PUBLIC_IMAGE_GEN_ENABLED` | Leave **unset/false** unless you've accepted the SD-Turbo license (see `NOTICE`). |

Everything in `frontend/out/` after the build is what you upload to your webroot.

---

## 2. Deploy the frontend (static)

Upload the **contents of `frontend/out/`** to your webroot. Any static host works — just make sure the two cross-origin-isolation headers above are served, plus an SPA fallback (unknown routes → `index.html`) and the API passthrough.

- **Apache / shared hosting:** the repo's root `.htaccess` already sets the headers, the `/api` passthrough, and the SPA fallback. Upload it to your webroot. The `frontend/public/api/index.php` shim forwards `/api/*` to the backend.
- **Nginx:** see [`deploy/nginx.conf.example`](deploy/nginx.conf.example).
- **IIS (Windows):** see [`deploy/web.config.example`](deploy/web.config.example).
- **Static CDN (Netlify/Vercel/Cloudflare/S3+CloudFront):** serve `frontend/out/`, add the two headers as custom response headers, and point `NEXT_PUBLIC_API_URL` at wherever the PHP backend runs.

---

## 3. Deploy the backend (optional)

Requires PHP 8.0+ and MySQL/MariaDB. The backend must sit **outside** the webroot so its source is never web-served.

```bash
cd backend
composer install --no-dev          # install dependencies (creates vendor/)
```

Recommended layout (sibling of the webroot):

```
/var/www/yourapp/                 ← webroot (contents of frontend/out/ + .htaccess)
/var/www/backend/                 ← this backend/ folder
/var/www/admin_config.php         ← secrets, one level ABOVE the webroot
```

The webroot's `api/index.php` shim resolves the backend as `dirname(__DIR__, 2) . '/backend/public/index.php'`. Keep the sibling relationship or adjust the shim.

---

## 4. Configure secrets (`admin_config.php`)

```bash
cp admin_config.php.template admin_config.php   # then move it ABOVE your webroot
```

Fill in: DB host/name/user/password, Auth0 client secret, Stripe secret + webhook secret, an encryption master key, and a CSRF secret. **Never commit this file** (it is already gitignored). Keep the real values in a password manager; `CLAUDE.local.md` may reference where they live but must not contain them.

---

## 5. Database

```bash
# create the database (utf8mb4), then apply migrations IN ORDER:
mysql -u <user> -p <dbname> < database/001_initial_schema.sql
mysql -u <user> -p <dbname> < database/002_v22_additions.sql
# ... through the highest-numbered file in database/
```

Apply every `database/NNN_*.sql` in ascending order. `database/full_schema.sql` is a consolidated snapshot for a fresh install if you prefer a single file. Use `utf8mb4` / `utf8mb4_unicode_ci` (MariaDB 10.5 does **not** support MySQL-8's `utf8mb4_0900_ai_ci`).

---

## 6. Verify

- The app loads and the UI renders.
- `GET /api/health` returns JSON (e.g. `{"status":"ok"}`), not a 500.
- `curl -I https://yourdomain.com/backend/config.php` returns **403/404** (backend source is not web-served).
- In the browser devtools, response headers show `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.
- Create a cartoon end-to-end and confirm the downloaded file is a valid MP4 (`ffprobe` it).

---

## 7. Updating / your own CD

Deploys are just: rebuild `frontend/out/`, upload it (additively — don't wipe `admin_config.php` or user uploads), run any new `database/*.sql` migrations, and restart the PHP worker/opcache if your host caches. Wire that into whatever CD you like (GitHub Actions, a git post-receive hook, rsync-over-SSH, or a host dashboard). Keep these invariants:

- Never overwrite the live `admin_config.php`, the webroot `.htaccess`/`web.config`, or user data.
- Run `php -l` on changed PHP and the frontend build before shipping (the CI workflow in `.github/workflows/ci.yml` does this).
- Keep `NEXT_PUBLIC_IMAGE_GEN_ENABLED` off unless the SD-Turbo license obligations in `NOTICE` are met.

That's it — clone, configure, build, upload. No part of this is tied to any specific provider.
