# Rolling three-month jobs cache — 2026-11-12

Extends the deployed two-month web implementation to previous/current/next calendar month (Europe/Prague), and adds the same rolling window to the native API-only SwiftUI client. No database migration or business-data conversion.

## Web/PWA

Uses the existing IndexedDB `job-list-cache-v1` read cache. Month summaries are fetched in complete, revision-fenced pages. Existing filters, paging fallback, account/grant/discipline scopes, startup manifest verification, 60-second freshness and background refresh remain. The new next-month copy is additive. Normal job reads outside the rolling window remain server-backed. Updated dependency URLs and Service Worker version ship together.

## Native iPhone source

`APIJobMonthCache.swift` stores three complete lean month snapshots in the existing AES-GCM encrypted, account/installation/grant/discipline-scoped vault. New optional `jobMonths` field preserves decoding of older vaults. Snapshots omit customer-contact phone/address payloads and garden notes; job work addresses remain usable.

On startup persisted IDs and exact versions are verified in batches through the existing workspace manifest API, with a final matching stamp. Changed/removed jobs invalidate the affected month before reuse. Standalone deployments without manifests do not reuse persisted months across a newly verified login. An unexpired existing offline session can use its previously authorized copy (maximum 24 hours).

Current/previous/next month/day/filter requests use complete stored snapshots immediately; stale copies refresh in the background. Cursor queries, unbounded lists, other months, mismatched disciplines and derived results above 500 rows retain server semantics. Snapshot fetching is bounded to 50 pages per month and refuses mixed revisions. Pull-to-refresh forces a server request. Status/report/reschedule acknowledgements patch read copies and mark them for refresh. Fences reject late responses across mutations/account changes. Permission denial removes read copies only. Drafts, outbox IDs, binary attachments and queued offline writes remain separate.

The SwiftUI jobs list shows the cached-copy timestamp, including offline use. No WebView UI introduced. Watch code is unchanged; existing phone-to-Watch data sharing is retained.

## Verification

- Web: all 76 test files passed; production-format Worker build validated in isolated SQLite/R2.
- Chromium integration: actual Worker, D1/R2 and IndexedDB; all three months including a real synthetic next-month visit served without another jobs-list request, cache reused after startup manifest fence, offline day card, unchanged isolated job, role/department separation and no routine identity polling.
- Native: seven changed Swift files parsed without syntax errors; 13 build-policy and 4 signing-policy tests passed.
- Six native XCTest regressions added: calendar/year boundary; filtering/ranking/lean payload; complete three-month download + repeat/offline/manual reads; restart version fence preserving draft/outbox; acknowledged reschedule/deletion; legacy decoding + encrypted persistence. Xcode execution is reported separately below; syntax parsing is not a native compile or a device test.

## Release status

Pending final site publication and GitHub native build result. Existing installed iPhone applications require a new successful native build and installation to gain this source change. Month caching stores job overview data; it does not automatically download every photo, PDF or full report. Those continue using their existing on-demand/offline mechanisms. Large or interrupted snapshot downloads safely keep server paging instead of treating partial data as complete.
