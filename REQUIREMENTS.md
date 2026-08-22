# suzu2 Rebuild Requirements

STATUS: APPROVED
APPROVED_BY: Project owner (user)
APPROVED_ON: 2026-08-21

## Objective

Build a new classroom site in this repository without modifying the existing `/Users/suzui/suzu-sensei` site. Treat the old site as read-only reference material and rewrite only the necessary behavior into the new architecture.

## Environment boundary

- Use a development Supabase environment for development and testing.
- Production Supabase ref `ploropobmgwlpphtkndo` must not be changed before explicit approval.
- Do not commit, push, or change production without separate explicit approval.

## Reference material to rescue selectively

- `site/classroom/classroom-auth.js`: Google Auth and session behavior.
- `site/textbook/theme.css`: design settings.
- `site/classroom/student.html`: credit totals, booking candidates, and payment UI.
- `site/classroom/teacher.html`: booking, payment, and history management UI.
- `supabase/drafts/01_classroom_ledger_and_booking.sql`.
- `supabase/drafts/04_confirmed_spec_booking_windows_and_cancellation.sql`.
- Existing migrations' RPC, RLS, Storage, constraint, and index design.

Reference code and SQL must not be copied wholesale.

## Explicit exclusions

- `remaining_lessons` as authoritative state.
- `classroom_weekly_slots`.
- `classroom_lesson_overrides`.
- `classroom_change_requests`.
- Browser-side generation of future schedules.
- Teacher authorization based only on fixed email addresses.
- Legacy fallback for unapplied migrations.
- SQL dedicated to one specific student.
- Credential files.
- `.claude/settings.local.json`.

## Required data model

- `profiles` / `students`.
- `teacher_roles`.
- `purchases`.
- `lesson_credits`.
- `booking_requests`.
- `booking_candidates`.
- `bookings`.
- `lesson_history`.
- `payments`.
- `audit_logs` when justified by the design.

Credit states: `available`, `reserved`, `completed`, `voided`.

## Required RPCs

- `claim_student_profile`.
- `register_purchase`.
- `submit_booking_request`.
- `approve_booking_request`.
- `reject_booking_request`.
- `complete_booking`.
- `approve_payment`.
- `reject_payment`.
- `void_credit`.

Booking approval, lesson completion, and payment approval must be transactional database operations.

## Authorization and isolation

- Student ownership is determined by `auth.uid() = students.auth_user_id`.
- Teacher authorization uses a UUID role table or `app_metadata`.
- Enable RLS on every applicable table.
- Clients may not directly update important state.
- A student must not retrieve another student's profile, credits, bookings, payments, or slips.

## Payments and slips

- New-purchase approval creates a purchase and issues credits.
- Evidence-only approval issues no credit.
- Relate payment and purchase uniquely and prevent duplicate credit issuance.
- Store slips in a private bucket.
- Slip path: `student_id/payment_id/random_uuid.ext`.
- Only the owning student and teachers may obtain signed URLs.

## Mandatory tests

- Student A cannot see any Student B data.
- A booking request cannot be approved twice.
- A credit cannot be used twice.
- Overlapping booking times cannot be registered.
- A lesson cannot be completed twice.
- Re-approving a payment does not increase credits.
- Evidence-only approval does not increase credits.
- Teacher proxy upload works safely.

## Required sequence

Design → schema migration → RLS → RPC → Storage → frontend → development testing → security review → review → production migration only after explicit approval.

At every stage, report changes, test results, and unresolved matters.

## Booking and language update approved on 2026-08-22

- A booking request may contain up to five candidate dates.
- Each candidate date may contain a first, second, and third preferred availability range.
- All selectable time boundaries and the teacher's final lesson start use only `:00` or `:30`.
- A teacher selects an exact 50-minute lesson start inside a submitted availability range.
- Students enter their own registration name during first profile claim.
- Teacher-only nicknames must not be retrievable by students.
- Student login, claim, dashboard, booking, payment, and history UI support Japanese, Traditional Chinese, and English.
- The teacher dashboard remains Japanese-only.
- Payment submission is labelled simply as sending, without the ambiguous phrase `安全に送信`.
- Credit voiding remains available only as a collapsed administrator correction/refund tool.
