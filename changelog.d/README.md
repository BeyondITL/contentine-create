# Changelog fragments

Each PR that changes behaviour or docs adds **one small file here** instead of
editing [`CHANGELOG.md`](../CHANGELOG.md) directly. That way two PRs never
conflict over the same lines.

## Naming

```
changelog.d/<PR or issue number>.<type>.md
```

`<type>` is one of:

| Type      | Use for                                  | Folds into `CHANGELOG.md` as |
|-----------|------------------------------------------|------------------------------|
| `added`   | new features or files                    | `### Added`                  |
| `changed` | changes to existing behaviour            | `### Changed`                |
| `fixed`   | bug fixes                                | `### Fixed`                  |
| `removed` | removed features or files                | `### Removed`                |
| `docs`    | documentation-only changes               | `### Documentation`          |

Use the issue number if you don't have a PR number yet; either is fine.

## Content

One or two lines, written for a user reading release notes, no heading:

```markdown
<!-- changelog.d/123.fixed.md -->
Script parser no longer turns the model's preamble into a junk first scene.
```

Not needed for CI-only, test-only, or typo changes.

## For maintainers: folding at release

At release time, move each fragment into the `[Unreleased]` section of
`CHANGELOG.md` under the heading from the table above (as a `- ` bullet), then
delete the fragments. To list them grouped by type:

```bash
for t in added changed fixed removed docs; do
  echo "== $t"; for f in changelog.d/*."$t".md; do [ -e "$f" ] && sed '1s/^/- /;2,$s/^/  /' "$f"; done
done
# after copying them in:
git rm -q --ignore-unmatch 'changelog.d/*.added.md' 'changelog.d/*.changed.md' \
  'changelog.d/*.fixed.md' 'changelog.d/*.removed.md' 'changelog.d/*.docs.md'
```
