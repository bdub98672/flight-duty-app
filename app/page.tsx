"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import emailjs from "@emailjs/browser";

type Row = {
  date: string;
  dutyIn: string;
  dutyOut: string;
  flightHours: string | number;
  dayLandings: string | number;
  nightLandings: string | number;
  remarks: string;
  exceedanceReason: string;
  approvedBy: string;
  approvalTime: string;
};

type Signoff = {
  signature: string;
  signedAt: string;
  monthKey: string;
  locked: boolean;
};

const PILOTS = ["Reyna", "Clark", "Millea", "Walsh"];
const MONTHS = ["All", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CERT_TEXT =
  "I certify that this month’s duty, flight time, landing, rest, and exceedance entries are complete and accurate to the best of my knowledge.";

const EMAILJS_SERVICE_ID = "service_jkhfj8f";
const EMAILJS_TEMPLATE_ID = "template_i71y0rr";
const EMAILJS_PUBLIC_KEY = "w35RaQpB8GMh64M41";

// test with one address first
const DUTY_LOG_RECIPIENTS = "bwalsh@superiorhelicopter.com";

const emptyRow = (date: string): Row => ({
  date,
  dutyIn: "OFF",
  dutyOut: "",
  flightHours: "",
  dayLandings: "",
  nightLandings: "",
  remarks: "",
  exceedanceReason: "",
  approvedBy: "",
  approvalTime: "",
});

function buildYearRows(year = 2026): Row[] {
  const rows: Row[] = [];
  const start = new Date(`${year}-01-01T00:00:00`);
  const end = new Date(`${year + 1}-01-01T00:00:00`);
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    rows.push(emptyRow(new Date(d).toISOString().slice(0, 10)));
  }
  return rows;
}

function monthKeyFromDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthName(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleString("en-US", { month: "short" });
}

function monthLabelFromKey(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

function parseTimeToMinutes(value: string) {
  if (!value || value.toUpperCase?.() === "OFF") return null;
  const clean = String(value).trim();
  if (/^\d{4}$/.test(clean)) {
    const h = Number(clean.slice(0, 2));
    const m = Number(clean.slice(2, 4));
    if (h > 23 || m > 59) return null;
    return h * 60 + m;
  }
  if (/^\d{1,2}:\d{2}$/.test(clean)) {
    const [h, m] = clean.split(":").map(Number);
    if (h > 23 || m > 59) return null;
    return h * 60 + m;
  }
  return null;
}

function fmtHours(hours: unknown) {
  if (hours === null || hours === undefined || Number.isNaN(Number(hours))) return "";
  return Number(hours).toFixed(2).replace(/\.00$/, "");
}

function mergeCloudRows(baseRows: Row[], cloudRows: any[]): Row[] {
  const map = new Map(cloudRows.map((r) => [r.log_date, r]));
  return baseRows.map((row) => {
    const c = map.get(row.date);
    if (!c) return row;
    return {
      ...row,
      dutyIn: c.duty_in ?? row.dutyIn,
      dutyOut: c.duty_out ?? row.dutyOut,
      flightHours: c.flight_hours ?? row.flightHours,
      dayLandings: c.day_landings ?? row.dayLandings,
      nightLandings: c.night_landings ?? row.nightLandings,
      remarks: c.remarks ?? row.remarks,
      exceedanceReason: c.exceedance_reason ?? row.exceedanceReason,
      approvedBy: c.approved_by ?? row.approvedBy,
      approvalTime: c.approval_time ?? row.approvalTime,
    };
  });
}

function computeRows(rows: Row[]) {
  return rows.map((row, index) => {
    const dutyInMin = parseTimeToMinutes(String(row.dutyIn));
    const dutyOutMin = parseTimeToMinutes(String(row.dutyOut));

    let dutyHours: number | null = null;
    if (dutyInMin !== null && dutyOutMin !== null) {
      dutyHours =
        dutyOutMin >= dutyInMin
          ? (dutyOutMin - dutyInMin) / 60
          : ((24 * 60 - dutyInMin) + dutyOutMin) / 60;
    }

    const prev = rows[index - 1];
    let restDisplay = "";
    let restHours: number | null = null;
    if (String(row.dutyIn).toUpperCase() !== "OFF" && dutyInMin !== null && prev) {
      if (String(prev.dutyIn).toUpperCase() === "OFF") {
        restDisplay = "24+";
      } else {
        const prevOutMin = parseTimeToMinutes(String(prev.dutyOut));
        if (prevOutMin !== null) {
          const restMin =
            dutyInMin >= prevOutMin
              ? dutyInMin - prevOutMin
              : ((24 * 60 - prevOutMin) + dutyInMin);
          restHours = restMin / 60;
          restDisplay = restHours >= 24 ? "24+" : fmtHours(restHours);
        }
      }
    }

    const day90 = rows.slice(Math.max(0, index - 89), index + 1);
    const dayLandings90 = day90.reduce((sum, r) => sum + Number(r.dayLandings || 0), 0);
    const nightLandings90 = day90.reduce((sum, r) => sum + Number(r.nightLandings || 0), 0);

    const dayCurrent = nightLandings90 >= 3 || dayLandings90 >= 3 ? "CURRENT" : "NOT CURRENT";
    const nightCurrent = nightLandings90 >= 3 ? "CURRENT" : "NOT CURRENT";
    const dutyExceedance = dutyHours !== null && dutyHours > 14 ? "EXCEEDANCE" : "";

    const currentDate = new Date(row.date + "T00:00:00");
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();
    const currentQuarter = Math.floor(currentMonth / 3);

    const monthFlightHours = rows.reduce((sum, r, i) => {
      if (i > index) return sum;
      const d = new Date(r.date + "T00:00:00");
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth ? sum + Number(r.flightHours || 0) : sum;
    }, 0);

    const quarterFlightHours = rows.reduce((sum, r, i) => {
      if (i > index) return sum;
      const d = new Date(r.date + "T00:00:00");
      return d.getFullYear() === currentYear && Math.floor(d.getMonth() / 3) === currentQuarter ? sum + Number(r.flightHours || 0) : sum;
    }, 0);

    const consecutiveQuarterFlightHours = rows.reduce((sum, r, i) => {
      if (i > index) return sum;
      const d = new Date(r.date + "T00:00:00");
      const yearDiff = currentYear - d.getFullYear();
      const quarterDiff = (currentQuarter - Math.floor(d.getMonth() / 3)) + yearDiff * 4;
      return quarterDiff >= 0 && quarterDiff <= 1 ? sum + Number(r.flightHours || 0) : sum;
    }, 0);

    const yearFlightHours = rows.reduce((sum, r, i) => {
      if (i > index) return sum;
      const d = new Date(r.date + "T00:00:00");
      return d.getFullYear() === currentYear ? sum + Number(r.flightHours || 0) : sum;
    }, 0);

    const validationErrors: string[] = [];
    if (String(row.dutyIn) && String(row.dutyIn) !== "OFF" && dutyInMin === null) validationErrors.push("Duty In invalid");
    if (String(row.dutyOut) && dutyOutMin === null) validationErrors.push("Duty Out invalid");
    if (String(row.flightHours) !== "" && Number.isNaN(Number(row.flightHours))) validationErrors.push("Flight Hours invalid");
    if (String(row.dayLandings) !== "" && Number.isNaN(Number(row.dayLandings))) validationErrors.push("Day Landings invalid");
    if (String(row.nightLandings) !== "" && Number.isNaN(Number(row.nightLandings))) validationErrors.push("Night Landings invalid");
    if (dutyExceedance && (!row.exceedanceReason || !row.approvedBy)) validationErrors.push("Exceedance documentation incomplete");

    return {
      ...row,
      monthKey: monthKeyFromDate(row.date),
      month: monthName(row.date),
      dutyHours,
      restHours,
      restDisplay,
      dayCurrent,
      nightCurrent,
      dutyExceedance,
      monthFlightHours,
      quarterFlightHours,
      consecutiveQuarterFlightHours,
      yearFlightHours,
      validationErrors,
    };
  });
}

export default function HomePage() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [selectedPilot, setSelectedPilot] = useState("Walsh");
  const [selectedMonth, setSelectedMonth] = useState("All");
  const [actorName, setActorName] = useState("Operations Admin");
  const [userRole, setUserRole] = useState("admin");
  const [data, setData] = useState<Record<string, Row[]>>(
    Object.fromEntries(PILOTS.map((p) => [p, buildYearRows()]))
  );
  const [signoffs, setSignoffs] = useState<Record<string, Record<string, Signoff>>>({});
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [signatureDraft, setSignatureDraft] = useState("");
  const [certifyChecked, setCertifyChecked] = useState(false);
  const [status, setStatus] = useState("Loading from Supabase...");
  const [busy, setBusy] = useState(false);

  const computed = useMemo(() => computeRows(data[selectedPilot] || []), [data, selectedPilot]);
  const visibleRows = useMemo(
    () => (selectedMonth === "All" ? computed : computed.filter((r: any) => r.month === selectedMonth)),
    [computed, selectedMonth]
  );

  const availableMonthKeys = useMemo(() => Array.from(new Set(computed.map((r: any) => r.monthKey))), [computed]);
  const activeMonthKey = useMemo(() => {
    if (selectedMonth === "All") return availableMonthKeys[availableMonthKeys.length - 1] || "2026-12";
    const sample = computed.find((r: any) => r.month === selectedMonth);
    return sample ? sample.monthKey : availableMonthKeys[0];
  }, [selectedMonth, computed, availableMonthKeys]);

  const activeSignoff = signoffs[selectedPilot]?.[activeMonthKey];
  const activeMonthLocked = Boolean(activeSignoff?.locked);

  const summary = useMemo(() => {
    const totalFlight = visibleRows.reduce((s: number, r: any) => s + Number(r.flightHours || 0), 0);
    const exceedances = visibleRows.filter((r: any) => r.dutyExceedance).length;
    const notCurrent = visibleRows.filter((r: any) => r.dayCurrent === "NOT CURRENT" || r.nightCurrent === "NOT CURRENT").length;
    const shortRest = visibleRows.filter((r: any) => typeof r.restHours === "number" && r.restHours < 10).length;
    const validationIssues = visibleRows.reduce((sum: number, r: any) => sum + r.validationErrors.length, 0);
    return { totalFlight, exceedances, notCurrent, shortRest, validationIssues };
  }, [visibleRows]);

  async function loadCloudData() {
    setBusy(true);
    try {
      const yearStart = "2026-01-01";
      const yearEnd = "2026-12-31";
      const [logsRes, signRes, auditRes] = await Promise.all([
        supabase.from("duty_logs")
          .select("pilot_name, log_date, duty_in, duty_out, flight_hours, day_landings, night_landings, remarks, exceedance_reason, approved_by, approval_time")
          .gte("log_date", yearStart)
          .lte("log_date", yearEnd)
          .order("log_date"),
        supabase.from("month_signoffs")
          .select("pilot_name, month_key, signed_name, signed_at, locked")
          .like("month_key", "2026-%"),
        supabase.from("audit_events")
          .select("pilot_name, month_key, actor_name, action, details, created_at")
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      if (logsRes.error) throw logsRes.error;
      if (signRes.error) throw signRes.error;
      if (auditRes.error) throw auditRes.error;

      const nextData: Record<string, Row[]> = Object.fromEntries(PILOTS.map((p) => [p, buildYearRows()]));
      for (const pilot of PILOTS) {
        nextData[pilot] = mergeCloudRows(buildYearRows(), (logsRes.data || []).filter((r) => r.pilot_name === pilot));
      }
      setData(nextData);

      const nextSignoffs: Record<string, Record<string, Signoff>> = {};
      for (const s of signRes.data || []) {
        nextSignoffs[s.pilot_name] ||= {};
        nextSignoffs[s.pilot_name][s.month_key] = {
          signature: s.signed_name,
          signedAt: new Date(s.signed_at).toLocaleString(),
          monthKey: s.month_key,
          locked: s.locked,
        };
      }
      setSignoffs(nextSignoffs);
      setAuditLog(auditRes.data || []);
      setStatus("Connected to Supabase.");
    } catch (err: any) {
      setStatus(err.message || "Failed to load data.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadCloudData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveCurrentPilot() {
    setBusy(true);
    try {
      const payload = (data[selectedPilot] || []).map((row) => ({
        pilot_name: selectedPilot,
        log_date: row.date,
        duty_in: row.dutyIn || null,
        duty_out: row.dutyOut || null,
        flight_hours: String(row.flightHours) === "" ? null : Number(row.flightHours),
        day_landings: String(row.dayLandings) === "" ? null : Number(row.dayLandings),
        night_landings: String(row.nightLandings) === "" ? null : Number(row.nightLandings),
        remarks: row.remarks || null,
        exceedance_reason: row.exceedanceReason || null,
        approved_by: row.approvedBy || null,
        approval_time: row.approvalTime || null,
        month_key: monthKeyFromDate(row.date),
        updated_by_name: actorName,
      }));

      const { error } = await supabase
        .from("duty_logs")
        .upsert(payload, { onConflict: "pilot_name,log_date" });

      if (error) throw error;

      await supabase.from("audit_events").insert({
        pilot_name: selectedPilot,
        month_key: activeMonthKey,
        actor_name: actorName,
        action: "LOGS_SAVED",
        details: { scope: "pilot-year", year: 2026 },
      });

      setStatus("Saved to Supabase.");
      await loadCloudData();
    } catch (err: any) {
      setStatus(err.message || "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function signMonth() {
    if (!signatureDraft.trim() || !certifyChecked || selectedMonth === "All") return;
    setBusy(true);
    try {
      const monthRows = (data[selectedPilot] || []).filter(
        (row) => monthKeyFromDate(row.date) === activeMonthKey
      );

      const payload = monthRows.map((row) => ({
        pilot_name: selectedPilot,
        log_date: row.date,
        duty_in: row.dutyIn || null,
        duty_out: row.dutyOut || null,
        flight_hours: String(row.flightHours) === "" ? null : Number(row.flightHours),
        day_landings: String(row.dayLandings) === "" ? null : Number(row.dayLandings),
        night_landings: String(row.nightLandings) === "" ? null : Number(row.nightLandings),
        remarks: row.remarks || null,
        exceedance_reason: row.exceedanceReason || null,
        approved_by: row.approvedBy || null,
        approval_time: row.approvalTime || null,
        month_key: monthKeyFromDate(row.date),
        updated_by_name: actorName,
      }));

      const saveRes = await supabase
        .from("duty_logs")
        .upsert(payload, { onConflict: "pilot_name,log_date" });

      if (saveRes.error) throw saveRes.error;

      const signedAtIso = new Date().toISOString();

      const { error } = await supabase
        .from("month_signoffs")
        .upsert(
          {
            pilot_name: selectedPilot,
            month_key: activeMonthKey,
            signed_name: signatureDraft.trim(),
            signed_at: signedAtIso,
            locked: true,
            certification_text: CERT_TEXT,
          },
          { onConflict: "pilot_name,month_key" }
        );

      if (error) throw error;

      try {
        const emailResult = await emailjs.send(
          EMAILJS_SERVICE_ID,
          EMAILJS_TEMPLATE_ID,
          {
            to_email: DUTY_LOG_RECIPIENTS,
            pilot_name: selectedPilot,
            month: activeMonthKey,
            month_label: monthLabelFromKey(activeMonthKey),
            signed_name: signatureDraft.trim(),
            signed_at: new Date(signedAtIso).toLocaleString(),
            status: "Signed and locked",
          },
          EMAILJS_PUBLIC_KEY
        );

        console.log("EmailJS success:", emailResult);
      } catch (emailErr) {
        console.error("EmailJS failed:", emailErr);
        setStatus("Month signed and locked, but email failed. Check console.");
      }

      await supabase.from("audit_events").insert([
        {
          pilot_name: selectedPilot,
          month_key: activeMonthKey,
          actor_name: actorName,
          action: "LOGS_SAVED",
          details: {
            scope: "selected-month",
            month_key: activeMonthKey,
            triggered_by: "sign_month",
          },
        },
        {
          pilot_name: selectedPilot,
          month_key: activeMonthKey,
          actor_name: actorName,
          action: "MONTH_SIGNED",
          details: { signed_name: signatureDraft.trim() },
        },
      ]);

      setSignatureDraft("");
      setCertifyChecked(false);
      await loadCloudData();
      setStatus("Month signed and locked.");
    } catch (err: any) {
      setStatus(err.message || "Sign-off failed.");
    } finally {
      setBusy(false);
    }
  }

  async function unlockMonth() {
    if (userRole !== "admin" || !activeSignoff) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("month_signoffs")
        .update({ locked: false })
        .eq("pilot_name", selectedPilot)
        .eq("month_key", activeMonthKey);
      if (error) throw error;

      await supabase.from("audit_events").insert({
        pilot_name: selectedPilot,
        month_key: activeMonthKey,
        actor_name: actorName,
        action: "MONTH_UNLOCKED",
        details: { reason: "admin correction" },
      });

      setStatus("Month unlocked.");
      await loadCloudData();
    } catch (err: any) {
      setStatus(err.message || "Unlock failed.");
    } finally {
      setBusy(false);
    }
  }

  function updateRow(date: string, field: keyof Row, value: string) {
    const rowMonthKey = monthKeyFromDate(date);
    if (signoffs[selectedPilot]?.[rowMonthKey]?.locked) return;
    setData((prev) => ({
      ...prev,
      [selectedPilot]: prev[selectedPilot].map((row) =>
        row.date === date ? { ...row, [field]: value } : row
      ),
    }));
  }

  function badgeClass(type: string, value: any) {
    if (type === "rest") {
      if (value === "24+") return "badge green";
      if (value === "") return "badge muted";
      return Number(value) < 10 ? "badge red" : "badge green";
    }
    if (type === "duty") {
      if (value === null || value === "") return "badge muted";
      return value > 14 ? "badge red" : "badge green";
    }
    if (type === "currency") return value === "CURRENT" ? "badge green" : "badge red";
    if (type === "issue") return value ? "badge amber" : "badge green";
    return "badge muted";
  }

  return (
    <main className="page">
      <div className="container">
        <div className="topbar">
          <div>
            <h1>Flight &amp; Duty Log</h1>
            <p className="subtle">Deployable Next.js + Supabase version with sign-off, locking, and audit trail.</p>
          </div>
          <button className="btn" onClick={saveCurrentPilot} disabled={busy}>{busy ? "Working..." : "Save to Cloud"}</button>
        </div>

        <div className="card">
          <div className="status-row">
            <div><strong>Status:</strong> {status}</div>
            <button className="btn secondary" onClick={loadCloudData} disabled={busy}>Refresh</button>
          </div>
          <div className="filters">
            <input className="input" value={actorName} onChange={(e) => setActorName(e.target.value)} placeholder="User name" />
            <select className="input" value={userRole} onChange={(e) => setUserRole(e.target.value)}>
              <option value="admin">Admin</option>
              <option value="pilot">Pilot</option>
            </select>
            <select className="input" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
              {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        <div className="tabs">
          {PILOTS.map((pilot) => (
            <button
              key={pilot}
              className={pilot === selectedPilot ? "tab active" : "tab"}
              onClick={() => setSelectedPilot(pilot)}
            >
              {pilot}
            </button>
          ))}
        </div>

        <div className="grid4">
          <div className="metric"><div className="label">Flight Hours</div><div className="value">{fmtHours(summary.totalFlight)}</div></div>
          <div className="metric"><div className="label">Duty Exceedances</div><div className="value">{summary.exceedances}</div></div>
          <div className="metric"><div className="label">Short Rest</div><div className="value">{summary.shortRest}</div></div>
          <div className="metric"><div className="label">Validation Issues</div><div className="value">{summary.validationIssues}</div></div>
        </div>

        <div className="card">
          <h2>Monthly Pilot Sign-Off</h2>
          <div className="signoff-grid">
            <div className="mini-card"><div className="label">Pilot</div><div className="value small">{selectedPilot}</div></div>
            <div className="mini-card"><div className="label">Month</div><div className="value small">{monthLabelFromKey(activeMonthKey || "2026-01")}</div></div>
            <div className="mini-card"><div className="label">Status</div><div className="value small">{activeSignoff ? "Signed" : "Unsigned"}</div></div>
            <div className="mini-card"><div className="label">Signed At</div><div className="value tiny">{activeSignoff?.signedAt || "—"}</div></div>
          </div>
          <div className="notice">{CERT_TEXT}</div>
          <div className="sign-row">
            <div className="sign-controls">
              <input className="input" value={signatureDraft} onChange={(e) => setSignatureDraft(e.target.value)} placeholder="Type full name to sign" disabled={selectedMonth === "All" || activeMonthLocked} />
              <label className="checkbox">
                <input type="checkbox" checked={certifyChecked} onChange={(e) => setCertifyChecked(e.target.checked)} disabled={selectedMonth === "All" || activeMonthLocked} />
                <span>I acknowledge this digital signature represents my certification of the selected month.</span>
              </label>
            </div>
            <button className="btn" onClick={signMonth} disabled={!signatureDraft.trim() || !certifyChecked || selectedMonth === "All" || activeMonthLocked}>Sign Month</button>
            <button className="btn secondary" onClick={unlockMonth} disabled={userRole !== "admin" || !activeMonthLocked}>Unlock Month</button>
          </div>
        </div>

        <div className="card">
          <h2>{selectedPilot} Log Entries</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Duty In</th><th>Duty Out</th><th>Duty Hours</th><th>Flight Hours</th>
                  <th>Day</th><th>Night</th><th>Day Current</th><th>Night Current</th><th>24hr Rest</th>
                  <th>Month Hrs</th><th>Quarter Hrs</th><th>2Q Hrs</th><th>Year Hrs</th>
                  <th>Duty Exceedance</th><th>Reason</th><th>Approved By</th><th>Approval Time</th><th>Remarks</th><th>Validation</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row: any) => {
                  const rowLocked = Boolean(signoffs[selectedPilot]?.[row.monthKey]?.locked);
                  return (
                    <tr key={row.date}>
                      <td>{row.date}</td>
                      <td><input className="cell-input" value={row.dutyIn} onChange={(e) => updateRow(row.date, "dutyIn", e.target.value)} disabled={rowLocked} /></td>
                      <td><input className="cell-input" value={row.dutyOut} onChange={(e) => updateRow(row.date, "dutyOut", e.target.value)} disabled={rowLocked} /></td>
                      <td><span className={badgeClass("duty", row.dutyHours)}>{row.dutyHours === null ? "" : fmtHours(row.dutyHours)}</span></td>
                      <td><input className="cell-input" value={String(row.flightHours)} onChange={(e) => updateRow(row.date, "flightHours", e.target.value)} disabled={rowLocked} /></td>
                      <td><input className="cell-input" value={String(row.dayLandings)} onChange={(e) => updateRow(row.date, "dayLandings", e.target.value)} disabled={rowLocked} /></td>
                      <td><input className="cell-input" value={String(row.nightLandings)} onChange={(e) => updateRow(row.date, "nightLandings", e.target.value)} disabled={rowLocked} /></td>
                      <td><span className={badgeClass("currency", row.dayCurrent)}>{row.dayCurrent}</span></td>
                      <td><span className={badgeClass("currency", row.nightCurrent)}>{row.nightCurrent}</span></td>
                      <td><span className={badgeClass("rest", row.restDisplay)}>{row.restDisplay}</span></td>
                      <td><span className="badge neutral">{fmtHours(row.monthFlightHours)}</span></td>
                      <td><span className="badge neutral">{fmtHours(row.quarterFlightHours)}</span></td>
                      <td><span className="badge neutral">{fmtHours(row.consecutiveQuarterFlightHours)}</span></td>
                      <td><span className="badge neutral">{fmtHours(row.yearFlightHours)}</span></td>
                      <td>{row.dutyExceedance ? <span className="badge red">EXCEEDANCE</span> : ""}</td>
                      <td><input className="cell-input" value={row.exceedanceReason} onChange={(e) => updateRow(row.date, "exceedanceReason", e.target.value)} disabled={rowLocked} /></td>
                      <td><input className="cell-input" value={row.approvedBy} onChange={(e) => updateRow(row.date, "approvedBy", e.target.value)} disabled={rowLocked} /></td>
                      <td><input className="cell-input" value={row.approvalTime} onChange={(e) => updateRow(row.date, "approvalTime", e.target.value)} disabled={rowLocked} /></td>
                      <td><textarea className="cell-textarea" value={row.remarks} onChange={(e) => updateRow(row.date, "remarks", e.target.value)} disabled={rowLocked} /></td>
                      <td><span className={badgeClass("issue", row.validationErrors.length)}>{row.validationErrors.length ? `${row.validationErrors.length} issues` : "Clean"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h2>Recent Audit Events</h2>
          <div className="audit-list">
            {auditLog.length === 0 ? <div className="subtle">No audit events yet.</div> : auditLog.map((item, idx) => (
              <div key={idx} className="audit-item">
                <div><strong>{item.action}</strong> — {item.actor_name || "System"}</div>
                <div className="subtle">{item.created_at ? new Date(item.created_at).toLocaleString() : ""}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
