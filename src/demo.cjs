// Proves the backend + SQLite index work end-to-end: seeds a temp data
// directory with a handful of requests/questions through the same syncAll()
// path the Electron app uses, then runs the kinds of structured queries the
// app's Now/Trends views need — as real SQL against the index, not
// re-implemented in JS. Run with: node src/demo.cjs
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const backend = require("./backend.cjs");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "question-demo-"));
console.log("Demo data dir:", dataDir);

const now = Date.now();
const daysAgo = n => now - n * 86400000;

const requests = [
  { id: "req_1", title: "Currency conversion calculator", description: "Convert prices between currencies.",
    customers: ["Meridian Co", "Northwind", "Halberd Ltd"], urgency: "medium", topic: "currency",
    status: "planned", quarter: "Q2 2027", dueDate: daysAgo(-10), createdAt: daysAgo(58), updatedAt: daysAgo(58),
    questionCount: 3 },
  { id: "req_2", title: "Bulk export to CSV", description: "Export the full request list.",
    customers: ["Northwind", "Faircrest", "Meridian Co", "Oakline"], urgency: "high", topic: "export",
    status: "in-progress", quarter: "Q4 2026", dueDate: daysAgo(-3), createdAt: daysAgo(94), updatedAt: daysAgo(94),
    questionCount: 6 },
  { id: "req_3", title: "Dark mode", description: "Full dark theme.",
    customers: ["Halberd Ltd"], urgency: "low", topic: "appearance",
    status: "shipped", quarter: "Q3 2026", dueDate: null, createdAt: daysAgo(140), updatedAt: daysAgo(140),
    questionCount: 2 },
];
const questions = [
  { id: "q_1", text: "Does it support GBP?", matchedRequestId: "req_1", answer: null, createdAt: daysAgo(20) },
  { id: "q_2", text: "Can I export everything?", matchedRequestId: "req_2", answer: null, createdAt: daysAgo(40) },
  { id: "q_3", text: "Is dark mode out yet?", matchedRequestId: "req_3", answer: "Shipped in Q3 2026.", createdAt: daysAgo(100) },
];
const settings = { views: [], activeView: null, scoreWeights: { urgency: 3, customers: 2, questions: 1.5, age: 0.03, dueDate: 1 }, theme: "system" };

backend.syncAll(dataDir, requests, questions, settings);
console.log("\n✓ syncAll wrote", fs.readdirSync(path.join(dataDir, "feature-requests")).length, "request files and",
  fs.readdirSync(path.join(dataDir, "questions")).length, "question files, and rebuilt the index.\n");

// Prove the index can be deleted and rebuilt losslessly from the files alone
// — that's what "disposable" means for this index.
fs.unlinkSync(path.join(dataDir, "index.sqlite"));
backend.rebuildIndex(dataDir);
console.log("✓ Deleted index.sqlite and rebuilt it from the markdown files alone.\n");

const db = new DatabaseSync(path.join(dataDir, "index.sqlite"));

console.log("Query: features requested by more than one customer");
for (const row of db.prepare(`
  SELECT r.title, COUNT(*) AS customer_count
  FROM requests r JOIN request_customers c ON c.request_id = r.id
  GROUP BY r.id HAVING customer_count > 1 ORDER BY customer_count DESC
`).all()) console.log(" -", row.title, `(${row.customer_count} customers)`);

console.log("\nQuery: customers appearing on more than one request");
for (const row of db.prepare(`
  SELECT customer, COUNT(*) AS request_count
  FROM request_customers GROUP BY customer HAVING request_count > 1 ORDER BY request_count DESC
`).all()) console.log(" -", row.customer, `(${row.request_count} requests)`);

console.log("\nQuery: how many features have shipped");
const shipped = db.prepare(`SELECT COUNT(*) AS n FROM requests WHERE shipped = 1`).get();
console.log(" -", shipped.n, "shipped");

console.log("\nQuery: most-asked-about requests");
for (const row of db.prepare(`
  SELECT title, question_count FROM requests ORDER BY question_count DESC LIMIT 5
`).all()) console.log(" -", row.title, `(asked ${row.question_count}×)`);

console.log("\nQuery: requests with an upcoming or overdue due date");
for (const row of db.prepare(`
  SELECT title, due_date FROM requests WHERE due_date IS NOT NULL ORDER BY due_date ASC
`).all()) console.log(" -", row.title, `(due_date=${new Date(row.due_date).toISOString().slice(0,10)})`);

db.close();
console.log("\nAll queries ran against the rebuilt index. Demo data left at:", dataDir);
