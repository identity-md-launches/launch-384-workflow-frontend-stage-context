# Portable source commit

The assignment workspace mounts `.git` read-only. `git add` failed with `Unable to create .../.git/index.lock: Read-only file system`, so the workspace's existing branch could not be updated.

`docs/guild-frontend.bundle` carries the completed source/export/evidence as a Git commit on **`guild-frontend`**, based on the handoff source commit `fdae4f2291346ec7c0970027ef8a575a0aa65693`. It was made in an isolated local checkout under the assignment's disposable `test/scratch/` area. The committed files contain only allowed-path changes. The shared workspace also retains those same source/export/documentation bytes directly.

In a writable checkout based on the deployed source, the publisher can inspect/import the portable commit:

```sh
git bundle verify /path/to/guild-frontend.bundle
git fetch /path/to/guild-frontend.bundle guild-frontend
git diff --stat HEAD FETCH_HEAD
git merge --ff-only FETCH_HEAD
```

A fresh review checkout can instead use:

```sh
git clone --branch guild-frontend /path/to/guild-frontend.bundle guild-review
```

The bundle contains the full repository history necessary for a standalone clone. It does not include itself, preventing recursive packaging. No dependency directories, caches or npm tarballs are included. `docs/evidence/submission.json` records committed source/export byte counts and scope checks. The bundle is an import artifact for the read-only workspace limitation; the publisher does not need to rebuild or serve it. Only the contents of `dist/` are hosted.
