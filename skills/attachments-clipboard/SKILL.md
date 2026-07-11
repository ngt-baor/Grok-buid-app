---
name: attachments-clipboard
description: >
  Debug clipboard image paste, file attachments, MIME/size/path rules for Grok
  Build composer. Use for paste image fail, attach file, attachments:read-paths,
  clipboard:read-image.
---

# attachments-clipboard

## Code map

| Piece | Path |
|-------|------|
| IPC | `clipboard:read-image`, `attachments:read-paths`, `attachments:pick-files` |
| UI | composer attach / paste in `App.tsx` |

## Checks

| Case | Expect |
|------|--------|
| Clipboard PNG/JPEG | read-image returns data or clear empty |
| Pick files | paths readable under policy |
| Huge file | reject or cap with message |
| Path outside project | follow existing allow rules — no arbitrary FS exfil |
| Binary non-image | MIME handling / skip |

## Rules

- Do not write attachment bytes into git.
- Do not log full base64 in persistent logs.
- Prefer temp/read through main, not renderer Node FS.

## Verify

- Paste screenshot → appears in pending attachments → sends with prompt.
- Pick small text/image file → same.
