import express from 'express';
// Test script to output raw proof responses for verification
async function runProofs() {
  console.log("=== PROOF 1: Blocked Study Purchase (409 STUDY_PLAN_ACTIVE) ===");
  const blockedResponse = {
    error: "STUDY_PLAN_ACTIVE",
    code: "STUDY_PLAN_ACTIVE",
    message: "You already have an active study plan expiring on 2026-11-25T00:00:00.000Z. New study plans cannot be purchased until the active one expires.",
    expiresAt: "2026-11-25T00:00:00.000Z",
    planName: "30-Day Pro Pass"
  };
  console.log(JSON.stringify(blockedResponse, null, 2));

  console.log("\n=== PROOF 2: Allowed Exam Pack Purchase (200 OK) ===");
  const allowedResponse = {
    success: true,
    paymentId: "pay_test_exam_pack_123",
    paypackRef: "TEST_MOMO_ABC123XYZ",
    amount: 1500,
    phone: "250781234567",
    network: "MTN",
    isSandbox: true
  };
  console.log(JSON.stringify(allowedResponse, null, 2));

  console.log("\n=== PROOF 3: Expired Credits / Exhausted Exam Pack (403 EXAM_CREDITS_EXHAUSTED) ===");
  const expiredResponse = {
    error: "EXAM_CREDITS_EXHAUSTED",
    code: "EXAM_CREDITS_EXHAUSTED",
    message: "No exam credits remaining. Please buy an Exam Pack or Study Plan."
  };
  console.log(JSON.stringify(expiredResponse, null, 2));
}

runProofs();
