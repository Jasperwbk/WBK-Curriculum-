export type GaugeStatus = "green" | "yellow" | "red";

export interface GaugeProps {
  label: string;
  expectedHours: number;
  actualHours: number;
  balanceHours: number;
  status: GaugeStatus;
}

const STATUS_COLOR: Record<GaugeStatus, string> = {
  green: "var(--status-good)",
  yellow: "var(--status-warning)",
  red: "var(--status-critical)",
};

function fmt(hours: number): string {
  return `${hours.toFixed(1)} hrs`;
}

export function Gauge({ label, expectedHours, actualHours, balanceHours, status }: GaugeProps) {
  const color = STATUS_COLOR[status];
  const meterMax = Math.max(actualHours, expectedHours, 1) * 1.15;
  const fillPct = Math.min((actualHours / meterMax) * 100, 100);
  const pacePct = Math.min((expectedHours / meterMax) * 100, 100);
  const banked = balanceHours >= 0;

  return (
    <div
      className="rounded-lg border p-3"
      style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {label}
        </span>
        <span
          className="text-xs whitespace-nowrap"
          title={banked ? "Banked surplus" : "Behind pace"}
        >
          <span style={{ color }}>{"●"}</span>{" "}
          <span style={{ color: "var(--text-secondary)" }}>
            {banked ? "+" : "−"}
            {Math.abs(balanceHours).toFixed(1)} {banked ? "banked" : "behind"}
          </span>
        </span>
      </div>

      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          {fmt(actualHours)}
        </span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          of {fmt(expectedHours)} expected to date
        </span>
      </div>

      <div className="relative mt-2 h-2.5 rounded-full overflow-visible" style={{ background: "var(--gridline)" }}>
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${fillPct}%`, background: color }}
        />
        <div
          className="absolute top-[-2px] bottom-[-2px] w-px"
          style={{ left: `${pacePct}%`, background: "var(--text-muted)" }}
          title="Pace marker: where you should be today"
        />
      </div>
    </div>
  );
}
