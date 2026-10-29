// GitHub front door — the first real "perform" connection, ported from the prototype
// app's GithubClient to the server. The clone writes code and opens a pull request the
// user reviews and merges. A PR is reviewable and reversible, so nothing changes without
// the user's approval.
const API = "https://api.github.com";

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Arrow",
    "content-type": "application/json",
  };
}

async function gh(token, method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: headers(token),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (res.status === 401) throw new Error("GitHub rejected the token.");
  if (res.status === 403) throw new Error("Token is missing the 'repo'/'pull request' permission.");
  if (res.status === 404) throw new Error("Repository or branch not found for this token.");
  if (!res.ok) {
    let msg = text;
    try { msg = JSON.parse(text).message || text; } catch {}
    throw new Error(`GitHub error ${res.status}: ${msg}`);
  }
  return text ? JSON.parse(text) : {};
}

// Verify a token and return the login it belongs to.
export async function me(token) {
  const u = await gh(token, "GET", "/user");
  return u.login || "";
}

// Create a branch, commit one file, open a PR. Returns { url, branch }.
export async function openPr(token, repo, base, path, code, title, body) {
  const [owner, name] = repo.split("/");
  if (!owner || !name) throw new Error("Repository must be owner/name.");
  const repoPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;

  let baseBranch = (base || "").trim();
  if (!baseBranch) baseBranch = (await gh(token, "GET", repoPath)).default_branch || "main";

  const ref = await gh(token, "GET", `${repoPath}/git/ref/heads/${encodeURIComponent(baseBranch)}`);
  const baseSha = ref.object.sha;

  const branch = `arrow-clone-${Date.now()}`;
  await gh(token, "POST", `${repoPath}/git/refs`, { ref: `refs/heads/${branch}`, sha: baseSha });

  const content = Buffer.from(code, "utf8").toString("base64");
  const encPath = path.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
  await gh(token, "PUT", `${repoPath}/contents/${encPath}`, { message: title, content, branch });

  const pr = await gh(token, "POST", `${repoPath}/pulls`, { title, head: branch, base: baseBranch, body });
  return { url: pr.html_url || "", branch };
}

// Pull the first fenced code block (and a file extension) out of the clone's answer.
export function extractCode(markdown) {
  const m = markdown.match(/```([a-zA-Z0-9+#]*)\s*\n([\s\S]*?)```/);
  const lang = (m ? m[1] : "").toLowerCase();
  const code = (m ? m[2] : markdown).trim();
  const ext = {
    python: "py", py: "py", javascript: "js", js: "js", node: "js", typescript: "ts", ts: "ts",
    jsx: "jsx", tsx: "tsx", java: "java", kotlin: "kt", kt: "kt", html: "html", css: "css",
    json: "json", go: "go", ruby: "rb", rb: "rb", php: "php", c: "c", cpp: "cpp", sh: "sh",
    bash: "sh", sql: "sql",
  }[lang] || "txt";
  return { code, ext };
}
