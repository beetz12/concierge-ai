---
name: bright-data-proxy
description: Configure and troubleshoot Bright Data residential proxy integration - 407 auth errors, SSL certificates, aiohttp/httpx setup, proxy rotation
---

# Bright Data Residential Proxy Integration

Configure, diagnose, and fix Bright Data residential proxy issues for Python web scrapers using aiohttp, httpx, or Playwright.

## When to Use

- Setting up Bright Data residential proxy for the first time
- 407 Proxy Authentication Required errors
- SSL certificate configuration issues
- Integrating proxies with aiohttp, httpx, or Playwright
- Proxy rotation and health tracking implementation
- Anti-bot evasion with residential IPs

## Quick Diagnosis

| Error Pattern | Root Cause | Fix |
|---------------|------------|-----|
| 407 Proxy Auth Required | Wrong credentials or URL format | Verify zone password, use correct URL format |
| SSL certificate errors | Wrong port or missing cert | Use port 33335, use `ssl=False` for aiohttp |
| Connection refused | Wrong host/port | Use `brd.superproxy.io:33335` |
| Timeout errors | Network/firewall issue | Check proxy zone is active in dashboard |
| Mixed SSL context errors | Cert applied to target site | Use `ssl=False` in TCPConnector |

---

## Issue #1: Proxy URL Format (Critical)

**Error:** 407 Proxy Authentication Required

**Correct URL Format:**
```
http://brd-customer-{CUSTOMER_ID}-zone-{ZONE}:{PASSWORD}@brd.superproxy.io:33335
```

**Example:**
```
http://brd-customer-hl_abc123-zone-residential_proxy1:yourpassword@brd.superproxy.io:33335
```

**Common Mistakes:**
```python
# WRONG - using API key instead of zone password
proxy = "http://brd-customer-hl_abc123-zone-residential:API_KEY_HERE@..."

# WRONG - using old port 22225
proxy = "http://brd-customer-hl_abc123-zone-residential:pass@brd.superproxy.io:22225"

# CORRECT - zone password + port 33335
proxy = "http://brd-customer-hl_abc123-zone-residential_proxy1:ZONE_PASSWORD@brd.superproxy.io:33335"
```

**How to find your zone password:**
1. Go to Bright Data Dashboard → Proxies → Your Zone
2. Click on the zone (e.g., "residential_proxy1")
3. Find "Password" field (NOT the API key from settings)
4. Copy the password for that specific zone

---

## Issue #2: SSL Certificate Configuration

**Error:** SSL verification errors, certificate issues

**Key Insight:** For Bright Data residential proxy with port 33335:
- Use `ssl=False` in aiohttp (equivalent to `curl -k`)
- The proxy handles HTTPS tunneling internally
- Do NOT try to apply Bright Data's SSL cert to target site verification

**Correct aiohttp Setup:**
```python
import aiohttp

# Create connector with SSL disabled for proxy compatibility
connector = aiohttp.TCPConnector(
    ssl=False,  # Required for Bright Data proxy
    limit=15,
    limit_per_host=10,
)

proxy_url = "http://brd-customer-XXX-zone-YYY:PASS@brd.superproxy.io:33335"

async with aiohttp.ClientSession(connector=connector) as session:
    async with session.get(target_url, proxy=proxy_url) as response:
        html = await response.text()
```

**Correct httpx Setup:**
```python
import httpx

# For httpx, use verify=False when using proxy
client_kwargs = {
    "timeout": 30.0,
    "verify": False,  # Disable SSL verification for proxy
    "proxy": proxy_url,
}

async with httpx.AsyncClient(**client_kwargs) as client:
    response = await client.get(target_url)
```

---

## Issue #3: Port 33335 vs 22225

**Important:** As of September 2024, Bright Data requires port 33335 for new SSL certificates.

**Old documentation may show:**
```
brd.superproxy.io:22225  # OLD - deprecated
```

**Use instead:**
```
brd.superproxy.io:33335  # CORRECT - new SSL port
```

**Environment Variables:**
```bash
BRIGHT_DATA_HOST=brd.superproxy.io
BRIGHT_DATA_PORT=33335  # Must be 33335
```

---

## Issue #4: Finding the Correct Zone Name

**Error:** 407 even with correct password

**Cause:** Using wrong zone name in URL

**How to find zone name:**
1. Bright Data Dashboard → Proxies
2. Look for your residential proxy zone
3. The zone name is shown (e.g., `residential_proxy1`, `linkedin_proxy`, etc.)
4. Use EXACT name in URL: `-zone-residential_proxy1`

**Zone naming pattern:**
```
-zone-{exact_zone_name_from_dashboard}
```

---

## Issue #5: Complete Python Integration

**Recommended config.py pattern:**
```python
import os
from typing import Optional

class Settings:
    def __init__(self):
        self.bright_data_customer_id: Optional[str] = os.getenv("BRIGHT_DATA_CUSTOMER_ID")
        self.bright_data_zone: str = os.getenv("BRIGHT_DATA_ZONE", "residential")
        self.bright_data_password: Optional[str] = os.getenv("BRIGHT_DATA_PASSWORD")
        self.bright_data_host: str = os.getenv("BRIGHT_DATA_HOST", "brd.superproxy.io")
        self.bright_data_port: str = os.getenv("BRIGHT_DATA_PORT", "33335")

    @property
    def bright_data_proxy_url(self) -> Optional[str]:
        if not self.bright_data_customer_id or not self.bright_data_password:
            return None
        return (
            f"http://brd-customer-{self.bright_data_customer_id}"
            f"-zone-{self.bright_data_zone}"
            f":{self.bright_data_password}"
            f"@{self.bright_data_host}:{self.bright_data_port}"
        )
```

**.env file:**
```bash
BRIGHT_DATA_CUSTOMER_ID=hl_abc123
BRIGHT_DATA_ZONE=residential_proxy1
BRIGHT_DATA_PASSWORD=your_zone_password_here
BRIGHT_DATA_HOST=brd.superproxy.io
BRIGHT_DATA_PORT=33335
```

---

## Issue #6: Playwright Proxy Integration

**For headless browser scraping:**
```python
from playwright.async_api import async_playwright

proxy_url = settings.bright_data_proxy_url

async with async_playwright() as p:
    browser = await p.chromium.launch(
        headless=True,
        proxy={"server": proxy_url} if proxy_url else None
    )
    page = await browser.new_page()
    await page.goto(target_url)
```

---

## Testing Proxy Connection

**Quick test script:**
```python
import asyncio
import aiohttp

async def test_proxy():
    proxy_url = "http://brd-customer-XXX-zone-YYY:PASS@brd.superproxy.io:33335"
    test_url = "https://geo.brdtest.com/welcome.txt"

    connector = aiohttp.TCPConnector(ssl=False)
    timeout = aiohttp.ClientTimeout(total=30)

    async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
        async with session.get(test_url, proxy=proxy_url) as response:
            if response.status == 200:
                text = await response.text()
                print(f"SUCCESS! Response:\n{text}")
            elif response.status == 407:
                print("FAILED: 407 Proxy Authentication Required")
                print("Check: zone password, customer ID, zone name")
            else:
                print(f"Response: {response.status}")

asyncio.run(test_proxy())
```

**Equivalent curl command for testing:**
```bash
curl -i --proxy brd.superproxy.io:33335 \
  --proxy-user brd-customer-XXX-zone-YYY:PASS \
  -k 'https://geo.brdtest.com/welcome.txt'
```

---

## Debugging Checklist

### Before Setup
- [ ] Have Bright Data account with residential proxy access
- [ ] Know your Customer ID (starts with `hl_`)
- [ ] Know your exact Zone name from dashboard
- [ ] Have the Zone password (NOT the API key)

### Common 407 Auth Fixes
- [ ] Verify zone password (NOT API key)
- [ ] Verify zone name matches dashboard exactly
- [ ] Verify customer ID format (`hl_xxxxx`)
- [ ] Use port 33335 (not 22225)
- [ ] Check zone is active in Bright Data dashboard

### SSL/Connection Fixes
- [ ] Use `ssl=False` in aiohttp TCPConnector
- [ ] Use `verify=False` in httpx
- [ ] Don't mix Bright Data cert with target site verification
- [ ] Port 33335 required for new SSL certificates

### Integration Verification
- [ ] Test with `geo.brdtest.com/welcome.txt` endpoint
- [ ] Check response shows different IP location
- [ ] Verify residential IP (not datacenter)

---

## Proxy Manager Pattern

**For production use with rotation and health tracking:**

```python
from dataclasses import dataclass
from typing import Optional, Dict
import asyncio
import time

@dataclass
class ProxyStats:
    url: str
    success_count: int = 0
    failure_count: int = 0
    is_banned: bool = False
    ban_until: float = 0.0

class ProxyManager:
    def __init__(self, proxy_url: str):
        self.proxies: Dict[str, ProxyStats] = {
            proxy_url: ProxyStats(url=proxy_url)
        }
        self._lock = asyncio.Lock()

    async def get_proxy(self) -> Optional[str]:
        async with self._lock:
            for url, stats in self.proxies.items():
                if not stats.is_banned or stats.ban_until < time.time():
                    return url
        return None

    async def report_success(self, proxy_url: str, response_time_ms: float):
        async with self._lock:
            if proxy_url in self.proxies:
                self.proxies[proxy_url].success_count += 1

    async def report_failure(self, proxy_url: str):
        async with self._lock:
            if proxy_url in self.proxies:
                stats = self.proxies[proxy_url]
                stats.failure_count += 1
                if stats.failure_count >= 3:
                    stats.is_banned = True
                    stats.ban_until = time.time() + 300  # 5 min ban
```

---

## Anti-Bot Best Practices

When using Bright Data proxy, combine with:

1. **Stealth Headers:** Rotate User-Agent and browser headers
2. **Jittered Delays:** `delay * (0.5 + random.random())`
3. **Connection Pooling:** Reuse aiohttp sessions
4. **Rate Limiting:** Use `asyncio.Semaphore` for concurrency control
5. **Retry Logic:** Exponential backoff on failures

```python
import random
import asyncio

# Jittered delay pattern
async def fetch_with_jitter(session, url, proxy, base_delay=0.5):
    # ... fetch logic ...
    jittered_delay = base_delay * (0.5 + random.random())
    await asyncio.sleep(jittered_delay)
```
