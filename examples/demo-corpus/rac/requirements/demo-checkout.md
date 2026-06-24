---
schema_version: 1
id: REQ-DEMO-CHECKOUT
type: requirement
---
# Requirement: Checkout Flow

## Status

Accepted

## Problem

Shoppers need to complete a purchase: review the cart, enter payment, and
receive an order confirmation. The flow must be verifiable end-to-end so a
regression in any step is caught before release.

## Requirements

- A shopper can review the cart and proceed to checkout.
- A shopper can submit valid payment details and reach an order confirmation.
- The confirmation shows an order number.

## Acceptance Criteria

- Submitting the checkout form with valid details shows the confirmation view.
- The confirmation view displays a non-empty order number.

## Related Decisions

- adr-001

## Related Requirements

- REQ-DEMO-CART

## Verified By

- Checkout flow verified — `examples/seed.spec.ts` (trace: `test-results/checkout/trace.zip`)
