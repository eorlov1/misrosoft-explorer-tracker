#!/usr/bin/env python3
"""
Checks the Microsoft Explore Program page for a live application posting
and updates state.json.

Meant to be run daily by the GitHub Actions workflow in this repo
(.github/workflows/check-explore.yml) — but you can also run it locally:

    pip install -r requirements.txt
    python check_explore.py

How detection works:
  Microsoft's Explore Microsoft page always shows an "Explore Program
  internships" section. When there's no live Explore application, that
  section is filled with generic/unrelated full-time job postings (as
  filler). When applications are actually open, real postings show up
  there with titles that mention "Explore Microsoft" and "First-Year" /
  "Second-Year". This script looks for that signal.

  This is a heuristic based on how the page looks as of July 2026 — if
  Microsoft changes the page layout, the parser falls back to scanning
  the whole page, and flags that in the output so you know to double
  check manually.
"""

import json
import os
import re
import sys
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup

PAGE_URL = "https://careers.microsoft.com/v2/global/en/exploremicrosoft"
STATE_FILE = "state.json"

# Phrases that would show up in a REAL Explore Microsoft job posting title,
# as opposed to the generic filler jobs shown when nothing is live.
SIGNAL_PATTERNS = [
    r"explore\s+microsoft.*(first|second)[\s-]*year",
    r"(first|second)[\s-]*year.*explore\s+microsoft",
    r"explore\s+microsoft\s*[-\u2013\u2014]\s*(application|intern)",
    r"explore\s+program\s+intern",
]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    )
}


def fetch_job_titles():
    resp = requests.get(PAGE_URL, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    heading = None
    for tag in soup.find_all(["h2", "h3"]):
        if "explore program internships" in tag.get_text(strip=True).lower():
            heading = tag
            break

    if heading is None:
        # Layout changed — fall back to scanning the whole page for h3s.
        titles = [h3.get_text(strip=True) for h3 in soup.find_all("h3")]
        return titles, True  # True = "used fallback, treat with caution"

    titles = []
    for sib in heading.find_next_siblings():
        if sib.name == "h2":
            break
        if sib.name == "h3":
            titles.append(sib.get_text(strip=True))
        else:
            titles.extend(h3.get_text(strip=True) for h3 in sib.find_all("h3"))

    return titles, False


def check_signal(titles):
    matches = []
    for title in titles:
        low = title.lower()
        if any(re.search(pattern, low) for pattern in SIGNAL_PATTERNS):
            matches.append(title)
    return matches


def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            return json.load(f)
    return {"open": False, "last_matches": []}


def save_state(state):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


def set_output(name, value):
    gh_out = os.environ.get("GITHUB_OUTPUT")
    if not gh_out:
        return
    with open(gh_out, "a") as f:
        f.write(f"{name}<<EOF\n{value}\nEOF\n")


def main():
    now = datetime.now(timezone.utc).isoformat()
    try:
        titles, used_fallback = fetch_job_titles()
    except Exception as exc:
        print(f"Fetch failed: {exc}", file=sys.stderr)
        set_output("should_notify", "false")
        sys.exit(0)  # don't fail the workflow over a transient fetch error

    matches = check_signal(titles)
    prev_state = load_state()
    was_open = prev_state.get("open", False)
    is_open = bool(matches)

    state = {
        "open": is_open,
        "last_checked": now,
        "last_matches": matches,
        "last_titles_seen": titles,
        "used_fallback_parser": used_fallback,
    }
    save_state(state)

    should_notify = is_open and not was_open
    set_output("should_notify", "true" if should_notify else "false")

    summary_lines = [
        f"Checked: {now}",
        f"Applications appear OPEN: {is_open}",
        f"Matching postings: {matches if matches else 'none'}",
        "",
        f"Page: {PAGE_URL}",
    ]
    if used_fallback:
        summary_lines.append(
            "NOTE: page layout looked different than expected -- parser "
            "fell back to scanning all headings. Double-check manually."
        )
    set_output("summary", "\n".join(summary_lines))
    print("\n".join(summary_lines))


if __name__ == "__main__":
    main()
