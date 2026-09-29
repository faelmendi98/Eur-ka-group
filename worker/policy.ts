export const classRank: Record<string,number> = { D: 1, C: 2, B: 3, A: 4, S: 5 };

export function canAccessTrade(globalAdmin: boolean, membershipTradeIds: string[], targetTradeId: string) {
  return globalAdmin || membershipTradeIds.includes(targetTradeId);
}

export function isMissionEligible(projectClass: string, availableCredits: number, requiredClass: string, requiredCredits: number) {
  return Boolean(classRank[projectClass] && classRank[requiredClass] && classRank[projectClass] >= classRank[requiredClass] && availableCredits >= requiredCredits);
}

export function canUploadProjectArea(role: string, area: string) {
  if (role === "admin_metier" || role === "admin_eureka") return true;
  if (role === "mandataire") return area === "cahier_des_charges" || area === "mission";
  if (role === "freelance") return area === "documents" || area === "suivi";
  return false;
}

export function invoiceTransitionAllowed(current: string, next: string) {
  const transitions: Record<string,string[]> = {
    to_invoice:["invoice_sent","cancelled"],
    invoice_sent:["payment_pending","paid","cancelled"],
    payment_pending:["paid","overdue","cancelled"],
    overdue:["paid","cancelled"],
    paid:[],
    cancelled:[],
  };
  return transitions[current]?.includes(next) ?? false;
}
