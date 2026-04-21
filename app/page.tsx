"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const PILOTS = ["Reyna", "Clark", "Millea", "Walsh"];
const THIS_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [THIS_YEAR - 1, THIS_YEAR, THIS_YEAR + 1, THIS_YEAR + 2];

const MONTHS = [
  { value: "ALL", label: "All" },
  { value: "01", label: "Jan" },
  { value: "02", label: "Feb" },
  { value: "03", label: "Mar" },
  { value: "04", label: "Apr" },
  { value: "05", label: "May" },
  { value: "06", label: "Jun" },
  { value: "07", label: "Jul" },
  { value: "08", label: "Aug" },
  { value: "09", label: "Sep" },
  { value: "10", label: "Oct" },
  { value: "11", label: "Nov" },
  { value: "12", label: "Dec" },
];

type DutyRow = {
  id: string | null;
  pilot_name: string;
  log_date: string;
  duty_in: string;
  duty_out: string;
  flight_hours: string;
  day_landings: number;
  night_landings: number;
  remarks: string;
  exceedance_reason: string;
  approved_by: string;
  approval_time: string;
  month_key: string;
};

type MonthSignoff = {
  id?: string;
  pilot_name: string;
  month_key: string;
  signed_name?: string;
  signed_at?: string;
  locked?: boolean;
  certification_text?: string;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function makeDateString(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function buildYearRows(year: number, pilot: string): DutyRow[] {
  const rows: DutyRow[] = [];

  for (let month = 1; month <= 12; month++) {
    const count = daysInMonth(year, month);

    for (let day = 1; day <= count; day++) {
      const log_date = makeDateString(year, month, day);

      rows.push({
        id: null,
        pilot_name: pilot,
        log_date,
        duty_in: "OFF",
        duty_out: "",
        flight_hours: "",
        day_landings: 0,
        night_landings: 0,
        remarks: "",
        exceedance_reason: "",
        approved_by: "",
        approval_time: "",
        month_key: `${year}-${pad(month)}`,
      });
    }
  }

  return rows;
}

function sanitizeTimeTyping(value: string) {
  const upper = value.toUpperCase().trim();

  if (!upper) return "";
  if (upper === "OFF") return "OFF";

  return upper.replace(/\D/g, "").slice(0, 4);
}

function normalizeTimeValue(value: string) {
  const raw = value.toUpperCase().trim();

  if (!raw) return "";
  if (raw === "OFF") return "OFF";

  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  let formatted = "";

  if (digits.length === 1 || digits.length === 2) {
    formatted = `${digits.padStart(2, "0")}00`;
  } else if (digits.length === 3) {
    formatted = `0${digits}`;
  } else {
    formatted = digits.slice(0, 4);
  }

  const hh = Number(formatted.slice(0, 2));
  const mm = Number(formatted.slice(2, 4));

  if (hh > 23 || mm > 59) return "";

  return formatted;
}

function parseTimeToMinutes(value: string) {
  const normalized = normalizeTimeValue(value);
  if (!normalized || normalized === "OFF") return null;

  const hh = Number(normalized.slice(0, 2));
  const mm = Number(normalized.slice(2, 4));

  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;

  return hh * 60 + mm;
}

function minutesToHoursString(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${pad(m)}`;
}

function calcDutyMinutes(dutyIn: string, dutyOut: string) {
  const start = parseTimeToMinutes(dutyIn);
  const end = parseTimeToMinutes(dutyOut);

  if (start === null || end === null) return null;
  if (end >= start) return end - start;

  return end + 1440 - start;
}

function parseFlightHours(value: string) {
  const n = parseFloat((value || "").trim());
  return Number.isFinite(n) ? n : 0;
}

function formatFlightHours(value: number) {
  return value.toFixed(1);
}

function getMonthFromDate(dateStr: string) {
  return dateStr.slice(5, 7);
}

function getQuarterFromMonth(month: string) {
  const m = Number(month);
  if (m >= 1 && m <= 3) return 1;
  if (m >= 4 && m <= 6) return 2;
  if (m >= 7 && m <= 9) return 3;
  return 4;
}

function getQuarterFromDate(dateStr: string) {
  return getQuarterFromMonth(getMonthFromDate(dateStr));
}

function addDays(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function prettyDate(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    weekday: "short",
  });
}

function isMeaningfulRow(row: DutyRow) {
  const flight = parseFlightHours(row.flight_hours);

  return (
    row.duty_in !== "OFF" ||
    row.duty_out.trim() !== "" ||
    flight > 0 ||
    row.day_landings > 0 ||
    row.night_landings > 0 ||
    row.remarks.trim() !== "" ||
    row.exceedance_reason.trim() !== "" ||
    row.approved_by.trim() !== "" ||
    row.approval_time.trim() !== ""
  );
}

export default function Page() {
  const [selectedPilot, setSelectedPilot] = useState(PILOTS[0]);
  const [selectedYear, setSelectedYear] = useState(THIS_YEAR);
  const [selectedMonth, setSelectedMonth] = useState("ALL");
  const [rows, setRows] = useState<DutyRow[]>([]);
  const [allLoadedRows, setAllLoadedRows] = useState<DutyRow[]>([]);
  const [signoffs, setSignoffs] = useState<Record<string, MonthSignoff>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function loadData(pilot: string, year: number) {
    setLoading(true);
    setMessage("");

    const visibleYearRows = buildYearRows(year, pilot);
    const queryStart = `${year - 1}-10-01`;
    const queryEnd = `${year}-12-31`;

    const { data: dbRows, error: rowsError } = await supabase
      .from("duty_logs_v2")
      .select("*")
      .eq("pilot_name", pilot)
      .gte("log_date", queryStart)
      .lte("log_date", queryEnd)
      .order("log_date", { ascending: true });

    const { data: signoffRows, error: signoffError } = await supabase
      .from("month_signoffs")
      .select("*")
      .eq("pilot_name", pilot)
      .gte("month_key", `${year}-01`)
      .lte("month_key", `${year}-12`)
      .order("month_key", { ascending: true });

    if (rowsError) {
      setMessage(`Load error: ${rowsError.message}`);
      setRows(visibleYearRows);
      setAllLoadedRows(visibleYearRows);
      setSignoffs({});
      setLoading(false);
      return;
    }

    if (signoffError) {
      setMessage(`Signoff load error: ${signoffError.message}`);
    }

    const db = (dbRows || []).map((r: any) => ({
      id: r.id ?? null,
      pilot_name: r.pilot_name ?? pilot,
      log_date: r.log_date,
      duty_in: r.duty_in ?? "OFF",
      duty_out: r.duty_out ?? "",
      flight_hours:
        r.flight_hours === null || r.flight_hours === undefined ? "" : String(r.flight_hours),
      day_landings: Number(r.day_landings ?? 0),
      night_landings: Number(r.night_landings ?? 0),
      remarks: r.remarks ?? "",
      exceedance_reason: r.exceedance_reason ?? "",
      approved_by: r.approved_by ?? "",
      approval_time: r.approval_time ?? "",
      month_key: r.month_key ?? r.log_date.slice(0, 7),
    })) as DutyRow[];

    const dbByDate = new Map<string, DutyRow>();
    db.forEach((r) => dbByDate.set(r.log_date, r));

    const mergedVisibleYear = visibleYearRows.map((base) => {
      const found = dbByDate.get(base.log_date);
      return found ? found : base;
    });

    const lookbackRows = db.filter((r) => r.log_date < `${year}-01-01`);
    const fullLoaded = [...lookbackRows, ...mergedVisibleYear].sort((a, b) =>
      a.log_date.localeCompare(b.log_date)
    );

    const signoffMap: Record<string, MonthSignoff> = {};
    (signoffRows || []).forEach((s: any) => {
      signoffMap[s.month_key] = s;
    });

    setRows(mergedVisibleYear);
    setAllLoadedRows(fullLoaded);
    setSignoffs(signoffMap);
    setLoading(false);
  }

  useEffect(() => {
    loadData(selectedPilot, selectedYear);
  }, [selectedPilot, selectedYear]);

  function isMonthLocked(monthKey: string) {
    return !!signoffs[monthKey]?.locked;
  }

  function isRowLocked(row: DutyRow) {
    return isMonthLocked(row.month_key);
  }

  function applyBusinessRules(row: DutyRow): DutyRow {
    const next = { ...row };

    if (next.duty_in.toUpperCase() === "OFF") {
      next.duty_in = "OFF";
      next.duty_out = "";
    }

    const dutyMinutes = calcDutyMinutes(next.duty_in, next.duty_out);
    if (dutyMinutes === null || dutyMinutes <= 14 * 60) {
      next.exceedance_reason = "";
      next.approved_by = "";
      next.approval_time = "";
    }

    return next;
  }

  function updateRow(logDate: string, patch: Partial<DutyRow>) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.log_date !== logDate) return row;

        const next = { ...row, ...patch };

        if (patch.flight_hours !== undefined) {
          next.flight_hours = patch.flight_hours.replace(/[^\d.]/g, "");
        }

        if (patch.day_landings !== undefined) {
          next.day_landings = Math.max(0, Number(patch.day_landings || 0));
        }

        if (patch.night_landings !== undefined) {
          next.night_landings = Math.max(0, Number(patch.night_landings || 0));
        }

        return applyBusinessRules(next);
      })
    );

    setAllLoadedRows((prev) =>
      prev.map((row) => {
        if (row.log_date !== logDate) return row;

        const next = { ...row, ...patch };

        if (patch.flight_hours !== undefined) {
          next.flight_hours = patch.flight_hours.replace(/[^\d.]/g, "");
        }

        if (patch.day_landings !== undefined) {
          next.day_landings = Math.max(0, Number(patch.day_landings || 0));
        }

        if (patch.night_landings !== undefined) {
          next.night_landings = Math.max(0, Number(patch.night_landings || 0));
        }

        return applyBusinessRules(next);
      })
    );
  }

  function normalizeTimeField(logDate: string, field: "duty_in" | "duty_out" | "approval_time") {
    const target = rows.find((r) => r.log_date === logDate);
    if (!target) return;

    const currentValue = target[field] ?? "";
    const normalized = normalizeTimeValue(currentValue);

    if (field === "duty_in") {
      updateRow(logDate, { duty_in: normalized || "OFF" });
      return;
    }

    if (field === "duty_out") {
      updateRow(logDate, { duty_out: normalized });
      return;
    }

    updateRow(logDate, { approval_time: normalized });
  }

  const displayedRows = useMemo(() => {
    if (selectedMonth === "ALL") return rows;
    return rows.filter((r) => getMonthFromDate(r.log_date) === selectedMonth);
  }, [rows, selectedMonth]);

  const derivedByDate = useMemo(() => {
    const map: Record<
      string,
      {
        dutyMinutes: number | null;
        restText: string;
        restOk: boolean | null;
        flight24Status: string;
        dayCurrent: boolean;
        nightCurrent: boolean;
      }
    > = {};

    const sorted = [...allLoadedRows].sort((a, b) => a.log_date.localeCompare(b.log_date));

    for (let i = 0; i < sorted.length; i++) {
      const row = sorted[i];
      const dutyMinutes = calcDutyMinutes(row.duty_in, row.duty_out);
      const flightHours = parseFlightHours(row.flight_hours);
      const flight24Status = flightHours > 8 ? "OVER 8.0" : "OK";

      let restText = "";
      let restOk: boolean | null = null;

      if (i > 0 && normalizeTimeValue(row.duty_in) !== "OFF") {
        const prev = sorted[i - 1];

        if (normalizeTimeValue(prev.duty_in) === "OFF") {
          restText = "24+";
          restOk = true;
        } else if (prev.duty_out) {
          const prevOut = parseTimeToMinutes(prev.duty_out);
          const currIn = parseTimeToMinutes(row.duty_in);

          if (prevOut !== null && currIn !== null) {
            let restMinutes = currIn - prevOut;
            if (restMinutes < 0) restMinutes += 1440;

            if (restMinutes >= 1440) {
              restText = "24+";
              restOk = true;
            } else {
              restText = minutesToHoursString(restMinutes);
              restOk = restMinutes >= 600;
            }
          }
        }
      }

      const start90 = addDays(row.log_date, -89);
      const windowRows = sorted.filter(
        (r) => r.log_date >= start90 && r.log_date <= row.log_date
      );

      const dayLanding90 = windowRows.reduce(
        (sum, r) => sum + Number(r.day_landings || 0),
        0
      );

      const nightLanding90 = windowRows.reduce(
        (sum, r) => sum + Number(r.night_landings || 0),
        0
      );

      const nightCurrent = nightLanding90 >= 3;
      const dayCurrent = dayLanding90 >= 3 || nightCurrent;

      if (row.log_date.startsWith(`${selectedYear}-`)) {
        map[row.log_date] = {
          dutyMinutes,
          restText,
          restOk,
          flight24Status,
          dayCurrent,
          nightCurrent,
        };
      }
    }

    return map;
  }, [allLoadedRows, selectedYear]);

  const totals = useMemo(() => {
    const monthRows =
      selectedMonth === "ALL"
        ? []
        : rows.filter((r) => getMonthFromDate(r.log_date) === selectedMonth);

    const monthFlight = monthRows.reduce(
      (sum, r) => sum + parseFlightHours(r.flight_hours),
      0
    );

    const monthDayLandings = monthRows.reduce(
      (sum, r) => sum + Number(r.day_landings || 0),
      0
    );

    const monthNightLandings = monthRows.reduce(
      (sum, r) => sum + Number(r.night_landings || 0),
      0
    );

    let quarterFlight = 0;
    let twoQuarterFlight = 0;

    if (selectedMonth !== "ALL") {
      const currentQuarter = getQuarterFromMonth(selectedMonth);
      const previousQuarter = currentQuarter - 1;

      quarterFlight = rows
        .filter((r) => getQuarterFromDate(r.log_date) === currentQuarter)
        .reduce((sum, r) => sum + parseFlightHours(r.flight_hours), 0);

      twoQuarterFlight = rows
        .filter((r) => {
          const q = getQuarterFromDate(r.log_date);
          return q === currentQuarter || q === previousQuarter;
        })
        .reduce((sum, r) => sum + parseFlightHours(r.flight_hours), 0);
    }

    const yearFlight = rows.reduce(
      (sum, r) => sum + parseFlightHours(r.flight_hours),
      0
    );

    return {
      monthFlight,
      monthDayLandings,
      monthNightLandings,
      quarterFlight,
      twoQuarterFlight,
      yearFlight,
    };
  }, [rows, selectedMonth]);

  async function saveChanges() {
    setSaving(true);
    setMessage("");

    try {
      const unlockedRows = rows.filter((row) => !isMonthLocked(row.month_key));

      for (const row of unlockedRows) {
        const normalizedDutyIn = normalizeTimeValue(row.duty_in) || "OFF";
        const normalizedDutyOut = normalizeTimeValue(row.duty_out);
        const normalizedApprovalTime = normalizeTimeValue(row.approval_time);

        const prepared: DutyRow = applyBusinessRules({
          ...row,
          duty_in: normalizedDutyIn,
          duty_out: normalizedDutyOut === "OFF" ? "" : normalizedDutyOut,
          approval_time: normalizedApprovalTime === "OFF" ? "" : normalizedApprovalTime,
        });

        const payload = {
          pilot_name: prepared.pilot_name,
          log_date: prepared.log_date,
          duty_in: prepared.duty_in || "OFF",
          duty_out: prepared.duty_out || "",
          flight_hours: prepared.flight_hours === "" ? null : parseFlightHours(prepared.flight_hours),
          day_landings: Number(prepared.day_landings || 0),
          night_landings: Number(prepared.night_landings || 0),
          remarks: prepared.remarks || "",
          exceedance_reason: prepared.exceedance_reason || "",
          approved_by: prepared.approved_by || "",
          approval_time: prepared.approved_by ? prepared.approval_time || "" : "",
          month_key: prepared.month_key,
        };

        if (row.id) {
          const { error } = await supabase
            .from("duty_logs_v2")
            .update(payload)
            .eq("id", row.id);

          if (error) throw error;
        } else if (isMeaningfulRow(prepared)) {
          const { data, error } = await supabase
            .from("duty_logs_v2")
            .insert(payload)
            .select()
            .single();

          if (error) throw error;

          setRows((prev) =>
            prev.map((r) => (r.log_date === row.log_date ? { ...prepared, id: data.id } : r))
          );

          setAllLoadedRows((prev) =>
            prev.map((r) => (r.log_date === row.log_date ? { ...prepared, id: data.id } : r))
          );
        }
      }

      setMessage("Saved successfully.");
      await loadData(selectedPilot, selectedYear);
    } catch (err: any) {
      setMessage(`Save error: ${err.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  }

  async function signMonth() {
    if (selectedMonth === "ALL") {
      setMessage("Select a single month before signing.");
      return;
    }

    const monthKey = `${selectedYear}-${selectedMonth}`;

    if (isMonthLocked(monthKey)) {
      setMessage("That month is already locked.");
      return;
    }

    const signedName = window.prompt("Type your name to sign this month:");
    if (!signedName || !signedName.trim()) {
      setMessage("Signing cancelled.");
      return;
    }

    const confirmed = window.confirm(
      `By signing, ${selectedPilot} ${monthKey} will be locked. Continue?`
    );

    if (!confirmed) {
      setMessage("Signing cancelled.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      await saveChanges();

      const existing = signoffs[monthKey];
      const payload = {
        pilot_name: selectedPilot,
        month_key: monthKey,
        signed_name: signedName.trim(),
        signed_at: new Date().toISOString(),
        locked: true,
        certification_text: "I certify this monthly flight and duty log is accurate.",
      };

      if (existing?.id) {
        const { error } = await supabase
          .from("month_signoffs")
          .update(payload)
          .eq("id", existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("month_signoffs").insert(payload);
        if (error) throw error;
      }

      setMessage(`Signed and locked ${monthKey}.`);
      await loadData(selectedPilot, selectedYear);
    } catch (err: any) {
      setMessage(`Sign error: ${err.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  }

  async function unlockMonth() {
    if (selectedMonth === "ALL") {
      setMessage("Select a single month before unlocking.");
      return;
    }

    const monthKey = `${selectedYear}-${selectedMonth}`;
    const existing = signoffs[monthKey];

    if (!existing?.locked) {
      setMessage("That month is not locked.");
      return;
    }

    const adminName = window.prompt("Type admin name to unlock this month:");
    if (!adminName || !adminName.trim()) {
      setMessage("Unlock cancelled.");
      return;
    }

    const confirmed = window.confirm(
      `Unlock ${selectedPilot} ${monthKey}? This will allow editing again.`
    );

    if (!confirmed) {
      setMessage("Unlock cancelled.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      if (existing.id) {
        const { error } = await supabase
          .from("month_signoffs")
          .update({
            locked: false,
            certification_text: `Unlocked by ${adminName.trim()} on ${new Date().toLocaleString()}`,
          })
          .eq("id", existing.id);

        if (error) throw error;
      }

      setMessage(`Unlocked ${monthKey}.`);
      await loadData(selectedPilot, selectedYear);
    } catch (err: any) {
      setMessage(`Unlock error: ${err.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  }

  const selectedMonthKey =
    selectedMonth === "ALL" ? "" : `${selectedYear}-${selectedMonth}`;

  const selectedMonthLocked =
    selectedMonth === "ALL" ? false : isMonthLocked(selectedMonthKey);

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-4 md:px-10 md:py-6 lg:px-14">
      <div className="max-w-[1700px] space-y-4">
        <div className="rounded-2xl bg-white p-5 shadow">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Flight & Duty Log</h1>
              <p className="text-sm text-slate-600">Table: duty_logs_v2</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Pilot
                </label>
                <select
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2"
                  value={selectedPilot}
                  onChange={(e) => setSelectedPilot(e.target.value)}
                >
                  {PILOTS.map((pilot) => (
                    <option key={pilot} value={pilot}>
                      {pilot}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Year
                </label>
                <select
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                >
                  {YEAR_OPTIONS.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Month
                </label>
                <select
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                >
                  {MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                onClick={saveChanges}
                disabled={loading || saving}
              >
                {saving ? "Saving..." : "Save"}
              </button>

              <button
                className="rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                onClick={signMonth}
                disabled={loading || saving || selectedMonth === "ALL" || selectedMonthLocked}
              >
                Sign Month
              </button>

              <button
                className="rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                onClick={unlockMonth}
                disabled={loading || saving || selectedMonth === "ALL" || !selectedMonthLocked}
              >
                Unlock Month
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            {selectedMonth !== "ALL" && (
              <span
                className={`rounded-full px-3 py-1 font-semibold ${
                  selectedMonthLocked
                    ? "bg-red-100 text-red-700"
                    : "bg-green-100 text-green-700"
                }`}
              >
                {selectedMonthLocked ? "Month Locked" : "Month Unlocked"}
              </span>
            )}

            {message && (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                {message}
              </span>
            )}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <div className="rounded-2xl bg-white p-4 shadow">
            <div className="text-sm text-slate-500">Monthly Flight</div>
            <div className="text-2xl font-bold text-slate-900">
              {selectedMonth === "ALL" ? "-" : formatFlightHours(totals.monthFlight)}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow">
            <div className="text-sm text-slate-500">Monthly Day Landings</div>
            <div className="text-2xl font-bold text-slate-900">
              {selectedMonth === "ALL" ? "-" : totals.monthDayLandings}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow">
            <div className="text-sm text-slate-500">Monthly Night Landings</div>
            <div className="text-2xl font-bold text-slate-900">
              {selectedMonth === "ALL" ? "-" : totals.monthNightLandings}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow">
            <div className="text-sm text-slate-500">Quarter Flight</div>
            <div className="text-2xl font-bold text-slate-900">
              {selectedMonth === "ALL" ? "-" : formatFlightHours(totals.quarterFlight)}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow">
            <div className="text-sm text-slate-500">2-Quarter Flight</div>
            <div className="text-2xl font-bold text-slate-900">
              {selectedMonth === "ALL" ? "-" : formatFlightHours(totals.twoQuarterFlight)}
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow">
          <div className="text-sm text-slate-500">Year Flight Total</div>
          <div className="text-3xl font-bold text-slate-900">
            {formatFlightHours(totals.yearFlight)}
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl bg-white shadow">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-slate-200 text-slate-800">
              <tr>
                <th className="border px-2 py-2 text-left">Date</th>
                <th className="border px-2 py-2 text-left">Duty In</th>
                <th className="border px-2 py-2 text-left">Duty Out</th>
                <th className="border px-2 py-2 text-left">Duty Hrs</th>
                <th className="border px-2 py-2 text-left">Rest</th>
                <th className="border px-2 py-2 text-left">Flight Hrs</th>
                <th className="border px-2 py-2 text-left">24h Flight</th>
                <th className="border px-2 py-2 text-left">Day Ldg</th>
                <th className="border px-2 py-2 text-left">Night Ldg</th>
                <th className="border px-2 py-2 text-left">Day Current</th>
                <th className="border px-2 py-2 text-left">Night Current</th>
                <th className="border px-2 py-2 text-left">Remarks</th>
                <th className="border px-2 py-2 text-left">Exceedance Reason</th>
                <th className="border px-2 py-2 text-left">Approved By</th>
                <th className="border px-2 py-2 text-left">Approval Time</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td className="border px-3 py-4 text-center" colSpan={15}>
                    Loading...
                  </td>
                </tr>
              ) : (
                displayedRows.map((row) => {
                  const d = derivedByDate[row.log_date];
                  const dutyOver14 = (d?.dutyMinutes || 0) > 14 * 60;
                  const rowLocked = isRowLocked(row);

                  return (
                    <tr key={row.log_date} className="odd:bg-white even:bg-slate-50">
                      <td className="border px-2 py-2 whitespace-nowrap font-medium">
                        {prettyDate(row.log_date)}
                      </td>

                      <td className="border px-2 py-2">
                        <input
                          className="w-20 rounded border px-2 py-1 font-mono"
                          maxLength={4}
                          value={row.duty_in}
                          disabled={rowLocked}
                          onChange={(e) =>
                            updateRow(row.log_date, {
                              duty_in: sanitizeTimeTyping(e.target.value),
                            })
                          }
                          onBlur={() => normalizeTimeField(row.log_date, "duty_in")}
                        />
                      </td>

                      <td className="border px-2 py-2">
                        <input
                          className="w-20 rounded border px-2 py-1 font-mono"
                          maxLength={4}
                          value={row.duty_out}
                          disabled={rowLocked || normalizeTimeValue(row.duty_in) === "OFF"}
                          onChange={(e) =>
                            updateRow(row.log_date, {
                              duty_out: sanitizeTimeTyping(e.target.value),
                            })
                          }
                          onBlur={() => normalizeTimeField(row.log_date, "duty_out")}
                        />
                      </td>

                      <td
                        className={`border px-2 py-2 font-semibold ${
                          d?.dutyMinutes === null
                            ? ""
                            : dutyOver14
                            ? "bg-red-100 text-red-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {d?.dutyMinutes === null ? "" : minutesToHoursString(d.dutyMinutes)}
                      </td>

                      <td
                        className={`border px-2 py-2 font-semibold ${
                          d?.restOk === null
                            ? ""
                            : d.restOk
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {d?.restText || ""}
                      </td>

                      <td className="border px-2 py-2">
                        <input
                          className="w-20 rounded border px-2 py-1"
                          value={row.flight_hours}
                          disabled={rowLocked}
                          onChange={(e) =>
                            updateRow(row.log_date, { flight_hours: e.target.value })
                          }
                        />
                      </td>

                      <td
                        className={`border px-2 py-2 font-semibold ${
                          d?.flight24Status === "OVER 8.0"
                            ? "bg-red-100 text-red-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {d?.flight24Status || "OK"}
                      </td>

                      <td className="border px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          className="w-16 rounded border px-2 py-1"
                          value={row.day_landings}
                          disabled={rowLocked}
                          onChange={(e) =>
                            updateRow(row.log_date, {
                              day_landings: Number(e.target.value || 0),
                            })
                          }
                        />
                      </td>

                      <td className="border px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          className="w-16 rounded border px-2 py-1"
                          value={row.night_landings}
                          disabled={rowLocked}
                          onChange={(e) =>
                            updateRow(row.log_date, {
                              night_landings: Number(e.target.value || 0),
                            })
                          }
                        />
                      </td>

                      <td
                        className={`border px-2 py-2 font-semibold ${
                          d?.dayCurrent
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {d?.dayCurrent ? "CURRENT" : "NOT CURRENT"}
                      </td>

                      <td
                        className={`border px-2 py-2 font-semibold ${
                          d?.nightCurrent
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {d?.nightCurrent ? "CURRENT" : "NOT CURRENT"}
                      </td>

                      <td className="border px-2 py-2">
                        <input
                          className="w-56 rounded border px-2 py-1"
                          value={row.remarks}
                          disabled={rowLocked}
                          onChange={(e) =>
                            updateRow(row.log_date, { remarks: e.target.value })
                          }
                        />
                      </td>

                      <td className="border px-2 py-2">
                        <input
                          className="w-56 rounded border px-2 py-1"
                          value={row.exceedance_reason}
                          disabled={rowLocked || !dutyOver14}
                          onChange={(e) =>
                            updateRow(row.log_date, {
                              exceedance_reason: e.target.value,
                            })
                          }
                        />
                      </td>

                      <td className="border px-2 py-2">
                        <input
                          className="w-36 rounded border px-2 py-1"
                          value={row.approved_by}
                          disabled={rowLocked || !dutyOver14}
                          onChange={(e) =>
                            updateRow(row.log_date, { approved_by: e.target.value })
                          }
                        />
                      </td>

                      <td className="border px-2 py-2">
                        <input
                          className="w-24 rounded border px-2 py-1 font-mono"
                          maxLength={4}
                          value={row.approval_time}
                          disabled={rowLocked || !dutyOver14}
                          onChange={(e) =>
                            updateRow(row.log_date, {
                              approval_time: sanitizeTimeTyping(e.target.value),
                            })
                          }
                          onBlur={() => normalizeTimeField(row.log_date, "approval_time")}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
