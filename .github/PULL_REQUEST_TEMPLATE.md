Closes #

## What changed

<!-- What does this change and why? Keep it to the essentials. -->

## How you tested

<!-- The commands you actually ran and what they printed (pass counts, errors).
     For any render or generation flow you touched, attach a downloaded,
     ffprobe-valid MP4 (or the ffprobe output and a frame grab). A green spinner
     is not evidence. If you could not run something, say so. -->

```text
$ cd frontend && npm run lint && npm run build && npm test
...
```

## AI assistance

<!-- AI tools are allowed. Describe their use honestly; "none" is a fine answer.
     See "AI-assisted contributions" in CONTRIBUTING.md. -->

- Tools used (or "none"):
- What the tool did:
- What you did (tick all that are true):
  - [ ] I read and reviewed every line of the diff
  - [ ] I ran the tests listed above myself
  - [ ] I wrote some or all of the code myself
  - [ ] I can explain and answer review questions on every change

## Checklist

- [ ] Changelog fragment added in `changelog.d/` (or this PR doesn't need one: CI, tests only, typo)
- [ ] `cd frontend && npm run lint && npm run build && npm test` passes
- [ ] `php -l` passes on any changed PHP (backend only)
- [ ] No facades — every control ends in a real engine result (L1)
- [ ] No secrets committed; any new model's license recorded in `LICENSES.md` + `NOTICE` (L4)
- [ ] I agree to the [CLA](../CLA.md) and signed off (`git commit -s`)
