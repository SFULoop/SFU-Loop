# SFU Ride-Sharing App: Hackathon Project Requirements (24-Hour Build)

## Project Overview

A mobile-first ride-sharing platform for **SFU students** to find or offer rides between Burnaby and Surrey campuses. For the hackathon MVP, trips are based on **real-time availability** (who is offering/looking for a ride *now*) rather than semester schedules. Drivers can gain **incentives** such as reserved parking and discounted rates. Future (V2) features may include AI-assisted route optimization and schedule-based planning.

---

## Core Goals (Hackathon MVP)

* Enable SFU students to log in with **@sfu.ca emails** and access ride-sharing features.
* Allow drivers to post **real-time availability** and riders to request rides.
* Implement basic matching: rider posts → nearby drivers notified.
* Support **chat & notifications** for coordination.
* Display **driver incentives** (reserved parking eligibility placeholder).
* Ensure basic safety: verification, report/block, reliability tracking.

---

## Functional Requirements (MVP)

### 1. Authentication & Verification (Firebase/GCP-backed)

* **Auth Provider (MVP):** **Firebase Authentication (Google Cloud/Firebase)** using **Email Link (passwordless)** or **Email OTP**. Restrict sign-ups to `@sfu.ca` domains. Cheapest & fastest for hackathons (generous free tier).
* **Alt (only if needed):** Google Identity Platform (GCP-managed version of Firebase Auth) or **Supabase Auth** (free tier, Postgres-based). Use only if Firebase limits block needed flows (e.g., self-hosted DB coupling).

#### Functional Requirements

* **Email Domain Restriction:** Only `@sfu.ca` (and approved subdomains like `@cs.sfu.ca` if applicable) can complete sign-up.
* **Passwordless Flow:** User enters email → receives magic link/OTP → tapping link completes sign-in in app.
* **Session Management:** Persist session securely; refresh tokens auto-rotated.
* **Optional Step-Up:** For sensitive actions (e.g., incentive claim), require recent login (re-auth) or 6‑digit OTP.
* **Basic Profile:** Store UID, name, photo (optional), primary role, createdAt, lastLoginAt.
* **Abuse Protection:** reCAPTCHA/DeviceCheck for sign-up; request throttling; disposable-email blocklist.

#### Acceptance Criteria (Pass/Fail)

* **Pass:**

  * Non-`@sfu.ca` emails are rejected at submit with clear message.
  * `name@sfu.ca` receives magic link/OTP; completing the link signs in and creates user profile.
  * Session persists across app restarts; user lands on role dashboard.
  * Recent-login required is enforced before viewing/claiming incentive badge.
* **Fail:**

  * Gmail/Yahoo addresses can sign up.
  * Expired magic link still signs in.
  * Users bypass domain restriction via alias/plus addressing.
  * Incentive screen accessible without re-auth in last 5 minutes.

#### Edge Case Test Matrix

* **Aliases & Plus-Addressing:** `user+tag@sfu.ca` allowed **only if** domain is exactly `sfu.ca`. Reject look‑alike domains (e.g., `sfu.co`, unicode homographs).
* **Subdomains:** If permitted (e.g., `@cs.sfu.ca`), maintain explicit allowlist. Tests for each subdomain.
* **Forwarders:** If user forwards from `@sfu.ca` to personal inbox, rely on original address entry; do **not** accept reply‑to domains.
* **Case Sensitivity:** `User@SFU.ca` should pass; normalize to lowercase for storage and matching.
* **Link Expiry:** Magic links expire in ≤15 minutes; verify server‑side timestamp. Test expired/used‑twice links (must fail on reuse).
* **Multi‑Device:** Opening the magic link on a different device than requested → require fallback (enter code) or deep link with cross‑device session; ensure only one session created.
* **Rate Limits:** Max N sign-in attempts per 15 minutes per IP/device/email. Exceeding shows friendly throttle message.
* **Bounced/Undeliverable:** Detect SMTP hard bounces; show alternative contact/help.
* **Network Offline:** Show retry/backoff; prevent multiple OTP sends while offline.
* **Account Deletion:** User can delete account; tokens revoked; PII purged except audit-safe ids.
* **Admin Overrides:** Admin can freeze user → sign-in allowed but access to core features blocked with banner.

#### Detailed Implementation Plan (No Code)

1. **Firebase Project Setup**

   * Create Firebase project (or via GCP). Enable **Authentication → Email Link (passwordless)** and **Email/Password** (optional for fallback OTP). Enable **App Check**.
   * Set **Authorized domains** to app links (Expo/production), and configure **Dynamic Links** for magic link deep linking.
2. **Domain Enforcement**

   * Client validation: regex match on `@sfu.ca` (and allowlisted subdomains).
   * Server enforcement: Cloud Function **beforeCreate** (Blocking functions) to reject non-allowlisted domains; normalize email to lowercase.
3. **User Profile Creation**

   * On first sign-in, create `/users/{uid}` with: email, domain, displayName, photoURL, roles:["rider"], createdAt, lastLoginAt, status:"active", flags:{verified:true}.
   * Set **Custom Claims**: `{ campusUser:true }` for Rules gating.
4. **Security Rules**

   * Firestore Rules: only owner can read/write their user doc; admins (role claim) can moderate; deny access if `status != "active"`.
   * Storage Rules: restrict uploads to `/users/{uid}/...` with size/type limits.
5. **Step-Up / Recent Login**

   * Gate incentive claim and admin actions with `auth.token.auth_time >= now() - 300` (recent 5 minutes). Trigger re-auth if stale.
6. **Abuse & Fraud Controls**

   * Enable reCAPTCHA/App Check for sign-in requests.
   * Block disposable domains and look-alike punycode (server-side validation).
   * Log sign-in IP/device fingerprint (hashed) for abuse analysis; comply with privacy policy.
7. **Observability**

   * Enable Firebase Analytics events: `login`, `signup`, `auth_error`, `reauth_required`.
   * Crash reporting on auth screens; alerting for spikes in `auth_error`.
8. **Pricing Considerations**

   * Firebase Auth free tier typically covers hackathon usage; Firestore pay‑as‑you‑go minimal for MVP. Monitor read/write costs; cache profile in memory.
9. **Admin Tools (MVP-lite)**

   * Create an **Admin** flag in user doc; simple web console page to freeze/unfreeze accounts and view reports.

#### Test Scenarios (Must Pass)

* Sign-up with `student@sfu.ca` → success; role dashboard shown.
* Sign-up with `student@gmail.com` → clear error; no account created.
* Magic link used twice → second attempt fails with "link already used/expired".
* Open magic link on a different device → still completes sign-in via deep link, creates only **one** session.
* Incentive claim without recent login → app asks to re-auth.

---

### 2. Role Selection (Multi-role, session-persistent)

#### Functional Requirements

* **Multi-role account:** Every user can have both roles enabled (Driver, Rider); one **active role** at a time controls the dashboard and available actions.
* **First-run selection:** After auth, user must choose an initial role; show short explainer for each role.
* **Session persistence:** Active role is stored on the user profile and restored on app launch.
* **Fast switching:** User can switch role from the header toggle or settings; switching updates navigation state immediately.
* **Role gating:** Feature visibility is derived from active role:

  * **Driver:** Post Ride Now; Manage Active Rides; View Requests; Incentive badge.
  * **Rider:** Find Ride Now; My Requests; Matched Drivers.
* **State safety:** If a user is in an **ongoing trip** as Driver, switching to Rider is disabled until trip completes (and vice versa) to prevent state conflicts.
* **Admin/Frozen status:** If account is frozen, role switching is blocked; show banner with reason.

#### Acceptance Criteria (Pass/Fail)

* **Pass:**

  * On first login, user must pick Driver or Rider before proceeding.
  * App returns to the previously selected role after restart; correct dashboard loads.
  * Switching roles updates bottom tabs/menus instantly; no access to the other role’s actions.
  * Switching is blocked during an active trip; user sees a clear message.
* **Fail:**

  * Role defaults unpredictably on restart; or wrong dashboard loads.
  * User can start a Rider request while they have an active Driver trip (or vice versa).
  * Frozen accounts can still toggle roles and access core actions.

#### Edge Case Test Matrix

* **No prior role set:** New user bypasses selection → must be redirected to role chooser; cannot access main nav until selected.
* **Offline at launch:** App uses last-known role from secure local cache; once online, reconciles with server; conflicts resolved in favor of server.
* **Stale cache:** Cached role differs from server (changed on another device) → on resume, UI switches to server role without crash; show one-time toast.
* **Multi-device switching:** User switches to Driver on phone, Rider on tablet within 60s → server is source of truth; last write wins; ensure no mixed UI states.
* **Active trip lock:** Attempt to switch roles during onboarding of a trip (between Accept and Start) → blocked with message: "Finish or cancel your current trip to switch roles."
* **Deep link routing:** App opened via deep link to a Rider screen while active role is Driver → app prompts to switch; if active trip, deny and show reason.
* **Accessibility:** Role toggle is reachable via screen reader; clear labels; large tap target.
* **Admin demotion:** Admin removes Driver eligibility flag (e.g., due to reports) while user is Driver → app forces switch to Rider and shows banner.

#### Detailed Implementation Plan (No Code)

1. **Data Model**

   * `users/{uid}`: `roles: { driver: true, rider: true }`, `activeRole: "driver" | "rider"`, `status: "active" | "frozen"`, `hasActiveTrip: boolean` (derived server-side).
   * Optional: `roleOnboarding: { driverDone: boolean, riderDone: boolean }` for tooltips.
2. **Role Guard & Router**

   * Central **RoleGuard** reads `activeRole` and conditionally mounts role-specific navigators; listens to server changes.
   * Guard enforces **trip lock**: if `hasActiveTrip == true`, prevent switching and surface explanatory UI.
3. **Persistence & Consistency**

   * On switch, update Firestore user doc and local cache atomically; use optimistic UI with rollback on failure.
   * Include `updatedAt` for last role change; server resolves multi-device conflicts by latest timestamp.
4. **Security Rules**

   * Firestore Rules ensure users can only write their own `activeRole` if `status == "active"`.
   * Deny writes to `activeRole` when `hasActiveTrip == true` (mirror via Cloud Function to prevent client bypass).
5. **Trip Lock Source of Truth**

   * Cloud Function updates `users/{uid}.hasActiveTrip` whenever a trip moves into `accepted|started` and clears on `completed|canceled`.
6. **Admin Controls**

   * Admin can set `roles.driver = false` for disciplinary action; app auto-falls back to Rider with banner.
   * All changes are audited.
7. **Analytics & Observability**

   * Events: `role_select_first`, `role_switch`, `role_switch_blocked_active_trip`, `role_switch_error`.
   * Monitor crashes on role-boundary screens; alert on spikes.

#### QA Scenarios (Must Pass)

* First login → choose Rider → app shows **Find Ride Now** dashboard; relaunch app → same dashboard persists.
* Start a Driver trip → attempt to switch to Rider → blocked with clear message; post-trip, switching allowed.
* Switch roles on device A; device B refreshes and reflects new role within 5 seconds without visual tearing.
* Admin freezes account → role toggle disabled; banner shown.

#### Document-wide Consistency Updates

* **Section 3 (Ride Posting - Driver):** Add precondition: `activeRole == "driver"` and `hasActiveTrip == false` to post; UI entry point from Driver dashboard.
* **Section 4 (Ride Requests - Rider):** Add precondition: `activeRole == "rider"` and `hasActiveTrip == false` to request; requests auto-cancel if user switches roles.
* **Section 5 (Matching Logic):** Matching queries must use `activeRole` to select index/collection (drivers vs riders) and ignore users with `hasActiveTrip == true`.
* **Section 6 (Chat & Notifications):** Conversation creation is role-scoped; prevent cross-role chats during active trip; notification copy reflects the active role.
* **Section 7 (Trip Execution):** Trip lifecycle updates `hasActiveTrip`; switching roles is disabled until trip completes or cancels.
* **Section 9 (Driver Incentives):** Eligibility checks only evaluate when `roles.driver == true`; incentive UI appears only on Driver dashboard.
* **Non-Functional:** Add requirement for **multi-device consistency** with server as source of truth; include latency SLO (<5s) for cross-device role sync.

### 3. Ride Posting (Driver)

#### Existing Feature (kept)

* **Feature:** Drivers tap "Post Ride Now" → enter origin, destination campus, seat count.
* **Pass:** Ride posted, visible to riders within radius (≤10km).
* **Fail:** Ride posts not visible, or multiple riders overbook beyond seat count.

#### Additions (necessary for real-time plan + safety)

* **Preconditions:** `activeRole == "driver"`, `hasActiveTrip == false`, account `status == "active"`.
* **Location:** Driver must grant foreground location permission to post (to compute distance for matching). If denied, show rationale and allow manual origin entry with reduced match accuracy.
* **Direction & Destination:** Destination is restricted to **SFU Burnaby** or **SFU Surrey** campus options in MVP to simplify matching and demo.
* **Availability Window:** Each real-time post includes a **departure window** (e.g., leave in 0–20 minutes). Posts auto-expire after the window.
* **Seat Integrity:** Seats are soft-held upon incoming request and decremented on accept; holds auto-expire after 10 minutes if not accepted.
* **Edit/Cancel:** Driver can edit origin, window, or cancel an open post until a trip is started; edits trigger re-match.
* **Spam/Rate Limit:** Limit to **max 3 active posts per driver**; repeated cancels within 10 minutes trigger a cooldown.

#### Acceptance Criteria (Pass/Fail)

* **Pass:**

  * Post appears to riders within configured radius and direction; disappears on expiry or when seats reach 0.
  * Accepting a rider decrements available seats; second rider cannot overbook beyond seat count.
  * Canceling a post notifies pending requesters and releases held seats.
* **Fail:**

  * Multiple riders can be accepted into the same final seat.
  * Expired posts still appear in search or accept new requests.
  * Driver can post while already in an active trip.

#### Edge Case Test Matrix

* **Location Off/Approximate:** Driver denies GPS → manual pin allowed; clearly mark result as "approximate" and still match by radius.
* **Rapid Edits:** Driver changes seat count from 2→1 while two requests pending → oldest accepted, others auto-decline with message.
* **Network Loss:** Post succeeds locally then fails server-side → optimistic UI rolls back and informs the driver.
* **Device Clock Skew:** Departure window validated server-side; posts with past windows are rejected.
* **Abandonment:** Driver closes app after posting → post persists until expiry; notifications still deliver.
* **Duplicate Posts:** Same origin/destination/window posted twice → backend dedup by hash (origin+dest+window within ±3 min) to avoid clutter.
* **Abuse:** Repeated mass-cancel (>3 in 30 min) triggers auto-cooldown and flags account for admin review.

#### Data Model & Rules (No Code)

* **`ridePosts/{postId}`**: `driverId`, `origin{lat,lng,label}`, `destinationCampus`, `seatsTotal`, `seatsAvailable`, `windowStart`, `windowEnd`, `status:"open|expired|canceled|inTrip"`, `createdAt`, `updatedAt`.
* **Security Rules:** Only owner can edit/cancel open posts; writes blocked when `status != "open"`. Server sets `status` transitions.
* **Indexes:** Composite index on `(destinationCampus, windowStart DESC)` and geo-index (radius queries via geohash) for rider search.

#### Implementation Plan (No Code)

1. **Post Ride Sheet:** Origin picker (map + search), destination campus selector, seats stepper, departure window picker.
2. **Validate & Create:** Client validation → create post; subscribe to seat count and status changes to update UI in realtime.
3. **Hold Logic:** On rider request, create `hold` with TTL 10 minutes; if driver accepts → convert to `booking`; if TTL expires → release seat.
4. **Expiry Job:** Cloud scheduler/function converts `open` posts to `expired` at `windowEnd`.
5. **Notifications:** On request, on accept/decline, on cancel, on expiry.

#### Scheduled Rides (Tab) — **Re-scoped to Stretch/V2**

> **Rationale for change:** The current plan prioritizes real-time availability for a 24-hour MVP. Keeping scheduled rides as a stretch goal avoids over-scope while preserving your design for later.

* **New Tab:** *Schedule Ride / Drive* (hidden by default in MVP; behind a feature flag for demo if time allows).
* **Driver Flow:** As provided (date/time, origin/destination, seats, cost-share/free, pickup radius). Minimal validation; stored in `scheduledRides/`.
* **Rider Flow:** As provided (browse & filter upcoming rides, request seat, approval/auto-accept, reminders).
* **Trip Lifecycle Additions:** Edit/cancel before departure; reminders; auto-expire unconfirmed holds **12 hours** before.
* **Constraints for V2:**

  * Reserve capacity with holds that **do not** block real-time posts unless time windows overlap.
  * Conflict resolution: scheduled ride starting within 30 minutes of an active real-time trip is blocked.

---

### 4. Ride Requests (Rider)

#### Functional Requirements

* **Discoverability:** Tap **Find Ride Now** to see nearby **open** driver posts bound for the selected campus, sorted by distance and soonest window.
* **Filters:** Campus (Burnaby/Surrey), max distance (default 10km), leaving window (e.g., now/15/30 min), min driver rating.
* **Request Flow:** Select a post → choose pickup method (map pin or meet-point) → send request. Request creates a **seat hold (10 min TTL)** on the driver’s post.
* **Approvals:** Driver approves/declines; auto-decline on TTL expiry. If driver enabled **auto-accept** and seats available, booking confirms instantly.
* **Multiple Requests:** Rider can have **one active request per campus at a time** to prevent double-booking; sending a new request auto-cancels the previous pending one.
* **Cancellation:** Rider can cancel pending/confirmed booking before trip start; seat returns to pool and notifications fire.

#### Acceptance Criteria (Pass/Fail)

* **Pass:**

  * Nearby valid posts display within 2 seconds of opening the screen.
  * Sending a request reduces `seatsAvailable` by creating a hold; acceptance converts to booking and persists across app restarts.
  * Auto-decline triggers after 10 minutes if no driver action; rider sees status update.
* **Fail:**

  * Rider can maintain multiple confirmed bookings for overlapping times in the same direction.
  * Requests remain pending after driver cancels/expires the post.
  * Requests can be sent to posts with `seatsAvailable == 0`.

#### Edge Case Test Matrix

* **Stale List:** Driver cancels after list load → item disappears; tapping shows "This ride is no longer available".
* **Race Conditions:** Two riders request the last seat simultaneously → first hold wins; second gets immediate "no seats left".
* **Geofence:** Rider outside max radius tries to request → blocked with message; changing radius allows.
* **Location Denied:** Rider denies location → allow manual pickup point; warn that ETAs may be inaccurate.
* **Push Disabled:** If rider disabled notifications, show in-app banner to refresh status; pull-to-refresh updates state.
* **No-show Protection:** >2 rider no-shows this week → soft-limit: can request but requires driver approval (auto-accept disabled).
* **Deep Link:** Opening a shared ride link respects current `activeRole`; prompt to switch to Rider if needed; block if active trip lock.

#### Data Model & Rules (No Code)

* **`rideRequests/{requestId}`**: `postId`, `riderId`, `status:"pending|accepted|declined|expired|canceled"`, `createdAt`, `ttl`.
* **`bookings/{bookingId}`**: `postId`, `riderId`, `driverId`, `pickup{lat,lng,label}`, `status:"confirmed|canceled|completed"`.
* **Rules:** Riders can only create one `pending` per campus; server enforces hold TTL; only participants can read booking details.

#### Implementation Plan (No Code)

1. **Search Screen:** Query geo-indexed `ridePosts` where `status==open`, `destinationCampus==selected`, and `windowEnd >= now`.
2. **Request CTA:** On tap, create `rideRequests` + hold; update UI to "Pending"; subscribe to status.
3. **Accept/Decline:** Driver action converts hold to `booking` or releases seat; notify both parties.
4. **Refresh & Offline:** Background listener updates list; offline shows cached results with stale badge; actions queue and reconcile on reconnect.
5. **Safety Copy:** Remind to meet at well-lit meet points; provide quick-report button.

#### QA Scenarios (Must Pass)

* Rider requests last seat → driver accepts → booking appears in **My Rides**; seat count decrements and post hides when full.
* Rider sends request then hits back → returns to list with status **Pending**; after 10 min with no response, request auto-expires.
* Rider outside radius increases filter to 15km → valid posts appear; request proceeds.

#### Document-wide Consistency Updates (from Sections 3 & 4)

* **Section 5 (Matching Logic):** Incorporate **seat holds** and **window expiry** into scoring/filters; exclude posts with `windowEnd < now` or `seatsAvailable == 0`.
* **Section 6 (Chat & Notifications):** Add events for `request_created`, `request_expired`, `booking_confirmed`, `post_canceled`; chat threads attach to `bookingId`.
* **Section 7 (Trip Execution):** Define transition from `booking.confirmed` → `trip.started` when driver taps Start and rider checks-in (optional); clearing all holds.
* **Section 9 (Incentives):** Eligibility counts **completed trips** (bookings marked completed), not just posts/requests; no credit for expired/canceled.
* **Hackathon Scope:** Keep **Scheduled Rides** behind a feature flag; only enable if core real-time flow is stable.
  Ride Requests (Rider)
* **Feature:** Riders tap "Find Ride" → see nearby active drivers heading same direction.
* **Pass:** Rider can request; driver receives push notification.
* **Fail:** Rider requests ignored due to backend not propagating.

### 5. Matching Logic (Real-time, Reliability-aware)

#### Functional Requirements

* **Objective:** Pair riders and drivers in real time based on proximity, direction, timing window, and reliability metrics.
* **Trigger Points:** Matching occurs whenever:

  1. A driver posts a new ride.
  2. A rider searches for rides.
  3. A rider modifies filters.
  4. A driver edits their post (origin/time window/seat count).
* **Primary Filters:**

  * Driver `status == open`.
  * Driver `windowEnd >= now`.
  * Driver destination campus == rider campus.
  * Rider within driver pickup radius or route path.
  * Driver `seatsAvailable > 0`.
* **Scoring Factors:**

  * `timeDelta` (difference between rider requested time and driver window start) → 40%.
  * `geoDistance` (rider pickup vs driver origin) → 35%.
  * `driverReliability` (completed/attempted trips) → 15%.
  * `driverRating` (average star rating) → 10%.
* **Sorting:** Descending composite score; tie-break by proximity.
* **Pagination:** Return top 10 per query; allow infinite scroll to next set.
* **Realtime Updates:** If a post expires, fills, or cancels, it disappears from search within 5 seconds.

#### Acceptance Criteria (Pass/Fail)

* **Pass:**

  * Valid posts appear for eligible riders within ≤2s of query.
  * Matching prioritizes drivers by proximity/time correctness.
  * Removing/changing driver post instantly removes it from visible results.
  * Ride requests blocked for expired or full posts.
* **Fail:**

  * Expired/canceled posts still show up.
  * Riders see opposite direction trips (e.g., Burnaby→Surrey when searching Surrey→Burnaby).
  * Matching list ordering not updated when driver reliability drops.

#### Edge Case Test Matrix

* **Geo Radius Edge:** Rider exactly at radius boundary → include with inclusive condition (≤ radius).
* **Clock Drift:** Rider device clock ahead 2 min → server uses authoritative timestamp; results unaffected.
* **Concurrent Requests:** Multiple riders match same driver simultaneously → seat holds enforce correctness; no double-book.
* **Low Supply:** No matches → fallback UI shows retry prompt and encourage posting as driver.
* **High Supply:** 50+ drivers in area → return paginated 10-per-page sorted by score.
* **Data Staleness:** Server detects >30s stale geo updates → mark driver unavailable until refreshed.
* **Offline Recovery:** Rider offline → last cached results displayed with stale badge; retry button refreshes.
* **Campus Swap:** Rider switches campus mid-search → immediately triggers new query; old results cleared.
* **Rate Limiting:** Prevent more than 10 search queries per 30s per user to protect quota.

#### Data Model & Security (No Code)

* **Indexes:**

  * `ridePosts` indexed by `destinationCampus`, `windowStart`, and `geohash`.
  * Secondary index for `driverReliability` and `driverRating`.
* **Firestore Rules:** Only server reads composite scores; client fetches public post subset.
* **Server Function:** Cloud Function listens for new/edited posts and updates match cache for top N riders in radius.

#### Implementation Plan (No Code)

1. **Geo Indexing:** Use geohash for driver origin; store with 6–8 char precision for ~1km radius accuracy.
2. **Realtime Sync:** Subscriptions on `ridePosts` where `status == open` and within geohash bounds.
3. **Score Calculation:** Cloud Function computes scores and stores in ephemeral cache (`matches/{riderId}`).
4. **Staleness Cleanup:** Scheduled cleanup every 5 minutes for expired matches.
5. **Pagination API:** Query offset via timestamp and distance cursor.
6. **Testing Hooks:** Log top match deltas and track fairness (no single driver dominating results).

#### QA Scenarios (Must Pass)

* Rider at Burnaby posts search → sees only Burnaby-bound open posts within radius and time window.
* Driver cancels → ride disappears from rider view instantly.
* Two riders request last seat → one confirmed, other gets immediate no-seat message.
* Driver reliability drop (low rating) → next search shows them ranked lower.

---

### 6. Chat & Notifications (Realtime Messaging & Alerts)

#### Functional Requirements

* **Purpose:** Enable communication and updates between drivers and riders tied to requests and bookings.
* **Scope:** Chat threads exist **only** for matched pairs (pending, accepted, or ongoing trips).
* **Notifications:** Push notifications triggered for all status changes (request, accept, decline, cancel, reminder).
* **Realtime Chat:**

  * Messages stored under `conversations/{bookingId}/messages/{messageId}`.
  * Lightweight chat with typing indicator (optional) and timestamp.
  * Only driver and rider can access their thread.
* **Push Events:**

  * `request_created`: notify driver.
  * `request_accepted`: notify rider.
  * `trip_start`: notify both.
  * `trip_reminder`: 20 min before departure.
  * `trip_canceled`: notify all participants.

#### Acceptance Criteria (Pass/Fail)

* **Pass:**

  * New messages deliver to both participants <3s.
  * Notifications fire on all lifecycle events; duplicates avoided.
  * Only matched users can open chat thread.
  * Muting notifications silences pushes but still allows in-app view.
* **Fail:**

  * Message delay >5s or lost messages.
  * Notifications repeat multiple times or go to wrong user.
  * Unmatched users can message each other.

#### Edge Case Test Matrix

* **Offline Messaging:** Sending while offline queues message; delivers on reconnect.
* **Expired Booking:** Chat disabled once trip marked completed/canceled; archived read-only.
* **Multi-device:** Message sent on phone visible instantly on tablet; ensure single source of truth via Firestore listeners.
* **Push Disabled:** If user disabled OS notifications → fallback to in-app banner when next opened.
* **Blocked User:** Messages blocked in both directions; prior chat archived.
* **Abuse Reporting:** User reports message → flagged to admin; sender’s chat access frozen pending review.
* **Typing Race:** Two messages sent simultaneously appear in correct chronological order.
* **Deleted Account:** All user chats anonymized; historical logs retained for moderation.

#### Data Model & Rules (No Code)

* **`conversations/{bookingId}`**: participants:[driverId,riderId], `status:"open|closed"`, `lastMessage`, `updatedAt`.
* **`messages/{messageId}`**: senderId, text, timestamp, delivered(bool).
* **Security Rules:** Read/write only if `auth.uid` in participants; writes denied when conversation.status == closed.

#### Implementation Plan (No Code)

1. **Messaging Backend:** Firebase Firestore + FCM for push delivery; enable offline persistence.
2. **Notification Routing:** Cloud Functions trigger on Firestore writes (e.g., `rideRequests`, `bookings`, `trips`) to send FCM payloads.
3. **Mute/Unmute:** User preference stored in `users/{uid}/settings.notifications`.
4. **Archiving:** Trip completion triggers chat closure; conversation retained 30 days then purged.
5. **Admin Oversight:** Admins can view reported conversations via moderation dashboard.
6. **Analytics:** Events: `message_send`, `notification_push`, `push_fail`, `report_chat`.

#### QA Scenarios (Must Pass)

* Driver receives push notification within 3s of rider request.
* Message typed by rider appears on driver screen instantly.
* Trip canceled → chat disables, archived with closed tag.
* User blocks another → cannot send/receive new messages.
* Multi-device messaging remains synchronized.

#### Document-wide Consistency Updates (from Sections 5 & 6)

* **Section 7 (Trip Execution):** Trigger chat closure and final notification on trip end; update `trip.completedAt`.
* **Section 8 (Ratings & Reports):** Add feedback link directly in chat closure screen for quick review.
* **Non-Functional Requirements:** Add latency target (<3s for chat delivery, <5s for push notifications) and reliability goal (99% message delivery success). Matching Logic (MVP)
* **Rule:** Show drivers sorted by distance and departure time proximity.
* **Pass:** Rider sees at least one valid driver if posted.
* **Fail:** No matches shown despite overlap.

### 6. Chat & Notifications

* **Feature:** In-app messaging between matched rider/driver; push notifications for requests/approvals.
* **Pass:** Messages delivered <3s; notifications fire on request.
* **Fail:** No notification received.

### 7. Trip Execution (Verified Trip Lifecycle)

#### Functional Requirements (refined and grounded)

* **Purpose:** Ensure every trip reflects a genuine ride, verified by movement and rider confirmation.
* **Flow:** Driver marks trip “Started” → location verified near pickup (≤100m) → trip tracking → driver marks “Completed” → API verifies distance ≥ threshold (e.g., 500m) → rider confirmation → archive.
* **Integration:**

  * **Location API:** Google Maps Platform / GCP Location Services to verify start-end coordinates.
  * **Fraud Detection:** Detect GPS spoofing or abnormal route patterns; flag to admin.
  * **Timeout Logic:** Trips idle >24h auto-flagged incomplete.
  * **Incentive Link:** Completion triggers parking eligibility check.
  * **Rating Trigger:** Verified completion triggers rating prompt for riders.

#### Acceptance Criteria (Pass/Fail)

* **Pass:**

  * Verified distance exceeds 500m; both driver and rider show completed trip in history.
  * Fraud detection flags under-threshold trips for admin.
  * Rider reconnection syncs trip completion data.
* **Fail:**

  * Trip completion accepted without movement.
  * Trips remain stuck open after 24h.
  * Fraud-flagged trips incorrectly marked eligible.

#### Edge Case Test Matrix (validated)

| #  | Scenario                         | Expected Result                  | Handling                     |
| -- | -------------------------------- | -------------------------------- | ---------------------------- |
| 1  | Normal movement, completed trip  | Archived, verified TRUE          | History updated              |
| 2  | Immediate completion after start | Rejected                         | Fraud flagged                |
| 3  | GPS loss mid-trip                | Completion valid via cached data | Backup recovery              |
| 4  | Rider offline at completion      | Syncs on reconnect               | Deferred completion confirm  |
| 5  | Trip not completed in 24h        | Auto-canceled                    | Flagged incomplete           |
| 6  | Distance <100m                   | Admin verification required      | Incentives paused            |
| 7  | API outage                       | Stored locally, verified later   | Retry job ensures validation |
| 8  | Start far from pickup            | Disabled start button            | UI geofence guard            |
| 9  | Skipped pickup                   | Await rider confirmation         | Rider verify screen          |
| 10 | GPS spoofing                     | Suspended trip                   | Fraud monitor triggers alert |

#### Implementation Plan (No Code)

1. **Database:** `trip_verification(tripId, driverId, riderId, start_time, end_time, start_loc, end_loc, distance, verified, fraud_flag)`.
2. **Triggers:**

   * On Start → validate pickup radius.
   * On Complete → compute distance via API; if <500m → set `fraud_flag`.
3. **Location Cache:** Periodic location pings stored client-side for recovery.
4. **API Integration:** Google Maps Directions API for route validation.
5. **Fraud Monitor:** Compare GPS variance, speed consistency, and API trust score.
6. **Timeout Process:** Cron auto-closes trips >24h old; logs incomplete status.
7. **Notifications:** Send completion confirmation and verification outcome to both users.
8. **Admin Dashboard:** Show fraud flags, travel distance, anomalies.
9. **Audit Trail:** Log all verification and override actions.

#### Document Consistency Updates

* **Section 6 (Chat):** Chat auto-closes on verified completion.
* **Section 8 (Reports):** Fraud-flagged trips appear in admin queue.
* **Section 9 (Incentives):** Parking eligibility only enabled for verified trips.
* **Section 10 (Ratings):** Trigger ratings post verified completion.

---

### 8. Reports (Driver Reporting & Suspension)

#### Functional Requirements (refined and grounded)

* **Objective:** Protect riders by tracking misconduct reports and automating suspensions.
* **Eligibility:** Reports valid only post-trip completion; duplicate trip reports by same rider disallowed.
* **Categories:** Unsafe driving, Rudeness, Harassment, Other.
* **Suspension Threshold:** ≥3 unique riders report within 30 days → auto-suspend driver.
* **Admin Controls:** Admins can override, review, or reinstate; actions logged.
* **Notifications:**

  * Rider confirmation: “Report received.”
  * Driver: Suspension notice.
  * Admin: New suspension alert.
* **Data Expiry:** Reports older than 30 days expire from count but remain archived.

#### Acceptance Criteria (Pass/Fail)

* **Pass:**

  * Trip-based reports recorded only once per rider.
  * 3 unique valid reports auto-suspend driver.
  * Expired reports drop from suspension count.
* **Fail:**

  * Duplicate reports inflating count.
  * Cancellation reports counted.
  * Non-unique riders trigger false suspension.

#### Edge Case Test Matrix (validated)

| #  | Scenario                       | Expected Result             | Handling                     |
| -- | ------------------------------ | --------------------------- | ---------------------------- |
| 1  | Rider submits report post-trip | Recorded successfully       | Valid only if trip completed |
| 2  | Duplicate report same trip     | Rejected                    | Prevent abuse                |
| 3  | 3 unique riders report driver  | Auto-suspend                | Admin notified               |
| 4  | 2 riders, 1 canceled trip      | Count = 2                   | Invalid trip ignored         |
| 5  | 3 reports same rider           | Ignored duplicates          | Count unique riders only     |
| 6  | Old reports >30d               | Dropped                     | Maintain fairness            |
| 7  | Admin reset                    | Reinstates driver           | Log override                 |
| 8  | Network error                  | Retry submission            | Prevent duplication          |
| 9  | Suspension mid-trip            | Completes current ride only | New requests blocked         |
| 10 | False reports                  | Removed after review        | Count recalculated           |

#### Implementation Plan (No Code)

1. **Database:** `driver_reports(driverId, riderId, tripId, reason, timestamp, status)`; add `report_count` and `driver_status` to profile.
2. **Logic:**

   * On report insertion → count distinct riders last 30d → if ≥3 → suspend.
   * On report expiry → decrement count.
3. **Integration:** Matching engine skips suspended drivers.
4. **Notifications:** Automatic alerts to admin and driver.
5. **Admin Dashboard:** “Reported Drivers” tab with filters and actions.
6. **Audit Logs:** Every override or deletion recorded.
7. **Data Retention:** Archive reports >30d for compliance.

#### Document Consistency Updates

* **Section 5 (Matching):** Exclude `driver_status == suspended` from matching pool.
* **Section 10 (Ratings):** Admin analytics cross-reference low ratings and reports.
* **Non-Functional:** Add moderation SLA <5 min for admin review; ensure 99% report delivery integrity.
* **Future Expansion:** Include rider reporting, mediation workflow, and appeals module. Trip Execution
* **Feature:** Driver can mark trip “Started” and “Completed.”
* **Pass:** Trip moves to history after completion.
* **Fail:** Trip remains open indefinitely.

### 8. Ratings & Reports

* **Feature:** Post-trip rating (1–5 stars + tags); report/block option.
* **Pass:** Ratings update profile score; reports go to admin queue.
* **Fail:** Ratings not saved or visible.

### 9. Driver Incentives (Parking Eligibility & Sustainability)

#### Functional Requirements (refined)

* **Purpose:** Encourage carpooling by rewarding drivers who complete verified rides with at least one rider with parking perks (discounted or reserved spots).
* **Verification:** Ride must be marked `completed` and include ≥1 confirmed rider.
* **Eligibility Flag:** On successful verification, the system sets `parking_eligible = true` and records `eligibility_date`.
* **Duration:** Eligibility valid until 23:59 of same day; auto-reset at midnight.
* **Badge Display:** Within 5 minutes of ride completion, driver dashboard displays “Eligible for Discounted Parking” badge.
* **Notifications:** Driver receives in-app and/or email notification confirming reward.
* **Data Sync (Future Integration):** If SFU Parking integration enabled, share driverId, eligibility_date, and verification hash securely.

#### Acceptance Criteria (Pass/Fail)

* **Pass:**

  * Driver completing ≥1 verified ride shows eligibility badge within 5 minutes.
  * Daily reset clears previous eligibility.
  * Data sync retries until successful; badge visible regardless of sync delays.
* **Fail:**

  * Driver completing solo rides marked eligible.
  * Badge not visible within 5 minutes of qualifying trip.
  * Eligibility persists past midnight.

#### Edge Case Test Matrix (Validated)

| #  | Scenario                  | Expected Result                                         | Edge Handling                               |
| -- | ------------------------- | ------------------------------------------------------- | ------------------------------------------- |
| 1  | Completed ride w/ rider   | Eligibility TRUE                                        | Badge + notification appear instantly       |
| 2  | Solo ride                 | Eligibility FALSE                                       | No badge                                    |
| 3  | Canceled ride             | Eligibility FALSE                                       | No trigger                                  |
| 4  | Multiple rides/day        | Eligibility TRUE after first ride; persists rest of day | No duplicate triggers                       |
| 5  | Ride ends at 11:55pm      | Eligibility TRUE until midnight                         | Reset job clears flag                       |
| 6  | Mid-trip rider cancel     | Eligibility FALSE                                       | System confirms trip must complete w/ rider |
| 7  | System downtime           | Eligibility recalculated on restore                     | No data loss                                |
| 8  | Duplicate trip record     | Eligibility TRUE once                                   | Deduplicate by rideId                       |
| 9  | API sync delay            | Badge shows locally; sync retries                       | Retry every 5 min until success             |
| 10 | Manual completion (fraud) | Eligibility denied                                      | Rider verification required                 |

#### Implementation Plan (Conceptual, grounded additions only)

1. **Eligibility Logic Layer:** Event listener for trip status → `completed`. Confirm ≥1 rider; mark eligibility.
2. **DB Schema:** `drivers/{driverId}` includes `parking_eligible: bool`, `eligibility_date: date`, `lastSyncStatus`.
3. **Cron/Function:** Scheduled midnight reset sets all eligibility flags to false.
4. **Badge Display:** Client polls eligibility every 60s while app in foreground.
5. **Sync Module (Future):** REST endpoint `/parkingSync` authenticates via token; retries with exponential backoff.
6. **Fraud Prevention:** Require both driver and ≥1 rider `trip.confirmed == true` before eligibility.
7. **Admin Oversight:** Admin UI shows daily eligible drivers list for audit.

#### Non-Functional & Document Consistency Updates

* **Section 7 (Trip Execution):** Ensure `trip.completed` event triggers eligibility check.
* **Section 8 (Ratings):** Eligibility calculated before rating prompt (ratings not required for incentive).
* **Non-Functional:** Add uptime requirement for eligibility job (99.9%) and midnight task recovery logic.
* **Future Extension:** Expand incentive model (eco-points, gamification) only after MVP.

---

### 10. Driver Rating System (Rider Feedback Integration)

#### Functional Requirements (refined)

* **Trigger:** After ride completion, riders receive a 5-star prompt with optional 200-char feedback.
* **Access Control:** One rating per ride per rider; available only after `trip.status == completed`.
* **Moderation:** Offensive content auto-flagged (simple keyword filter or API like Google Perspective).
* **Visibility:** Aggregate (average) ratings public; individual ratings private.
* **Edit Window:** 24h post-completion; thereafter locked.
* **Driver Dashboard:** Displays average rating (rounded to 1 decimal) and total review count.
* **Notifications:** Rider sees thank-you message; driver gets notification of new feedback.

#### Acceptance Criteria (Pass/Fail)

* **Pass:**

  * Rating form appears only post-completion; stores correctly.
  * Average recalculates within 5 minutes of submission.
  * Inappropriate comments auto-hidden or flagged.
* **Fail:**

  * Rating available pre-completion.
  * Duplicate submissions allowed.
  * Deleted fraudulent rating not reflected in average.

#### Edge Case Test Matrix (Validated)

| #  | Scenario                 | Expected Result                  | Handling                        |
| -- | ------------------------ | -------------------------------- | ------------------------------- |
| 1  | Rider rates 5⭐           | Recorded; driver average updates | Refresh visible on dashboard    |
| 2  | Rating before completion | Denied                           | Prompt locked until trip end    |
| 3  | Rider canceled trip      | No rating shown                  | Prevent invalid feedback        |
| 4  | Multiple riders          | Each rating counts once          | Weighted equally                |
| 5  | Duplicate rating attempt | Rejected                         | One per trip enforced           |
| 6  | No riders                | Rating disabled                  | Skipped cleanly                 |
| 7  | Empty feedback           | Accepted                         | Optional text field             |
| 8  | Offensive comment        | Hidden                           | Moderation tool filters content |
| 9  | System outage            | Retry                            | Stored offline until reconnect  |
| 10 | Late rating (>24h)       | Rejected                         | Expiry enforced                 |
| 11 | Many low ratings         | Average recalculates accurately  | Preserve consistency            |
| 12 | Admin deletes rating     | Average updates instantly        | Data integrity maintained       |

#### Implementation Plan (Conceptual, minimal deltas)

1. **Trigger Event:** On `trip.completed`, enqueue rating requests for all riders.
2. **UI:** Show rating modal immediately post-trip or under `My Trips` for 24h.
3. **DB Schema:** `ratings/{ratingId}` → `{rideId, driverId, riderId, rating, feedback, timestamp, moderated}`.
4. **Aggregation:** Background job recalculates driver average (ignore moderated=false entries).
5. **Driver Profile API:** Returns average, count, and badge-level (e.g., Gold Driver >4.7).
6. **Moderation:** Inline keyword filter + optional Perspective API. Admin can override hide/show.
7. **Notifications:** Driver receives anonymized alert with summary (e.g., “New feedback added”).
8. **Admin Analytics:** Dashboard for trend monitoring; trigger flags if average <3.0 for >5 trips.

#### Document Consistency Updates

* **Section 5 (Matching Logic):** Include driverRating in composite score weighting (10%).
* **Section 6 (Chat):** Append quick feedback CTA post-trip in chat closure.
* **Section 9 (Incentives):** Ratings optional; do not affect eligibility logic.
* **Non-Functional:** Add moderation latency target (<10s); ensure 99% uptime on rating API.
* **Future Expansion:** Add Rider rating system (driver feedback on riders) for reputation balancing.
  Driver Incentives (Placeholder Integration)
* **Feature:** Eligible drivers (≥2 trips/day) flagged as “Parking Eligible.”
* **Pass:** Driver dashboard shows incentive badge.
* **Fail:** Active drivers never flagged.

---

## Non-Functional Requirements

* **Privacy:** No personal phone/email shown; only first name + initial.
* **Scalability:** Support 500 concurrent users for hackathon demo.
* **Uptime:** Stable across 24h hackathon testing.
* **Performance:** API calls <300ms locally.

---

## V2 Roadmap (Post-Hackathon)

1. **AI-Assisted Route Optimization**

   * Algorithm to assign optimal rider pickups to each driver.
   * ML model considers location, traffic, rider wait times.

2. **Schedule-Based Matching**

   * Semester-long schedule uploads; recurring rides.
   * Auto-matching for week-long planning.

3. **Parking Discounts Integration**

   * Direct API sync with SFU Parking for QR-code or ID validation.

4. **Cost-Sharing & Payments**

   * Stripe integration for per-trip cost-splits.

5. **Multi-Pickup Routing**

   * Route optimization for multiple riders per trip.

---

## Hackathon Build Scope (24h Priorities)

* [x] SFU-auth restricted login
* [x] Driver: Post Ride (origin → campus)
* [x] Rider: Request Ride
* [x] Real-time matching (distance-based)
* [x] Notifications + chat
* [ ] Trip lifecycle (start/complete)
* [ ] Ratings & reporting
* [ ] Incentive badge (non-integrated placeholder)

---

## Acceptance Criteria Summary

| Feature      | Pass Condition                        | Fail Condition                        |
| ------------ | ------------------------------------- | ------------------------------------- |
| Auth         | Only @sfu.ca logins succeed           | Non-SFU logins succeed                |
| Ride Posting | Driver posts visible to nearby riders | Post not visible                      |
| Requests     | Rider request notifies driver         | Driver not notified                   |
| Matching     | Rider sees driver within 10km         | Rider sees none despite driver nearby |
| Chat/Notif   | Msg <3s delivery                      | Msg not delivered                     |
| Trip Flow    | Start/End updates ride history        | Trip stuck open                       |
| Ratings      | Ratings stored & update profile       | Ratings lost                          |
| Incentives   | Eligible driver flagged               | Never flagged                         |

---

### Notes for Hackathon Team

* Prioritize **core flow**: Post Ride → Request Ride → Chat → Trip.
* Incentives, AI routing, and schedules = **stretch/V2**.
* Focus on working demo: a rider finds a driver in real-time and coordinates a ride successfully.
