# explore-ms-watcher

Checks the [Microsoft Explore Program page](https://careers.microsoft.com/v2/global/en/exploremicrosoft)
once a day and emails you the moment a real application posting shows up
(vs. the generic filler jobs Microsoft shows there when nothing's live).

As of the last manual check (July 16, 2026), applications are **not open
yet** — historically this program opens applications around mid-to-late
August.

## How it works

- `check_explore.py` fetches the page, looks at the "Explore Program
  internships" section, and checks the job titles there against patterns
  like "Explore Microsoft ... First-Year" / "Second-Year".
- `state.json` tracks whether it was open last time it checked.
- The GitHub Actions workflow (`.github/workflows/check-explore.yml`) runs
  the script daily and emails you **only when the status flips from closed
  to open** (so you get one alert, not a daily spam).
- This is a heuristic based on the page's current layout — not a guarantee.
  If Microsoft redesigns the page, the script falls back to a looser scan
  and flags that in its output so you know to go check manually.

## Setup (~5 minutes)

1. **Create a new GitHub repo** and push these files to it (public or
   private both work).

2. **Get an email app password.** Gmail is the easiest to wire up:
   - Turn on 2-Step Verification on your Google account if it isn't already.
   - Go to <https://myaccount.google.com/apppasswords> and generate an app
     password (pick "Mail" as the app). Copy the 16-character password.
   - (If you'd rather use a different provider, swap `server_address` /
     `server_port` in the workflow file for that provider's SMTP settings.)

3. **Add repo secrets.** In your repo: Settings → Secrets and variables →
   Actions → New repository secret. Add:
   - `MAIL_USERNAME` — your Gmail address
   - `MAIL_PASSWORD` — the app password from step 2
   - `MAIL_TO` — where you want the alert sent (can be the same address)

4. **Enable Actions** on the repo if GitHub prompts you to (it's on by
   default for repos you push to).

5. That's it — it'll run automatically every day at 13:00 UTC. You can also
   trigger a check immediately: Actions tab → "Check Microsoft Explore
   Program status" → Run workflow.

## Worth knowing

- GitHub's free tier gives 2,000 Actions minutes/month for private repos
  (unlimited for public repos) — this job takes well under a minute a day,
  so cost isn't a concern.
- Because this relies on scraping a marketing page rather than an official
  API, treat it as an early warning, not a guarantee — it's worth checking
  the page yourself once mid-August rolls around regardless.
- You can also sign up for Microsoft's own job alerts (Talent Network) on
  the careers site as a backup channel.
