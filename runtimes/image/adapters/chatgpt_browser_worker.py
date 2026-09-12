#!/usr/bin/env python3
from __future__ import annotations

import base64
import io
import json
import os
import sys
import time
from typing import Any


def read_request() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        raise RuntimeError("ChatGPT Browser worker expects one JSON request on stdin.")
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise RuntimeError("ChatGPT Browser worker request must be a JSON object.")
    return value


def require_playwright():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise RuntimeError(
            "Playwright is required for ChatGPT Browser generation. Install it in the selected Python environment."
        ) from exc
    return sync_playwright


def require_pillow():
    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError(
            "Pillow is required to normalize ChatGPT images to the exact Format Profile dimensions."
        ) from exc
    return Image


def page_state(page) -> str:
    url = str(page.url or "").lower()
    body = ""
    try:
        body = " ".join(page.locator("body").inner_text(timeout=3000).lower().split())
    except Exception:
        pass
    if "/auth/login" in url:
        return "login_required"
    if any(token in body for token in ("verify you are human", "captcha", "사람인지 확인", "보안 확인")):
        return "challenge"
    if any(token in body for token in ("image generation limit", "이미지 생성 한도", "사용 한도에 도달")):
        return "usage_limit"
    return "ready"


def raise_for_page_state(page) -> None:
    state = page_state(page)
    if state == "login_required":
        raise RuntimeError("ChatGPT login is required in the connected Chrome session.")
    if state == "challenge":
        raise RuntimeError("ChatGPT browser challenge/captcha is blocking image generation.")
    if state == "usage_limit":
        raise RuntimeError("ChatGPT image generation usage limit has been reached.")


def find_chatgpt_page(browser):
    candidates = []
    for context in browser.contexts:
        for page in context.pages:
            if "chatgpt.com" in str(page.url or "").lower():
                candidates.append(page)
    if candidates:
        return candidates[-1]
    if not browser.contexts:
        raise RuntimeError("Chrome CDP session has no browser context.")
    page = browser.contexts[0].new_page()
    page.goto("https://chatgpt.com/", wait_until="domcontentloaded", timeout=30000)
    return page


def find_composer(page):
    selectors = (
        "#prompt-textarea",
        "textarea[placeholder]",
        "main [contenteditable='true']",
    )
    for selector in selectors:
        locator = page.locator(selector).last
        try:
            locator.wait_for(state="visible", timeout=3000)
            return locator
        except Exception:
            continue
    raise RuntimeError("Could not find the ChatGPT prompt composer in the connected tab.")


def fill_composer(locator, text: str) -> None:
    try:
        locator.fill(text, timeout=5000)
        return
    except Exception:
        pass
    try:
        locator.click(timeout=3000)
        locator.press("Control+A")
        locator.press("Backspace")
        locator.evaluate(
            """(el, value) => {
              if ('value' in el) el.value = value;
              else el.textContent = value;
              el.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText', data: value}));
            }""",
            text,
        )
    except Exception as exc:
        raise RuntimeError("Could not place the approved prompt into ChatGPT.") from exc


def image_snapshot(page) -> list[dict[str, Any]]:
    return page.locator("main img").evaluate_all(
        """imgs => imgs.map((img, index) => ({
          index,
          src: img.currentSrc || img.src || '',
          width: Number(img.naturalWidth || 0),
          height: Number(img.naturalHeight || 0),
          complete: Boolean(img.complete)
        }))"""
    )


def capture_candidate_bytes(page, candidate: dict[str, Any]) -> bytes:
    index = int(candidate["index"])
    locator = page.locator("main img").nth(index)
    src = str(candidate.get("src") or "")
    if src:
        try:
            data_url = page.evaluate(
                """async (url) => {
                  const response = await fetch(url);
                  if (!response.ok) throw new Error('download failed');
                  const blob = await response.blob();
                  return await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                  });
                }""",
                src,
            )
            if isinstance(data_url, str) and "," in data_url:
                return base64.b64decode(data_url.split(",", 1)[1])
        except Exception:
            pass
    try:
        return bytes(locator.screenshot(type="png"))
    except Exception as exc:
        raise RuntimeError("Could not download or capture the generated ChatGPT image.") from exc


def normalize_png(raw: bytes, width: int, height: int) -> bytes:
    Image = require_pillow()
    with Image.open(io.BytesIO(raw)) as image:
        image.load()
        if image.width <= 0 or image.height <= 0:
            raise RuntimeError("Generated image has invalid dimensions.")
        target_ratio = width / height
        source_ratio = image.width / image.height
        if source_ratio > target_ratio:
            crop_width = max(1, round(image.height * target_ratio))
            left = max(0, (image.width - crop_width) // 2)
            image = image.crop((left, 0, left + crop_width, image.height))
        elif source_ratio < target_ratio:
            crop_height = max(1, round(image.width / target_ratio))
            top = max(0, (image.height - crop_height) // 2)
            image = image.crop((0, top, image.width, top + crop_height))
        image = image.convert("RGB").resize((width, height), Image.Resampling.LANCZOS)
        output = io.BytesIO()
        image.save(output, format="PNG", optimize=True)
        return output.getvalue()


def generate(request: dict[str, Any]) -> dict[str, Any]:
    text = str(request.get("transmissionText") or "").strip()
    width = int(request.get("width") or 0)
    height = int(request.get("height") or 0)
    cdp_url = str(request.get("cdpUrl") or "http://127.0.0.1:9222").strip()
    timeout_seconds = float(request.get("timeoutSeconds") or 180)
    if not text or width <= 0 or height <= 0 or timeout_seconds <= 0:
        raise RuntimeError("ChatGPT Browser worker received invalid prompt/dimension/timeout input.")
    if not (cdp_url.startswith("http://127.0.0.1:") or cdp_url.startswith("http://localhost:")):
        raise RuntimeError("CHATGPT_CDP_URL must point to a local Chrome CDP endpoint.")

    sync_playwright = require_playwright()
    playwright = sync_playwright().start()
    started = time.monotonic()
    try:
        try:
            browser = playwright.chromium.connect_over_cdp(cdp_url, timeout=30000)
        except Exception as exc:
            raise RuntimeError(f"Could not connect to Chrome CDP at {cdp_url}.") from exc
        page = find_chatgpt_page(browser)
        page.bring_to_front()
        raise_for_page_state(page)
        composer = find_composer(page)
        baseline = image_snapshot(page)
        before_sources = {str(item.get("src") or "") for item in baseline}
        fill_composer(composer, text)
        composer.press("Enter")

        deadline = time.monotonic() + timeout_seconds
        stable_key = None
        stable_polls = 0
        selected = None
        while time.monotonic() < deadline:
            page.wait_for_timeout(1000)
            raise_for_page_state(page)
            images = image_snapshot(page)
            candidates = [
                item
                for item in images
                if item.get("complete")
                and int(item.get("width") or 0) >= 256
                and int(item.get("height") or 0) >= 256
                and str(item.get("src") or "") not in before_sources
            ]
            if not candidates:
                stable_key = None
                stable_polls = 0
                continue
            candidate = candidates[-1]
            key = (
                str(candidate.get("src") or ""),
                int(candidate.get("width") or 0),
                int(candidate.get("height") or 0),
            )
            if key == stable_key:
                stable_polls += 1
            else:
                stable_key = key
                stable_polls = 1
            if stable_polls >= 3:
                selected = candidate
                break

        if selected is None:
            raise RuntimeError(f"ChatGPT image did not reach a stable generated state within {timeout_seconds:.0f}s.")
        raw = capture_candidate_bytes(page, selected)
        normalized = normalize_png(raw, width, height)
        return {
            "imageBase64": base64.b64encode(normalized).decode("ascii"),
            "mimeType": "image/png",
            "providerRequestIds": [],
            "sourceWidth": int(selected.get("width") or 0),
            "sourceHeight": int(selected.get("height") or 0),
            "elapsedSeconds": round(time.monotonic() - started, 3),
        }
    finally:
        playwright.stop()


def main() -> int:
    try:
        result = generate(read_request())
        sys.stdout.write(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as exc:
        sys.stderr.write(f"[chatgpt-browser-worker] {exc}\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
