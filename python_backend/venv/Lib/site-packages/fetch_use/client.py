"""
Browser-Use Fetch - HTTP client service.

Features:
- Session-based IP persistence
- Automatic retry with exponential backoff
- Proxy routing by country
- Server-side cookie persistence per session

Environment variables:
- BROWSER_USE_API_KEY: Required for authentication (Browser Use API key, starts with 'bu_')
- SESSION_ID: Optional, enables session/IP persistence and server-side cookies.
  If not set, a random session ID is generated per call (ephemeral, no persistence).
- FETCH_USE_URL: Optional, override service URL for testing

Note: Cookies are persisted server-side per session. Pass cookies via the
`cookies` parameter to add or override cookies for a request.
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import re
import socket
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

# Valid HTTP methods
VALID_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}

# Session ID validation
MAX_SESSION_ID_LENGTH = 36
VALID_SESSION_ID_REGEX = re.compile(r"^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*$")

# Maximum timeout (2 minutes)
MAX_TIMEOUT_MS = 120_000

# Default service URL
DEFAULT_FETCH_USE_URL = "https://fetch.browser-use.com"


class _ConfigCache:
    """Caches environment variables for performance.

    Reads env vars once on first access, then caches them.
    Call clear() to force re-reading from environment.
    """

    __slots__ = ("_api_key", "_session_id", "_service_url", "_initialized")

    def __init__(self) -> None:
        self._api_key: str | None = None
        self._session_id: str | None = None
        self._service_url: str | None = None
        self._initialized = False

    def _ensure_initialized(self) -> None:
        if not self._initialized:
            self._api_key = os.environ.get("BROWSER_USE_API_KEY", "")
            self._session_id = os.environ.get("SESSION_ID", "")
            self._service_url = os.environ.get("FETCH_USE_URL", DEFAULT_FETCH_USE_URL)
            self._initialized = True

    @property
    def api_key(self) -> str:
        self._ensure_initialized()
        return self._api_key or ""

    @property
    def session_id(self) -> str:
        self._ensure_initialized()
        return self._session_id or ""

    @property
    def service_url(self) -> str:
        self._ensure_initialized()
        return self._service_url or DEFAULT_FETCH_USE_URL

    def clear(self) -> None:
        """Clear the cache, forcing re-read from environment on next access."""
        self._api_key = None
        self._session_id = None
        self._service_url = None
        self._initialized = False


# Global config cache instance
_config = _ConfigCache()


def clear_config_cache() -> None:
    """Clear the environment variable cache.

    Call this if you change environment variables at runtime and want
    fetch-use to pick up the new values.
    """
    _config.clear()


# For backwards compatibility
FETCH_USE_URL = DEFAULT_FETCH_USE_URL


class FetchError(Exception):
    """Error from fetch-use service.

    Attributes:
        code: HTTP status code or error code from the service
        details: Additional error details from the service
        url: The URL that was being fetched (if available)
    """

    def __init__(self, message: str, code: int = 0, details: str = "", url: str = ""):
        super().__init__(message)
        self.code = code
        self.details = details
        self.url = url


@dataclass
class FetchResponse:
    """Response from fetch-use service.

    Attributes:
        status_code: HTTP status code (e.g., 200, 404)
        status: Full status string (e.g., "200 OK")
        headers: Response headers as dict
        body: Response body as string (for text content)
        body_base64: Response body as base64 (for binary content)
        is_binary: Whether the response body is binary
        final_url: URL after following redirects
        redirect_count: Number of redirects followed
        protocol: HTTP protocol version (e.g., "HTTP/2.0")
        error: Error message if request failed
    """

    status_code: int
    status: str
    headers: dict[str, str]
    body: str
    body_base64: str
    is_binary: bool
    final_url: str
    redirect_count: int
    protocol: str
    error: str

    @property
    def text(self) -> str:
        """Get response body as text."""
        return self.body

    @property
    def content(self) -> bytes:
        """Get response body as bytes.

        For binary responses, decodes the base64-encoded body.
        For text responses, encodes the body as UTF-8.
        """
        if self.is_binary and self.body_base64:
            return base64.b64decode(self.body_base64)
        return self.body.encode("utf-8")

    def json(self) -> Any:
        """Parse response body as JSON.

        Raises:
            ValueError: If body is empty or not valid JSON
        """
        if not self.body:
            raise ValueError("Response body is empty, cannot parse as JSON")
        try:
            return json.loads(self.body)
        except json.JSONDecodeError as e:
            raise ValueError(f"Response body is not valid JSON: {e}") from e

    @property
    def ok(self) -> bool:
        """Check if response status is successful (2xx)."""
        return 200 <= self.status_code < 300

    def raise_for_status(self) -> None:
        """Raise FetchError if response status indicates an error (>= 400).

        Raises:
            FetchError: If status_code is 400 or higher
        """
        if self.status_code >= 400:
            raise FetchError(
                f"HTTP {self.status_code}: {self.status}",
                code=self.status_code,
                url=self.final_url,
            )


@dataclass
class RetryConfig:
    """Configuration for automatic retries.

    Attributes:
        count: Number of retry attempts (default: 3)
        on_status: List of status codes that trigger a retry (default: [500, 502, 503, 504])
        backoff_ms: Initial backoff duration in milliseconds (default: 100)
    """

    count: int = 3
    on_status: list[int] | None = None
    backoff_ms: int = 100

    def to_dict(self) -> dict[str, Any]:
        return {
            "count": self.count,
            "on_status": [500, 502, 503, 504] if self.on_status is None else self.on_status,
            "backoff_ms": self.backoff_ms,
        }


def _validate_url(url: str) -> None:
    """Validate URL format.

    Raises:
        ValueError: If URL is invalid or uses unsupported scheme
    """
    parsed = urllib.parse.urlparse(url)
    if not parsed.scheme:
        raise ValueError(f"Invalid URL: missing scheme (http/https): {url}")
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"Invalid URL scheme: {parsed.scheme}. Only http/https supported.")
    if not parsed.netloc:
        raise ValueError(f"Invalid URL: missing host: {url}")


def _validate_method(method: str) -> str:
    """Validate and normalize HTTP method.

    Returns:
        Uppercased method string

    Raises:
        ValueError: If method is invalid
    """
    method_upper = method.upper()
    if method_upper not in VALID_METHODS:
        raise ValueError(f"Invalid HTTP method: {method}. Must be one of {VALID_METHODS}")
    return method_upper


def _validate_session_id(session_id: str) -> None:
    """Validate session ID format.

    Raises:
        ValueError: If session ID is invalid
    """
    if not session_id:
        return
    if len(session_id) > MAX_SESSION_ID_LENGTH:
        raise ValueError("session_id too long (max 36 characters)")
    if not VALID_SESSION_ID_REGEX.match(session_id):
        raise ValueError("session_id must be alphanumeric with hyphens as separators")


def _do_fetch(
    url: str,
    method: str,
    headers: dict[str, str] | None,
    body: str | None,
    body_base64: str | None,
    json_body: dict[str, Any] | None,
    cookies: dict[str, str] | None,
    timeout_ms: int,
    follow_redirects: bool,
    max_redirects: int,
    proxy_country: str,
    retry: RetryConfig | None,
    content_type: str | None,
    insecure_skip_verify: bool,
    api_key: str | None,
    session_id: str | None,
    output_format: str | None = None,
) -> FetchResponse:
    """Internal synchronous fetch implementation."""
    # Validate URL
    _validate_url(url)

    # Validate method
    method = _validate_method(method)

    # Validate timeout and redirects
    if timeout_ms <= 0:
        raise ValueError("timeout_ms must be positive")
    if max_redirects < 0:
        raise ValueError("max_redirects must be non-negative")

    # Get config from cache (reads env vars once, then caches)
    resolved_api_key = api_key or _config.api_key
    if not resolved_api_key:
        raise ValueError(
            "BROWSER_USE_API_KEY environment variable is required. "
            "Set it to your Browser Use API key (starts with 'bu_'), or pass api_key parameter."
        )

    resolved_session_id = session_id or _config.session_id
    if not resolved_session_id:
        import uuid

        resolved_session_id = str(uuid.uuid4())
    _validate_session_id(resolved_session_id)

    # Build request headers
    req_headers = dict(headers) if headers else {}

    # Merge cookies into Cookie header (with URL encoding for safety)
    if cookies:
        cookie_parts = [
            f"{urllib.parse.quote(k, safe='')}={urllib.parse.quote(v, safe='')}"
            for k, v in cookies.items()
        ]
        existing_cookie = req_headers.get("Cookie", "")
        if existing_cookie:
            cookie_parts.insert(0, existing_cookie)
        req_headers["Cookie"] = "; ".join(cookie_parts)

    # Build request body
    req_body = body
    req_body_base64 = body_base64
    resolved_content_type = content_type
    if json_body is not None:
        req_body = json.dumps(json_body)
        if not resolved_content_type:
            resolved_content_type = "application/json"

    # Build fetch-use request payload
    fetch_request: dict[str, Any] = {
        "url": url,
        "method": method,
        "timeout_ms": min(timeout_ms, MAX_TIMEOUT_MS),
        "follow_redirects": follow_redirects,
        "max_redirects": max_redirects,
        "proxy_country": proxy_country,
        "session_id": resolved_session_id,
    }

    if req_headers:
        fetch_request["headers"] = req_headers
    if req_body:
        fetch_request["body"] = req_body
    if req_body_base64:
        fetch_request["body_base64"] = req_body_base64
    if resolved_content_type:
        fetch_request["content_type"] = resolved_content_type
    if retry:
        fetch_request["retry"] = retry.to_dict()
    if insecure_skip_verify:
        fetch_request["insecure_skip_verify"] = True
    if output_format:
        fetch_request["output_format"] = output_format

    # Get service URL from cache
    api_url = f"{_config.service_url}/fetch"
    request_data = json.dumps(fetch_request).encode("utf-8")

    req_headers = {
        "Content-Type": "application/json",
        "X-Browser-Use-API-Key": resolved_api_key,
    }
    _fetch_token = os.environ.get("FETCH_USE_AUTH_TOKEN", "")
    if _fetch_token:
        req_headers["X-Fetch-Token"] = _fetch_token

    req = urllib.request.Request(
        api_url,
        data=request_data,
        headers=req_headers,
        method="POST",
    )

    try:
        # Add buffer time for service overhead
        http_timeout = (timeout_ms / 1000) + 10
        with urllib.request.urlopen(req, timeout=http_timeout) as resp:
            result = json.loads(resp.read().decode("utf-8"))
    except socket.timeout as e:
        raise FetchError(f"Request timed out after {timeout_ms}ms", url=url) from e
    except urllib.error.HTTPError as e:
        # Parse error response from service
        try:
            error_body = json.loads(e.read().decode("utf-8"))
            raise FetchError(
                error_body.get("error", f"HTTP {e.code}"),
                code=error_body.get("code", e.code),
                details=error_body.get("details", ""),
                url=url,
            ) from e
        except json.JSONDecodeError:
            raise FetchError(f"HTTP {e.code}: {e.reason}", code=e.code, url=url) from e
    except urllib.error.URLError as e:
        raise FetchError(f"Connection error: {e.reason}", url=url) from e

    # Check for error in response
    if result.get("error"):
        raise FetchError(result["error"], url=url)

    return FetchResponse(
        status_code=result.get("status_code", 0),
        status=result.get("status", ""),
        headers=result.get("headers", {}),
        body=result.get("body", ""),
        body_base64=result.get("body_base64", ""),
        is_binary=result.get("is_binary", False),
        final_url=result.get("final_url", url),
        redirect_count=result.get("redirect_count", 0),
        protocol=result.get("protocol", ""),
        error=result.get("error", ""),
    )


async def fetch(
    url: str,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: str | None = None,
    body_base64: str | None = None,
    json_body: dict[str, Any] | None = None,
    cookies: dict[str, str] | None = None,
    timeout_ms: int = 30000,
    follow_redirects: bool = True,
    max_redirects: int = 10,
    proxy_country: str = "US",
    retry: RetryConfig | None = None,
    content_type: str | None = None,
    insecure_skip_verify: bool = False,
    session_id: str | None = None,
    output_format: str | None = None,
) -> FetchResponse:
    """
    Make HTTP request via Browser-Use Fetch service.

    Requires BROWSER_USE_API_KEY environment variable to be set.

    Args:
        url: Target URL (required, must be http or https)
        method: HTTP method - GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
        headers: Additional HTTP headers to include
        body: Request body as string (for text content)
        body_base64: Request body as base64 (for binary content)
        json_body: Request body as dict (will be JSON-encoded, sets Content-Type)
        cookies: Cookies as dict (merged into Cookie header, URL-encoded)
        timeout_ms: Request timeout in milliseconds (default: 30000, max: 120000)
        follow_redirects: Whether to follow HTTP redirects (default: True)
        max_redirects: Maximum redirects to follow (default: 10)
        proxy_country: ISO 3166-1 alpha-2 country code for proxy routing (default: US)
        retry: Retry configuration for automatic retries
        content_type: Explicit Content-Type header (overrides auto-detection)
        insecure_skip_verify: Skip TLS certificate verification (use with caution)

    Returns:
        FetchResponse with status_code, headers, body, etc.

    Raises:
        FetchError: If the request fails or service returns an error
        ValueError: If URL, method, or parameters are invalid

    Example:
        >>> response = await fetch("https://example.com/api")
        >>> if response.ok:
        ...     data = response.json()
        ...     print(data)

        >>> # With error handling
        >>> try:
        ...     response = await fetch("https://api.example.com/data")
        ...     response.raise_for_status()
        ...     data = response.json()
        ... except FetchError as e:
        ...     print(f"Request failed: {e}")

        >>> # Binary data
        >>> response = await fetch("https://example.com/image.png")
        >>> image_bytes = response.content

    Note:
        This function uses a thread pool for async execution. For high-concurrency
        scenarios, consider the concurrency limits of the default executor.
    """
    # Run blocking HTTP call in thread pool to not block event loop
    return await asyncio.to_thread(
        _do_fetch,
        url,
        method,
        headers,
        body,
        body_base64,
        json_body,
        cookies,
        timeout_ms,
        follow_redirects,
        max_redirects,
        proxy_country,
        retry,
        content_type,
        insecure_skip_verify,
        None,  # api_key - always use env var
        session_id,
        output_format,
    )


def fetch_sync(
    url: str,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: str | None = None,
    body_base64: str | None = None,
    json_body: dict[str, Any] | None = None,
    cookies: dict[str, str] | None = None,
    timeout_ms: int = 30000,
    follow_redirects: bool = True,
    max_redirects: int = 10,
    proxy_country: str = "US",
    retry: RetryConfig | None = None,
    content_type: str | None = None,
    insecure_skip_verify: bool = False,
    session_id: str | None = None,
    output_format: str | None = None,
) -> FetchResponse:
    """
    Synchronous version of fetch().

    Requires BROWSER_USE_API_KEY environment variable to be set.

    Use this when you're not in an async context and don't want to use asyncio.run().
    See fetch() for full documentation of parameters.
    """
    return _do_fetch(
        url,
        method,
        headers,
        body,
        body_base64,
        json_body,
        cookies,
        timeout_ms,
        follow_redirects,
        max_redirects,
        proxy_country,
        retry,
        content_type,
        insecure_skip_verify,
        None,  # api_key - always use env var
        session_id,
        output_format,
    )
