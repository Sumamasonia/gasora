"""Read-only business assistant (optional; needs a Google Gemini key in GASORA_GEMINI_KEY).

How it stays read-only and private:
  * It has no tools. It receives one text snapshot of the agency's totals and a question, and returns text.
  * The snapshot holds totals and counts only: no customer names, phone numbers, addresses or ids.
  * The key stays on the server and is never sent to the browser.
  * Only an owner may ask. Each question is logged as an event with its length, not its text.
The answer is the model's reading of those totals. It can be wrong, so it must be checked against the pages.
"""
import json
import os
import urllib.error
import urllib.request

from backend import reports

MODEL = os.environ.get("GASORA_GEMINI_MODEL", "gemini-2.0-flash")
URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
MAX_QUESTION = 500
SYSTEM = ("You answer questions for the owner of an LPG cylinder distribution agency, using only the figures in the "
          "snapshot below. Amounts are Pakistani rupees. If the snapshot does not contain the answer, say so. "
          "Never invent figures. Keep answers short and in plain words.")


def configured():
    return bool(os.environ.get("GASORA_GEMINI_KEY"))


def snapshot(session, today):
    d = reports.dashboard(session, today)
    d["receivables"] = {k: v for k, v in d["receivables"].items() if k != "top"}      # no names, no ids
    return d


def build_request(snap, question):
    text = f"{SYSTEM}\n\nSnapshot (JSON):\n{json.dumps(snap, sort_keys=True)}\n\nQuestion: {question}"
    return {"contents": [{"role": "user", "parts": [{"text": text}]}],
            "generationConfig": {"temperature": 0.2, "maxOutputTokens": 400}}


def _post(url, key, body, timeout=20):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "x-goog-api-key": key})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def ask(session, today, question, transport=None):
    """Return the assistant's answer. `transport(url, key, body)` can be replaced in tests."""
    question = (question or "").strip()
    if not question:
        raise ValueError("write a question")
    if len(question) > MAX_QUESTION:
        raise ValueError(f"keep the question under {MAX_QUESTION} characters")
    key = os.environ.get("GASORA_GEMINI_KEY")
    if not key:
        raise RuntimeError("the assistant is not set up: set GASORA_GEMINI_KEY and restart the server")
    try:
        data = (transport or _post)(URL.format(model=MODEL), key, build_request(snapshot(session, today), question))
        return data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (urllib.error.URLError, TimeoutError, OSError):
        raise ConnectionError("could not reach the assistant service")
    except (KeyError, IndexError, TypeError, ValueError):
        raise ConnectionError("the assistant service gave an answer this system could not read")
