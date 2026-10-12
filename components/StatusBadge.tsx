const STYLES: Record<string, string> = {
  NEW: "bg-zinc-100 text-zinc-700",
  OUTREACH_SCHEDULED: "bg-blue-50 text-blue-700",
  CONTACTED: "bg-indigo-50 text-indigo-700",
  RESPONDED: "bg-brand-50 text-brand-800",
  NEEDS_REVIEW: "bg-amber-100 text-amber-800",
  BOOKED: "bg-green-100 text-green-800",
  HANDED_OFF: "bg-purple-100 text-purple-800",
  CLOSED: "bg-zinc-200 text-zinc-600",
};

const LABELS: Record<string, string> = {
  NEW: "New",
  OUTREACH_SCHEDULED: "Outreach scheduled",
  CONTACTED: "Contacted",
  RESPONDED: "Responded",
  NEEDS_REVIEW: "Needs review",
  BOOKED: "Booked",
  HANDED_OFF: "Handed off",
  CLOSED: "Closed",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${STYLES[status] ?? STYLES.NEW}`}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
