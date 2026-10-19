# Phase 0: Plan and Entitlement System Implementation Plan

## 1. Environment & Server Logic (NEW)
- **No Cloud Functions**: All server-side logic (startExam, plan management, access summary) will be implemented as protected API endpoints in `server.ts` using the Firebase Admin SDK.
- **Verification**: The Admin SDK can run in this environment with the project credentials.
- **Auth**: API endpoints will verify Firebase ID tokens (Authorization: Bearer <token>) and enforce admin checks on the server side (using an admin allowlist stored in Firestore, never client-side).

## 2. Data Model
- **plans/{planId}**: name{en,rw,fr}, price (placeholder), currency, active, durationDays, features{lessons:bool, videos:bool, exams:bool}, examLimit{type:'unlimited'|'count', count:number|null}.
- **users/{uid}/purchases/{id}**: Plan snapshot, start/expiry dates, status, exam usage, createdAt.
- **users/{uid}/access/current**: Summary of active features and exam credits (updated by server).

## 3. Enforcement
- **Firestore Rules**: Hardened `hasLessons()`, `hasVideos()`, `hasExams()` functions enforcing access based on `users/{uid}/access/current`.
- **Server API**: `startExam()` endpoint in `server.ts` (transactional).
- **Rules Deployment**: Rules will be deployed using the `deploy_firebase` tool which provisions the configured `firestore.rules`.

## 4. Admin UI
- **Plan Management**: Admin-only screen to CRUD plans.
- **Student Management**: Admin-only tool to search students by phone, view/grant/cancel plans, and log actions.
- **Payment**: Currently assumed to be manual (e.g., MoMo) and external. No payment integration built yet.

## 5. Migration Proposal
- Scan existing users for `isPaid` flag.
- Propose mapping existing paying users to a "Legacy Full Access" plan with a 30-day expiry from migration.
- **Will not change any data without your explicit approval.**
