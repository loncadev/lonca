# Changesets

This monorepo uses [Changesets](https://github.com/changesets/changesets) for versioning and publishing.

When you make a change worth releasing:

```bash
pnpm changeset
```

This will prompt you to describe the change. The generated changeset file gets committed to version control.

At release time:

```bash
pnpm version-packages   # bump versions based on changesets
pnpm release            # build and publish to npm
```
