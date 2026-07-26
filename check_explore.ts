/**
 * Checks the Microsoft Explore Program page for a live application posting
 * and updates state.json.
 *
 * Meant to be run daily by the GitHub Actions workflow in this repo
 * (.github/workflows/check-explore.yml) — but you can also run it locally:
 *
 *     npm install
 *     npm start
 *
 * How detection works:
 *   Microsoft's Explore Microsoft page always shows an "Explore Program
 *   internships" section. When there's no live Explore application, that
 *   section is filled with generic/unrelated full-time job postings (as
 *   filler). When applications are actually open, real postings show up
 *   there with titles that mention "Explore Microsoft" and "First-Year" /
 *   "Second-Year". This script looks for that signal.
 *
 *   This is a heuristic based on how the page looks as of July 2026 — if
 *   Microsoft changes the page layout, the parser falls back to scanning
 *   the whole page, and flags that in the output so you know to double
 *   check manually.
 */

import * as fs from "node:fs";
import * as cheerio from "cheerio";

const PAGE_URL = "https://careers.microsoft.com/v2/global/en/exploremicrosoft";
const STATE_FILE = "state.json";

// Phrases that would show up in a REAL Explore Microsoft job posting title,
// as opposed to the generic filler jobs shown when nothing is live.
const SIGNAL_PATTERNS: RegExp[] = [
  /explore\s+microsoft.*(first|second)[\s-]*year/,
  /(first|second)[\s-]*year.*explore\s+microsoft/,
  /explore\s+microsoft\s*[-–—]\s*(application|intern)/,
  /explore\s+program\s+intern/,
];

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

interface State {
  open: boolean;
  last_checked?: string;
  last_matches: string[];
  last_titles_seen?: string[];
  used_fallback_parser?: boolean;
}

async function fetchJobTitles(): Promise<{ titles: string[]; usedFallback: boolean }> {
  const resp = await fetch(PAGE_URL, { headers: HEADERS });
  if (!resp.ok) {
    throw new Error(`Request failed with status ${resp.status}`);
  }
  const html = await resp.text();
  const $ = cheerio.load(html);

  let heading: ReturnType<typeof $> | null = null;
  $("h2, h3").each((_, el) => {
    if (heading) return;
    const text = $(el).text().trim().toLowerCase();
    if (text.includes("explore program internships")) {
      heading = $(el);
    }
  });

  if (!heading) {
    // Layout changed — fall back to scanning the whole page for h3s.
    const titles = $("h3")
      .map((_, el) => $(el).text().trim())
      .get();
    return { titles, usedFallback: true };
  }

  const titles: string[] = [];
  let sib = (heading as ReturnType<typeof $>).next();
  while (sib.length) {
    const tag = (sib.get(0) as { tagName?: string } | undefined)?.tagName?.toLowerCase();
    if (tag === "h2") break;
    if (tag === "h3") {
      titles.push(sib.text().trim());
    } else {
      sib.find("h3").each((_, h3) => {
        titles.push($(h3).text().trim());
      });
    }
    sib = sib.next();
  }

  return { titles, usedFallback: false };
}

function checkSignal(titles: string[]): string[] {
  return titles.filter((title) => {
    const low = title.toLowerCase();
    return SIGNAL_PATTERNS.some((pattern) => pattern.test(low));
  });
}

function loadState(): State {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as State;
  }
  return { open: false, last_matches: [] };
}

function saveState(state: State): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
}

function setOutput(name: string, value: string): void {
  const ghOut = process.env.GITHUB_OUTPUT;
  if (!ghOut) return;
  fs.appendFileSync(ghOut, `${name}<<EOF\n${value}\nEOF\n`);
}

async function main(): Promise<void> {
  const now = new Date().toISOString();
  let titles: string[];
  let usedFallback: boolean;

  try {
    ({ titles, usedFallback } = await fetchJobTitles());
  } catch (exc) {
    console.error(`Fetch failed: ${exc}`);
    setOutput("should_notify", "false");
    return; // don't fail the workflow over a transient fetch error
  }

  const matches = checkSignal(titles);
  const prevState = loadState();
  const wasOpen = prevState.open ?? false;
  const isOpen = matches.length > 0;

  const state: State = {
    open: isOpen,
    last_checked: now,
    last_matches: matches,
    last_titles_seen: titles,
    used_fallback_parser: usedFallback,
  };
  saveState(state);

  const shouldNotify = isOpen && !wasOpen;
  setOutput("should_notify", shouldNotify ? "true" : "false");

  const summaryLines = [
    `Checked: ${now}`,
    `Applications appear OPEN: ${isOpen}`,
    `Matching postings: ${matches.length ? JSON.stringify(matches) : "none"}`,
    "",
    `Page: ${PAGE_URL}`,
  ];
  if (usedFallback) {
    summaryLines.push(
      "NOTE: page layout looked different than expected -- parser " +
        "fell back to scanning all headings. Double-check manually."
    );
  }
  const summary = summaryLines.join("\n");
  setOutput("summary", summary);
  console.log(summary);
}

main();
