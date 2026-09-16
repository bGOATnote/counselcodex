import assert from "node:assert/strict";
import test from "node:test";

import { reviewOriginPlan } from "../lib/review-origin.ts";

test("IPv4 loopback moves once to the canonical localhost origin", () => {
  assert.deepEqual(reviewOriginPlan("http://127.0.0.1:4120/review?case=C14"), {
    canonicalUrl: "http://localhost:4120/review?case=C14",
    legacyRecoveryUrl: null,
    recoveryOrigin: false,
    shouldRedirect: true,
  });
});

test("IPv6 loopback moves once to the canonical localhost origin", () => {
  assert.deepEqual(reviewOriginPlan("http://[::1]:4120/?case=C14"), {
    canonicalUrl: "http://localhost:4120/?case=C14",
    legacyRecoveryUrl: null,
    recoveryOrigin: false,
    shouldRedirect: true,
  });
});

test("the explicit IPv4 recovery origin remains reachable", () => {
  assert.deepEqual(reviewOriginPlan("http://127.0.0.1:4120/?originRecovery=1"), {
    canonicalUrl: "http://localhost:4120/",
    legacyRecoveryUrl: null,
    recoveryOrigin: true,
    shouldRedirect: false,
  });
});

test("localhost exposes a recovery link without redirecting", () => {
  assert.deepEqual(reviewOriginPlan("http://localhost:4120/?case=C14"), {
    canonicalUrl: "http://localhost:4120/?case=C14",
    legacyRecoveryUrl: "http://127.0.0.1:4120/?case=C14&originRecovery=1",
    recoveryOrigin: false,
    shouldRedirect: false,
  });
});
