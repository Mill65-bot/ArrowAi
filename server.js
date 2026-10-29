// Arrow web platform — Milestone 1 foundation.
// A dependency-free Node server: serves the web app and a small JSON API for the clone,
// its chat, the clone worker, and tool connections (GitHub wired; social = front doors next).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";

import { read, update } from "./lib/store.js";
import * as llm from "./lib/llm.js";
import * as gh from "./lib/github.js";
import { systemPrompt, routerPrompt, askFor } from "./lib/clone.js";

const PORT = process.env.PORT || 3000;
const PUBLIC = new URL("./public", import.meta.url).pathname;

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

// Tools shown on the Connections page. GitHub is live; the rest are front doors we wire next.
const TOOLS = [
  { id: "github", name: "GitHub", note: "Write code and open a pull request you merge.", live: true },
  { id: "meta", name: "Meta (Instagram + Facebook)", note: "One business sign-in posts to both.", live: false },
  { id: "youtube", name: "YouTube", note: "Upload videos via the official Data API.", live: false },
  { id: "tiktok", name: "TikTok", note: "Post via the official Content Posting API.", live: false },
];

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    return await serveStatic(res, url.pathname);
  } catch (err) {
    send(res, 500, { error: err.message });
  }
});

async function api(req, res, url) {
  const path = url.pathname;

  if (req.method === "GET" && path === "/api/state") {
    const s = read();
    return send(res, 200, {
      profile: s.profile,
      chat: s.chat,
      worklog: s.worklog,
      backend: llm.backendName(),
      tools: TOOLS.map((t) => ({ ...t, connected: isConnected(s, t.id) })),
    });
  }

  if (req.method === "POST" && path === "/api/profile") {
    const b = await readBody(req);
    const s = update((st) => {
      st.profile = {
        profession: (b.profession || "").trim(),
        name: (b.name || "").trim(),
        style: (b.style || "").trim(),
        rules: Array.isArray(b.rules) ? b.rules : [],
      };
    });
    return send(res, 200, { profile: s.profile });
  }

  if (req.method === "POST" && path === "/api/chat") {
    const { message } = await readBody(req);
    if (!message) return send(res, 400, { error: "Empty message." });
    const s = read();
    const history = [...s.chat, { role: "user", text: message }].map((m) => ({ role: m.role, text: m.text }));
    const reply = await llm.chat(systemPrompt(s.profile), history);
    update((st) => {
      st.chat.push({ role: "user", text: message }, { role: "model", text: reply });
    });
    return send(res, 200, { reply });
  }

  // The clone worker: route a command to one real action and carry it out.
  if (req.method === "POST" && path === "/api/command") {
    const { command } = await readBody(req);
    if (!command) return send(res, 400, { error: "Empty command." });
    const s = read();
    const plan = await llm.classifyJson(routerPrompt(s.profile, command));
    const action = plan.action || "answer";
    let result = plan.reply || "";
    const creation = ["write_code", "make_content", "draft", "answer"].includes(action);
    if (creation) {
      result = await llm.answer(systemPrompt(s.profile), askFor(action, s.profile, plan.topic, command));
    } else if (action === "needs_connection") {
      result = (plan.reply || "") + " Connect that platform on the Connections page first, then I can do it directly.";
    } else if (action === "spend_money") {
      result = (plan.reply || "") + " That spends money or can't be undone, so it stops for you to do or confirm.";
    } else if (action === "out_of_scope") {
      result = "That's outside what your clone does. " + (plan.reply || "");
    }
    const id = randomUUID().slice(0, 8);
    update((st) => st.worklog.push({ id, cmd: command, action, result, approved: false, pr: "" }));
    return send(res, 200, { id, action, result, creation });
  }

  if (req.method === "POST" && path.match(/^\/api\/worklog\/[^/]+\/approve$/)) {
    const id = path.split("/")[3];
    update((st) => { const e = st.worklog.find((w) => w.id === id); if (e) e.approved = true; });
    return send(res, 200, { ok: true });
  }

  if (req.method === "POST" && path === "/api/connections/github") {
    const { token, repo, base } = await readBody(req);
    if (!token || !repo) return send(res, 400, { error: "Token and repository are required." });
    const login = await gh.me(token); // verifies the token
    update((st) => { st.connections.github = { token, repo, base: base || "", login }; });
    return send(res, 200, { login });
  }

  if (req.method === "POST" && path.match(/^\/api\/worklog\/[^/]+\/ship-github$/)) {
    const id = path.split("/")[3];
    const { filePath } = await readBody(req);
    const s = read();
    const conn = s.connections.github;
    const entry = s.worklog.find((w) => w.id === id);
    if (!conn) return send(res, 400, { error: "GitHub is not connected." });
    if (!entry) return send(res, 404, { error: "No such work item." });
    const { code, ext } = gh.extractCode(entry.result);
    if (!code) return send(res, 400, { error: "No code in this item to open a PR with." });
    const path2 = filePath || `arrow-clone/${Date.now()}.${ext}`;
    const title = "Arrow clone: " + entry.cmd.slice(0, 60);
    const body = `Written by the user's Arrow clone from the command:\n\n> ${entry.cmd}\n\nReview and merge if it's what you wanted.`;
    const pr = await gh.openPr(conn.token, conn.repo, conn.base, path2, code, title, body);
    update((st) => { const e = st.worklog.find((w) => w.id === id); if (e) { e.pr = pr.url; e.approved = true; } });
    return send(res, 200, { url: pr.url });
  }

  return send(res, 404, { error: "Unknown endpoint." });
}

function isConnected(state, id) {
  const c = state.connections[id];
  return Boolean(c && (id !== "github" || (c.token && c.repo)));
}

async function serveStatic(res, pathname) {
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  try {
    const file = join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC)) return send(res, 403, { error: "Forbidden" });
    const data = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(new Error("Bad JSON body.")); } });
    req.on("error", reject);
  });
}

function send(res, code, obj) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
}

server.listen(PORT, () => console.log(`Arrow web platform on http://localhost:${PORT}`));
