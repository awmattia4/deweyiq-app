"use client"

/**
 * TeamDashboard — Owner-only team management dashboard.
 *
 * Displays:
 * - Alerts section: cert expiry, forgotten clock-outs, break violations, pending PTO
 * - Employee grid: live status cards with today/week hours, PTO balance, alert badges
 * - Labor cost section: date range analysis with per-employee + per-customer tables + bar chart
 *
 * Auto-refreshes employee status every 60 seconds.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  getTeamDashboard,
  getLaborCostAnalysis,
  getTeamAlerts,
  forceClockOut,
} from "@/actions/team-dashboard"
import type {
  EmployeeDashboardEntry,
  TeamAlert,
  PerEmployeeCost,
  PerCustomerCost,
  LaborCostSummary,
} from "@/actions/team-dashboard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"

// ─── Types ─────────────────────────────────────────────────────────────────────

interface TeamDashboardProps {
  initialEmployees: EmployeeDashboardEntry[]
  initialAlerts: TeamAlert[]
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatHours(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount)
}

/** Returns the local YYYY-MM-DD date string for N days ago. */
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const pad = (x: number) => String(x).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Returns today as YYYY-MM-DD in local time. */
function todayLocal(): string {
  return daysAgo(0)
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

// ─── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: EmployeeDashboardEntry["status"] }) {
  const config: Record<
    EmployeeDashboardEntry["status"],
    { label: string; className: string; pulse?: boolean }
  > = {
    clocked_in: {
      label: "Clocked In",
      className: "border-emerald-500/40 text-emerald-400",
      pulse: true,
    },
    on_break: {
      label: "On Break",
      className: "border-amber-500/40 text-amber-400",
    },
    clocked_out: {
      label: "Clocked Out",
      className: "border-sky-500/40 text-sky-400",
    },
    off_shift: {
      label: "Off Shift",
      className: "border-border text-muted-foreground",
    },
  }

  const { label, className, pulse } = config[status]

  return (
    <div className="flex items-center gap-1.5">
      {pulse && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
      )}
      <Badge variant="outline" className={className}>
        {label}
      </Badge>
    </div>
  )
}

// ─── Employee card ─────────────────────────────────────────────────────────────

function EmployeeCard({ employee }: { employee: EmployeeDashboardEntry }) {
  const hasAlerts = employee.expiring_cert_count > 0 || employee.pending_pto_count > 0

  return (
    <Card className="p-4 flex flex-col gap-3">
      {/* Header: avatar + name + status */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-sm font-semibold">
          {employee.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={employee.avatar_url}
              alt={employee.full_name}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            getInitials(employee.full_name)
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{employee.full_name}</p>
          <p className="text-xs text-muted-foreground capitalize">{employee.role}</p>
        </div>
        {hasAlerts && (
          <div className="flex gap-1 shrink-0">
            {employee.expiring_cert_count > 0 && (
              <Badge variant="outline" className="border-red-500/40 text-red-400 text-xs px-1.5">
                {employee.expiring_cert_count} cert{employee.expiring_cert_count > 1 ? "s" : ""}
              </Badge>
            )}
            {employee.pending_pto_count > 0 && (
              <Badge variant="outline" className="border-amber-500/40 text-amber-400 text-xs px-1.5">
                {employee.pending_pto_count} PTO
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Status badge */}
      <StatusBadge status={employee.status} />

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="flex flex-col gap-0.5">
          <p className="text-xs text-muted-foreground">Today</p>
          <p className="text-sm font-semibold">{formatHours(employee.today_hours)}</p>
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="text-xs text-muted-foreground">This Week</p>
          <p className="text-sm font-semibold">{formatHours(employee.week_hours)}</p>
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="text-xs text-muted-foreground">Stops</p>
          <p className="text-sm font-semibold">{employee.stops_today}</p>
        </div>
      </div>

      {/* PTO balance */}
      <div className="flex items-center justify-between pt-1 border-t border-border/60">
        <p className="text-xs text-muted-foreground">PTO Balance</p>
        <p className="text-xs font-medium">{employee.pto_balance_hours.toFixed(1)} hrs</p>
      </div>
    </Card>
  )
}

// ─── Alert item ────────────────────────────────────────────────────────────────

function AlertItem({
  alert,
  onForceClockOut,
  onApprovePto,
}: {
  alert: TeamAlert
  onForceClockOut?: (timeEntryId: string) => Promise<void>
  onApprovePto?: (ptoRequestId: string) => void
}) {
  const [loading, setLoading] = useState(false)

  const severityClass =
    alert.severity === "critical"
      ? "border-red-500/30 bg-red-500/5"
      : "border-amber-500/30 bg-amber-500/5"

  const badgeClass =
    alert.severity === "critical"
      ? "border-red-500/40 text-red-400"
      : "border-amber-500/40 text-amber-400"

  const typeLabel: Record<TeamAlert["type"], string> = {
    cert_expiry: "Certification",
    forgotten_clock_out: "Clock-Out",
    break_violation: "Break",
    pending_pto: "PTO Request",
  }

  return (
    <div className={`rounded-lg border p-3 flex items-start gap-3 ${severityClass}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <Badge variant="outline" className={`text-xs ${badgeClass}`}>
            {typeLabel[alert.type]}
          </Badge>
          <p className="text-sm font-medium truncate">{alert.title}</p>
        </div>
        <p className="text-xs text-muted-foreground">{alert.description}</p>
      </div>

      {/* Action buttons */}
      {alert.type === "forgotten_clock_out" && onForceClockOut && alert.metadata?.time_entry_id && (
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 text-xs"
          disabled={loading}
          onClick={async () => {
            setLoading(true)
            try {
              await onForceClockOut(String(alert.metadata!.time_entry_id))
            } finally {
              setLoading(false)
            }
          }}
        >
          {loading ? "Clocking out..." : "Force Clock Out"}
        </Button>
      )}

      {alert.type === "pending_pto" && onApprovePto && alert.metadata?.pto_request_id && (
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 text-xs"
          onClick={() => onApprovePto(String(alert.metadata!.pto_request_id))}
        >
          Review
        </Button>
      )}
    </div>
  )
}

// ─── Labor Cost Section ────────────────────────────────────────────────────────

interface LaborCostSectionProps {
  initialStartDate: string
  initialEndDate: string
}

function LaborCostSection({ initialStartDate, initialEndDate }: LaborCostSectionProps) {
  const [startDate, setStartDate] = useState(initialStartDate)
  const [endDate, setEndDate] = useState(initialEndDate)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [perEmployee, setPerEmployee] = useState<PerEmployeeCost[]>([])
  const [perCustomer, setPerCustomer] = useState<PerCustomerCost[]>([])
  const [summary, setSummary] = useState<LaborCostSummary | null>(null)

  const fetchCosts = useCallback(
    async (start: string, end: string) => {
      setLoading(true)
      setError(null)
      try {
        const result = await getLaborCostAnalysis(start, end)
        if (result.success) {
          setPerEmployee(result.data.per_employee)
          setPerCustomer(result.data.per_customer)
          setSummary(result.data.summary)
        } else {
          setError(result.error)
        }
      } catch {
        setError("Failed to load labor cost data")
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    fetchCosts(startDate, endDate)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleApply = () => {
    fetchCosts(startDate, endDate)
  }

  // Bar chart data: per employee
  const chartData = perEmployee.map((e) => ({
    name: e.tech_name.split(" ")[0], // First name for brevity
    "Labor Cost": e.total_cost,
    Hours: e.total_hours,
  }))

  return (
    <div className="flex flex-col gap-6">
      {/* Date range picker */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">From</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-md border border-border bg-background text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-md border border-border bg-background text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <Button size="sm" variant="outline" onClick={handleApply} disabled={loading}>
          {loading ? "Loading..." : "Apply"}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Summary KPI cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Labor Cost", value: formatCurrency(summary.total_cost) },
            { label: "Avg Cost / Stop", value: formatCurrency(summary.avg_cost_per_stop) },
            { label: "Total Stops", value: String(summary.total_stops) },
            { label: "Total Hours", value: formatHours(summary.total_hours) },
          ].map(({ label, value }) => (
            <Card key={label} className="p-4 flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-lg font-semibold">{value}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Bar chart: labor cost by employee */}
      {perEmployee.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Labor Cost by Employee</p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#94a3b8" }} />
                <YAxis
                  yAxisId="cost"
                  tick={{ fontSize: 12, fill: "#94a3b8" }}
                  tickFormatter={(v) => `$${v}`}
                />
                <YAxis
                  yAxisId="hours"
                  orientation="right"
                  tick={{ fontSize: 12, fill: "#94a3b8" }}
                  tickFormatter={(v) => `${v}h`}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }}
                  labelStyle={{ color: "#f1f5f9" }}
                  formatter={(value, name) => [
                    name === "Labor Cost" ? formatCurrency(Number(value)) : `${value}h`,
                    name,
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
                <Bar yAxisId="cost" dataKey="Labor Cost" fill="#60a5fa" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="hours" dataKey="Hours" fill="#34d399" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Per-employee table */}
      {perEmployee.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">By Employee</p>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Employee</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Hours</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Stops</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Total Cost</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Cost/Stop</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {perEmployee.map((emp) => (
                  <tr key={emp.tech_id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5">
                      <div>
                        <p className="font-medium">{emp.tech_name}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {emp.pay_type === "per_stop" ? "Per stop" : "Hourly"} · {formatCurrency(emp.pay_rate)}/
                          {emp.pay_type === "per_stop" ? "stop" : "hr"}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">{formatHours(emp.total_hours)}</td>
                    <td className="px-4 py-2.5 text-right">{emp.total_stops}</td>
                    <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(emp.total_cost)}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">
                      {emp.total_stops > 0 ? formatCurrency(emp.cost_per_stop) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : !loading && (
        <p className="text-sm text-muted-foreground italic">
          No labor cost data for the selected date range.
        </p>
      )}

      {/* Per-customer table */}
      {perCustomer.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">By Customer</p>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Customer</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Visits</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Onsite Time</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Total Cost</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Avg / Visit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {perCustomer.map((cust) => (
                  <tr key={cust.customer_id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5 font-medium">{cust.customer_name}</td>
                    <td className="px-4 py-2.5 text-right">{cust.total_visits}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">
                      {formatHours(cust.total_onsite_minutes / 60)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(cust.total_cost)}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">
                      {formatCurrency(cust.avg_cost_per_visit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── TeamDashboard ─────────────────────────────────────────────────────────────

export function TeamDashboard({ initialEmployees, initialAlerts }: TeamDashboardProps) {
  const [employees, setEmployees] = useState<EmployeeDashboardEntry[]>(initialEmployees)
  const [alerts, setAlerts] = useState<TeamAlert[]>(initialAlerts)
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date())
  const [activeView, setActiveView] = useState<"overview" | "labor">("overview")

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const [dashResult, alertResult] = await Promise.all([
        getTeamDashboard(),
        getTeamAlerts(),
      ])
      if (dashResult.success) {
        setEmployees(dashResult.data.employees)
      }
      if (alertResult.success) {
        setAlerts(alertResult.data)
      }
      setLastRefreshed(new Date())
    } catch {
      // Silent — stale data is acceptable for dashboard
    } finally {
      setRefreshing(false)
    }
  }, [])

  // Auto-refresh every 60 seconds
  useEffect(() => {
    intervalRef.current = setInterval(refresh, 60_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [refresh])

  const handleForceClockOut = useCallback(
    async (timeEntryId: string) => {
      const result = await forceClockOut(timeEntryId)
      if (result.success) {
        // Remove from alerts and refresh employee statuses
        setAlerts((prev) =>
          prev.filter(
            (a) => !(a.type === "forgotten_clock_out" && String(a.metadata?.time_entry_id) === timeEntryId)
          )
        )
        refresh()
      }
    },
    [refresh]
  )

  const today = todayLocal()
  // Labor cost defaults: last 30 days
  const defaultStart = daysAgo(29)

  return (
    <div className="flex flex-col gap-6">
      {/* View toggle + refresh */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 p-1 rounded-lg bg-muted/40 border border-border/60">
          <button
            onClick={() => setActiveView("overview")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeView === "overview"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Team Overview
          </button>
          <button
            onClick={() => setActiveView("labor")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeView === "labor"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Labor Costs
          </button>
        </div>

        <div className="flex items-center gap-2">
          {refreshing && (
            <span className="text-xs text-muted-foreground">Refreshing...</span>
          )}
          {!refreshing && (
            <span className="text-xs text-muted-foreground">
              Updated {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <Button size="sm" variant="outline" onClick={refresh} disabled={refreshing}>
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Overview view ──────────────────────────────────────────────────────── */}
      {activeView === "overview" && (
        <div className="flex flex-col gap-6">
          {/* Alerts section */}
          {alerts.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-foreground">
                Alerts
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {alerts.length} item{alerts.length !== 1 ? "s" : ""} requiring attention
                </span>
              </h2>
              <div className="flex flex-col gap-2">
                {alerts.map((alert) => (
                  <AlertItem
                    key={alert.id}
                    alert={alert}
                    onForceClockOut={handleForceClockOut}
                    onApprovePto={() => {
                      // Navigate to PTO tab for full approve/deny workflow
                      // Since we're in the dashboard tab, we just note this is handled in PTO tab
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Employee grid */}
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-foreground">
              Team Status
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {employees.filter((e) => e.status === "clocked_in").length} clocked in today
              </span>
            </h2>

            {employees.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No team members found.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {employees.map((emp) => (
                  <EmployeeCard key={emp.id} employee={emp} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Labor cost view ────────────────────────────────────────────────────── */}
      {activeView === "labor" && (
        <LaborCostSection initialStartDate={defaultStart} initialEndDate={today} />
      )}
    </div>
  )
}
