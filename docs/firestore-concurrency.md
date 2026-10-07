# Firestore concurrency invariants

This file documents the write rules that the Project Desk web app and any future mobile app must share.

## Record identifiers

- Do not use `Date.now()` as a project, invoice, receipt, client, or registry identifier.
- Internal records pre-allocate a Firestore document reference and derive the human-facing suffix from the first 12 characters of that Firestore ID.
- Public order submissions use a cryptographically random UUID and the first 12 characters for the displayed client/project reference.
- The business year comes from the record date. Web defaults use `Asia/Jakarta`.

## Invoice creation

Creating an invoice and its `public_documents` verification registry entry is one Firestore write batch. A failed commit must create neither record.

## Recording payments

Payments must use a Firestore transaction:

1. Read the current invoice from Firestore inside the transaction.
2. Reject cancelled/paid invoices and reject an amount larger than the current outstanding balance.
3. Create the payment.
4. Update `paidAmount`, `outstandingAmount`, and invoice status.
5. Update the matching `public_documents` status.

All five steps commit together. A mobile implementation must not calculate the new paid balance from cached UI state.

## Receipt issuance

A payment may have only one receipt.

- The receipt document ID is the payment ID.
- Receipt issuance runs in a Firestore transaction and checks whether that deterministic receipt already exists.
- The receipt and its `public_documents` registry entry are created in the same transaction.
- Transaction retries reuse the same receipt ID, so concurrent web/mobile attempts cannot create duplicate receipts.

## Public order form

The public client + project pair already uses one Firestore write batch and must remain atomic.

## Destructive operations

Invoice/client/project cascade deletion currently starts from records loaded by the client. That is acceptable for the current single-admin workflow, but it is not a strong cross-device referential-integrity boundary. Before destructive writes are exposed in the mobile app, prefer a trusted server operation (Cloud Function/Worker with Admin SDK) or a soft-delete workflow so a concurrent payment/project write cannot become orphaned.
