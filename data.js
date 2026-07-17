/* ============================================================
   SNT FIELD BOARD — CONFIG
   Edit this file only. Nothing else needs touching to add MRs.
   ============================================================ */

/* 1. Paste your Apps Script Web App URL here (ends with /exec) */
const API_URL = "https://script.google.com/macros/s/AKfycbwCM-2r1-WTmYQCjhkXZFZk9DB9xZv-s7pnXaqB1no31TQVlwkYv9lgSQ2dl6dbCGvs/exec";

/* 2. Cutoff hour (24h, IST). Entries after this are tagged LATE. */
const CUTOFF_HOUR = 11;

/* 3. MR master list. Add rows as you roll out.
      id must be unique and must never change once used. */
const MRS = [
  { id: "mr01", name: "Rohit",    division: "LCM" },
  { id: "mr02", name: "Sukla ji", division: "LCM" },
  { id: "mr03", name: "MR Three", division: "Novocamp" },
  { id: "mr04", name: "MR Four",  division: "Novocamp" },
];

/* 4. Zones and towns — from Gujarat_MR_Zones.xlsx */
const ZONES = {
  "North Gujarat": [
    "Ahmedabad", "Gandhinagar", "Mehsana", "Patan", "Palanpur",
    "Himmatnagar", "Modasa", "Unjha", "Visnagar", "Kadi",
  ],
  "Central Gujarat": [
    "Vadodara", "Anand", "Nadiad", "Godhra", "Dahod",
    "Halol", "Kapadvanj", "Mahisagar",
  ],
  "South Gujarat": [
    "Surat", "Navsari", "Valsad", "Bharuch", "Vapi",
    "Ankleshwar", "Bilimora", "Vyara", "Ahwa",
  ],
  "Saurashtra & Kutch": [
    "Rajkot", "Jamnagar", "Junagadh", "Bhavnagar", "Porbandar",
    "Morbi", "Gondal", "Amreli", "Surendranagar", "Bhuj", "Gandhidham",
  ],
};

/* 5. Zone display order + colour key (used by both pages) */
const ZONE_ORDER = ["North Gujarat", "Central Gujarat", "South Gujarat", "Saurashtra & Kutch"];
const ZONE_KEY = {
  "North Gujarat":     { abbr: "N", var: "--z-north" },
  "Central Gujarat":   { abbr: "C", var: "--z-central" },
  "South Gujarat":     { abbr: "S", var: "--z-south" },
  "Saurashtra & Kutch":{ abbr: "W", var: "--z-west" },
};

/* 6. Non-field statuses. "Working" is handled separately. */
const STATUSES = [
  { code: "WORKING", label: "Working in field", field: true },
  { code: "HQ",      label: "Travelling to HQ", field: false },
  { code: "OFFICE",  label: "SNT Office",       field: false },
  { code: "LEAVE",   label: "On leave",         field: false },
];

/* ---- helpers shared by both pages ---- */
function todayIST() {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  });
  return f.format(new Date()); // YYYY-MM-DD
}
function prettyDateIST() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long",
  }).format(new Date());
}
