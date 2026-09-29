# Web site on the OVH host

One Linux VM runs the marketing site (`apps/web`) as a container behind Caddy. The image is built by
`.github/workflows/web-image.yml` and published to `ghcr.io/aieasycep/dijitalasistanim-web`; the host only pulls it.
Nothing stateful lives on the host except Caddy's certificates (`caddy_data` volume).

## First deployment

1. Server (Ubuntu 24.04 / Debian 12, 1 vCPU / 2 GB is plenty):
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER && newgrp docker
   sudo ufw allow 22,80,443/tcp && sudo ufw allow 443/udp && sudo ufw enable
   ```
2. DNS (Cloudflare): `A @ → <server IP>`, `CNAME www → dijitalasistan.app`, both **DNS only** (grey cloud) until the
   first certificate is issued. The `.app` TLD is HSTS-preloaded, so the site is HTTPS-only from the first request.
3. Registry access: the package is private by default. Create a GitHub personal access token with `read:packages`
   and log in once on the host: `docker login ghcr.io -u <github-user>` (token as the password). Alternatively make the
   package public under the repository's Packages settings; the image contains only the public site.
4. Files:
   ```bash
   mkdir -p ~/dijitalasistan && cd ~/dijitalasistan
   # copy deploy/ovh/{docker-compose.yml,Caddyfile,.env.example} here (scp or git clone of the repo)
   cp .env.example .env && nano .env      # APPLE_TEAM_ID / ANDROID_SHA256_CERT_FINGERPRINTS once the store builds exist
   docker compose pull && docker compose up -d
   docker compose logs -f caddy           # watch the certificate being issued
   ```
5. Check: `https://dijitalasistan.app`, `https://www.dijitalasistan.app` (redirects),
   `https://dijitalasistan.app/.well-known/assetlinks.json`, `/privacy`, `/terms`, `/support`.

## Updating

Every push that touches `apps/web` (or a manual run of the "Web image" workflow) publishes a new image. On the host:

```bash
cd ~/dijitalasistan && docker compose pull && docker compose up -d && docker image prune -f
```

Pin a build instead of `latest` by setting `WEB_IMAGE_TAG=sha-<7 chars>` in `.env` (tags are listed in the workflow
run summary). Roll back the same way.

## Cloudflare proxy (optional, later)

Turning the orange cloud on hides the server IP and adds CDN caching. Do it after the first certificate exists and set
SSL/TLS to **Full (strict)**; Caddy keeps renewing its Let's Encrypt certificate through the proxy over TLS-ALPN as long
as port 443 stays reachable. Do not use "Flexible".

## Later: backoffice

The admin app (`apps/admin`, next phase) is added as a second service in `docker-compose.yml` and a second site block
in the `Caddyfile` (`admin.dijitalasistan.app`, restricted to your IPs); it shares nothing with the web container.
