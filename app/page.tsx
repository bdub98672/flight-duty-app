"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import emailjs from "@emailjs/browser";

/* TYPES */
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

/* CONSTANTS */
const PILOTS = ["Reyna", "Clark", "Millea", "Walsh"];
const MONTHS = ["All", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const EMAILJS_SERVICE_ID = "service_jkhfj8f";
const EMAILJS_TEMPLATE_ID = "template_i71y0rr";
const EMAILJS_PUBLIC_KEY = "w35RaQpB8GMh64M41";

const DUTY_LOG_RECIPIENTS = "bwalsh@superiorhelicopter.com";

/* HELPERS */
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
  const start = new Date(`${year}-01-01`);
  const end = new Date(`${year + 1}-01-01`);
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    rows.push(emptyRow(new Date(d).toISOString().slice(0, 10)));
  }
  return rows;
}

function monthKey(date: string) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/* COMPONENT */
export default function HomePage() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [pilot, setPilot] = useState("Walsh");
  const [data, setData] = useState<Record<string, Row[]>>(
    Object.fromEntries(PILOTS.map((p) => [p, buildYearRows()]))
  );
  const [status, setStatus] = useState("Loading...");
  const [signature, setSignature] = useState("");

  async function load() {
    try {
      const res = await supabase.from("duty_logs").select("*");
      if (res.error) throw res.error;

      const updated = { ...data };
      for (const row of res.data || []) {
        const list = updated[row.pilot_name];
        if (!list) continue;
        const index = list.findIndex((r) => r.date === row.log_date);
        if (index >= 0) {
          list[index] = {
            ...list[index],
            dutyIn: row.duty_in || "",
            dutyOut: row.duty_out || "",
            flightHours: row.flight_hours || "",
          };
        }
      }

      setData(updated);
      setStatus("Loaded");
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : "Load failed");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function signMonth() {
    try {
      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        {
          pilot_name: pilot,
          signature,
        },
        EMAILJS_PUBLIC_KEY
      );
      setStatus("Signed + Email Sent");
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : "Email failed");
    }
  }

  const rows = data[pilot] || [];

  return (
    <main className="page">
      <div className="container">
        <h1>Flight & Duty Log</h1>

        <div className="card">
          <strong>Status:</strong> {status}
        </div>

        <div className="tabs">
          {PILOTS.map((p) => (
            <button key={p} onClick={() => setPilot(p)}>
              {p}
            </button>
          ))}
        </div>

        <div className="card">
          <input
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder="Type name to sign"
          />
          <button onClick={signMonth}>Sign Month</button>
        </div>

        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Duty In</th>
                <th>Duty Out</th>
                <th>Flight Hours</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.date}>
                  <td>{r.date}</td>
                  <td>{r.dutyIn}</td>
                  <td>{r.dutyOut}</td>
                  <td>{r.flightHours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
