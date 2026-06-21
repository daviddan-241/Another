#!/usr/bin/env node
import fs from "fs";
import path from "path";
import crypto from "crypto";

const TOKEN = process.env.GITHUB_PERSONAL_ACCESS_TOKEN?.trim();
const OWNER = "daviddan-241";
const REPO  = "Another";
const BRANCH = "main";
const MAX_SIZE = 400_000;
const CONCURRENCY = 4;

const EXCLUDE_DIRS  = new Set([".git","node_modules","dist",".local",".config",".pnpm-store","__pycache__",".cache","coverage"]);
const EXCLUDE_FILES = new Set(["artifact.edit.toml"]);

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function api(method, path2, body, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(`https://api.github.com${path2}`, {
      method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    if (res.status === 403 && text.includes("secondary rate limit")) {
      const wait = (attempt + 1) * 8000;
      console.log(`  Rate limited — waiting ${wait/1000}s...`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) { console.error(`  ERR ${res.status} ${method} ${path2}: ${text.slice(0,200)}`); return null; }
    return JSON.parse(text);
  }
  return null;
}

// Compute the git blob SHA the same way git does: "blob <size>\0<content>"
function gitBlobSha(content) {
  const header = Buffer.from(`blob ${content.length}\0`);
  const h = crypto.createHash("sha1");
  h.update(header);
  h.update(content);
  return h.digest("hex");
}

function collectFiles(root) {
  const results = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!EXCLUDE_DIRS.has(entry.name)) walk(path.join(dir, entry.name));
      } else {
        if (EXCLUDE_FILES.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        const stat = fs.statSync(full);
        if (stat.size > MAX_SIZE) continue;
        results.push({ rel: path.relative(root, full).replace(/\\/g, "/"), full });
      }
    }
  }
  walk(root);
  return results.sort((a,b) => a.rel.localeCompare(b.rel));
}

// Walk the full tree in GitHub to get all existing path→sha mappings
async function fetchFullTree(treeSha) {
  const data = await api("GET", `/repos/${OWNER}/${REPO}/git/trees/${treeSha}?recursive=1`);
  if (!data) return new Map();
  const map = new Map();
  for (const item of data.tree ?? []) {
    if (item.type === "blob") map.set(item.path, item.sha);
  }
  return map;
}

async function createBlob(content) {
  const r = await api("POST", `/repos/${OWNER}/${REPO}/git/blobs`, {
    content: content.toString("base64"),
    encoding: "base64",
  });
  return r?.sha ?? null;
}

async function processInBatches(items, batchSize, fn) {
  const results = new Array(items.length);
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((item, j) => fn(item, i + j)));
    for (let j = 0; j < batchResults.length; j++) results[i + j] = batchResults[j];
    await sleep(500); // gentle pacing between batches
  }
  return results;
}

async function main() {
  const root = "/home/runner/workspace";

  const ref = await api("GET", `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`);
  if (!ref) { console.error("Cannot get HEAD ref"); process.exit(1); }
  const parentSha = ref.object.sha;
  const parentCommit = await api("GET", `/repos/${OWNER}/${REPO}/git/commits/${parentSha}`);
  const baseTreeSha = parentCommit.tree.sha;
  console.log(`Parent: ${parentSha.slice(0,8)}  Tree: ${baseTreeSha.slice(0,8)}`);

  console.log("Fetching existing tree from GitHub...");
  const existingTree = await fetchFullTree(baseTreeSha);
  console.log(`  ${existingTree.size} files already in repo`);

  const files = collectFiles(root);
  console.log(`${files.length} local files found`);

  // Only upload files whose content hash differs from what's in GitHub
  const changed = [];
  for (const f of files) {
    const content = fs.readFileSync(f.full);
    const localSha = gitBlobSha(content);
    const remoteSha = existingTree.get(f.rel);
    if (localSha !== remoteSha) {
      changed.push({ ...f, content, localSha });
    }
  }
  console.log(`${changed.length} changed files to upload`);

  if (changed.length === 0) {
    console.log("Nothing to push — already up to date.");
    return;
  }

  const treeItems = [];
  // Reuse existing blobs for unchanged files (include them in tree via their existing SHA)
  for (const [p, sha] of existingTree) {
    if (!changed.find(f => f.rel === p) && files.find(f => f.rel === p)) {
      treeItems.push({ path: p, mode: "100644", type: "blob", sha });
    }
  }

  // Upload only changed blobs
  let done = 0;
  await processInBatches(changed, CONCURRENCY, async ({ rel, content }) => {
    const sha = await createBlob(content);
    if (sha) treeItems.push({ path: rel, mode: "100644", type: "blob", sha });
    done++;
    process.stdout.write(`\r  ${done}/${changed.length} blobs uploaded`);
    return sha;
  });
  console.log();

  console.log(`Building tree with ${treeItems.length} entries...`);
  const tree = await api("POST", `/repos/${OWNER}/${REPO}/git/trees`, { tree: treeItems });
  if (!tree) { console.error("Tree creation failed"); process.exit(1); }
  console.log(`New tree: ${tree.sha.slice(0,8)}`);

  const msg = process.argv[2] || "chore: sync from Replit";
  const commit = await api("POST", `/repos/${OWNER}/${REPO}/git/commits`, {
    message: msg,
    tree: tree.sha,
    parents: [parentSha],
  });
  if (!commit) { console.error("Commit creation failed"); process.exit(1); }
  console.log(`New commit: ${commit.sha.slice(0,8)}`);

  const updated = await api("PATCH", `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
    sha: commit.sha,
    force: false,
  });
  if (updated) {
    console.log(`\n✅ SUCCESS — ${BRANCH} → ${commit.sha.slice(0,8)}`);
    console.log(`   https://github.com/${OWNER}/${REPO}/commit/${commit.sha}`);
  } else {
    console.error("Failed to update branch ref");
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
