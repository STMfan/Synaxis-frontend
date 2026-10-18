"""Portable opt-in helpers for a deliberately selected Android test device.

Set ANDROID_SERIAL explicitly. adb is resolved from SYNAXIS_QA_ADB, PATH, then
ANDROID_SDK_ROOT/ANDROID_HOME. Importing this module performs no device action.
No production account, emulator number, personal SDK path or backend is assumed.
"""

from __future__ import annotations

import os
import re
import shlex
import shutil
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path


def adb_executable() -> str:
    configured = os.environ.get("SYNAXIS_QA_ADB")
    if configured:
        return str(Path(configured).expanduser().resolve(strict=True))
    found = shutil.which("adb")
    if found:
        return found
    for variable in ("ANDROID_SDK_ROOT", "ANDROID_HOME"):
        if os.environ.get(variable):
            candidate = Path(os.environ[variable]) / "platform-tools" / ("adb.exe" if os.name == "nt" else "adb")
            if candidate.is_file():
                return str(candidate)
    raise RuntimeError("adb was not found. Set ANDROID_SDK_ROOT, add platform-tools to PATH, or set SYNAXIS_QA_ADB.")


def content(node) -> str:
    return node.get("text", "") or node.get("content-desc", "")


def bounds(node) -> list[int]:
    return [int(value) for value in re.findall(r"\d+", node.get("bounds", ""))]


def visible(node) -> bool:
    rect = bounds(node)
    return len(rect) == 4 and rect[2] > rect[0] and rect[3] > rect[1]


class AndroidDevice:
    def __init__(self, serial: str | None = None, application_id: str = "cn.synaxis.client"):
        self.serial = serial or os.environ.get("ANDROID_SERIAL")
        if not self.serial:
            raise ValueError("Set ANDROID_SERIAL to the disposable test device shown by adb devices. No device is selected automatically.")
        self.adb_path = adb_executable()
        self.application_id = application_id

    def adb(self, *args: str) -> bytes:
        return subprocess.check_output([self.adb_path, "-s", self.serial, *args], stderr=subprocess.STDOUT)

    def ui(self):
        for attempt in range(3):
            try:
                self.adb("shell", "uiautomator", "dump", "/sdcard/synaxis-qa.xml")
                break
            except subprocess.CalledProcessError as error:
                if error.returncode != 137 or attempt == 2:
                    raise
                time.sleep(0.5)
        return ET.fromstring(self.adb("shell", "cat", "/sdcard/synaxis-qa.xml"))

    def find(self, text: str, exact: bool = False, clickable: bool = False, timeout: float = 15):
        until = time.monotonic() + timeout
        while time.monotonic() < until:
            nodes = [node for node in self.ui().iter("node") if visible(node) and (content(node) == text if exact else text in content(node))]
            if clickable:
                nodes = [node for node in nodes if node.get("clickable") == "true"]
            if nodes:
                return nodes[0]
            time.sleep(0.25)
        raise AssertionError("Expected Android UI: " + text)

    def tap(self, node):
        rect = bounds(node)
        self.adb("shell", "input", "tap", str((rect[0] + rect[2]) // 2), str((rect[1] + rect[3]) // 2))

    def edits(self):
        return [node for node in self.ui().iter("node") if visible(node) and node.get("class") == "android.widget.EditText"]

    def type_text(self, node, value: str):
        self.tap(node)
        # adb shell input is suitable for ASCII test values; use platform IME for CJK.
        self.adb("shell", "input", "text", shlex.quote(value))

    def screenshot(self, target: Path):
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(self.adb("exec-out", "screencap", "-p"))

    def resume(self):
        self.adb("shell", "am", "start", "-n", self.application_id + "/.MainActivity")

    def restart(self):
        self.adb("shell", "am", "force-stop", self.application_id)
        self.resume()
