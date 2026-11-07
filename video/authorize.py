#!/usr/bin/env python3
"""One-time YouTube OAuth consent bootstrap.

Creates the refresh token that upload.py needs, saving it to
~/.secure-credentials/master.env as YT_REFRESH_TOKEN.

Prereqs (one-time, in Google Cloud Console):
  1. Create a project, enable "YouTube Data API v3" (APIs & Services → Library)
  2. Configure the OAuth consent screen (External), add scope
     https://www.googleapis.com/auth/youtube.upload
  3. Set Publishing status to "In production" — otherwise refresh tokens
     from Testing mode expire after 7 days
  4. Credentials → Create Credentials → OAuth client ID → Application type:
     "Desktop app" → copy the client ID/secret into master.env as
     YT_CLIENT_ID / YT_CLIENT_SECRET

Usage:  python3 authorize.py
"""
import http.server
import os
import re
import sys

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]
ENV_FILE = os.path.expanduser("~/.secure-credentials/master.env")
PORT = 8080


def read_env() -> dict:
    env = {}
    if not os.path.isfile(ENV_FILE):
        return env
    for line in open(ENV_FILE, encoding="utf-8"):
        m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.strip())
        if m:
            env[m.group(1)] = m.group(2)
    return env


def set_env(key: str, value: str) -> None:
    """Create-or-replace KEY=value in master.env (keeps file mode 600)."""
    text = open(ENV_FILE, encoding="utf-8").read() if os.path.isfile(ENV_FILE) else ""
    if re.search(rf"^{key}=", text, flags=re.M):
        text = re.sub(rf"^{key}=.*$", f"{key}={value}", text, flags=re.M)
    else:
        text = text.rstrip("\n") + (f"\n# YouTube Data API\n{key}={value}\n")
    fd = os.open(ENV_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(text)
    os.chmod(ENV_FILE, 0o600)


def main() -> None:
    env = read_env()
    client_id = os.environ.get("YT_CLIENT_ID") or env.get("YT_CLIENT_ID") or ""
    client_secret = os.environ.get("YT_CLIENT_SECRET") or env.get("YT_CLIENT_SECRET") or ""
    if not client_id or not client_secret:
        sys.exit("error: set YT_CLIENT_ID + YT_CLIENT_SECRET in ~/.secure-credentials/master.env first")

    flow = InstalledAppFlow.from_client_config(
        {
            "installed": {
                "client_id": client_id,
                "client_secret": client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [f"http://localhost:{PORT}/"],
            }
        },
        scopes=SCOPES,
    )

    # offline+consent guarantees a refresh token comes back
    auth_url, _ = flow.authorization_url(access_type="offline", prompt="consent",
                                         include_granted_scopes="true")
    print(f"\nOpen this URL in your phone browser and approve:\n\n  {auth_url}\n")

    captured = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            captured["path"] = self.path
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"Authorized. You can close this tab and return to Termux.")

        def log_message(self, *args):
            pass

    server = http.server.HTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Waiting for the redirect on http://localhost:{PORT}/ …")
    server.handle_request()  # exactly one request
    server.server_close()
    if "path" not in captured:
        sys.exit("error: no redirect captured — did the page finish loading in your browser?")

    os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"  # loopback http redirect for token exchange
    flow.fetch_token(authorization_response=f"http://localhost:{PORT}{captured['path']}")
    creds = flow.credentials
    if not creds.refresh_token:
        sys.exit("error: Google returned no refresh token — revoke the client and redo consent")
    set_env("YT_REFRESH_TOKEN", creds.refresh_token)
    print("\nOK — YT_REFRESH_TOKEN saved to master.env.")
    print("Next: python3 upload.py <mp4> --meta <json> [--dry-run]")


if __name__ == "__main__":
    main()
