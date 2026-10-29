// A tiny JSON-file data store. One file holds the whole workspace for now.
// Milestone 2+ swaps this for a real database with per-user accounts.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

const FILE = new URL("../data/store.json", import.meta.url).pathname;

const EMPTY = {
  profile: { profession: "", name: "", style: "", rules: [] },
  // connections hold secrets (tokens) — on a real deployment these are encrypted at rest.
  connections: {},
  chat: [],        // {role, text}
  worklog: [],     // {id, cmd, action, result, approved, pr}
};

function load() {
  try {
    return { ...EMPTY, ...JSON.parse(readFileSync(FILE, "utf8")) };
  } catch {
    return structuredClone(EMPTY);
  }
}

function save(state) {
  if (!existsSync(dirname(FILE))) mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(state, null, 2));
}

// Read-modify-write helper so callers never touch the file directly.
export function read() {
  return load();
}

export function update(mutator) {
  const state = load();
  mutator(state);
  save(state);
  return state;
}
