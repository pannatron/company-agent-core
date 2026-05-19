export interface KpiItem {
  id: string;
  name: string;
  department: string;
  owner: string;
  direction: "higher_is_better" | "lower_is_better";
  target: number;
  current: number;
  unit: string;
  status: "on_track" | "at_risk" | "off_track" | string;
  note?: string;
}

export interface KpiFile {
  updated_at: string;
  kpis: KpiItem[];
}

export function kpiStatusColor(status: string): "ok" | "warn" | "danger" | "muted" {
  switch (status) {
    case "on_track":
      return "ok";
    case "at_risk":
      return "warn";
    case "off_track":
      return "danger";
    default:
      return "muted";
  }
}

export function pctOfTarget(k: KpiItem): number {
  if (k.target === 0) return 0;
  if (k.direction === "lower_is_better") {
    if (k.current === 0) return 100;
    return Math.round((k.target / k.current) * 100);
  }
  return Math.round((k.current / k.target) * 100);
}

export function formatNumber(v: number, unit: string): string {
  if (unit === "THB") {
    return v.toLocaleString("th-TH", { maximumFractionDigits: 0 });
  }
  if (Number.isInteger(v)) return v.toLocaleString("th-TH");
  return v.toFixed(1);
}
