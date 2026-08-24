#!/usr/bin/env node
/**
 * AICSS CLI - fetch free (and licensed Pro) components from the hosted registry.
 * This package contains no Pro source.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const BASE = (process.env.AICSS_REGISTRY_URL || "https://www.aicss.dev").replace(
  /\/$/,
  "",
);
const TOKEN = process.env.AICSS_TOKEN || "";

const args = process.argv.slice(2);
const cmd = args[0];
const force = args.includes("--force");

function help() {
  console.log(`@aicss/cli

Install AICSS component files into your project.

  npx @aicss/cli list
  npx @aicss/cli add <slug> [--framework react|vue|svelte] [--dir <path>] [--force]

Existing files are left as-is. Pass --force to overwrite them.

  AICSS_TOKEN         From ${BASE}/account (Pro components)
  AICSS_REGISTRY_URL  Registry origin (default ${BASE})
`);
}

function note(message) {
  console.log(message);
}

function flagValue(name, fallback) {
  const i = args.indexOf(name);
  if (i === -1) return fallback;
  const value = args[i + 1];
  if (!value || value.startsWith("--")) return fallback;
  return value;
}

async function api(path, { accept } = {}) {
  const headers = { Accept: accept || "application/json" };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { headers });
  } catch {
    return {
      ok: false,
      status: 0,
      body: { message: `Could not reach ${BASE}. Check your network and try again.` },
    };
  }
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = {};
  }
  return { ok: res.ok, status: res.status, body };
}

async function list() {
  const { ok, body } = await api("/r");
  if (!ok) {
    note(body.message || "Could not load the component list. Try again in a moment.");
    process.exitCode = 1;
    return;
  }
  const rows = (body.components || []).filter((c) => c.tier === "free");
  if (!rows.length) {
    note("No free components are listed right now.");
    return;
  }
  note("Free components\n");
  for (const c of rows) {
    note(`  ${c.slug.padEnd(22)} ${c.name}`);
  }
  note(`\nPro components need AICSS_TOKEN. See ${BASE}/pricing`);
}

async function add(slug) {
  if (!slug || slug.startsWith("--")) {
    help();
    process.exitCode = 1;
    return;
  }

  const framework = flagValue("--framework", "react");
  const dir = flagValue("--dir", ".");
  const allowed = new Set(["react", "vue", "svelte"]);
  if (!allowed.has(framework)) {
    note(`Framework "${framework}" is not supported. Use react, vue, or svelte.`);
    process.exitCode = 1;
    return;
  }

  const qs = framework === "react" ? "" : `?framework=${encodeURIComponent(framework)}`;
  const { ok, status, body } = await api(`/r/${slug}.json${qs}`);

  if (status === 0) {
    note(body.message || `Could not reach ${BASE}.`);
    process.exitCode = 1;
    return;
  }
  if (status === 404) {
    note(`No component named "${slug}". Run npx @aicss/cli list to see what is available.`);
    process.exitCode = 1;
    return;
  }
  if (status === 401 || status === 403) {
    note(
      `"${slug}" is a Pro component. Sign in at ${BASE}/account, copy AICSS_TOKEN, then run this again.`,
    );
    process.exitCode = 1;
    return;
  }
  if (!ok) {
    note(body.message || `Could not fetch "${slug}". Try again in a moment.`);
    process.exitCode = 1;
    return;
  }

  const files = body.files || [];
  if (!files.length) {
    note(`"${slug}" did not return any files.`);
    process.exitCode = 1;
    return;
  }

  note(`Adding ${body.title || slug} (${framework})\n`);

  let written = 0;
  let skipped = 0;
  for (const file of files) {
    const target = join(dir, file.target || file.path);
    mkdirSync(dirname(target), { recursive: true });
    const existed = existsSync(target);
    if (existed && !force) {
      note(`  skipped  ${target}  (already exists)`);
      skipped += 1;
      continue;
    }
    try {
      writeFileSync(target, file.content);
    } catch {
      note(`  skipped  ${target}  (could not write this path)`);
      skipped += 1;
      continue;
    }
    note(existed ? `  updated  ${target}` : `  wrote    ${target}`);
    written += 1;
  }

  note("");
  if (written && skipped) {
    note(`Done. ${written} written, ${skipped} already present.`);
  } else if (written) {
    note(`Done. ${written === 1 ? "1 file written." : `${written} files written.`}`);
  } else {
    note("Nothing to write. Those files are already in your project.");
    note("Pass --force if you want to overwrite them.");
  }
}

try {
  if (cmd === "list") {
    await list();
  } else if (cmd === "add") {
    await add(args[1]);
  } else if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    help();
  } else {
    note(`Unknown command "${cmd}".`);
    help();
    process.exitCode = 1;
  }
} catch {
  note("Something went wrong. Please try again.");
  process.exitCode = 1;
}
