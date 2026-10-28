let pendingDashboardDate: string | null = null;

export function setPendingDashboardDate(date: string) {
  pendingDashboardDate = date;
}

export function consumePendingDashboardDate() {
  const date = pendingDashboardDate;
  pendingDashboardDate = null;
  return date;
}
