"""Isolated, zero-provider HTTP/SSE fixture shared by public browser regressions.

Only Python's standard library is needed. Inputs are authored synthetic fixtures;
neither backend source/runtime data nor ignored test-results are read.
"""

from __future__ import annotations

import copy
import json
import mimetypes
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

FRONTEND = Path(__file__).resolve().parents[1]
FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "api.json").read_text(encoding="utf-8"))
SESSION_ID = "1" * 32
ACCESS_TOKEN = "synthetic-fixture-access"


def message(mid: int, role: str, text: str | None = None, presentation: dict | None = None) -> dict:
    return {
        "id": mid, "session_id": SESSION_ID, "role": role,
        "kind": "question" if role == "student" else "presentation",
        "text": text, "presentation": presentation, "question_id": None, "images": [],
        "created_at": FIXTURE["_fixture"]["timestamp"], "time_accuracy": "exact",
    }


class FixtureServer:
    """Context-managed loopback server. Unknown writes fail closed."""

    def __init__(self, static_root: Path | None = None):
        self.static_root = static_root.resolve() if static_root else None
        self.data = copy.deepcopy(FIXTURE)
        self.lock = threading.RLock()
        self.requests: list[dict] = []
        self.connections = 0
        self.active = 0
        self.max_active = 0
        self.tokens_valid = True
        self.refreshes = 0
        self.drop_next = False
        self.search_error: tuple[int, str] | None = None
        self.messages = [message(1, "student", "请解释合成函数样例。")]
        self.session = {
            "id": SESSION_ID, "title": "合成函数样例", "summary": "公开回归使用的合成会话。",
            "subject": "math", "grade": "高二", "province": None, "textbook": "合成测试教材",
            "image_count": 0, "status": "running", "expert": "Euclid",
            "created_at": FIXTURE["_fixture"]["timestamp"], "updated_at": FIXTURE["_fixture"]["timestamp"],
            "pinned": False, "archived": False, "original_message": self.messages[0]["text"],
            "question": None, "presentations": [], "error": None, "submission_message_id": 1,
        }
        self.events: list[dict] = []
        self.event("message", {"message": self.messages[0]})
        self.event("reasoning_start", {"stream_id": "reason-1", "round": 1, "effort": "low"})
        self.event("reasoning_delta", {"stream_id": "reason-1", "sequence": 1, "text": "先检核合成条件。"})
        self.event("output_start", {"stream_id": "body-1", "round": 1, "effort": "low"})
        self.event("output_delta", {"stream_id": "body-1", "sequence": 1, "text": "## 已知条件\n\n第一段合成正文。"})
        fixture = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *_args):
                pass

            def handle(self):
                try:
                    super().handle()
                except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
                    pass

            def headers_for(self, status: int, content_type: str, length: int | None = None):
                self.send_response(status)
                self.send_header("Content-Type", content_type)
                self.send_header("Cache-Control", "no-store")
                if length is None:
                    self.send_header("Transfer-Encoding", "chunked")
                else:
                    self.send_header("Content-Length", str(length))
                self.end_headers()

            def respond_json(self, value, status: int = 200):
                data = json.dumps(value, ensure_ascii=False).encode()
                self.headers_for(status, "application/json; charset=utf-8", len(data))
                self.wfile.write(data)

            def do_GET(self):
                self.respond()

            def do_POST(self):
                self.respond()

            def do_PUT(self):
                self.respond()

            def do_PATCH(self):
                self.respond()

            def do_DELETE(self):
                self.respond()

            def respond(self):
                parsed = urlparse(self.path)
                path = parsed.path
                raw = self.rfile.read(int(self.headers.get("Content-Length", "0")))
                payload = json.loads(raw) if raw and "application/json" in self.headers.get("Content-Type", "") else {}
                record = {"method": self.command, "path": path, "query": parsed.query, "after": self.headers.get("Last-Event-ID")}
                with fixture.lock:
                    fixture.requests.append(record)
                if path == "/health":
                    return self.respond_json({"status": "ok", "version": fixture.data["capabilities"]["version"], "syllabus": "ready", "sandbox": "configured"})
                if path in ("/v1/auth/token", "/v1/auth/refresh") and self.command == "POST":
                    if path.endswith("refresh"):
                        fixture.refreshes += 1
                    fixture.tokens_valid = True
                    return self.respond_json({"access_token": ACCESS_TOKEN, "refresh_token": "synthetic-fixture-refresh-" + "r" * 40, "expires_in": 3600, "refresh_expires_in": 2592000, "token_type": "bearer"})
                if path.startswith("/v1/"):
                    if not fixture.tokens_valid or self.headers.get("Authorization") != "Bearer " + ACCESS_TOKEN:
                        return self.respond_json({"code": "UNAUTHORIZED", "detail": "Synthetic token expired"}, 401)
                    return self.api(path, parsed, payload)
                if self.command != "GET" or fixture.static_root is None:
                    return self.respond_json({"code": "NOT_FOUND"}, 404)
                candidate = (fixture.static_root / unquote(path).lstrip("/")).resolve()
                if not candidate.is_relative_to(fixture.static_root):
                    return self.respond_json({"code": "NOT_FOUND"}, 404)
                if candidate.is_dir():
                    candidate = candidate / "index.html"
                if not candidate.is_file():
                    return self.respond_json({"code": "NOT_FOUND"}, 404)
                data = candidate.read_bytes()
                mime = "application/javascript" if candidate.suffix in (".js", ".mjs") else mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
                self.headers_for(200, mime, len(data))
                self.wfile.write(data)

            def api(self, path, parsed, payload):
                method = self.command
                if path == "/v1/me" and method == "GET":
                    return self.respond_json(fixture.data["profile"])
                if path == "/v1/me/preferences" and method in ("GET", "PUT"):
                    if method == "PUT":
                        fixture.data["profile"]["preferences"] = payload
                    return self.respond_json(fixture.data["profile"]["preferences"])
                if path == "/v1/capabilities" and method == "GET":
                    return self.respond_json(fixture.data["capabilities"])
                if path == "/v1/error-codes" and method == "GET":
                    return self.respond_json({"items": []})
                if path == "/v1/experts" and method == "GET":
                    return self.respond_json({"experts": fixture.data["capabilities"]["experts"], "skills": {}})
                if path == "/v1/usage/summary" and method == "GET":
                    return self.respond_json({"group_by": "total", "date_from": "2026-01-01", "date_to": "2026-01-01", "items": [{"key": "total", "currency": "CNY", "calls": 0, "estimated_cost": "0", "unknown_cost_calls": 0, "input_tokens": 0, "output_tokens": 0, "cache_read_tokens": 0}], "next_cursor": None})
                if path == "/v1/usage" and method == "GET":
                    return self.respond_json({"items": [], "next_before": None})
                if path == "/v1/sessions" and method == "GET":
                    return self.respond_json({"items": [fixture.session], "next_cursor": None})
                if path == "/v1/syllabus/search" and method == "POST":
                    if fixture.search_error:
                        return self.respond_json({"code": fixture.search_error[1]}, fixture.search_error[0])
                    section = fixture.data["section"]
                    mode = payload.get("mode", "hybrid")
                    hit = {**section, "id": "synthetic-fragment", "section_id": section["id"], "context_before": "", "context_pdf_pages": [], "embedding_text": "", "score": 0.5, "retrieval_method": mode}
                    results = [] if payload.get("query") == "无匹配样例" else [hit]
                    return self.respond_json({"status": "ok", "code": None, "subject": payload.get("subject"), "edition": fixture.data["capabilities"]["syllabus"]["edition"], "mode": mode, "count": len(results), "results": results, "message": None})
                if path == "/v1/syllabus/sections/" + fixture.data["section"]["id"] and method == "GET":
                    return self.respond_json(fixture.data["section"])
                prefix = "/v1/sessions/" + SESSION_ID
                if path.startswith(prefix) and method == "GET":
                    after = int(parse_qs(parsed.query).get("after", ["0"])[0])
                    if path == prefix + "/events":
                        return self.stream(after)
                    with fixture.lock:
                        if path == prefix + "/events/history":
                            items = copy.deepcopy([e for e in fixture.events if e["id"] > after])
                            return self.respond_json({"items": items[:4], "next_after": items[3]["id"] if len(items) > 4 else None})
                        if path == prefix + "/messages":
                            return self.respond_json({"items": copy.deepcopy(fixture.messages), "next_after": None})
                        if path == prefix + "/budget":
                            return self.respond_json({"session_id": SESSION_ID, "currency": "CNY", "limit": "5", "spent": "0", "uncertain": "0", "reserved": "0", "available": "5", "exhausted": False})
                        if path == prefix:
                            return self.respond_json(copy.deepcopy(fixture.session))
                # A regression must never accidentally dispatch a teaching request.
                return self.respond_json({"code": "FIXTURE_WRITE_FORBIDDEN" if method != "GET" else "NOT_FOUND"}, 405 if method != "GET" else 404)

            def chunk(self, data: bytes):
                self.wfile.write(f"{len(data):x}\r\n".encode() + data + b"\r\n")
                self.wfile.flush()

            def stream(self, after: int):
                self.headers_for(200, "text/event-stream; charset=utf-8")
                with fixture.lock:
                    fixture.connections += 1
                    fixture.active += 1
                    fixture.max_active = max(fixture.max_active, fixture.active)
                try:
                    while not fixture.stopped.is_set():
                        with fixture.lock:
                            events = copy.deepcopy([e for e in fixture.events if e["id"] > after])
                            terminal = fixture.session["status"] not in ("queued", "running")
                            drop, fixture.drop_next = fixture.drop_next, False
                        if drop:
                            self.connection.shutdown(socket.SHUT_RDWR)
                            self.connection.close()
                            self.close_connection = True
                            return
                        for event in events:
                            frame = f'id: {event["id"]}\nevent: {event["event"]}\ndata: {json.dumps(event["data"], ensure_ascii=False)}\n\n'.encode()
                            # Deliberately split a multibyte Chinese character across HTTP chunks.
                            split = next((i + 1 for i, byte in enumerate(frame) if byte >= 0x80), len(frame) // 2)
                            self.chunk(frame[:split])
                            self.chunk(frame[split:])
                            after = event["id"]
                        if terminal:
                            self.wfile.write(b"0\r\n\r\n")
                            self.wfile.flush()
                            return
                        self.chunk(b": heartbeat\n\n")
                        time.sleep(0.1)
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
                    pass
                finally:
                    with fixture.lock:
                        fixture.active -= 1

        self.stopped = threading.Event()
        self.http = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.http.daemon_threads = True
        self.base = f"http://127.0.0.1:{self.http.server_port}"

    def event(self, kind: str, data: dict):
        with self.lock:
            self.events.append({"id": len(self.events) + 1, "event": kind, "data": data, "created_at": FIXTURE["_fixture"]["timestamp"]})

    def append_delta(self, sequence: int = 2, text: str | None = None):
        self.event("reasoning_delta", {"stream_id": "reason-1", "sequence": sequence, "text": f"第 {sequence} 次检查合成边界。"})
        self.event("output_delta", {"stream_id": "body-1", "sequence": sequence, "text": text or "\n\n恢复后的合成正文。 **实时加粗**。"})

    def finish(self):
        presentation = {"version": "1.0", "blocks": [
            {"type": "markdown", "text": "## 正式合成讲解\n\n正式结果替换预览。<script>window.previewExecuted=true</script>\n\n公式 \\(x^2+1\\)。"},
            {"type": "svg", "source": '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#eee"/><path d="M80 800 Q512 100 944 800" fill="none" stroke="#567"/><script>window.svgExecuted=true</script><image href="https://unsafe.example/remote.png"/></svg>'},
            {"type": "markdown", "text": "图后的合成结论。"},
        ]}
        with self.lock:
            self.event("reasoning_end", {"stream_id": "reason-1", "status": "received"})
            self.event("output_end", {"stream_id": "body-1", "status": "received"})
            final = message(2, "assistant", presentation=presentation)
            self.messages.append(final)
            self.session.update(status="completed", presentations=[presentation])
            self.event("message", {"message": final})
            self.event("presentation", presentation)
            self.event("completed", {})

    def __enter__(self):
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()
        return self

    def __exit__(self, *_args):
        self.stopped.set()
        self.http.shutdown()
        self.http.server_close()
        self.thread.join(timeout=2)
