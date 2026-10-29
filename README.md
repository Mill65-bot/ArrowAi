# Arrow — web platform

A cloud web platform where a professional's **clone** performs real work through connected
tools, with the person approving before anything public, paid, or irreversible.

This is Milestone 1 (foundation). It is a dependency-free Node server — no install step.

## Run

```bash
cd arrow-web
# Give the clone a brain (one of these):
export GEMINI_API_KEY=your-key        # or
export ANTHROPIC_API_KEY=your-key
npm start                              # → http://localhost:3000
```

Without a key the app still runs; the clone chat just asks you to add one.

## What works now

- **Profile** — set your profession, name, working style, and rules. These shape the clone.
- **Clone chat** — talk to your clone; it answers in your style (via the AI key).
- **Clone worker** — give a command; it routes to a real action (answer, draft, make_content,
  write_code) or tells you when a command needs a tool connected. Everything it creates is
  shown for you to **Approve**.
- **Connections → GitHub (live)** — connect a token + repo; when the clone writes code, open a
  **pull request** you review and merge. This is the clone performing real work through a tool's
  front door.
- **Connections → Meta / YouTube / TikTok** — placeholders for the next milestones (official
  business sign-ins).

## How the clone reaches a tool

- **Front door** — the tool's official API / business sign-in. Reliable, allowed, auditable.
- **Back door** — a cloud browser driving a website (a later phase), only for tools with no API.

## Roadmap

1. ✅ Foundation — this.
2. Meta (Instagram + Facebook) — one sign-in, "post to both" with approval.
3. YouTube, then TikTok.
4. Browser agent for tools with no official connection.
5. Real accounts, encrypted secret storage, hosted deployment.

## Notes

- Data is stored in `data/store.json` for now (gitignored). Milestone 2 moves to a real database
  with per-user accounts and encrypted tokens.
- No API keys or tokens are ever committed. Keys come from the environment; the GitHub token is
  entered by the user and kept in the local store only.
