#!/usr/bin/env python3
"""ZES Studio narration worker (Kokoro TTS).

Reads a Remotion props JSON (FactsVideo), synthesizes a voiceover for the
intro, each fact and the outro, fits every segment into the video timeline,
and writes a 45-second 24 kHz mono WAV that FactsVideo can play as audioSrc.

Run inside the Debian proot with the Kokoro-TTS-Local virtualenv:

    proot-distro login debian -- bash -lc \
      'cd ~/kokoro-tts && .venv/bin/python ~/zes-studio/narration.py \
         --props ../zes-studio/video/.props/<id>.json \
         --out ../zes-studio/tmp/narration_<id>.wav'

The script prints PROGRESS lines for the Node job queue.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import numpy as np
import soundfile as sf

SAMPLE_RATE = 24000
VIDEO_SECONDS = 45.0
INTRO_START = 0.15
FACT_START = 4.4
FACT_STEP = 7.0
FACT_WINDOW = 6.9
OUTRO_START = 39.4
OUTRO_WINDOW = 5.4
INTRO_WINDOW = 4.1


def emit(msg: str) -> None:
    print(msg, flush=True)


def progress(pct: int) -> None:
    emit(f"PROGRESS {max(0, min(99, int(pct)))}")


def ffmpeg_bin() -> str:
    for candidate in (
        os.environ.get("FFMPEG_BIN"),
        shutil.which("ffmpeg"),
        "/data/data/com.termux/files/usr/bin/ffmpeg",
    ):
        if candidate and Path(candidate).exists():
            return candidate
    raise RuntimeError("ffmpeg not found (set FFMPEG_BIN)")


def read_wav(path: Path) -> np.ndarray:
    data, sr = sf.read(str(path), dtype="float32", always_2d=False)
    if data.ndim > 1:
        data = data.mean(axis=1)
    if sr != SAMPLE_RATE:
        # Linear resample is fine for a short narration segment.
        n = int(round(len(data) * SAMPLE_RATE / sr))
        data = np.interp(
            np.linspace(0, len(data) - 1, n, dtype=np.float64),
            np.arange(len(data), dtype=np.float64),
            data,
        ).astype(np.float32)
    return data


def fit_segment(path: Path, window: float, workdir: Path) -> np.ndarray:
    """Speed up a segment with ffmpeg atempo when it overflows its window."""
    audio = read_wav(path)
    duration = len(audio) / SAMPLE_RATE
    if duration <= window * 0.98:
        return audio
    ratio = min(1.65, duration / (window * 0.96))
    out = workdir / (path.stem + "_fit.wav")
    cmd = [
        ffmpeg_bin(), "-y", "-loglevel", "error", "-i", str(path),
        "-filter:a", f"atempo={ratio:.4f}", "-ar", str(SAMPLE_RATE), "-ac", "1", str(out),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    emit(f"Fitted {path.name}: {duration:.1f}s -> {len(read_wav(out)) / SAMPLE_RATE:.1f}s")
    return read_wav(out)


def synthesize(model, text: str, voice: str, speed: float, out: Path) -> np.ndarray:
    from kokoro_tts_local.models import generate_speech

    audio, _phonemes = generate_speech(model, text, voice, speed)
    if audio is None:
        raise RuntimeError(f"Kokoro returned no audio for: {text[:60]!r}")
    data = audio.detach().cpu().numpy().astype(np.float32).reshape(-1)
    sf.write(str(out), data, SAMPLE_RATE)
    return data


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--props", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--voice", default=os.environ.get("KOKORO_VOICE", "af_bella"))
    ap.add_argument("--speed", type=float, default=float(os.environ.get("KOKORO_SPEED", "1.05")))
    args = ap.parse_args()

    props = json.loads(Path(args.props).read_text(encoding="utf-8"))
    facts = props.get("facts") or []
    if len(facts) != 5:
        emit(f"ERROR narration needs exactly 5 facts, got {len(facts)}")
        return 2

    topic = str(props.get("topic") or "this topic").strip()
    intro_text = f"{topic.title()}. Five amazing facts."
    outro_text = "Which fact surprised you the most? Follow for more amazing facts."
    fact_texts = [
        f"{str(f.get('headline') or '').strip()}. {str(f.get('detail') or '').strip()}"
        for f in facts
    ]

    out_path = Path(args.out)
    if not out_path.is_absolute():
        out_path = Path.cwd() / out_path
    out_path.parent.mkdir(parents=True, exist_ok=True)

    started = time.time()
    progress(5)
    emit(f"Loading Kokoro voice {args.voice} ...")
    from kokoro_tts_local.models import build_model

    model = build_model(None, "cpu")
    progress(20)

    total = VIDEO_SECONDS * SAMPLE_RATE
    track = np.zeros(int(total), dtype=np.float32)
    workdir = Path(tempfile.mkdtemp(prefix="zes-narration-"))
    try:
        segments = [(intro_text, INTRO_START, INTRO_WINDOW, "intro")]
        for idx, text in enumerate(fact_texts):
            segments.append((text, FACT_START + idx * FACT_STEP, FACT_WINDOW, f"fact{idx + 1}"))
        segments.append((outro_text, OUTRO_START, OUTRO_WINDOW, "outro"))

        for i, (text, start, window, name) in enumerate(segments):
            progress(22 + int((i / len(segments)) * 70))
            raw = workdir / f"{name}.wav"
            synthesize(model, text, args.voice, args.speed, raw)
            audio = fit_segment(raw, window, workdir)
            offset = int(round(start * SAMPLE_RATE))
            end = min(len(track), offset + len(audio))
            track[offset:end] += audio[: end - offset]
            emit(f"Placed {name} at {start:.1f}s ({len(audio) / SAMPLE_RATE:.1f}s)")
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

    peak = float(np.max(np.abs(track))) or 1.0
    if peak > 0.98:
        track = track / peak * 0.98
    sf.write(str(out_path), track, SAMPLE_RATE)
    progress(96)
    emit(f"WROTE {out_path}")
    emit(f"Narration ready in {time.time() - started:.1f}s")
    progress(99)
    return 0


if __name__ == "__main__":
    sys.exit(main())
