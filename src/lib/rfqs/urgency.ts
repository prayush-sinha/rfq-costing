import { todayIST } from "@/lib/dates";

const dayNumber = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

export function dueUrgency(dueDate: string, today: string): "overdue" | "due_soon" | "ok" {
  const diff = dayNumber(dueDate) - dayNumber(today);
  if (diff < 0) return "overdue";
  if (diff <= 2) return "due_soon";
  return "ok";
}

export { todayIST };
