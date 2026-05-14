from __future__ import annotations

import unittest

from scripts.acquire_smart_session import cookie_value_from_headers, extract_form_submission


class AcquireSmartSessionTests(unittest.TestCase):
    def test_extracts_openemr_autosubmit_form(self) -> None:
        body = b"""
        <html>
          <body>
            <form method="POST" action="http://localhost:8300/oauth2/default/authorize?autosubmit=1&amp;state=abc">
              <input type="hidden" name="csrf_token_form" value="token-123">
              <input type="hidden" name="authorize" value="1">
            </form>
          </body>
        </html>
        """

        form = extract_form_submission(body)

        self.assertIsNotNone(form)
        assert form is not None
        self.assertEqual(form.method, "post")
        self.assertEqual(form.action, "http://localhost:8300/oauth2/default/authorize?autosubmit=1&state=abc")
        self.assertEqual(form.fields["csrf_token_form"], "token-123")
        self.assertEqual(form.fields["authorize"], "1")

    def test_reads_smart_session_cookie_from_headers(self) -> None:
        value = cookie_value_from_headers(
            {"Set-Cookie": "copilot_smart_session=session-token; Path=/; HttpOnly; SameSite=Lax"},
            "copilot_smart_session",
        )

        self.assertEqual(value, "session-token")


if __name__ == "__main__":
    unittest.main()
