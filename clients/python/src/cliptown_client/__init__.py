"""Dependency-free ClipTown HTTP transport."""
from __future__ import annotations
import json
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

class ClipTownError(RuntimeError):
    def __init__(self, status: int, body: str) -> None:
        super().__init__(f"ClipTown HTTP {status}: {body[:512]}")
        self.status, self.body = status, body

@dataclass(frozen=True)
class ClipTownClient:
    base_url: str
    token: str | None = None
    timeout: float = 30.0

    def request(self, method: str, path: str, body: Any | None = None) -> Any:
        if not self.base_url.startswith(("http://", "https://")):
            raise ValueError("base_url must be absolute HTTP(S)")
        data = None if body is None else json.dumps(body).encode()
        headers = {"Accept": "application/json"}
        if data is not None: headers["Content-Type"] = "application/json"
        if self.token: headers["Authorization"] = f"Bearer {self.token}"
        req = Request(urljoin(self.base_url.rstrip("/") + "/", path.lstrip("/")), data=data, method=method.upper(), headers=headers)
        try:
            with urlopen(req, timeout=self.timeout) as response:
                raw = response.read()
                return None if not raw else (json.loads(raw) if "json" in response.headers.get("Content-Type", "") else raw)
        except HTTPError as error:
            raise ClipTownError(error.code, error.read().decode(errors="replace")) from error

__all__ = ["ClipTownClient", "ClipTownError"]
