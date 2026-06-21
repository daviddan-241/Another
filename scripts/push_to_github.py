#!/usr/bin/env python3
"""Push current workspace to GitHub via API (no git commit needed)."""
import os, json, base64, subprocess, urllib.request, urllib.error

TOKEN = os.environ["GITHUB_PERSONAL_ACCESS_TOKEN"].strip()
OWNER = "daviddan-241"
REPO  = "Another"
BRANCH = "main"

EXCLUDES = {
    ".git", "node_modules", "dist", ".local", ".config",
    ".pnpm-store", "__pycache__", ".cache",
}
EXCLUDE_NAMES = {"artifact.edit.toml"}
MAX_SIZE = 400_000  # 400KB

def api(method, path, body=None):
    url = f"https://api.github.com{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        print(f"  ERROR {e.code} {method} {path}: {e.read().decode()[:200]}")
        return None

def collect_files(root):
    files = []
    for dirpath, dirs, filenames in os.walk(root):
        # prune excluded dirs in-place
        dirs[:] = [d for d in dirs if d not in EXCLUDES]
        for fname in filenames:
            if fname in EXCLUDE_NAMES:
                continue
            fpath = os.path.join(dirpath, fpath2 := fname)
            full = os.path.join(dirpath, fname)
            size = os.path.getsize(full)
            if size > MAX_SIZE:
                continue
            rel = os.path.relpath(full, root).replace("\\", "/")
            files.append((rel, full))
    files.sort()
    return files

def create_blob(content_bytes):
    b64 = base64.b64encode(content_bytes).decode()
    result = api("POST", f"/repos/{OWNER}/{REPO}/git/blobs", {
        "content": b64,
        "encoding": "base64"
    })
    return result["sha"] if result else None

def main():
    root = "/home/runner/workspace"

    # 1. Get HEAD
    ref = api("GET", f"/repos/{OWNER}/{REPO}/git/refs/heads/{BRANCH}")
    if not ref:
        print("Failed to get HEAD ref"); return
    parent_sha = ref["object"]["sha"]
    parent_commit = api("GET", f"/repos/{OWNER}/{REPO}/git/commits/{parent_sha}")
    base_tree_sha = parent_commit["tree"]["sha"]
    print(f"Parent: {parent_sha[:8]}  Tree: {base_tree_sha[:8]}")

    # 2. Collect files
    files = collect_files(root)
    print(f"Found {len(files)} files to push")

    # 3. Create blobs
    tree_items = []
    for i, (rel, full) in enumerate(files):
        try:
            with open(full, "rb") as f:
                content = f.read()
        except Exception as e:
            print(f"  skip {rel}: {e}")
            continue
        sha = create_blob(content)
        if sha:
            tree_items.append({"path": rel, "mode": "100644", "type": "blob", "sha": sha})
            if i % 20 == 0:
                print(f"  {i}/{len(files)} blobs created...")

    print(f"Created {len(tree_items)} blobs")

    # 4. Create tree
    tree = api("POST", f"/repos/{OWNER}/{REPO}/git/trees", {
        "base_tree": base_tree_sha,
        "tree": tree_items
    })
    if not tree:
        print("Failed to create tree"); return
    new_tree_sha = tree["sha"]
    print(f"New tree: {new_tree_sha[:8]}")

    # 5. Create commit
    commit = api("POST", f"/repos/{OWNER}/{REPO}/git/commits", {
        "message": "feat: real chat panel with Solana signing, lock/unlock, live replies + Telegram fix + Render config",
        "tree": new_tree_sha,
        "parents": [parent_sha]
    })
    if not commit:
        print("Failed to create commit"); return
    new_commit_sha = commit["sha"]
    print(f"New commit: {new_commit_sha[:8]}")

    # 6. Update ref
    result = api("PATCH", f"/repos/{OWNER}/{REPO}/git/refs/heads/{BRANCH}", {
        "sha": new_commit_sha,
        "force": False
    })
    if result:
        print(f"SUCCESS! Branch {BRANCH} updated to {new_commit_sha[:8]}")
    else:
        print("Failed to update ref")

if __name__ == "__main__":
    main()
