"""Standard-library checks for the public fixture's isolation and resumable data."""

import http.client
import json
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from fixture_server import ACCESS_TOKEN, SESSION_ID, FixtureServer


class FixtureTests(unittest.TestCase):
    def request(self, fixture, path, method="GET", value=None, auth=True):
        body = json.dumps(value).encode() if value is not None else None
        headers = {"Content-Type": "application/json"}
        if auth:
            headers["Authorization"] = "Bearer " + ACCESS_TOKEN
        return urlopen(Request(fixture.base + path, data=body, method=method, headers=headers), timeout=3)

    def test_auth_and_teaching_writes_fail_closed(self):
        with FixtureServer() as fixture:
            with self.assertRaises(HTTPError) as unauthenticated:
                self.request(fixture, "/v1/sessions", auth=False)
            self.assertEqual(unauthenticated.exception.code, 401)
            unauthenticated.exception.close()
            with self.assertRaises(HTTPError) as teaching:
                self.request(fixture, "/v1/sessions", "POST", {"message": "never dispatched"})
            self.assertEqual(teaching.exception.code, 405)
            teaching.exception.close()
            self.assertEqual(len(fixture.messages), 1)

    def test_history_pages_and_terminal_sse_resume(self):
        with FixtureServer() as fixture:
            with self.request(fixture, f"/v1/sessions/{SESSION_ID}/events/history") as response:
                first = json.load(response)
            self.assertEqual(len(first["items"]), 4)
            self.assertEqual(first["next_after"], 4)
            fixture.append_delta()
            fixture.finish()
            connection = http.client.HTTPConnection("127.0.0.1", fixture.http.server_port, timeout=3)
            connection.request("GET", f"/v1/sessions/{SESSION_ID}/events?after=5", headers={"Authorization": "Bearer " + ACCESS_TOKEN, "Last-Event-ID": "5"})
            response = connection.getresponse()
            text = response.read().decode("utf-8")
            connection.close()
            self.assertIn("恢复后的合成正文", text)
            self.assertIn("event: completed", text)
            self.assertNotIn("id: 5\n", text)
            self.assertEqual(fixture.requests[-1]["after"], "5")

    def test_static_files_stay_under_explicit_dist(self):
        with FixtureServer(Path(__file__).parent / "fixtures") as fixture:
            with self.request(fixture, "/api.json") as response:
                self.assertEqual(json.load(response)["_fixture"]["kind"], "synthetic")
            with self.assertRaises(HTTPError) as traversal:
                self.request(fixture, "/%2e%2e/private.txt")
            self.assertEqual(traversal.exception.code, 404)
            traversal.exception.close()


if __name__ == "__main__":
    unittest.main()
