#!/usr/bin/env python3
"""Tempo medido de cada palavra de um áudio cujo texto já é conhecido (alinhamento forçado).

Uso: python tools/align.py <audio.wav> <texto.txt> <saida.json> [--language Portuguese]

Backends, em ordem:
  1. mlx-audio + Qwen3-ForcedAligner (Apple Silicon). `pip install mlx-audio`
  2. faster-whisper com word_timestamps (qualquer CPU). `pip install faster-whisper`
Saída: {"backend": "...", "words": [{"text": "...", "start": s, "end": s}, ...]}
O Node casa essas palavras com o roteiro; palavra que o backend não reconhecer é interpolada.
"""
import json
import sys


def mlx_forced(audio, text, language):
    from mlx_audio.stt.utils import load_model

    model = load_model("mlx-community/Qwen3-ForcedAligner-0.6B-8bit")
    result = model.generate(audio=audio, text=text, language=language)
    item = result[0] if isinstance(result, list) else result
    return "qwen3-forced-aligner", [{"text": i.text, "start": float(i.start_time), "end": float(i.end_time)} for i in item.items]


def faster_whisper(audio, text, language):
    from faster_whisper import WhisperModel

    codes = {"portuguese": "pt", "english": "en", "spanish": "es"}
    model = WhisperModel("small", device="cpu", compute_type="int8")
    segments, _ = model.transcribe(audio, language=codes.get(language.lower(), None), word_timestamps=True, initial_prompt=text[:200])
    words = [{"text": w.word.strip(), "start": float(w.start), "end": float(w.end)} for s in segments for w in (s.words or [])]
    return "faster-whisper-small", words


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    language = "Portuguese"
    if "--language" in sys.argv:
        language = sys.argv[sys.argv.index("--language") + 1]
        args = [a for a in args if a != language]
    audio, text_file, out = args[:3]
    text = open(text_file, encoding="utf-8").read()
    errors = []
    for backend in (mlx_forced, faster_whisper):
        try:
            name, words = backend(audio, text, language)
            if words:
                json.dump({"backend": name, "words": words}, open(out, "w", encoding="utf-8"), ensure_ascii=False)
                return
            errors.append(f"{backend.__name__}: nenhuma palavra")
        except Exception as error:  # noqa: BLE001 — tenta o próximo backend
            errors.append(f"{backend.__name__}: {error}")
    sys.exit("nenhum alinhador disponível:\n  " + "\n  ".join(errors))


if __name__ == "__main__":
    main()
