from __future__ import annotations

import argparse
import http.cookiejar
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from html.parser import HTMLParser
from http.cookies import SimpleCookie
from pathlib import Path


DEFAULT_OPENEMR_URL = "http://localhost:8300"
DEFAULT_COPILOT_URL = "http://localhost:8400"
DEFAULT_SITE = "default"
DEFAULT_PATIENT_PID = 13


@dataclass(frozen=True)
class HttpResult:
    url: str
    status: int
    headers: dict[str, str]
    body: bytes


@dataclass(frozen=True)
class FormSubmission:
    method: str
    action: str
    fields: dict[str, str]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # type: ignore[override]
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Acquire a real Clinical Co-Pilot SMART session through local OpenEMR login.")
    parser.add_argument("--openemr-url", default=os.environ.get("BOUNDARY_OPENEMR_URL", DEFAULT_OPENEMR_URL))
    parser.add_argument("--copilot-url", default=os.environ.get("BOUNDARY_TARGET_URL", DEFAULT_COPILOT_URL))
    parser.add_argument("--site", default=os.environ.get("BOUNDARY_OPENEMR_SITE", DEFAULT_SITE))
    parser.add_argument("--username", default=os.environ.get("BOUNDARY_OPENEMR_USERNAME", os.environ.get("OPENEMR_USERNAME", "admin")))
    parser.add_argument("--password", default=os.environ.get("BOUNDARY_OPENEMR_PASSWORD", os.environ.get("OPENEMR_PASSWORD", "pass")))
    parser.add_argument("--patient-pid", type=int, default=int(os.environ.get("BOUNDARY_OPENEMR_PATIENT_PID", str(DEFAULT_PATIENT_PID))))
    parser.add_argument("--timeout-seconds", type=float, default=float(os.environ.get("BOUNDARY_TARGET_AUTH_TIMEOUT_SECONDS", "15")))
    parser.add_argument("--cookie-only", action="store_true", help="Print only the copilot_smart_session value.")
    parser.add_argument("--output-file", type=Path, help="Optional JSON output path. The session cookie is included.")
    args = parser.parse_args()

    try:
        result = acquire_smart_session(
            openemr_url=args.openemr_url,
            copilot_url=args.copilot_url,
            site=args.site,
            username=args.username,
            password=args.password,
            patient_pid=args.patient_pid,
            timeout_seconds=args.timeout_seconds,
        )
    except RuntimeError as exc:
        print(f"SMART session acquisition failed: {exc}", file=sys.stderr)
        return 1

    if args.output_file:
        args.output_file.parent.mkdir(parents=True, exist_ok=True)
        args.output_file.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")

    if args.cookie_only:
        print(result["smart_session_cookie"])
    else:
        safe = {key: value for key, value in result.items() if key != "smart_session_cookie"}
        safe["smart_session_cookie_configured"] = True
        print(json.dumps(safe, indent=2))
    return 0


def acquire_smart_session(
    *,
    openemr_url: str,
    copilot_url: str,
    site: str,
    username: str,
    password: str,
    patient_pid: int,
    timeout_seconds: float,
) -> dict[str, object]:
    openemr_url = openemr_url.rstrip("/")
    copilot_url = copilot_url.rstrip("/")
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar), NoRedirect)

    login(openemr_url, site, username, password, opener, timeout_seconds)
    launch_url = (
        f"{openemr_url}/interface/modules/custom_modules/oe-module-clinical-copilot/public/launch.php"
        f"?site={urllib.parse.quote(site)}&set_pid={patient_pid}"
    )
    final_url, redirects = follow_launch(launch_url, opener, timeout_seconds)
    smart_cookie = cookie_value(jar, "copilot_smart_session")
    if not smart_cookie:
        raise RuntimeError(f"launch completed without copilot_smart_session; final_url={final_url}")

    auth_session = request(
        opener,
        f"{copilot_url}/auth/session",
        timeout_seconds=timeout_seconds,
        headers={"Accept": "application/json"},
    )
    if auth_session.status >= 400:
        raise RuntimeError(f"captured session was rejected by /auth/session: status={auth_session.status} body={preview(auth_session.body)}")

    return {
        "ok": True,
        "openemr_url": openemr_url,
        "copilot_url": copilot_url,
        "site": site,
        "patient_pid": patient_pid,
        "final_url": final_url,
        "redirect_count": len(redirects),
        "auth_session_status": auth_session.status,
        "smart_session_cookie": smart_cookie,
    }


def login(
    openemr_url: str,
    site: str,
    username: str,
    password: str,
    opener: urllib.request.OpenerDirector,
    timeout_seconds: float,
) -> None:
    login_url = f"{openemr_url}/interface/login/login.php?site={urllib.parse.quote(site)}"
    initial = request(opener, login_url, timeout_seconds=timeout_seconds)
    if initial.status >= 400:
        raise RuntimeError(f"OpenEMR login page failed: status={initial.status}")

    data = urllib.parse.urlencode(
        {
            "new_login_session_management": "1",
            "authUser": username,
            "clearPass": password,
            "languageChoice": "1",
        }
    ).encode("utf-8")
    login_action = f"{openemr_url}/interface/main/main_screen.php?auth=login&site={urllib.parse.quote(site)}"
    response = request(
        opener,
        login_action,
        data=data,
        timeout_seconds=timeout_seconds,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Referer": login_url,
        },
    )
    if response.status not in {200, 302, 303}:
        raise RuntimeError(f"OpenEMR login POST failed: status={response.status} body={preview(response.body)}")


def follow_launch(
    launch_url: str,
    opener: urllib.request.OpenerDirector,
    timeout_seconds: float,
) -> tuple[str, list[str]]:
    current = launch_url
    redirects: list[str] = []
    for _ in range(20):
        response = request(opener, current, timeout_seconds=timeout_seconds, headers={"Accept": "text/html,application/json"})
        if response.status in {301, 302, 303, 307, 308}:
            location = response.headers.get("Location") or response.headers.get("location")
            if not location:
                raise RuntimeError(f"redirect from {current} did not include Location")
            current = urllib.parse.urljoin(current, location)
            redirects.append(current)
            continue

        form = extract_form_submission(response.body)
        if form is not None:
            current = urllib.parse.urljoin(current, form.action)
            redirects.append(current)
            if form.method == "post":
                response = request(
                    opener,
                    current,
                    data=urllib.parse.urlencode(form.fields).encode("utf-8"),
                    timeout_seconds=timeout_seconds,
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
                if response.status in {301, 302, 303, 307, 308}:
                    location = response.headers.get("Location") or response.headers.get("location")
                    if not location:
                        raise RuntimeError(f"redirect from {current} did not include Location")
                    current = urllib.parse.urljoin(current, location)
                    redirects.append(current)
                    continue
            else:
                query = urllib.parse.urlencode(form.fields)
                separator = "&" if urllib.parse.urlparse(current).query else "?"
                current = f"{current}{separator}{query}" if query else current
                continue

        smart_cookie = cookie_value_from_headers(response.headers, "copilot_smart_session")
        if smart_cookie or cookie_value(get_cookiejar(opener), "copilot_smart_session"):
            return current, redirects

        if looks_like_login(response.body):
            raise RuntimeError("OpenEMR redirected back to login; check BOUNDARY_OPENEMR_USERNAME/BOUNDARY_OPENEMR_PASSWORD")
        raise RuntimeError(f"SMART launch stopped before session cookie: url={current} status={response.status} body={preview(response.body)}")

    raise RuntimeError("SMART launch exceeded redirect limit")


def request(
    opener: urllib.request.OpenerDirector,
    url: str,
    *,
    data: bytes | None = None,
    timeout_seconds: float,
    headers: dict[str, str] | None = None,
) -> HttpResult:
    req = urllib.request.Request(url, data=data, headers=headers or {}, method="POST" if data is not None else "GET")
    try:
        with opener.open(req, timeout=timeout_seconds) as response:
            return HttpResult(
                url=response.geturl(),
                status=response.status,
                headers=dict(response.headers.items()),
                body=response.read(),
            )
    except urllib.error.HTTPError as exc:
        return HttpResult(
            url=exc.geturl(),
            status=exc.code,
            headers=dict(exc.headers.items()),
            body=exc.read(),
        )
    except urllib.error.URLError as exc:
        raise RuntimeError(f"request failed for {url}: {exc.reason}") from exc


def get_cookiejar(opener: urllib.request.OpenerDirector) -> http.cookiejar.CookieJar:
    for handler in opener.handlers:
        if isinstance(handler, urllib.request.HTTPCookieProcessor):
            return handler.cookiejar  # type: ignore[return-value]
    return http.cookiejar.CookieJar()


def cookie_value(jar: http.cookiejar.CookieJar, name: str) -> str:
    for cookie in jar:
        if cookie.name == name and cookie.value:
            return cookie.value
    return ""


def cookie_value_from_headers(headers: dict[str, str], name: str) -> str:
    raw = headers.get("Set-Cookie") or headers.get("set-cookie") or ""
    if not raw:
        return ""
    parsed = SimpleCookie()
    parsed.load(raw)
    morsel = parsed.get(name)
    return morsel.value if morsel else ""


def looks_like_login(body: bytes) -> bool:
    text = body[:5000].decode("utf-8", errors="ignore").lower()
    return "openemr login" in text or 'name="authuser"' in text or 'id="login_form"' in text


def extract_form_submission(body: bytes) -> FormSubmission | None:
    parser = FirstFormParser()
    parser.feed(body[:20000].decode("utf-8", errors="ignore"))
    if not parser.action:
        return None
    return FormSubmission(method=parser.method or "get", action=parser.action, fields=parser.fields)


class FirstFormParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.in_form = False
        self.seen_form = False
        self.action = ""
        self.method = "get"
        self.fields: dict[str, str] = {}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key.lower(): value or "" for key, value in attrs}
        if tag.lower() == "form" and not self.seen_form:
            self.in_form = True
            self.seen_form = True
            self.action = values.get("action", "")
            self.method = values.get("method", "get").lower()
            return
        if self.in_form and tag.lower() == "input":
            name = values.get("name", "")
            if name:
                self.fields[name] = values.get("value", "")

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "form" and self.in_form:
            self.in_form = False


def preview(body: bytes) -> str:
    text = body[:500].decode("utf-8", errors="replace").strip()
    return " ".join(text.split())


if __name__ == "__main__":
    raise SystemExit(main())
