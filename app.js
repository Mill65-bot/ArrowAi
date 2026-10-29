// Arrow web platform — frontend. Talks to the JSON API in server.js.
const $ = (s) => document.querySelector(s);
const api = async (path, body) => {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
};

let state = { profile: {}, chat: [], worklog: [], tools: [], backend: null };

// --- tabs ---
document.querySelectorAll("nav button").forEach((b) =>
  b.addEventListener("click", () => {
    document.querySelectorAll("nav button").forEach((x) => x.classList.toggle("on", x === b));
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t.id === b.dataset.tab));
  })
);

async function load() {
  state = await api("/api/state");
  $("#subtitle").textContent = state.profile.profession
    ? "Your digital " + state.profile.profession.toLowerCase()
    : "Set your profession in Profile to begin";
  renderChat();
  renderWorklog();
  renderTools();
  fillProfile();
  $("#backendNote").textContent = state.backend
    ? "Clone brain: " + state.backend + " (key set in the environment)."
    : "No AI key set yet — add GEMINI_API_KEY or ANTHROPIC_API_KEY to the server to switch the clone on.";
}

// --- clone chat ---
function renderChat() {
  $("#chat").innerHTML = state.chat
    .map((m) => `<div class="bubble ${m.role}">${esc(m.text)}</div>`)
    .join("");
  $("#chat").scrollTop = $("#chat").scrollHeight;
}
$("#chatForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = $("#chatInput").value.trim();
  if (!message) return;
  $("#chatInput").value = "";
  state.chat.push({ role: "user", text: message });
  renderChat();
  try {
    const { reply } = await api("/api/chat", { message });
    state.chat.push({ role: "model", text: reply });
  } catch (err) {
    state.chat.push({ role: "model", text: "⚠️ " + err.message });
  }
  renderChat();
});

// --- clone worker ---
function renderWorklog() {
  $("#worklog").innerHTML = state.worklog
    .slice()
    .reverse()
    .map((w) => {
      const creation = ["write_code", "make_content", "draft", "answer"].includes(w.action);
      let actions = "";
      if (w.pr) {
        actions = `<div class="row"><a href="${w.pr}" target="_blank">✓ Pull request opened — review it</a></div>`;
      } else {
        const btns = [];
        if (creation && !w.approved) btns.push(`<button data-approve="${w.id}">Approve</button>`);
        if (w.action === "write_code") btns.push(`<button class="ghost" data-pr="${w.id}">Open a pull request on GitHub</button>`);
        if (btns.length) actions = `<div class="row">${btns.join("")}</div>`;
      }
      const tag = w.approved ? "APPROVED ✓" : creation ? "YOUR CLONE MADE THIS — REVIEW IT" : "CLONE WORKER";
      return `<div class="card"><div class="label">YOU SAID</div>${esc(w.cmd)}
        <div class="label">${tag}</div><div style="white-space:pre-wrap">${esc(w.result)}</div>${actions}</div>`;
    })
    .join("");
  $("#worklog").querySelectorAll("[data-approve]").forEach((b) =>
    b.addEventListener("click", async () => { await api(`/api/worklog/${b.dataset.approve}/approve`, {}); await load(); })
  );
  $("#worklog").querySelectorAll("[data-pr]").forEach((b) =>
    b.addEventListener("click", () => shipPr(b.dataset.pr))
  );
}
$("#cmdForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const command = $("#cmdInput").value.trim();
  if (!command) return;
  $("#cmdInput").value = "";
  try {
    await api("/api/command", { command });
  } catch (err) {
    alert(err.message);
  }
  await load();
});

async function shipPr(id) {
  if (!state.tools.find((t) => t.id === "github" && t.connected)) {
    alert("Connect GitHub first on the Connections page.");
    return;
  }
  const filePath = prompt("File path in the repo:", "arrow-clone/output.txt");
  if (filePath === null) return;
  try {
    const { url } = await api(`/api/worklog/${id}/ship-github`, { filePath });
    window.open(url, "_blank");
  } catch (err) {
    alert(err.message);
  }
  await load();
}

// --- connections ---
function renderTools() {
  $("#tools").innerHTML = state.tools
    .map((t) => {
      const pill = t.connected
        ? `<span class="pill on">Connected</span>`
        : t.live
        ? `<span class="pill ok">Ready to connect</span>`
        : `<span class="pill off">Coming next</span>`;
      let form = "";
      if (t.id === "github" && !t.connected) {
        form = `<div class="row" style="flex-direction:column;align-items:stretch">
          <input id="gh-token" placeholder="GitHub token (github_pat_… / ghp_…)" />
          <input id="gh-repo" placeholder="Repository (owner/name)" />
          <input id="gh-base" placeholder="Base branch (optional, e.g. main)" />
          <button id="gh-connect">Connect GitHub</button></div>`;
      }
      return `<div class="card"><h3>${esc(t.name)} ${pill}</h3><div class="muted">${esc(t.note)}</div>${form}</div>`;
    })
    .join("");
  const c = $("#gh-connect");
  if (c)
    c.addEventListener("click", async () => {
      try {
        const { login } = await api("/api/connections/github", {
          token: $("#gh-token").value.trim(),
          repo: $("#gh-repo").value.trim(),
          base: $("#gh-base").value.trim(),
        });
        alert("Connected as " + login);
        await load();
      } catch (err) {
        alert(err.message);
      }
    });
}

// --- profile ---
function fillProfile() {
  $("#pf-profession").value = state.profile.profession || "";
  $("#pf-name").value = state.profile.name || "";
  $("#pf-style").value = state.profile.style || "";
  $("#pf-rules").value = (state.profile.rules || []).join("\n");
}
$("#saveProfile").addEventListener("click", async () => {
  await api("/api/profile", {
    profession: $("#pf-profession").value,
    name: $("#pf-name").value,
    style: $("#pf-style").value,
    rules: $("#pf-rules").value.split("\n").map((s) => s.trim()).filter(Boolean),
  });
  await load();
  alert("Saved.");
});

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

load();
