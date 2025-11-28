# Implementation Plan

## Verification Snapshot (Functional Requirements)
- Authentication & Verification — Not implemented. Current flow is local-only (`src/contexts/AuthContext.tsx`), Firebase config is placeholder (`src/services/firebase/config.ts`), and no magic link/OTP, App Check, or domain enforcement beyond a naive validator.
- Role Selection — Partial UI only. Role is a local toggle (`useRoleStore`) with no persistence, trip lock, server source of truth, or routing guard.
- Ride Posting (Driver) — UI and client controller exist, but Firebase config is missing; no enforced preconditions, expiry, rate limits, or seat integrity on the backend.
- Ride Requests (Rider) — Not implemented. No request screen, holds/auto-decline, single-active-request guard, or cancellation flows.
- Matching Logic — Scoring helper exists but is unused; no backend trigger, feed wiring, or geospatial filters in production.
- Chat & Notifications — Stub screens/hooks; no messaging, push tokens, or notification triggers.
- Trip Execution — Not implemented. No start/complete flow, distance verification, fraud checks, or auto-timeouts.
- Reports & Suspensions — Not implemented. No reporting UI, rules, or auto-suspension logic.
- Driver Incentives — Placeholder badge only; no eligibility calculation or midnight reset.
- Driver Ratings — Placeholder hook/UI; no rating creation, aggregation, moderation, or UI gating.

## Work Breakdown (Pick-up-ready Tasks)

### Task 1: Firebase Auth + Domain Enforcement
- Done - Firebase email-link auth with SFU domain enforcement, App Check gating, and emulator coverage for success/failure/expiry.
- Goal: Deliver passwordless/OTP sign-in restricted to `@sfu.ca` (and allowlisted subdomains) with App Check and blocking functions.
- Pass if:
  - Non-allowlisted domains rejected client- and server-side; aliases allowed only for exact `sfu.ca`.
  - Magic link/OTP sign-in completes and persists session; tokens rotate; auth state restored on relaunch.
  - Blocking function enforces domain and normalizes email; App Check/reCAPTCHA required for sign-up.
- Tests:
  - Unit: email validator covers case/plus/punycode; link expiry fails after 15m.
  - Integration (Firebase emulator): sign-in success for `name@sfu.ca`; failure for `gmail.com`; reused/expired links fail.
  - Manual: offline attempt throttles sends; bounce handling shows retry.

### Task 2: User Profile Persistence + Admin Freeze
- Goal: Create and persist `/users/{uid}` with role defaults and status, and honor admin freeze.
- Pass if:
  - On first auth, profile saved with email, displayName/nickname, gender, roles `{driver:true,rider:true}`, activeRole, createdAt, lastLoginAt, status.
  - Freeze flag blocks feature access and role switching; banner shown.
  - Account deletion revokes tokens and removes profile (minus audit-safe ids).
- Tests:
  - Emulator: profile created/updated on login; frozen user rejected by Firestore rules/routes.
  - UI: frozen account sees banner and cannot access driver/rider actions.

### Task 3: Role Selection, Persistence, and Trip Lock
- Goal: Enforce first-run role selection, persist activeRole locally + in Firestore, and block switching during active trips.
- Pass if:
  - New users must choose a role before main nav; relaunch restores server role within 5s.
  - Role switch updates nav immediately and is mirrored in Firestore; server timestamp resolves multi-device conflicts.
  - Switching blocked when `hasActiveTrip==true` or status frozen; clear message shown.
- Tests:
  - Unit: role reducer handles cache vs server reconciliation.
  - Integration: multi-device switch last-write-wins; trip lock prevents switch.
  - Manual: deep link to Rider screen while Driver active prompts/blocks per rules.

### Task 4: Maps & Location (Google Maps API)
- Goal: Provide live maps for driver/rider discovery and trip tracking using Google Maps Platform, with secure key handling for Expo native and web.
- Pass if:
  - Google Maps SDK loads via `MapContext` on web; native uses Expo Location + static map/markers (or Maps SDK if enabled) with graceful fallback when offline.
  - API keys managed via env (no hardcoding); restricted to platform origins/package signatures.
  - Location bootstrapping refreshes cached location; errors surfaced via user-friendly banners; offline degrades to manual entry.
  - Map overlays render driver posts and rider pickups on Live Rides/Details screens; tap reveals post/request details.
  - Directions/Distance API callable from backend worker/Function for trip verification (used by Task 9) with retry/backoff.
- Tests:
  - Unit: Map loader mocked; context returns ready/error states; fallback path exercised.
  - Manual: SDK loads on web; native shows static map/placeholder with location dot; offline shows banner and manual inputs.
  - Security: Verify API key restrictions (HTTP referrers/package name/sha1) and quota alerts.

### Task 5: Ride Posting (Driver) with Expiry & Cooldowns
- Goal: Enable drivers to post live rides with window/seat limits, expiry, and rate limits tied to driver status.
- Pass if:
  - Preconditions enforced (`activeRole=driver`, `status=active`, `hasActiveTrip=false`); GPS permission gate with manual fallback marks origin approximate and allows map pin drop.
  - Post writes to Firestore with windowStart/end, seatsTotal/available, geohash, status `open`; auto-expire at window end via scheduler/function; map marker updates in feed/Live map.
  - Seat edits/cancel allowed only while open; overbooking prevented; max 3 active posts; rapid cancel cooldown applied.
- Tests:
  - Emulator: security rules block non-owners and invalid transitions; expiry job moves to `expired`.
  - UI: offline queue retries; manual origin flagged approximate; map marker visible; rapid edits resolve correctly.

### Task 6: Ride Requests + Holds (Rider)
- Goal: Riders can request a seat with 10m hold TTL, auto-decline, and single-active-request-per-campus guard.
- Pass if:
  - Request creates hold decrementing seatsAvailable; auto-decline after TTL or on driver cancel/expiry; acceptance promotes to booking.
  - One active request per campus enforced server-side; sending a new one auto-cancels prior pending.
  - Rider/driver cancellations restore seat and send notifications; map view updates marker states accordingly.
- Tests:
  - Emulator: concurrent last-seat requests grant first hold, reject second; holds TTL expire and release seat.
  - UI: stale list tap shows “no longer available”; map pins disappear on expiry; offline submit retries without duping.

### Task 7: Matching Service + Rider Feed
- Goal: Real-time feed of nearby open posts sorted by composite score (distance + window + reliability + rating).
- Pass if:
  - Matching job recomputes `matches/{riderId}.top` with score weighting; excludes suspended drivers, zero seats, expired windows.
  - Feed supports geohash prefix filtering (10km default) and updates within 5s of driver post changes; map overlays consume same feed.
  - Stale data labelled when >5m since server sync; offline cache shown with banner.
- Tests:
  - Unit: scoring function orders by score, then proximity, then recency.
  - Integration: geofence blocks out-of-radius rider; match sweep removes expired posts; map pins filtered by radius.
  - UI: feed shows at least one driver when present; cache banner displayed offline; map displays pins consistent with list.

### Task 8: Chat & Notifications
- Goal: Ride-scoped messaging with push notifications for requests/accept/decline/cancel and chat messages.
- Pass if:
  - Chat thread auto-created on accept; messages deliver <3s; typing offline queues locally until reconnect.
  - Push notifications fire for request events and new messages; in-app banner shown when push disabled.
  - Block/report disables messaging between users and hides thread.
- Tests:
  - Integration: Expo push tokens registered and stored; notification handler routes to thread.
  - UI: send message while offline queues and flushes; block prevents new messages.

### Task 9: Trip Execution & Verification
- Goal: Start/complete trips with location verification, fraud checks, and 24h timeout.
- Pass if:
  - Start requires driver near pickup (≤100m) and at least one rider confirmed; completion requires distance ≥500m (or rider confirmation) before marking verified; map shows live progress when available.
  - GPS loss handled with cached pings; spoof detection flags anomalies; trips auto-flag/incomplete at 24h.
  - Trip completion closes chat, triggers rating/incentive workflows, and syncs when rider reconnects.
- Tests:
  - Unit: verification rejects <500m; timeout job flags stale trips; Directions/Distance API mock validates call contract.
  - Manual: start too far from pickup blocked; live map shows position; offline completion retries until API returns distance.

### Task 10: Reports & Suspension
- Goal: Post-trip rider reports with auto-suspension at 3 unique riders in 30 days and admin override.
- Pass if:
  - One report per rider per trip; canceled trips excluded; reports older than 30d drop from active count.
  - Suspension flag blocks new posts/requests but allows current trip to finish; notifications to rider/driver/admin sent.
  - Admin dashboard can reinstate/reset counts with audit log.
- Tests:
  - Backend: distinct rider counting enforced; 3 unique reports trigger suspension; expired reports reduce count.
  - UI: report flow available only on completed trips; duplicate report blocked.

### Task 11: Driver Incentives (Parking Eligibility)
- Goal: Eligibility badge based on verified trips with riders, with midnight reset and sync retries.
- Pass if:
  - Completing a verified trip with ≥1 rider sets `parking_eligible=true` and `eligibility_date=today`; solo/canceled trips excluded.
  - Badge visible within 5m of completion; reset job clears at midnight; sync retries do not block badge display.
  - Notifications fire on eligibility; fraud-flagged trips skip incentives.
- Tests:
  - Integration: completion event toggles eligibility; midnight job clears flag.
  - UI: badge hidden on next day and for solo trips; resilience to backend outage (local badge + retry).

### Task 12: Driver Ratings
- Goal: Per-trip rating prompt for riders with aggregation, moderation, and visibility on driver profile/matching.
- Pass if:
  - Rating available only when trip completed and within 24h; one per rider per trip; optional feedback moderated/flagged.
  - Aggregates (avg, count) refresh within 5m and shown on driver dashboard and matching data.
  - Admin can hide/delete offensive feedback and recalculations apply immediately.
- Tests:
  - Unit: duplicate ratings rejected; late submissions blocked; average recalculates after delete.
  - UI: rating modal appears post-trip; offensive content filtered/hidden.

### Task 13: Observability & Security Hardening
- Goal: Telemetry, throttling, and rule coverage across critical flows.
- Pass if:
  - Firebase/App logs events: auth, role_switch, ride_post, request_send, message_send, trip_complete, fraud_flag, report_submit.
  - Rate limits: auth sends per IP/email, ride posts per driver, request spam throttled; alerts on error spikes; Google Maps API quotas monitored with alarms.
  - Security rules updated/tested for roles, status, seat mutations, and backend-only fields; CI runs emulator tests.
- Tests:
  - CI: `firebase emulators:exec` runs rules tests; Playwright covers auth→post→request→chat happy path.
  - Manual: throttling messages shown when limits exceeded; Maps quota alerting verified in staging.

### Task 14 (Optional): Redis Cache/Queue Layer for Backend Workers
- Do we need it? Not for the current Expo/Firebase-only stack or hackathon scope. Implement only if we introduce a Node/Cloud Run worker to handle high-throughput rate limits, TTL holds, and fast match recompute beyond what Firestore/Functions provide.
- Best insertion point: backend services that orchestrate holds/matching/notifications (e.g., future Cloud Run worker invoked by Functions triggers). No client changes; the React Native app continues to talk to Firebase APIs.
- Goal (if adopted): Centralize ephemeral state (seat holds, request rate limits, notification dedupe) with millisecond TTLs and atomic counters to reduce Firestore contention.
- Pass if:
  - Seat holds and request throttles are enforced via atomic Redis ops (SETNX + TTL, INCR + EXPIRE) and mirrored back to Firestore within SLA (<2s).
  - Matching worker can read/write match sets without hot-document contention; falls back to Firestore if Redis unavailable.
  - Redis outage degrades gracefully (no double-booking; operations fail closed with user-facing error).
- Tests:
  - Unit: rate-limit keys expire correctly; SETNX prevents double-holds; fallback path triggers on simulated Redis failure.
  - Integration (worker): end-to-end ride request → hold set → Firestore seat decrement; concurrent last-seat requests allow only one hold.
  - Resilience: kill Redis connection during load; verify errors surface and Firestore remains consistent.
