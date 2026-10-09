---
name: monetization
description: Stripe hosted-redirect + credits engine + entitlements. Use for WS-1 work (checkout, top-ups, subscriptions, webhooks, admin feature-cost editor). Enforces Law L9 (commerce is real) and the "no embedded Elements iframes on a require-corp origin" architecture.
---

# monetization

## Build shape

- **Hosted redirect only.** Full-page redirect to Stripe Checkout / Billing Portal. COEP=`require-corp` breaks embedded Elements iframes on our origin — no exceptions.
- **Backend already exists** (do not rebuild): `StripeController`, `CreditController`, `CreditService`, `admin_config.php` holds `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`. WS-1 wires the frontend + hardens (idempotency, Tax, admin UI).
- **Frontend key** — `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` baked at build time; the deploy-script guard refuses `next build` when it's unset.

## Pricing model

- **Free tier** — 0-credit browser-native core (Law L2 — unlimited).
- **Subscriptions:** Starter · Creator · Business. Entitlements gate premium style packs, clone tier, publishing/scheduler, team seats, watermark-off, storage/sync quota.
- **Wallet top-ups** — one-time Stripe Checkout ⇒ credit balance. Metered premium actions debit the balance.

## Credits engine (v2.2 spec)

- `feature_costs` (admin-editable): `feature_key`, `cost`, `enabled_from`, `notes`. Cost 0 = free/promo.
- Every gated action: **client-side** check for UX (entitlement + balance) → **server-side** authoritative check → issue a signed **action-grant** (JWT, short TTL, single-use, idempotency key).
- `credit_ledger`: `user_id`, `delta` (± credits), `reason`, `feature_key`, `idempotency_key` (unique), `grant_id`, `stripe_ref`, `created_at`. Every debit/credit records — reconstructible history.
- Idempotency: never write a ledger row without the client's `idempotency_key`. Duplicate posts are no-ops that return the prior row's outcome.

## Stripe Tax

- Enable Stripe Tax on the account.
- **US sales-tax nexus** only. No EU VAT unless EU sales open (COWORK_BRIEF §5).

## Webhook handler (PHP)

1. **Verify signature** with `STRIPE_WEBHOOK_SECRET` — no signature = 400.
2. Parse event → route on type (`checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`, `charge.dispute.created`).
3. Idempotency: each handler stores `event.id` in `stripe_events_processed`. Duplicate `event.id` → 200 no-op.
4. Downgrade path: on subscription cancel/downgrade, **remove entitlements immediately**; queued/in-flight action-grants still redeem (short TTL bounds risk).
5. All handlers wrap in a transaction. On DB error: DO NOT return 200 — Stripe retries with backoff.

## Frontend surfaces (WS-1)

- **Account page:** current plan, credit balance, invoices list, add-balance, cancel/upgrade → Billing Portal redirect.
- **Add balance:** amount picker → Checkout session (mode=`payment`) → success redirect → balance refetched.
- **Subscribe:** plan picker → Checkout session (mode=`subscription`) → success redirect → entitlements refetched.
- **Admin dashboard:** users list, plans, `feature_costs` editor, promo codes, ledger browser.

## BYOK (encrypted API-key storage)

- `system_api_keys` — AES-256-GCM with `ENCRYPTION_MASTER_KEY`. Rotate master key annually (v2.2 pattern) — dual-key window on rotation.
- User BYOK: stored under user-scoped rows; on decrypt, key is used and immediately discarded (never returned to the browser).

## E2E gate (WS-QA billing-tester)

1. Sign up → subscribe with test card `4242 4242 4242 4242` → entitlement set.
2. Top up (mode=`payment`) → balance updated.
3. Gated action fires → server checks + debits balance + returns action-grant → action succeeds.
4. Simulate subscription cancel via Stripe CLI → webhook removes entitlement → the same gated action now refused.
5. Refund path: Stripe CLI refund → ledger records reversal → no double-refund on duplicate webhooks.
6. Every step's `curl -sI` shows the response is our origin, not Stripe (post-redirect).

## Live-mode activation

**Never** flip Stripe test → live without explicit operator go at C-M4. Escalation trigger per COWORK_BRIEF §7.
