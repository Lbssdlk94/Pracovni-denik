# Visible job composer selection — 2026-11-13

The five work-preset buttons previously only called `autoFill`: no `aria-pressed` state or selected styling was set. Users could choose Realizace while all buttons still looked identical.

The existing composer now derives a single active choice from the actual `jobType` and title controls. Exact named service presets (Zazimování/Jarní spuštění) take precedence; otherwise the real type highlights Servis/Realizace/Zaměření even with a custom title. Active buttons retain a dark forest background, white text and an explicit check mark after focus/pointer changes. Screen readers receive `aria-pressed`. Existing manual-field overwrite confirmation and save path remain authoritative; declining autofill cannot leave a falsely selected button.

Selection is refreshed on input/change, restored drafts and reset. Existing filters, photo-category tabs and navigation already expose their own selected state and were left unchanged. Cached module/CSS/Service Worker versions update together. No backend, database, role, job data, SwiftUI or photo-pipeline changes.

Verification: real application + production Worker/D1/R2 browser scenario passes initial type, every preset, keyboard activation, direct dropdown change, custom title, declined autofill, draft close/restore, actual save and edit/reopen. Exactly one active choice, visible check mark, stable white-on-dark computed colors, minimum 44px targets and no horizontal overflow at 360/390/430/1440 CSS pixels. All records were synthetic and isolated. Offline-import cache test, existing planner tests and Worker artifact validation passed. No physical iPhone/Safari test.

Release status: pending final publication of the exact tested artifacts for Dr. Závlaha and Dr. Garden.
