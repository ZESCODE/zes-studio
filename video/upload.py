#!/usr/bin/env python3
"""Upload a rendered Short to YouTube via the Data API v3.

Reads credentials from env:
  YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN   (see authorize.py)
Renders upload via a resumable session (safe on Termux connections).

Usage:
  python3 upload.py ../renders/Brazil-Top5-Facts.mp4 --meta meta/brazil.json
  python3 upload.py clip.mp4 --meta meta/brazil.json --dry-run      # validate only
  python3 upload.py clip.mp4 --meta meta/brazil.json --privacy public
  python3 upload.py clip.mp4 --meta meta/brazil.json --schedule 2026-11-10T18:00

Meta JSON fields: title, description, tags[], categoryId, privacy, publishAt.
Defaults: categoryId 27 (Education), privacy private.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

ENV_FILE = os.path.expanduser("~/.secure-credentials/master.env")
SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]
TOKEN_URI = "https://oauth2.googleapis.com/token"
MAX_DURATION = 180  # Shorts limit (seconds)


def log(msg: str) -> None:
    print(msg, flush=True)


def load_credential(refresh: bool = True) -> Credentials:
    cid = os.environ.get("YT_CLIENT_ID", "")
    secret = os.environ.get("YT_CLIENT_SECRET", "")
    token = os.environ.get("YT_REFRESH_TOKEN", "")
    missing = [k for k, v in (("YT_CLIENT_ID", cid), ("YT_CLIENT_SECRET", secret),
                              ("YT_REFRESH_TOKEN", token)) if not v]
    if missing:
        sys.exit(f"error: missing env {', '.join(missing)} — run authorize.py first")
    creds = Credentials(token=None, refresh_token=token, token_uri=TOKEN_URI,
                        client_id=cid, client_secret=secret, scopes=SCOPES)
    if refresh:
        creds.refresh(Request())
    return creds


def probe_video(path: str):
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return None
    try:
        out = subprocess.run(
            [ffprobe, "-v", "error", "-show_entries", "stream=codec_type,width,height",
             "-show_entries", "format=duration", "-of", "json", path],
            capture_output=True, text=True, timeout=60).stdout
        return json.loads(out)
    except Exception:
        return None


def validate_video(path: str, info) -> list[str]:
    problems = []
    if not os.path.isfile(path):
        sys.exit(f"error: file not found: {path}")
    size = os.path.getsize(path)
    if size > 256 * 1024 * 1024 * 1024:
        problems.append("file larger than YouTube's 256GB cap")
    if not info or "streams" not in info:
        return problems + ["ffprobe could not read the file — is it a valid mp4?"]
    video = next((s for s in info["streams"] if s.get("codec_type") == "video"), None)
    if not video:
        problems.append("no video stream found")
    else:
        w, h = video.get("width", 0), video.get("height", 0)
        if w and h and abs(w / h - 9 / 16) > 0.02:
            problems.append(f"aspect {w}x{h} is not vertical 9:16 (Shorts may not be surfaced)")
    dur = float(info.get("format", {}).get("duration", 0) or 0)
    if dur and dur > MAX_DURATION:
        problems.append(f"duration {dur:.0f}s exceeds the {MAX_DURATION}s Shorts limit")
    return problems


def validate_meta(meta: dict) -> list[str]:
    problems = []
    title = meta.get("title", "")
    if not (0 < len(title) <= 100):
        problems.append(f"title must be 1-100 chars (got {len(title)})")
    desc = meta.get("description", "")
    if len(desc) > 5000:
        problems.append(f"description must be ≤5000 chars (got {len(desc)})")
    tags = meta.get("tags", [])
    if len(tags) > 15:
        problems.append(f"max 15 tags (got {len(tags)})")
    total = sum(len(t) for t in tags)
    if total > 500:
        problems.append(f"tags combined must be ≤500 chars (got {total})")
    if meta.get("categoryId") and not str(meta["categoryId"]).isdigit():
        problems.append("categoryId must be numeric (27 = Education)")
    if meta.get("privacy") and meta["privacy"] not in ("private", "public", "unlisted"):
        problems.append("privacy must be private|public|unlisted")
    return problems


def build_body(meta: dict, privacy: str, publish_at: str | None) -> dict:
    body = {
        "snippet": {
            "title": meta["title"],
            "description": meta.get("description", ""),
            "tags": meta.get("tags", []),
            "categoryId": str(meta.get("categoryId", 27)),
        },
        "status": {"privacyStatus": privacy, "selfDeclaredMadeForKids": False},
    }
    if publish_at:
        body["status"]["publishAt"] = publish_at + ":00Z" if len(publish_at) == 16 else publish_at
    return body


def upload(video_path: str, meta_path: str, privacy: str | None,
           publish_at: str | None, dry_run: bool) -> None:
    if not os.path.isfile(meta_path):
        sys.exit(f"error: meta file not found: {meta_path}")
    meta = json.load(open(meta_path, encoding="utf-8"))
    problems = validate_meta(meta) + validate_video(video_path, probe_video(video_path))
    if problems:
        for p in problems:
            log(f"  ! {p}")
        sys.exit("error: validation failed — fix the above and retry")

    privacy = privacy or meta.get("privacy", "private")
    publish_at = publish_at or meta.get("publishAt")
    body = build_body(meta, privacy, publish_at)

    info = probe_video(video_path) or {}
    dur = float(info.get("format", {}).get("duration", 0) or 0)
    size_mb = os.path.getsize(video_path) / 1e6
    log(f"video : {video_path} ({size_mb:.1f} MB, {dur:.0f}s)")
    log(f"title : {body['snippet']['title']}")
    log(f"tags  : {', '.join(body['snippet']['tags'])}")
    log(f"privacy: {privacy}" + (f"  schedule: {publish_at}" if publish_at else ""))

    if dry_run:
        log("\n[dry-run] request body:")
        log(json.dumps(body, indent=2, ensure_ascii=False))
        log("[dry-run] no credentials used, nothing uploaded.")
        return

    creds = load_credential()
    youtube = build("youtube", "v3", credentials=creds, cache_discovery=False)
    media = MediaFileUpload(video_path, chunksize=8 * 1024 * 1024, resumable=True,
                            mimetype="video/mp4")
    request = youtube.videos().insert(part="snippet,status", body=body, media_body=media)

    log("\nuploading…")
    response = None
    try:
        while response is None:
            status, response = request.next_chunk()
            if status:
                log(f"  {status.progress() * 100:.0f}%")
    except HttpError as e:
        reason = str(e)
        if e.resp.status in (401, 403) and "invalid_grant" in reason:
            sys.exit("error: refresh token rejected — re-run authorize.py")
        if e.resp.status == 403 and "quotaExceeded" in reason:
            sys.exit("error: YouTube daily upload quota exhausted (10,000 units/day; 1,600 per upload)")
        if e.resp.status == 403 and "uploadLimitExceeded" in reason:
            sys.exit("error: daily upload limit for this channel reached (~6/day)")
        raise
    vid = response.get("id", "")
    log(f"\nDONE  https://youtu.be/{vid}   (status: {privacy})")
    log("Upload counts 1,600 of your 10,000 daily quota units.")


def main() -> None:
    ap = argparse.ArgumentParser(description="Upload a rendered Short to YouTube (Data API v3)")
    ap.add_argument("video", help="path to the mp4 (e.g. ../renders/Brazil-Top5-Facts.mp4)")
    ap.add_argument("--meta", required=True, help="path to a metadata JSON file")
    ap.add_argument("--privacy", choices=["private", "public", "unlisted"], help="override meta privacy")
    ap.add_argument("--schedule", help="publish time, ISO UTC e.g. 2026-11-10T18:00")
    ap.add_argument("--dry-run", action="store_true", help="validate + print the request body, no upload")
    args = ap.parse_args()
    upload(args.video, args.meta, args.privacy, args.schedule, args.dry_run)


if __name__ == "__main__":
    main()
