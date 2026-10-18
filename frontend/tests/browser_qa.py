"""Phone-first regressions against an isolated synthetic server and built Web app.

Setup: python -m pip install -r tests/requirements-browser.txt
       python -m playwright install chromium
Run after npm run build: python tests/browser_qa.py
Optional: SYNAXIS_QA_BROWSER points to an explicitly supplied Chromium executable.
No external backend, live account, private report, model or original PDF is used.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from fixture_server import FRONTEND, SESSION_ID, FixtureServer

try:
    from playwright.sync_api import sync_playwright
except ImportError as error:
    raise SystemExit("Install browser QA dependencies: python -m pip install -r tests/requirements-browser.txt") from error


def run():
    dist = FRONTEND / "dist"
    if not (dist / "index.html").is_file():
        raise SystemExit("Missing production Web build. Run npm run build first.")
    out = FRONTEND / "test-results" / "browser"
    out.mkdir(parents=True, exist_ok=True)
    checks, errors, blocked, geometry = [], [], [], []
    success = False
    with FixtureServer(dist) as fixture, sync_playwright() as playwright:
        launch_options = {"headless": True}
        if os.environ.get("SYNAXIS_QA_BROWSER"):
            launch_options["executable_path"] = str(Path(os.environ["SYNAXIS_QA_BROWSER"]).expanduser().resolve(strict=True))
        try:
            browser = playwright.chromium.launch(**launch_options)
        except Exception as error:
            raise SystemExit("Unable to launch Chromium. Run python -m playwright install chromium, or set SYNAXIS_QA_BROWSER to a local executable.\n" + str(error)) from error
        context = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        if os.environ.get("SYNAXIS_QA_LEGACY_ABORT") == "1":
            context.add_init_script("for(const [object,key] of [[AbortSignal,'any'],[AbortSignal,'timeout'],[AbortSignal.prototype,'throwIfAborted']])Object.defineProperty(object,key,{configurable:true,value:undefined})")
        context.add_init_script("if(window===window.top&&!localStorage.getItem('synaxis.settings'))localStorage.setItem('synaxis.settings'," + json.dumps(json.dumps({"server": fixture.base, "theme": "light", "closeToTray": False})) + ")")

        def only_fixture(route):
            if route.request.url.startswith(fixture.base + "/"):
                route.continue_()
            else:
                blocked.append(route.request.url)
                route.abort("blockedbyclient")

        context.route("**/*", only_fixture)
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))

        def wait(predicate, seconds=15):
            import time
            end = time.monotonic() + seconds
            while time.monotonic() < end:
                if predicate():
                    return
                page.wait_for_timeout(50)
            raise AssertionError("Expected browser fixture condition within " + str(seconds) + "s")

        def checked(label):
            checks.append(label)
            print("PASS: " + label, flush=True)

        def settle():
            wait(lambda: page.locator(".motion-surface,.hero-flight,.sheet-exit").count() == 0)
            page.wait_for_timeout(100)

        def back():
            page.get_by_label("返回上一屏", exact=True).click()
            settle()

        def tab(name):
            page.locator(".mobile-nav").get_by_role("button", name=name, exact=True).click()
            settle()

        def search(query):
            page.get_by_label("查找知识点", exact=True).fill(query)
            page.get_by_role("button", name="检索", exact=True).click()
            wait(lambda: page.get_by_role("button", name="检索", exact=True).is_enabled())

        try:
            page.goto(fixture.base)
            if os.environ.get("SYNAXIS_QA_LEGACY_ABORT") == "1":
                assert page.evaluate("()=>[typeof AbortSignal.any,typeof AbortSignal.timeout,typeof AbortSignal.prototype.throwIfAborted]") == ["undefined"] * 3
            page.get_by_role("heading", name="进入研习室", exact=True).wait_for()
            page.get_by_label("用户名", exact=True).fill("fixture_student")
            page.get_by_label("密码", exact=True).fill("synthetic-browser-password")
            page.get_by_role("button", name="登录", exact=True).click()
            page.locator(".recent-card").first.wait_for()
            page.reload()
            page.locator(".recent-card").first.wait_for()
            assert sum(r["path"] == "/v1/auth/token" for r in fixture.requests) == 1
            checked("synthetic login and remembered session restore without another password submission")

            page.locator(".recent-card").first.click()
            page.locator(".output-preview .markdown").wait_for()
            settle()
            wait(lambda: fixture.active == 1)
            fixture.append_delta()
            page.locator(".output-preview .markdown strong").get_by_text("实时加粗", exact=True).wait_for()
            assert page.locator(".output-preview .markdown").inner_text().count("第一段合成正文") == 1
            assert "第 2 次检查" in page.locator(".reasoning-content pre").inner_text()
            checked("real chunked UTF-8 SSE renders Markdown and independent thinking in real time")

            # Match actual WebView lifecycle signals without opening another browser tab.
            page.evaluate("()=>{window.qaVisible=false;Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.qaVisible?'visible':'hidden'});document.dispatchEvent(new Event('visibilitychange'))}")
            wait(lambda: fixture.active == 0)
            refreshes_before = fixture.refreshes
            fixture.tokens_valid = False
            fixture.append_delta(3, "\n\n后台续传的合成正文。")
            before = fixture.connections
            page.evaluate("()=>{window.qaVisible=true;document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('pageshow'));window.dispatchEvent(new Event('online'))}")
            page.get_by_text("后台续传的合成正文。", exact=False).wait_for()
            wait(lambda: fixture.connections == before + 1)
            assert fixture.refreshes == refreshes_before + 1
            assert fixture.max_active == 1
            assert page.locator(".output-preview .markdown").inner_text().count("后台续传的合成正文") == 1
            assert any(r["path"].endswith("/events") and int(r["after"] or 0) > 0 for r in fixture.requests)
            checked("background resume merges foreground signals, refreshes expired auth and continues one stream from a durable cursor")

            fixture.drop_next = True
            page.get_by_text("连接中断，正在续接。", exact=False).wait_for()
            wait(lambda: fixture.connections >= before + 2)
            wait(lambda: page.get_by_text("连接中断，正在续接。", exact=False).count() == 0)
            fixture.finish()
            page.get_by_role("heading", name="正式合成讲解", exact=True).wait_for()
            wait(lambda: page.locator(".output-preview").count() == 0)
            assert page.locator(".message-assistant").count() == 1
            wait(lambda: page.locator("mjx-container").count() > 0)
            assert page.locator("[data-mjx-error],mjx-merror,.static-diagram script,.static-diagram image").count() == 0
            assert page.evaluate("window.previewExecuted===undefined&&window.svgExecuted===undefined")
            page.get_by_label("放大预览：教学静态图示", exact=True).click()
            page.get_by_role("dialog", name="教学静态图示", exact=True).wait_for()
            page.get_by_label("放大图片", exact=True).click()
            assert page.get_by_label("重置图片缩放", exact=True).inner_text() == "150%"
            page.get_by_label("关闭面板", exact=True).click()
            settle()
            checked("TCP interruption reconnects; formal sanitized Markdown/formula/SVG replaces preview and the image viewer remains touch accessible")

            back()
            tab("会话")
            page.locator(".history-row").first.wait_for()
            nav_top = page.locator(".mobile-nav").bounding_box()["y"]
            page.get_by_label("筛选", exact=True).click()
            page.get_by_role("dialog", name="筛选会话", exact=True).wait_for()
            page.get_by_role("button", name="完成", exact=True).click()
            settle()
            assert abs(page.locator(".mobile-nav").bounding_box()["y"] - nav_top) < 2
            checked("history filter sheet returns to the same compact navigation position")

            tab("我的")
            page.get_by_role("button", name="课程标准", exact=False).click()
            page.get_by_role("heading", name="课程标准", exact=True).wait_for()
            settle()
            search("函数")
            page.locator(".syllabus-hit").wait_for()
            page.locator(".syllabus-hit-open").first.click()
            page.locator(".syllabus-original").wait_for()
            assert page.locator(".syllabus-original").text_content() == fixture.data["section"]["text"]
            assert page.locator(".syllabus-original script,.syllabus-warnings img").count() == 0
            assert page.evaluate("window.syllabusExecuted===undefined")
            page.get_by_text("来源与课程分类", exact=True).click()
            assert page.locator(".source-hash").inner_text() == fixture.data["section"]["source"]["sha256"]
            back()
            assert page.get_by_label("查找知识点").input_value() == "函数"
            assert page.locator(".syllabus-hit").count() == 1
            fixture.search_error = (503, "SYLLABUS_MODEL_UNAVAILABLE")
            search("暂时不可用")
            page.get_by_text("本地向量模型尚未就绪", exact=False).wait_for()
            assert page.locator(".syllabus-hit").count() == 1
            fixture.search_error = None
            search("无匹配样例")
            page.get_by_role("heading", name="未找到匹配片段", exact=True).wait_for()
            checked("synthetic syllabus original/source stays inert, back preserves results, failures retain previous results and empty matches remain explicit")

            search("函数")
            for width in (320, 390, 412, 1280):
                for theme in ("light", "dark"):
                    page.set_viewport_size({"width": width, "height": 844})
                    page.evaluate("theme=>{document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme}", theme)
                    page.wait_for_timeout(100)
                    size = page.evaluate("()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,controls:[...document.querySelectorAll('.syllabus-filters>button,.syllabus-search-actions button')].map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))})")
                    assert size["scroll"] <= size["width"], size
                    assert all(control["width"] >= 48 and control["height"] >= 48 for control in size["controls"]), size
                    geometry.append({**size, "theme": theme})
                    if width == 390:
                        page.screenshot(path=str(out / f"syllabus-{theme}.png"))
            assert not errors, errors
            assert not blocked, blocked
            teaching_posts = [r for r in fixture.requests if r["method"] != "GET" and r["path"].startswith("/v1/sessions")]
            assert not teaching_posts, teaching_posts
            checked("320/390/412/1280 light/dark layouts have no horizontal overflow; touch controls are at least 48px; no outside network or teaching writes")
            success = True
        except Exception:
            page.screenshot(path=str(out / "failure.png"))
            (out / "failure.txt").write_text(page.locator("body").inner_text(), encoding="utf-8")
            raise
        finally:
            (out / "report.json").write_text(json.dumps({"passed": success, "legacy_abort_apis_missing": os.environ.get("SYNAXIS_QA_LEGACY_ABORT") == "1", "checks": checks, "errors": errors, "blocked_external_requests": blocked, "geometry": geometry, "requests": fixture.requests, "vendor_calls": 0, "fixture": "tests/fixtures/api.json"}, ensure_ascii=False, indent=2), encoding="utf-8")
            context.close()
            browser.close()
    print(f"PASS: {len(checks)} public browser regression groups", flush=True)


if __name__ == "__main__":
    run()
