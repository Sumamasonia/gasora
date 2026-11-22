# Putting Gasora online

Gasora runs as **one container**: the API, the web app and the SQLite files (on a disk that survives restarts). It needs
one small server with HTTPS in front. Pick one of the three routes below. The commands are PowerShell.

## Before you start (all routes)

1. Make sure everything is committed and `python -m pytest -q` passes.
2. Make a secret for login tokens and keep it somewhere private (a password manager). It is not stored in the repository.
   ```
   python -c "import secrets; print(secrets.token_urlsafe(48))"
   ```
3. Choose the first owner's username and a long password. They are used once, when the database is empty.
4. Optional: build and try it on your own computer first (needs Docker Desktop):
   ```
   docker build -t gasora .
   docker run --rm -p 8080:8080 -v gasora_data:/data -e GASORA_SECRET=<secret> -e GASORA_ADMIN_USER=owner -e GASORA_ADMIN_PASSWORD=<password> gasora
   ```
   Open http://localhost:8080 and sign in.

## What the server does by itself

- Refuses to start in production with a weak `GASORA_SECRET`.
- Hides the interactive API documentation, adds security headers, and never lets the browser cache `/api` answers.
- Locks a login for ten minutes after five wrong passwords (from the same address and username).
- Writes a backup file to `/data/backups` every 24 hours (first one 90 seconds after starting) and keeps the last 14.
- Uses straight-line distances for planning. Road-based distances need the road map file; see "Road distances" below.

## Route A: Fly.io (recommended)

Costs a few dollars a month (a card is needed). Data lives on a Fly volume.

1. Install the Fly tool and sign in: `winget install Fly-io.flyctl`, then `fly auth login`.
2. In `D:\gasora`, edit `fly.toml`: change `app = "gasora-CHANGE-ME"` to a unique name.
3. Create the app and the disk (1 GB is plenty):
   ```
   fly apps create <your-app-name>
   fly volumes create gasora_data --size 1 --region sin
   ```
4. Store the secrets on Fly (they never go in a file):
   ```
   fly secrets set GASORA_SECRET=<secret> GASORA_ADMIN_USER=<owner-name> GASORA_ADMIN_PASSWORD=<password>
   ```
5. Deploy: `fly deploy`. When it finishes, open `https://<your-app-name>.fly.dev` and sign in.
6. Remove the password from Fly's settings now that the owner exists: `fly secrets unset GASORA_ADMIN_PASSWORD`.
7. Run exactly one machine: `fly scale count 1`. Do not add more: SQLite must have a single writer.

## Route B: Railway (or any host with a Docker deploy and a volume)

1. Create a project from your GitHub repository. It will find the `Dockerfile`.
2. Add a **volume** mounted at `/data` (without it every restart erases your data).
3. Add the variables `GASORA_SECRET`, `GASORA_ADMIN_USER`, `GASORA_ADMIN_PASSWORD`. Set the port to 8080.
4. Generate a public domain, open it, sign in, then delete `GASORA_ADMIN_PASSWORD`.

## Route C: your own Linux server (a VPS)

1. Install Docker. Start the app with a data folder and a restart policy:
   ```
   docker run -d --name gasora --restart unless-stopped -p 127.0.0.1:8080:8080 -v /srv/gasora:/data \
     -e GASORA_SECRET=<secret> -e GASORA_ADMIN_USER=<owner-name> -e GASORA_ADMIN_PASSWORD=<password> gasora
   ```
2. Put Caddy in front for automatic HTTPS. Point your domain's DNS A record at the server, then use this `Caddyfile`:
   ```
   gasora.example.com {
       reverse_proxy 127.0.0.1:8080
   }
   ```
3. Open ports 80 and 443 only. Keep the OS updated.

**Avoid** hosts whose disk is erased on restart (for example Render's free tier): your customers' accounts would vanish.

## After it is online (do these the same day)

1. Sign in as the owner and **change the password** (Password button, bottom right).
2. Settings tab: set the currency label, the real depot position and the overdue days. Accounts tab: set the cylinder price.
3. Add your customers (Customers tab) with correct map coordinates. Create the drivers, manager and any customer logins on the Staff tab.
4. **Test the backup once:** Reports tab, Download backup, and keep that file. Then check the audit chain on the Audit tab.
5. Copy backups **off the server** regularly. The daily files in `/data/backups` protect against mistakes, not against losing the disk.
   - Fly: `fly ssh sftp shell` then `get /data/backups/<file>`; or download from the Reports tab.
   - VPS: `scp` the folder to another computer, or use `rclone` to cloud storage.

## Restoring from a backup

Stop the app first, because the restore replaces the two database files. It checks every file's checksum and the audit chain
before touching anything, and keeps your current files under a new name.

- **Docker on your own computer or a VPS:**
  ```
  docker stop gasora
  docker run --rm -v /srv/gasora:/data -v ${PWD}:/in gasora python -m backend.manage restore /in/<backup>.zip --force
  docker start gasora
  ```
- **Fly.io:** `fly scale count 0`, then start a one-off machine that mounts the volume, run the same restore command there, and
  `fly scale count 1`. This is fiddly: if you ever need it, practise once on a test app first.

Backups made on one version restore on the same or a newer version; new columns are added at start-up.

## Locked out

If the owner forgets the password: `python -m backend.manage reset-password <owner-name>` inside the container
(`docker exec -it gasora python -m backend.manage reset-password <name>` or `fly ssh console`).

## Road distances (optional)

The online version plans with straight-line distances scaled to road time. For road-based times, download the map once on your
computer (`python -m planner.download_map`, see the README), put `faisalabad.graphml` and `road_cache.json` into the data folder, install `osmnx`
in the image (use the full `requirements.txt`) and set `GASORA_ROUTING=road`. This needs a larger server (about 1 GB of memory).
Ask before doing this: it is not needed for the evaluation or the demonstration.

## Updating later

Commit, then `fly deploy` (or push to GitHub on Railway). The data volume is kept. New database columns are added automatically at start-up.
Take a backup first.

## Known limits (state them in the report)

- One server process and one SQLite database: fine for one agency of a few hundred customers, not for many agencies.
- No email or SMS: password resets are done by the owner.
- Sign-in sessions last 8 hours; a changed or reset password ends all of that user's sessions.
- The route plan is only as good as the customer coordinates and the demand records entered.
