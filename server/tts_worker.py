#!/usr/bin/env python3
"""
Kokoro TTS worker for Course Magic motion videos.

Kokoro is a free, open-source, self-hosted TTS model — no API, no per-use
cost, no datacenter-IP blocking (the issue ElevenLabs' free tier has). This
mirrors the audiobook-studio app's approach.

Batch mode: the Kokoro model takes ~13s to load, so the Node server passes
ALL of a video's scene narrations in one invocation — the model loads once
and every scene is synthesized in the same process.

Called by the Node server as a subprocess:
    python3 tts_worker.py <input_json>

Input JSON:
    {
      "voice": "af_heart",
      "speed": 1.0,
      "outDir": "/abs/path/to/dir",
      "segments": [ { "id": "0", "text": "..." }, ... ]
    }

Final stdout line (JSON):
    { "done": true, "results": [ { "id": "0", "output": ".../0.wav", "duration": 3.42 }, ... ] }
On failure: { "error": "..." } and a non-zero exit code.
"""
import sys
import json
import os


def find_model_files():
    """Locate the Kokoro ONNX model + voices, downloading them if absent."""
    home = os.path.expanduser("~")
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        (os.path.join(home, "kokoro-v1.0.onnx"), os.path.join(home, "voices-v1.0.bin")),
        ("/app/kokoro-v1.0.onnx", "/app/voices-v1.0.bin"),
        (os.path.join(here, "kokoro-v1.0.onnx"), os.path.join(here, "voices-v1.0.bin")),
    ]
    for model, voices in candidates:
        if os.path.exists(model) and os.path.exists(voices):
            return model, voices

    # Not found anywhere — download to the home directory.
    import urllib.request
    model = os.path.join(home, "kokoro-v1.0.onnx")
    voices = os.path.join(home, "voices-v1.0.bin")
    base = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0"
    if not os.path.exists(model):
        print(json.dumps({"status": "downloading_model"}), flush=True)
        urllib.request.urlretrieve(f"{base}/kokoro-v1.0.onnx", model)
    if not os.path.exists(voices):
        print(json.dumps({"status": "downloading_voices"}), flush=True)
        urllib.request.urlretrieve(f"{base}/voices-v1.0.bin", voices)
    return model, voices


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: tts_worker.py <input_json>"}))
        sys.exit(1)

    try:
        with open(sys.argv[1], "r", encoding="utf-8") as f:
            cfg = json.load(f)
    except Exception as e:
        print(json.dumps({"error": f"failed to read input: {e}"}))
        sys.exit(1)

    voice = cfg.get("voice", "af_heart")
    speed = float(cfg.get("speed", 1.0))
    out_dir = cfg.get("outDir", ".")
    segments = cfg.get("segments", [])
    if not segments:
        print(json.dumps({"error": "no segments provided"}))
        sys.exit(1)

    os.makedirs(out_dir, exist_ok=True)

    try:
        import numpy as np
        import soundfile as sf
        model_path, voices_path = find_model_files()
        from kokoro_onnx import Kokoro

        kokoro = Kokoro(model_path, voices_path)  # loaded once for the whole batch
    except Exception as e:
        print(json.dumps({"error": f"failed to load Kokoro: {e}"}))
        sys.exit(1)

    results = []
    for seg in segments:
        seg_id = str(seg.get("id"))
        text = (seg.get("text") or "").strip()
        out_path = os.path.join(out_dir, f"{seg_id}.wav")
        if not text:
            results.append({"id": seg_id, "output": None, "duration": 0})
            continue
        try:
            samples, sample_rate = kokoro.create(text, voice=voice, speed=speed, lang="en-us")
            if samples is None or len(samples) == 0:
                raise RuntimeError("Kokoro produced no audio")
            sf.write(out_path, np.asarray(samples), sample_rate)
            results.append({
                "id": seg_id,
                "output": out_path,
                "duration": round(len(samples) / float(sample_rate), 3),
            })
            print(json.dumps({"progress": seg_id}), flush=True)
        except Exception as e:
            print(json.dumps({"error": f"segment {seg_id} failed: {e}"}))
            sys.exit(1)

    print(json.dumps({"done": True, "results": results}), flush=True)


if __name__ == "__main__":
    main()
