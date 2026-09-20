from __future__ import annotations

import json
import os
import sys
from typing import Any

from faster_whisper import WhisperModel


def fail(message: str) -> None:
    print(json.dumps({"success": False, "error": message}, ensure_ascii=False))
    raise SystemExit(1)


def main() -> None:
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    try:
        request: dict[str, Any] = json.load(sys.stdin)
        audio_path = str(request.get("audioPath") or "").strip()
        prompt = str(request.get("prompt") or "").strip()
        language = str(request.get("language") or "ko").strip()
        model_name = str(request.get("model") or os.environ.get("VPF_WHISPER_MODEL") or "small").strip()
        if not audio_path or not os.path.isfile(audio_path):
            fail(f"Audio file does not exist: {audio_path}")

        model = WhisperModel(model_name, device="cpu", compute_type="int8")
        segments, info = model.transcribe(
            audio_path,
            language=language,
            beam_size=5,
            word_timestamps=True,
            vad_filter=True,
            initial_prompt=prompt or None,
            condition_on_previous_text=False,
        )
        words: list[dict[str, Any]] = []
        transcript: list[str] = []
        for segment in segments:
            transcript.append(segment.text)
            for word in segment.words or []:
                if word.start is None or word.end is None:
                    continue
                words.append(
                    {
                        "text": word.word,
                        "startSeconds": float(word.start),
                        "endSeconds": float(word.end),
                        "probability": float(word.probability),
                    }
                )
        if not words:
            fail("Whisper returned no timestamped words.")
        print(
            json.dumps(
                {
                    "success": True,
                    "model": model_name,
                    "language": info.language,
                    "languageProbability": float(info.language_probability),
                    "transcript": "".join(transcript).strip(),
                    "words": words,
                },
                ensure_ascii=False,
            )
        )
    except SystemExit:
        raise
    except Exception as error:
        fail(str(error))


if __name__ == "__main__":
    main()
