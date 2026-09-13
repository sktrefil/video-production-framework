#!/usr/bin/env python3
from __future__ import annotations

import base64
import io
import json
import os
import sys
import time
from typing import Any, Callable


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
        raise RuntimeError("Playwright is required for ChatGPT Browser generation.") from exc
    return sync_playwright


def require_pillow():
    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError("Pillow is required for ChatGPT Browser generation.") from exc
    return Image


def poll_until(label: str, predicate: Callable[[], Any], timeout_seconds: float, interval_seconds: float = 0.35):
    deadline = time.monotonic() + timeout_seconds
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            value = predicate()
            if value:
                return value
        except Exception as exc:
            last_error = exc
        time.sleep(interval_seconds)
    suffix = f" Last error: {last_error}" if last_error else ""
    raise RuntimeError(f"Timed out waiting for {label}.{suffix}")


def page_state(page) -> str:
    url = str(page.url or "").lower()
    body = ""
    try:
        body = " ".join(page.locator("body").inner_text(timeout=1500).lower().split())
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


def connect_browser(playwright, cdp_url: str):
    if not (cdp_url.startswith("http://127.0.0.1:") or cdp_url.startswith("http://localhost:")):
        raise RuntimeError("CHATGPT_CDP_URL must point to a local Chrome CDP endpoint.")
    try:
        browser = playwright.chromium.connect_over_cdp(cdp_url, timeout=30000)
    except Exception as exc:
        raise RuntimeError(f"Could not connect to Chrome CDP at {cdp_url}.") from exc
    if not browser.contexts:
        raise RuntimeError("Chrome CDP session has no browser context.")
    return browser


def open_clean_chatgpt_page(browser):
    page = browser.contexts[0].new_page()
    page.goto("https://chatgpt.com/", wait_until="domcontentloaded", timeout=30000)
    poll_until("ChatGPT document", lambda: page.locator("body").count() > 0, 15)
    raise_for_page_state(page)
    return page


def find_composer(page):
    selectors = (
        "#prompt-textarea",
        "textarea[placeholder]",
        "main [contenteditable='true']",
    )

    def locate():
        for selector in selectors:
            locator = page.locator(selector).last
            try:
                if locator.count() > 0 and locator.is_visible():
                    return locator
            except Exception:
                continue
        return None

    return poll_until("visible ChatGPT prompt composer", locate, 25)


def composer_text(locator) -> str:
    return str(locator.evaluate("el => 'value' in el ? el.value : (el.innerText || el.textContent || '')") or "")


def normalize_text(value: str) -> str:
    return " ".join(value.replace("\u00a0", " ").split())


def fill_and_verify_composer(page, text: str, timeout_seconds: float):
    expected = normalize_text(text)
    composer = find_composer(page)
    try:
        composer.fill(text, timeout=7000)
    except Exception:
        composer = find_composer(page)
        composer.click(timeout=5000)
        composer.press("Control+A")
        composer.press("Backspace")
        composer.evaluate(
            """(el, value) => {
              if ('value' in el) el.value = value;
              else el.textContent = value;
              el.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText', data: value}));
            }""",
            text,
        )

    def matches():
        current = find_composer(page)
        actual = normalize_text(composer_text(current))
        if "�" in actual:
            raise RuntimeError("Composer text contains Unicode replacement characters; refusing to send corrupted prompt text.")
        return current if actual == expected else None

    return poll_until("composer text to exactly match approved prompt", matches, min(timeout_seconds, 30))


def validated_reference_paths(request: dict[str, Any]) -> list[str]:
    references = request.get("references") or []
    if not isinstance(references, list):
        raise RuntimeError("ChatGPT Browser worker references must be an array.")
    paths: list[str] = []
    for index, reference in enumerate(references):
        if not isinstance(reference, dict):
            raise RuntimeError(f"Reference {index + 1} is invalid.")
        filename = str(reference.get("absolutePath") or "").strip()
        if not filename or not os.path.isfile(filename):
            raise RuntimeError(f"Reference image is unavailable: {filename or index + 1}")
        paths.append(os.path.abspath(filename))
    return paths


def composer_scope(composer):
    for xpath in (
        "xpath=ancestor::form[1]",
        "xpath=ancestor::*[@data-type='unified-composer'][1]",
        "xpath=ancestor::*[contains(@class,'composer')][1]",
    ):
        candidate = composer.locator(xpath)
        try:
            if candidate.count() > 0:
                return candidate
        except Exception:
            pass
    return composer.locator("xpath=parent::*")


def find_file_input(page):
    if page.locator("input[type='file']").count() > 0:
        return page.locator("input[type='file']").last
    for selector in (
        "button[aria-label*='Attach']",
        "button[aria-label*='attach']",
        "button[aria-label*='파일']",
        "button[data-testid*='composer-plus']",
        "button[data-testid*='attach']",
    ):
        try:
            button = page.locator(selector).last
            if button.count() > 0 and button.is_visible():
                button.click(timeout=4000)
                return poll_until(
                    "ChatGPT reference-file input",
                    lambda: page.locator("input[type='file']").last if page.locator("input[type='file']").count() > 0 else None,
                    10,
                )
        except Exception:
            continue
    raise RuntimeError("Could not find the ChatGPT reference-file input.")


def attachment_snapshot(page, expected_paths: list[str]) -> dict[str, int]:
    composer = find_composer(page)
    scope = composer_scope(composer)
    image_count = 0
    remove_count = 0
    filename_hits = 0
    busy_count = 0
    try:
        image_count = scope.locator("img").count()
    except Exception:
        pass
    try:
        remove_count = scope.locator(
            "button[aria-label*='Remove'], button[aria-label*='remove'], button[aria-label*='삭제'], button[aria-label*='제거']"
        ).count()
    except Exception:
        pass
    try:
        text = scope.inner_text(timeout=1000).lower()
        filename_hits = sum(1 for item in expected_paths if os.path.basename(item).lower() in text)
    except Exception:
        pass
    try:
        busy_count = scope.locator(
            "[aria-busy='true'], [data-state='loading'], [data-testid*='upload'][aria-busy='true'], progress"
        ).count()
    except Exception:
        pass
    return {
        "image_count": image_count,
        "remove_count": remove_count,
        "filename_hits": filename_hits,
        "busy_count": busy_count,
    }


def attach_reference_files(page, paths: list[str], timeout_seconds: float) -> dict[str, int]:
    if not paths:
        return {"expected": 0, "visible": 0}
    composer = find_composer(page)
    scope = composer_scope(composer)
    before_images = scope.locator("img").count()
    file_input = find_file_input(page)
    file_input.set_input_files(paths, timeout=20000)
    expected = len(paths)
    last: dict[str, int] = {}

    def visible():
        nonlocal last
        raise_for_page_state(page)
        snap = attachment_snapshot(page, paths)
        snap["preview_delta"] = max(0, snap["image_count"] - before_images)
        last = snap
        count = max(snap["preview_delta"], snap["remove_count"], snap["filename_hits"])
        return snap if count >= expected else None

    try:
        evidence = poll_until("all reference attachments to appear in the composer", visible, min(timeout_seconds, 90))
    except Exception as exc:
        raise RuntimeError(f"Reference attachments did not become visible. expected={expected}, last={last}") from exc
    return {"expected": expected, "visible": expected, **evidence}


def find_send_button(page):
    selectors = (
        "button[data-testid='send-button']",
        "button[aria-label*='Send']",
        "button[aria-label*='send']",
        "button[aria-label*='보내기']",
    )
    for selector in selectors:
        try:
            button = page.locator(selector).last
            if button.count() > 0 and button.is_visible():
                return button
        except Exception:
            continue
    return None


def wait_until_send_ready(page, expected_paths: list[str], timeout_seconds: float):
    last: dict[str, Any] = {}

    def ready():
        nonlocal last
        raise_for_page_state(page)
        evidence = attachment_snapshot(page, expected_paths)
        button = find_send_button(page)
        enabled = False
        if button is not None:
            try:
                enabled = button.is_enabled()
            except Exception:
                enabled = False
        last = {**evidence, "sendButtonFound": button is not None, "sendButtonEnabled": enabled}
        # The send button is ChatGPT's own readiness gate. We do not infer success
        # from elapsed time or from thumbnails merely being present.
        if button is not None and enabled and evidence["busy_count"] == 0:
            return button
        return None

    try:
        return poll_until("ChatGPT send button to become enabled after attachment processing", ready, timeout_seconds, 0.4)
    except Exception as exc:
        raise RuntimeError(f"Composer never became send-ready. last={last}") from exc


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


def assistant_turn_count(page) -> int:
    try:
        return page.locator("[data-message-author-role='assistant']").count()
    except Exception:
        return 0


def generation_in_progress(page) -> bool:
    for selector in (
        "button[data-testid='stop-button']",
        "button[aria-label*='Stop']",
        "button[aria-label*='stop']",
        "button[aria-label*='중지']",
    ):
        try:
            locator = page.locator(selector).last
            if locator.count() > 0 and locator.is_visible():
                return True
        except Exception:
            continue
    return False


def send_prompt_and_verify_started(page, send_button, before_assistant_turns: int, timeout_seconds: float) -> None:
    send_button.click(timeout=7000)

    def started():
        raise_for_page_state(page)
        if generation_in_progress(page):
            return True
        if assistant_turn_count(page) > before_assistant_turns:
            return True
        try:
            if normalize_text(composer_text(find_composer(page))) == "":
                return True
        except Exception:
            pass
        return False

    poll_until("ChatGPT generation to start", started, min(timeout_seconds, 45), 0.35)


def wait_for_generated_image(page, before_sources: set[str], timeout_seconds: float) -> dict[str, Any]:
    stable_key = None
    stable_polls = 0

    def completed():
        nonlocal stable_key, stable_polls
        raise_for_page_state(page)
        candidates = [
            item for item in image_snapshot(page)
            if item.get("complete")
            and int(item.get("width") or 0) >= 256
            and int(item.get("height") or 0) >= 256
            and str(item.get("src") or "") not in before_sources
        ]
        if not candidates:
            stable_key = None
            stable_polls = 0
            return None
        candidate = candidates[-1]
        key = (str(candidate.get("src") or ""), int(candidate.get("width") or 0), int(candidate.get("height") or 0))
        if key == stable_key:
            stable_polls += 1
        else:
            stable_key = key
            stable_polls = 1
        if stable_polls >= 3 and not generation_in_progress(page):
            return candidate
        return None

    return poll_until("a stable completed ChatGPT image", completed, timeout_seconds, 0.5)


def capture_candidate_bytes(page, candidate: dict[str, Any]) -> bytes:
    locator = page.locator("main img").nth(int(candidate["index"]))
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
    return bytes(locator.screenshot(type="png"))


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


def probe(request: dict[str, Any]) -> dict[str, Any]:
    cdp_url = str(request.get("cdpUrl") or "http://127.0.0.1:9222").strip()
    sync_playwright = require_playwright()
    playwright = sync_playwright().start()
    page = None
    try:
        browser = connect_browser(playwright, cdp_url)
        page = open_clean_chatgpt_page(browser)
        composer = find_composer(page)
        return {"status": "READY", "pageState": page_state(page), "composerVisible": composer.is_visible(), "cdpUrl": cdp_url}
    finally:
        if page is not None:
            try:
                page.close()
            except Exception:
                pass
        playwright.stop()


def generate(request: dict[str, Any]) -> dict[str, Any]:
    text = str(request.get("transmissionText") or "").strip()
    width = int(request.get("width") or 0)
    height = int(request.get("height") or 0)
    cdp_url = str(request.get("cdpUrl") or "http://127.0.0.1:9222").strip()
    timeout_seconds = float(request.get("timeoutSeconds") or 180)
    reference_paths = validated_reference_paths(request)
    if not text or width <= 0 or height <= 0 or timeout_seconds <= 0:
        raise RuntimeError("ChatGPT Browser worker received invalid prompt/dimension/timeout input.")

    sync_playwright = require_playwright()
    playwright = sync_playwright().start()
    started = time.monotonic()
    page = None
    stage = "CONNECT"
    try:
        browser = connect_browser(playwright, cdp_url)
        stage = "OPEN_PAGE"
        page = open_clean_chatgpt_page(browser)
        page.bring_to_front()
        find_composer(page)

        stage = "ATTACH_REFERENCES"
        attachment_status = attach_reference_files(page, reference_paths, timeout_seconds)

        stage = "FILL_PROMPT"
        composer = fill_and_verify_composer(page, text, timeout_seconds)
        baseline = image_snapshot(page)
        before_sources = {str(item.get("src") or "") for item in baseline}
        before_assistant_turns = assistant_turn_count(page)

        stage = "WAIT_SEND_READY"
        send_button = wait_until_send_ready(page, reference_paths, timeout_seconds)

        stage = "SEND_PROMPT"
        send_prompt_and_verify_started(page, send_button, before_assistant_turns, timeout_seconds)

        stage = "WAIT_IMAGE"
        selected = wait_for_generated_image(page, before_sources, timeout_seconds)

        stage = "CAPTURE_IMAGE"
        raw = capture_candidate_bytes(page, selected)
        normalized = normalize_png(raw, width, height)
        return {
            "imageBase64": base64.b64encode(normalized).decode("ascii"),
            "mimeType": "image/png",
            "providerRequestIds": [],
            "referenceCount": len(reference_paths),
            "attachmentStatus": attachment_status,
            "sourceWidth": int(selected.get("width") or 0),
            "sourceHeight": int(selected.get("height") or 0),
            "elapsedSeconds": round(time.monotonic() - started, 3),
        }
    except Exception as exc:
        raise RuntimeError(f"stage={stage}: {exc}") from exc
    finally:
        if page is not None:
            try:
                page.close()
            except Exception:
                pass
        playwright.stop()


def main() -> int:
    try:
        request = read_request()
        action = str(request.get("action") or "generate").strip().lower()
        result = probe(request) if action == "probe" else generate(request)
        sys.stdout.write(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as exc:
        sys.stderr.write(f"[chatgpt-browser-worker-v2] {exc}\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
