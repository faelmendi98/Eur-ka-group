import assert from "node:assert/strict";
import test from "node:test";
import { canAccessTrade, canUploadProjectArea, invoiceTransitionAllowed, isMissionEligible } from "../worker/policy.ts";

test("isole strictement les métiers",()=>{
  assert.equal(canAccessTrade(false,["horlogerie"],"horlogerie"),true);
  assert.equal(canAccessTrade(false,["automobile"],"horlogerie"),false);
  assert.equal(canAccessTrade(true,[],"horlogerie"),true);
});

test("applique classe et crédits aux missions",()=>{
  assert.equal(isMissionEligible("B",50,"C",30),true);
  assert.equal(isMissionEligible("D",100,"C",30),false);
  assert.equal(isMissionEligible("S",20,"A",30),false);
});

test("sépare les zones de dépôt par rôle",()=>{
  assert.equal(canUploadProjectArea("mandataire","cahier_des_charges"),true);
  assert.equal(canUploadProjectArea("mandataire","documents"),false);
  assert.equal(canUploadProjectArea("freelance","documents"),true);
  assert.equal(canUploadProjectArea("freelance","cahier_des_charges"),false);
});

test("interdit de déclarer un paiement sans transition autorisée",()=>{
  assert.equal(invoiceTransitionAllowed("to_invoice","paid"),false);
  assert.equal(invoiceTransitionAllowed("invoice_sent","paid"),true);
  assert.equal(invoiceTransitionAllowed("paid","payment_pending"),false);
});
