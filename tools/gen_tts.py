#!/usr/bin/env python3
"""Generate TOEFL Part A audio: 3 British voices via edge-tts + ffmpeg concat.
Narrator=en-GB-ThomasNeural, Man=en-GB-RyanNeural, Woman=en-GB-SoniaNeural.
Retries transient NoAudioReceived up to 4x with backoff."""
import asyncio, json, os, subprocess, sys, tempfile
import edge_tts

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = json.load(open(os.path.join(ROOT, "items.json")))
AUDIO_DIR = os.path.join(ROOT, "site", "audio")
RATE = "+5%"
NARRATOR, MAN, WOMAN = DATA["voices"]["narrator"], DATA["voices"]["man"], DATA["voices"]["woman"]

def synth(text, voice, out):
    async def one():
        c = edge_tts.Communicate(text, voice, rate=RATE)
        await c.save(out)
    for attempt in range(1, 5):
        try:
            asyncio.run(one())
            if os.path.getsize(out) > 500:
                return
        except Exception as e:
            print(f"  retry {attempt} ({type(e).__name__}: {e})")
    raise RuntimeError(f"TTS failed permanently: {voice}: {text[:60]}")

def silence(dur, out):
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi",
                    "-i", f"anullsrc=r=24000:cl=mono", "-t", str(dur),
                    "-b:a", "48k", out], check=True)

def concat(files, out):
    lst = out + ".txt"
    with open(lst, "w") as f:
        for x in files:
            f.write(f"file '{os.path.abspath(x)}'\n")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0",
                    "-i", lst, "-c:a", "libmp3lame", "-b:a", "64k", out], check=True)
    os.remove(lst)

def main():
    os.makedirs(AUDIO_DIR, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="tts_")
    jobs = []
    # Intro directions
    intro = os.path.join(AUDIO_DIR, "intro.mp3")
    print("[intro] directions...")
    synth(DATA["intro"], NARRATOR, intro)
    jobs.append(intro)
    num = os.path.join(tmp, "sil_num.mp3")
    turn = os.path.join(tmp, "sil_turn.mp3")
    preq = os.path.join(tmp, "sil_preq.mp3")
    post = os.path.join(tmp, "sil_post.mp3")
    silence(1.2, num); silence(0.6, turn); silence(1.0, preq); silence(1.5, post)
    only = sys.argv[1:] and [int(x) for x in sys.argv[1:]]
    for item in DATA["items"]:
        if only and item["id"] not in only:
            continue
        print(f"[item {item['id']:02d}] {item['sentence_type']}/{item['question_focus']} ({len(item['script'])} turns)")
        parts = [num]
        seg = os.path.join(tmp, f"n{item['id']}_num.mp3")
        synth(f"Number {item['id']}.", NARRATOR, seg)
        parts += [seg, turn]
        for spk, line in item["script"]:
            v = MAN if spk == "man" else WOMAN
            seg = os.path.join(tmp, f"{item['id']}_{spk}_{len(parts)}.mp3")
            synth(line, v, seg)
            parts += [seg, turn]
        parts += [preq]
        seg = os.path.join(tmp, f"{item['id']}_q.mp3")
        synth(item["question"], NARRATOR, seg)
        parts += [seg, post]
        out = os.path.join(AUDIO_DIR, f"item{item['id']:02d}.mp3")
        concat(parts, out)
        jobs.append(out)
    print(f"\nDONE: {len(jobs)} files")
    for j in jobs:
        r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                            "-of", "default=nw=1:nk=1", j], capture_output=True, text=True)
        print(f"  {os.path.basename(j):12s} {float(r.stdout.strip()):6.1f}s")

if __name__ == "__main__":
    main()
