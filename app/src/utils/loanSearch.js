
export function loanMatchesSearch(loan, rawQuery) {
  const q = String(rawQuery || '').trim().toLowerCase();
  if (!q) return true;
  if ((loan.ownerName || '').toLowerCase().includes(q)) return true;
  const id = String(loan.loanId || '').toLowerCase();
  return id.includes(q);
}
