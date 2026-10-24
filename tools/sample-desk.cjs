#!/usr/bin/env node
// Writes a sample desk (the example feature requests and questions the app
// used to seed on first run) so screens and ideas can be tried against
// realistic data without it shipping to users. Not part of the packaged app
// (electron-builder only bundles main/preload/src/renderer).
//
//   node tools/sample-desk.cjs [outDir]
//
// outDir defaults to a fresh temp folder. To look at it in the real app, copy
// it into Documents/Question under any name. Dates are relative to "now", so
// the ages and due dates stay believable whenever it is generated.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const backend = require("../src/backend.cjs");

function uid(prefix) { return prefix + "_" + Math.random().toString(36).slice(2, 9); }
function daysAgo(n) { return Date.now() - n * 86400000; }

  const requests = [
    { id: uid("req"), title: "Bulk export to CSV", description: "Export the full request list, not just the visible page.",
      customers: ["Acme", "Meridian Co", "Halden", "Brightline"],
      urgency: "high", topic: "export",
      status: "in-progress", quarter: "Q3 2026", dueDate: daysAgo(-3), createdAt: daysAgo(14), updatedAt: daysAgo(2), questionCount: 3, shippedAt: null },
    { id: uid("req"), title: "Role-based permissions", description: "Restrict who can edit vs. only view requests once the team grows.",
      customers: ["Otterly", "Halden"],
      urgency: "low", topic: "access",
      status: "new", quarter: "Q3 2026", dueDate: daysAgo(-2), createdAt: daysAgo(30), updatedAt: daysAgo(30), questionCount: 2, shippedAt: null },
    { id: uid("req"), title: "Currency conversion calculator", description: "Convert prices between currencies inline when viewing invoices.",
      customers: ["Acme", "Meridian Co", "Halden"],
      urgency: "medium", topic: "currency",
      status: "planned", quarter: "Q4 2026", dueDate: daysAgo(-10), createdAt: daysAgo(58), updatedAt: daysAgo(58), questionCount: 2, shippedAt: null },
    { id: uid("req"), title: "Weighted priority score", description: "A single combined score view blending urgency, customer count and age.",
      customers: ["Acme"],
      urgency: "low", topic: "prioritisation",
      status: "planned", quarter: "Q4 2026", dueDate: daysAgo(-25), createdAt: daysAgo(20), updatedAt: daysAgo(20), questionCount: 1, shippedAt: null },
    { id: uid("req"), title: "Slack notifications for new questions", description: "Ping a Slack channel whenever a customer question comes in unanswered.",
      customers: ["Brightline"],
      urgency: "medium", topic: "notifications",
      status: "new", quarter: "Unscheduled", dueDate: null, createdAt: daysAgo(12), updatedAt: daysAgo(12), questionCount: 1, shippedAt: null },
    { id: uid("req"), title: "Dark theme", description: "Full dark theme across the app, not just the editor.",
      customers: ["Halden"],
      urgency: "low", topic: "appearance",
      status: "shipped", quarter: "Q2 2026", dueDate: null, createdAt: daysAgo(140), updatedAt: daysAgo(100), questionCount: 1, shippedAt: daysAgo(100) },
  ];
  const questions = [
    { id: uid("q"), text: "Can I export everything, not just the page I'm on?", matchedRequestId: requests[0].id, answer: null, createdAt: daysAgo(2) },
    { id: uid("q"), text: "Does the export support scheduling?", matchedRequestId: requests[0].id, answer: null, createdAt: daysAgo(5) },
    { id: uid("q"), text: "Is there a CSV download?", matchedRequestId: requests[0].id, answer: null, createdAt: daysAgo(9) },
    { id: uid("q"), text: "Can we show prices in EUR as well as USD?", matchedRequestId: requests[2].id, answer: null, createdAt: daysAgo(50) },
    { id: uid("q"), text: "Does the currency calculator support GBP?", matchedRequestId: requests[2].id, answer: null, createdAt: daysAgo(20) },
    { id: uid("q"), text: "Is there a dark theme yet?", matchedRequestId: requests[5].id, answer: "Shipped in Q2 2026 — toggle it in settings.", createdAt: daysAgo(90) },
    { id: uid("q"), text: "Can we restrict who's allowed to edit requests?", matchedRequestId: requests[1].id, answer: null, createdAt: daysAgo(20) },
    { id: uid("q"), text: "Is there a view-only role for requests?", matchedRequestId: requests[1].id, answer: null, createdAt: daysAgo(6) },
    { id: uid("q"), text: "Can this ping a Slack channel when a question comes in?", matchedRequestId: requests[4].id, answer: null, createdAt: daysAgo(10) },
    // These three, and the two below, are worded to deliberately share 2+
    // stemmed words with each other (see clusterUnmatchedQuestions() /
    // stem() further down) so the seed data actually demonstrates a
    // "recurring theme" on first launch, instead of relying on wording
    // that merely *looks* similar to a person but doesn't overlap under
    // the app's real (literal, non-semantic) matching.
    { id: uid("q"), text: "Does it work without internet access?", matchedRequestId: null, answer: null, createdAt: daysAgo(12) },
    { id: uid("q"), text: "Can I use it with no internet access?", matchedRequestId: null, answer: null, createdAt: daysAgo(4) },
    { id: uid("q"), text: "Does it need internet access to run?", matchedRequestId: null, answer: null, createdAt: daysAgo(1) },
    { id: uid("q"), text: "Can I see the change history for a request?", matchedRequestId: null, answer: null, createdAt: daysAgo(18) },
    { id: uid("q"), text: "Is there a change history log per request?", matchedRequestId: null, answer: null, createdAt: daysAgo(6) },
  ];

const outDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : fs.mkdtempSync(path.join(os.tmpdir(), "question-sample-desk-"));
backend.syncAll(outDir, requests, questions, null);
console.log(`Sample desk written to: ${outDir}`);
console.log(`  ${requests.length} requests, ${questions.length} questions`);
