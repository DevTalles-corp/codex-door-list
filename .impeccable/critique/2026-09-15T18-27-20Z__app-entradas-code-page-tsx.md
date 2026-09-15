---
target: app/entradas/[code]/page.tsx
total_score: 26
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 2
target_identity: "file:/Users/teddypaz/Desktop/door-list/app/entradas/[code]/page.tsx"
target_fingerprint: "sha256:d858c8061e5f11e2ed72dea3361bb84b98bcdb573b213ce0c5127a9fa2e9c054"
target_path: /Users/teddypaz/Desktop/door-list/app/entradas/[code]/page.tsx
timestamp: 2026-09-15T18-27-20Z
slug: app-entradas-code-page-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3 | Loading and ticket states exist, but loading is not a live status and does not preserve ticket geometry. |
| 2 | Match System / Real World | 4 | Clear Spanish ticket vocabulary and natural information order. |
| 3 | User Control and Freedom | 2 | Retry exists, but there is no safe exit or recovery path for an invalid link. |
| 4 | Consistency and Standards | 4 | Tokens, typography, states, responsive rules, and print behavior are cohesive. |
| 5 | Error Prevention | 3 | Invalid code format is rejected early; manual fallback remains error-prone. |
| 6 | Recognition Rather Than Recall | 3 | Details are visible, but the 64-character value is unlabeled and unexplained. |
| 7 | Flexibility and Efficiency | 1 | No copy/save accelerator, and mobile places five details before the QR. |
| 8 | Aesthetic and Minimalist Design | 3 | Clean and sober; email and full token add exposure and visual load. |
| 9 | Error Recovery | 2 | A service failure is headed “Entrada no encontrada,” contradicting the actual problem. |
| 10 | Help and Documentation | 1 | No valid-state instruction, invalid-link next step, or support path. |
| **Total** | | **26/40** | **Acceptable** |

## Design Specificity Verdict

**LLM assessment:** Cohesive, but only partially authored for Door List. The restrained palette, explicit states, monospaced identifier, dashed divider, QR, and ticket-shaped card support “La mesa de control.” The composition remains category-interchangeable, and its largest missed opportunity is operational specificity: on mobile, the QR follows five detail rows even though presenting it is the attendee’s primary task at the door.

**Deterministic scan:** The detector returned zero findings for `app/entradas/[code]/page.tsx`. This has a material scope limitation: the 18-line route wrapper delegates all rendered UI to `public-ticket.tsx`, and the detector did not establish transitive-import coverage. There were no reported false positives; the clean result carries false-negative risk.

**Visual overlays:** No reliable user-visible overlay is available. Browser automation exposed no browser providers, so mutable injection could not be preflighted. The fallback signal was a successful localhost HTTP response showing the server-rendered loading state plus direct source and responsive-order inspection.

## Overall Impression

The surface is trustworthy, quiet, and semantically strong. Its biggest opportunity is to behave like a credential used under pressure: status and QR should dominate, while secondary identity details and recovery data should recede.

## What's Working

- Ticket status never relies on color alone; text and semantic surfaces make valid, used, and revoked states explicit.
- The ticket anatomy is clean: one elevated card, semantic details, a titled QR, and restrained print behavior.
- Responsive behavior is intentionally simple and prevents overflow without ornamental distractions.

## Priority Issues

### [P1] The mobile order hides the primary door action

- **Why it matters:** Five detail rows precede the QR after the grid collapses, slowing presentation at the door.
- **Fix:** Place QR, state, and “Presenta este QR al ingresar” immediately after the heading on narrow screens; demote metadata below.
- **Suggested command:** `$impeccable adapt`

### [P1] Service failure is mislabeled as a missing ticket

- **Why it matters:** A temporary backend failure can make the attendee believe the credential is invalid.
- **Fix:** Use “No pudimos verificar tu entrada” for service failure and reserve “Entrada no encontrada” for a completed lookup with no record.
- **Suggested command:** `$impeccable clarify`

### [P2] Initial loading causes a structural and accessibility gap

- **Why it matters:** The final card is replaced by text and the dynamic status may not be announced reliably.
- **Fix:** Render a ticket-shaped skeleton, keep `aria-busy="true"`, and add a visually hidden `role="status"` message.
- **Suggested command:** `$impeccable harden`

### [P2] Secondary personal data competes with the credential

- **Why it matters:** Email and the full token increase visual load and privacy exposure without helping the normal scan.
- **Fix:** Keep attendee name and ticket type primary; move email and token behind “Ver datos de respaldo” or remove unnecessary fields.
- **Suggested command:** `$impeccable distill`

### [P2] The manual fallback code is not operationally usable

- **Why it matters:** A wrapped 64-character string cannot be compared, dictated, or entered quickly under pressure.
- **Fix:** Label it “Código de respaldo,” provide a copy action, and expose a short verification fragment if the model safely supports one.
- **Suggested command:** `$impeccable clarify`

## Persona Red Flags

**Casey — distracted mobile attendee:** The compact layout places details before the QR, offers no explicit instruction, and swaps the whole geometry during loading.

**Sam — accessibility-dependent user:** The QR has an accessible title and state is textual, but loading lacks `role="status"`; the fallback token has no semantic label or copy control; the failure heading is misleading.

**Jordan — first-time attendee:** The page never says what to show at entry, the raw token’s purpose is unclear, and a backend failure looks like an invalid ticket.

## Cognitive Load and Emotional Journey

Cognitive load is moderate: 3 of 8 checklist failures—chunking, visual hierarchy, and progressive disclosure. There are no decision points with more than four options. The valid state establishes trust but does not close the anxiety loop with a direct instruction. The deepest emotional valley is a service outage labeled as a missing ticket.

## Minor Observations

- `robots: { index: false, follow: false }` is a sound privacy default.
- Print styling is thoughtful, but there is no visible print or save action.
- `role="status"` on used/revoked copy is unnecessary when content is present on initial render.
- There is no route-level ticket loading geometry; initial data arrives after client hydration.

## Questions to Consider

- If the attendee has three seconds at the door, should anything appear before status and QR?
- What fallback should staff use when a phone cannot display or scan the QR?
- Does attendee email earn permanent visibility on a credential shown to strangers?
- Should used and revoked states explain what the attendee can do next?