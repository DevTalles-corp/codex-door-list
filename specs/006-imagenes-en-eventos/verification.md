# Verification — event covers

## Scope and gates

- Active feature: `006-imagenes-en-eventos`.
- Requirements checklist: 16/16 checked. UX checklist: 0/38 checked; user explicitly authorized implementation despite this gate. Checklist files remain reviewer-owned and unchanged.
- Existing uncommitted changes in `plan.md` and `data-model.md` preserved.
- No extension configuration exists; no pre-implementation hooks registered.
- `.gitignore` and flat ESLint ignore configuration already cover the detected Node project. No Dockerfile, Terraform, Helm or Prettier configuration; private npm application, not a publishing package.

## Setup and foundation

- Node 24.19.0, Next 16.3.3, Supabase CLI 2.116.0, sharp 0.35.3.
- Context7 documentation consulted for Next Image/Route Handlers/server-only, Supabase signed uploads and local CLI, sharp decoding/orientation/timeouts.
- `npm install --save-exact sharp@0.35.3`: passed after authorized network escalation. Existing Next/React/Supabase versions preserved.
- Native sharp smoke decode: passed.
- `node tests/db/run-event-covers.mjs --setup-only`: passed with Storage enabled, own project/556xx ports and pre-cover synthetic fixture. Own project stopped successfully.
- Standalone `event-cover-fixtures.spec.ts`: 1 passed. Valid full static decode of JPEG/PNG/WebP, exactly 5,242,880-byte PNG and textual acTL; EXIF 1–8; full animated-container fixture decode. Generator is reproducible and also runs before cover suites.
- `node tests/db/run-event-covers.mjs --db-only`: initial foundation checkpoint passed 24 pgTAP assertions and identical historical business snapshots after upgrade. A previous invocation before test creation correctly reported NOTESTS; not counted as validation.
- Foundation `npx tsc --noEmit` and `npm run lint`: passed after correcting target-compatible BigInt syntax and auth union narrowing.

## Deployment boundary

Hosting scheduler (15-minute interval), native binary availability, operational duration limits and decoder concurrency must be verified on the selected hosting before deployment. No hosting or remote migrations have been configured during this implementation.

## US1 red phase

`node tests/db/run-event-covers.mjs --red-story` detected absent behavior: current-state GET 404 instead of 200; unauthenticated GET 404 instead of 401; browser reached Event editing but no cover selector existed. All three failures are feature failures, not setup failures. Disposable project stopped successfully.

## US1 implemented-path checks

- 30 pgTAP assertions passed, including existence of fenced upload functions and safe nullable public projections.
- Real Storage API tests: static JPEG/PNG/WebP, exact 5 MiB, textual acTL, disguised extension, EXIF 1–8 accepted; dimension limits, damage, GIF/SVG and one-/multi-frame PNG/WebP rejected while prior saved state remains identical. Durable replay/result and changed-payload conflict passed.
- Anonymous/other-owner/door-only and owner-loss-after-signing checks passed.
- First combined browser run identified browser FormData MIME mismatch. Corrected by creating an octet-stream Blob before signed upload; original filename is not sent.
- Repeated browser flow passed (7.5 seconds): independent save, general configuration draft preserved, same image/alt/position on both public surfaces, saved values after reopening editor.
- One earlier API run was interrupted by editing Next configuration during that run. It is not counted as a product failure or passing run; repeated stable-source API run passed.
- Cleanup persists a separate internal `transfer_uncertain` boolean on each candidate job so a worker's temporary error cannot erase transfer uncertainty. Tombstones are retained and reopened when late Storage records appear; no result/path evidence is purged on the basis of a timeout.

## Responsive and cleanup checkpoint

- Red layout tests rejected the old transparent agenda rows at both 375/1440px before card styles were implemented.
- Six selected integration tests passed after corrections: busy claim/202 and replay, browser credential bypass attempts, real cleanup and late staging recreation, public geometry at both widths, independent editor flow.
- Same-width/same-text bounds remained within 0.02 CSS px (subpixel representation) across horizontal/portrait/square/transparent/light/dark/dense/EXIF/absent covers on listing and registration. 16:9, margins, maximum width, full title and no horizontal overflow checked.
- Failed optimizer followed by failed original made exactly one request to each; image unmounted and reservation remained usable.
- Cleanup removed obsolete cover/staging, kept the current cover, reopened a completed tombstone for a late signed upload and removed it on retry. Local Storage represents not-found as HTTP 400 with `statusCode:404`; the test checks that semantic result explicitly.
- Lint ignores extended to generated Playwright artifacts to avoid enumeration races when Playwright clears test-results.
- At this intermediate checkpoint, complete email/ticket/QR/check-in variants and maintenance had not yet been verified; their passing results are recorded below.

## US3 and operational failure evidence

- Red maintenance API/browser run failed with PATCH 405 and disabled metadata-only save before implementing maintenance. Independent-session race helper detected absent `mutate_event_cover` before backend work. Cleanup cases cover already-implemented US1 cleanup; their definitive execution occurred after maintenance, rather than claiming a retrospective red failure for existing behavior.
- 49 pgTAP checks passed: historical backfill/new-Event trigger, coherence, exact dimensions/bytes, finite positions, normalized alternatives, actual owner RLS/grants, public projections, owner CAS, omitted metadata, clearing, immutable replay, stale revision, removal/no-op and cleanup enqueue.
- Independent PostgreSQL sessions with observed lock barriers passed B/C at one revision, replace/remove, position/replace, double finalization, expired native attempt token and total deadline. Old attempt due_at remains unchanged after lease reclamation.
- Real Storage cleanup passed uncertain absent object, late publication, injected delete 503, backoff, retry, expired worker fencing, Event/actor deletion and retained results beyond 24 hours. Actor deletion exposed an FK failure during the Event cascade; the actor-retirement trigger now detaches actor_id before Auth deletes its parent, preserving committed result and cleanup. Existing issued-Ticket deletion guard remains untouched.
- Fault proxy exists only in the isolated test process on localhost:3102. Download/publication/commit failures return owned 503/no-store, preserve saved state, and recover via the same operation. Actual publication followed by a 30-second response timeout leaves its candidate and transfer uncertainty intact; retry uses a fresh candidate. A dropped response after a real database commit is recovered through durable result and replay, with one increment. PATCH/DELETE failures preserve the prior state and retry with their original ID.
- Three decoder fault tests passed: resource exhaustion => retryable 503 with limitInputPixels=false; response timeout keeps the native slot until settlement; expired queued/total-deadline work never starts; genuine damaged data =>422. No pixel-count business ceiling is introduced. Operational production durations remain those in the shared configuration; short injected clocks are confined to decoder unit tests.
- Browser maintenance passed metadata-only keyboard Home/End, centered replacement without inheriting custom alternative, lost response recovery, removal and focus return to file selector. Removal retries retain the original operation ID; saving a separate draft cannot accidentally repeat a pending removal.

## Security and privacy review

- All cover tables have RLS. Browser JWTs can only SELECT their own cover through owner RLS; no ledger/jobs access, direct reference mutation, final upload or listing, or private staging read. Functions use an empty search_path and explicit schema names; internal execution is service-only. Public RPCs retain only their historical Event filters/order/availability plus the safe nullable cover projection.
- API verifies JWT/getUser and owner before constructing service client, then SQL reauthorizes under Event → Cover → Operation locks. Bodies cannot select actor, bucket, path or URL. Server and browser operation/object/lease identifiers use 32 cryptographically random bytes; paths contain no Event IDs, filenames or participant data.
- Signed staging tokens are returned only to the authorized preparer; tokens are absent from current/result/public projection and production logs. API errors contain only Spanish product copy and `{ error: string }`. Cover responses use private/no-store. Cleanup CLI logs counts only and exits nonzero for unresolved failure/deferred uncertainty.
- Exact configured protocol/host/port and final public bucket path are the Next Image allowlist; local-IP access is disabled in production. Final keys are immutable and stored bytes/MIME/hash are taken from actual full validation, never extension or browser MIME.
- Original bytes are limited during download, format containers parsed structurally, sharp decodes strictly and checks EXIF-oriented dimensions. Native concurrency and request/decode/total deadlines are bounded; pending native work retains its slot. Cover RPCs also use AbortSignal and the remaining processing deadline, so an external RPC cannot silently run outside the response budget.
- Cleanup registers a candidate before publication and never interprets an HTTP timeout or elapsed due_at as proof of completion. Uncertain jobs and path tombstones survive retries; late objects reopen done jobs. Active and still-committable paths are protected. Result retention is conservative and unbounded rather than prematurely purged.
- Migration/service mutation paths write only cover technical tables. Event publication, calendar, capacity, TicketTypes, reservations, Registrations, Tickets and door permissions are not changed by a cover operation. Historical business snapshots are identical immediately before/after upgrade.

## Final automated validation

| Command / scope | Result |
|---|---|
| `node tests/db/run-event-covers.mjs` | PASS: exact upgrade business snapshots, 49 pgTAP assertions, independent-session races, real cleanup/retention and 24 browser tests (3.1 minutes) |
| `node tests/db/run-event-covers.mjs --grep 'public covers\|editor preserves\|save optional\|maintain cover\|publish, register'` | PASS: 49 SQL checks/helpers and 8 affected browser tests (1.8 minutes) after the grouped card/loading corrections |
| `node tests/db/run-event-covers.mjs --no-screenshots --grep 'editor preserves\|US1\|US2\|US3 API'` | PASS: helpers/49 SQL assertions and 7 browser tests (30.4 seconds); editor control containment at every width/zoom and six capacity regressions after the functional zoom correction |
| `npx playwright test --config tests/unit/playwright.config.ts` | PASS: 3 decoder tests, including actual empty and +1-byte buffers as well as native-resource/deadline faults |
| `npm run lint`, `npx tsc --noEmit`, `npm run build` | PASS before visual review; repeated after the final contained-layout changes |
| `git diff --check` | PASS |

All runs use an isolated local project with Storage, synthetic pre-migration rows, localhost-only guards, independent sessions, captured email and teardown of their own project. No migration, fixture, email or deployment was sent to a remote service. The capacity and constitutional suites and all three complete reservation → email → confirmation → Ticket/QR → camera check-in variants passed. Camera HTTPS messages and development-only lazy listing LCP hints are development runtime messages; neither interrupted the tested flow. Registration's above-fold image now loads eagerly; listing remains lazy.

The invariant fixture passed after adding and replacing, then editing alt/position and removing: Event capacity 10, TicketType capacity 10, two Registrations (including a revoked Ticket), one valid pending reservation, consumption 3 and remaining 7. Event calendar/publication/public_code, Tickets, reservation rows and door grants remain identical. Immutable operation results replay without a second revision.

## Impeccable visual and interaction review

Reviewed the rendered surfaces against PRODUCT.md, DESIGN.md, the Door List UI references and the Impeccable polish/craft floor. One batched visual review covered desktop/mobile, normal/absent/loading/failed covers and the synthetic horizontal/portrait/square/transparent/light/dark/dense/EXIF matrix. One visual confirmation followed the grouped corrections. No further cosmetic passes were performed.

- Initial review found inherited generic `li` flex/border/padding made card widths depend on content. A scoped `.event-agenda > li` reset now fills equal grid tracks without inherited row separators; automated card-versus-track widths confirm it. Responsive image sizes account for sparse auto-fit groups.
- Above-fold registration imagery now uses eager loading; list thumbnails retain lazy loading. No loading or fallback state blocks reservation. Optimizer-only failure successfully recovers the original; double failure tries each once and unmounts the image.
- The final visual confirmation exposed an internal 200% zoom overlap despite a passing document scrollWidth check. Corrected bounded grid tracks and intrinsic min-widths, and used the editor's available width to collapse field columns. A separate **functional** check (no new captures/polish round) now compares every cover/general form control with its parent bounds, alongside height, focus, keyboard ranges and the capacity regressions. These checks passed. The named before-containment-fix capture is retained as defect evidence, not claimed as the final state.
- Cover bounds remain 16:9. At equal text/width, card/header/title/date/action bounds remain unchanged across image identities and delayed load, within 0.02 CSS px numerical representation only. Failed/absent/loading states keep the same geometry. Listing gutter is >=16 px and width <=1120 px; actions sit last; titles/venues stay outside imagery.
- Native labelled ranges expose percentage values and support Home/End. Focus ring is the system's 3px token; controls are >=44px (scaled to >=88 physical pixels under controlled CSS zoom 200%). Errors receive focus and use alert; progress/success use status; removal returns focus to selector. Draft survives validation/conflict and explicit refresh; general Event draft stays independent.
- Long unbroken title tested on both public surfaces at 375/700/1440. Editor tested at those widths and controlled CSS zoom 200%; child containment supplements whole-document overflow checks. No image transition or decorative motion was added; existing reduced-motion treatment is retained.
- Measured text contrast on canvas/surface: text 17.06/17.85:1, subtle 7.24/7.58:1, muted 4.55/4.76:1, priority date blue 8.34/8.72:1. Photography cannot reduce it because text and actions are outside the image.

The detector reported no deterministic issues on the edited surfaces; that result was supplemented by the rendered/interaction review and the real defects above. Validation is scoped to Chromium and the stated widths/fixtures, not a claim of certification across all browsers or assistive technologies.

The matrix generated 56 captures. Thirteen selected review captures are retained locally in the ignored `specs/006-imagenes-en-eventos/screenshots/` directory, including a `before-containment-fix` defect record. These images are not repository artifacts. The automated tests can regenerate the current visual matrix in the ignored `test-results/` directory; the historical defect capture is local evidence only.

| Requirement | Implementation / evidence |
|---|---|
| FR-001–002 | Owner-only API and transaction locks; door-only/other owner/anon rejected; publish/reserve without image in full check-in flow |
| FR-003–004 | Shared projection/component, same saved URL/position, custom/trim/null/derived alternatives, renamed title test |
| FR-005–006 | Durable recovery and preserved prior state; fault proxy/unit faults; real JPEG/PNG/WebP/exact bytes/EXIF, invalid/animated/damaged inputs and inclusive dimensions |
| FR-007–009 | Shared fixed 16:9 geometry; delayed/success/absence/double-failure bounds; neutral decorative symbol and no broken image |
| FR-010–014 | Equal white cards, date priority/action last, neutral tokens/contrast, 375/1440 grid/columns, keyboard/controls/focus, sober separate registration header |
| FR-015–016 | Exact business snapshot and numerical availability invariant; optional native crop ranges, metadata-only PATCH, centered replacement, persisted keyboard adjustment |
| SC-001 | Add/replace/remove/reopen, rejected/temporary failures preserve state; CAS winner and recovery |
| SC-002–003 | Automated 16:9 and unchanged bounds across identity/loading/absence/failure at both widths |
| SC-004–006 | Both public fallback states, no broken icon, normal/delayed/failed full reserve/check-in, widths/contrast/keyboard |
| SC-007 | Custom/blank/trim/clearing/replacement alternatives, derived current title after rename |
| SC-008 | Upgrade/business snapshots, 10/10 with consumption3/remaining7, no-cover publication and existing capacity/audit regressions |
| SC-009 | Actual codec decoding, exact 5 MiB, +1-byte/empty native rejection, independent minimums, animation containers including single frames |
| SC-010 | Same objectPosition/crop in both 16:9 consumers; native keyboard persistence; center/no inheritance; failed metadata preserves prior crop |

## Read-only checklist review

Both checklists were actually reviewed against the clarified spec, contracts and the evidence above. Markers remain unchanged as required by speckit-implement: requirements 16/16, UX 0/38 reviewer-owned. Implementation task completion is distinct from approval of requirements quality.

| UX items reviewed | Resolution / trace |
|---|---|
| CHK001–004 | UI contract explicitly defines editor hierarchy, optional help and all saved/draft/loading/failure states; implemented surfaces follow it |
| CHK005–008 | Indeterminate upload stages, server-confirmed durable success, centered native crop and neutral decorative marker are defined separately |
| CHK009–012 | Shared alt/crop projection, pinned design system, prior-state preservation and unchanged business semantics are consistent across stories |
| CHK013–016 | Spec measurable geometry/width criteria, system contrast, native keyboard and inclusive file/dimension matrix are verified |
| CHK017–021 | Cancel/discard/keyed Event preview cleanup, conflict/unknown-result recovery, locked conflicting controls and owner/session authorization are covered by contract, code review and tests |
| CHK022–027 | Actual formats/structural animation/EXIF/extreme ratio/alpha, normalized unrestricted alternatives, wrapping and reset/no-inheritance lifecycle follow spec |
| CHK028–033 | Labels/help/fieldset error association, order/focus/status/percentage values, 375/700/1440 and 200% control containment; marker is decorative and preview explicitly provisional |
| CHK034–038 | PRODUCT/DESIGN authority retained, bounded latency and recovery defined, cover save independent, effective alt distinct from marker, same normalized crop in both views |

Requirements checklist notes saying 12/16 and Q1–Q3 open are historical and stale. The spec's 2026-10-08 clarification is authoritative: Q1 JPEG/PNG/WebP static, inclusive 5 MiB and 640×360; Q2 16:9; Q3 cover crop centered by default with optional organizer adjustment. No unresolved spec/constitution conflict was found. Supabase Storage is a user constraint; the technical design stays in plan/contracts/migration.

## Operational work before deployment

Still requires the selected hosting: schedule the cleanup CLI every 15 minutes, securely load server variables, verify failure/alert/retry, native sharp binary and memory/concurrency, and API/worker duration limits. Configuration relationships are documented in README and checked in Node and SQL; per-attempt deadlines remain persisted across configuration changes. This implementation includes the worker and its local evidence, **not a configured remote scheduler or hosting validation**.

## Completion

All 45 implementation tasks are complete. Final lint/TypeScript, three decoder tests and production build passed after the control-containment correction. The final production client chunks contain none of the decoder, operational lease configuration, service-role variable or private cleanup markers searched in the bundle check. `git diff --check` passed. `.specify/extensions.yml` is absent at post-execution review, so no after_implement hook is registered. Existing user edits in plan/data-model and checklist markers remain preserved; no commit, remote migration or deployment was performed.

## E2E runner correction — 2026-10-12

The reported general run had 30 passes, one failure and one skip. Its retained
trace establishes that `/organizador` returned HTTP 500 before login: Next.js
`getNextFontManifest` called `loadManifest`, whose JSON parse failed with
`Unexpected end of JSON input`. The test then exhausted 120 seconds waiting for
the Email field. The trace does not establish what truncated the manifest.

The E2E server now uses `.next-e2e/dev`, separate from normal development's
`.next/dev` and production's `.next`. Its artifacts are ignored by Git and ESLint,
and its generated type paths are declared so Next.js does not rewrite tsconfig
on startup. The initial organizer navigation asserts the HTTP response before
looking for the login form. This preserves the original error status instead of
turning a server failure into a locator timeout; no retries or increased timeouts
were added.

`npm run test:e2e:full` runs the general suite, followed by the isolated cover
runner, stopping on failure. The general suite intentionally skips the Storage
fault case without the proxy. The isolated runner activates that proxy and
executes the case. Traces and attachments use `test-results/e2e` and
`test-results/event-covers`, preserving both runs' results.

| Validation | Result |
|---|---|
| `npm run test:e2e:full` — general suite | PASS: 31 passed, one expected proxy-only skip, 3.0 minutes |
| Same command — isolated cover suite | PASS: 24 passed, zero skipped, 3.0 minutes; the Storage fault/lost-response case passed |
| Same command — isolated database/helpers | PASS: 52 SQL assertions, upgrade snapshots, concurrency and cleanup checks |
| Registration → email → confirmation → Ticket/QR → camera check-in | PASS: absent, delayed and failed covers in both suites |
| Artifact isolation | E2E generated `.next-e2e/dev/server/next-font-manifest.json`; the normal `.next/dev` manifest retained its earlier modification time |
| `npm run lint`, `npx tsc --noEmit`, `git diff --check` | PASS after the configuration changes and E2E type generation |

The combined command exited successfully and stopped its disposable cover
project. No remote service or deployment was used. Production build and decoder
unit results above belong to the earlier validation; they were not rerun for this
runner-only correction.

## Repository artifacts and clean-checkout verification — 2026-10-12

The repository excludes the 34 generated cover fixtures (10,930,513 bytes) and
13 local review captures (1,876,094 bytes). The application icon and seven seed
PNGs (315,550 bytes) remain versioned. The seed requires those exact objects for
its references and integrity checks; they are development data, not production
uploads. Production build trace manifests contain none of the seed images,
generated fixtures or review captures.

Fixture generation now lives in `tests/e2e/generate-cover-fixtures.mjs` and is
re-exported by the typed actor helper. The database runner invokes it before the
cleanup helper reads `minimum.png`. A validation copy made from the Git file
inventory contained no generated fixtures or screenshots and reused only the
installed dependencies. Its direct `--db-only` run passed 52 SQL assertions,
upgrade snapshots, concurrency and cleanup, generating its own image inputs.

The first complete validation after this extraction passed the general suite
(31 passed, one expected proxy-only skip), but the isolated suite exposed a
separate camera restart race (23 passed, one failed). The trace showed the first
check-in succeeded and no second check-in request was sent. In qr-scanner 1.4.2,
`stop()` schedules stream release after 300 ms; destroying the scanner and
creating another on the same video lets that pending release stop the new stream.
The application now reuses its scanner between scans and destroys it on unmount.
Its decode callback uses the current validation handler. The regression performs
two consecutive re-scans and asserts a real HTTP 409 and the used-ticket state
for each, without fixed waits, retries or increased timeouts.

Additional completed checks: the isolated seed verification passed reset,
idempotence, dates, sold-out states, Tickets and all seven PNG downloads; three
decoder tests and three preflight tests passed; lint, TypeScript and the production
build passed. Local review captures remain available but are not linked as
repository-delivered evidence.

Final combined validation after the camera correction:

| Check | Result |
|---|---|
| `npm run test:e2e:full` — general browser suite | PASS: 31 passed, one expected proxy-only skip, 2.9 minutes |
| Same command — isolated browser suite | PASS: 24 passed, zero skipped, 2.8 minutes; includes Storage faults and every consecutive-scan regression |
| Direct clean-copy `node tests/db/run-event-covers.mjs --db-only` | PASS: 52 SQL assertions plus upgrade, concurrency and cleanup with generated image inputs |
| `node tests/db/run-seed.mjs` | PASS: reset, idempotence and all seven seed PNGs |
| Decoder and preflight unit suites | PASS: three decoder tests and three preflight tests |
| Lint, TypeScript, production build and staged whitespace checks | PASS |

The changes are grouped into the eight planned local commits plus one independent
camera lifecycle fix discovered during validation. Generated images and review
captures remain local and ignored. No push, remote migration or deployment was
performed.