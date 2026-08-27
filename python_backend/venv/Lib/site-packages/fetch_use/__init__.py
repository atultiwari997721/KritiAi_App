"""
fetch-use: Python client for Browser-Use Fetch HTTP service.

Example:
    >>> from fetch_use import fetch
    >>> response = await fetch("https://example.com")
    >>> print(response.status_code)
    200
    >>> data = response.json()

    >>> # Synchronous usage
    >>> from fetch_use import fetch_sync
    >>> response = fetch_sync("https://example.com")

    >>> # Error handling
    >>> from fetch_use import fetch, FetchError
    >>> try:
    ...     response = await fetch("https://example.com")
    ...     response.raise_for_status()
    ... except FetchError as e:
    ...     print(f"Request failed: {e}")
"""

from .client import (
    DEFAULT_FETCH_USE_URL,
    FETCH_USE_URL,
    FetchError,
    FetchResponse,
    RetryConfig,
    clear_config_cache,
    fetch,
    fetch_sync,
)

__version__ = "0.4.0"

__all__ = [
    "fetch",
    "fetch_sync",
    "FetchResponse",
    "FetchError",
    "RetryConfig",
    "clear_config_cache",
    "FETCH_USE_URL",
    "DEFAULT_FETCH_USE_URL",
]
