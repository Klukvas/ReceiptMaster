---
title: "How SHA256 Protects Your Receipt Integrity"
slug: "sha256-receipt-verification"
date: "2026-03-20"
category: "Technical"
description: "How receiptmaster uses SHA256 hashing internally to make sure a stored document is not silently altered before it is rendered again."
---

# How SHA256 Protects Your Receipt Integrity

When receiptmaster issues a document, it freezes the exact content that went into the PDF and records a SHA256 hash of it. That hash lets the system notice if the stored content ever changes.

## What Is SHA256?

SHA256 (Secure Hash Algorithm 256-bit) is a one-way function that takes any input and produces a fixed-length 64-character hex string:

```
SHA256: a3f8e2d1c9b74e62f05a8d3c1b7e4f2a9d6c8b0e...
```

Two key properties: **deterministic** (same input = same hash) and **collision-resistant** (practically impossible for different inputs to match).

## How receiptmaster Uses It

1. The document data is rendered into an HTML template
2. HTML is converted to PDF via Playwright
3. The HTML snapshot is hashed using SHA256
4. The snapshot and its hash are stored with the document

The hash is kept on our side. It is not printed on the document and is not shown in the app.

## Why This Matters

**The PDF matches what was issued** — Whenever a document has to be rendered again from its stored snapshot, receiptmaster first recomputes the hash and compares it with the stored one. If they differ, the document is not rebuilt from altered content.

**Your history stays stable** — Changing your company details, templates or prices later does not rewrite documents you have already issued: they keep their frozen content.

**What it is not** — A hash is not an electronic signature. It does not by itself make a document compliant with tax or EU e-invoicing rules; check what your jurisdiction requires.

## Verification Flow

```
Original HTML → SHA256 → Stored Hash
                            ↓
Stored HTML  → SHA256 → Compare before rendering
                            ↓
                  Match? ✓ Render
                  Differ? ✗ Refuse
```

The HTML snapshot is stored separately from the PDF, so a document can be rendered again from the content that was actually issued.

## Key Takeaway

SHA256 hashing helps receiptmaster keep issued documents consistent with what you originally created. It does not encrypt your data, and it is not a signature. Every receiptmaster plan includes it at no extra cost.
