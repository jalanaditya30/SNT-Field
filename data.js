/* ============================================================
   SNT FIELD BOARD — CONFIG
   ============================================================ */

/* 1. Your Apps Script Web App URL (ends with /exec) */
const API_URL = "https://script.google.com/macros/s/AKfycbxmeRQfNJNubCfN2fGwhMqt6KSS-j6x5BeXUjHTAedEULs_1mfGNSv-f2P9y4w5J1xs/exec";

/* 2. Cutoff hour (24h, IST). Entries at/after this are tagged LATE. */
const CUTOFF_HOUR = 11;

/* 3. MR list — FALLBACK ONLY.
      The live list comes from the "Master" tab of your Google Sheet.
      This copy is used only if the sheet cannot be reached, so the form
      still works on a bad connection. Refresh it now and then. */
let MRS = [
  { id: "mr01", name: "Rohit",    division: "Alkem" },
  { id: "mr02", name: "Sukla ji", division: "Alkem" },
  { id: "mr03", name: "Vinayak", division: "Lupin" },
  { id: "mr04", name: "MR Four",  division: "Novocamp" },
];
let MRS_SOURCE = "fallback";

/* 4. Zones and towns — from Gujarat_MR_Zones.xlsx.
      Add a town here, then push to GitHub. An MR can pick several towns
      across several zones in one day (multi-select on the form). */
const ZONES = {
  "Ahmedabad": [
    "Sabarmati", "Bopal",
  ],
  "North Gujarat": [
    "Gandhinagar", "Mehsana", "Patan", "Palanpur",
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

/* Order the zones appear on the form */
const ZONE_ORDER = ["Ahmedabad", "North Gujarat", "Central Gujarat", "South Gujarat", "Saurashtra & Kutch"];

/* Order the zones appear on the dashboard */
const BOARD_ORDER = ["Ahmedabad", "North Gujarat", "Central Gujarat", "Saurashtra & Kutch", "South Gujarat"];

const ZONE_KEY = {
  "Ahmedabad":          { var: "--z-ahmedabad" },
  "North Gujarat":      { var: "--z-north" },
  "Central Gujarat":    { var: "--z-central" },
  "South Gujarat":      { var: "--z-south" },
  "Saurashtra & Kutch": { var: "--z-west" },
};

/* Which zone each town belongs to — built once from ZONES so the
   dashboard can place an MR under the right zone even when they logged
   towns across several zones in one entry. */
const CITY_TO_ZONE = {};
Object.keys(ZONES).forEach(function (z) {
  ZONES[z].forEach(function (c) { CITY_TO_ZONE[c] = z; });
});

/* Split a stored comma-joined field ("Sabarmati, Bopal") into a clean list. */
function splitList(s) {
  return String(s == null ? "" : s)
    .split(",")
    .map(function (x) { return x.trim(); })
    .filter(Boolean);
}

/* 5. Non-field statuses. WORKING is handled separately. */
const STATUSES = [
  { code: "WORKING", label: "Working in field", field: true },
  { code: "OFFICE",  label: "SNT Office",       field: false },
  { code: "LEAVE",   label: "On leave",         field: false },
];

/* ---- shared helpers ---- */
function todayIST() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
function prettyDateIST() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long",
  }).format(new Date());
}

/* Fetch JSON from the Apps Script API. When Google answers with an HTML
   page instead of JSON (sign-in page, "page not found", authorisation
   screen), explain the real problem instead of "Unexpected token '<'". */
async function apiFetch(url, options) {
  const res = await fetch(url, Object.assign({ redirect: "follow" }, options || {}));
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    const err = new Error(
      /^\s*</.test(text)
        ? "The Google Script link is answering with a web page, not data. " +
          "Owner: in Apps Script go Deploy ▸ Manage deployments ▸ ✏️, set " +
          "“Who has access” to “Anyone”, pick “New version”, Deploy — and check " +
          "API_URL in data.js matches the current /exec URL"
        : "Unexpected reply from the server (HTTP " + res.status + ")"
    );
    err.apiConfig = true;
    throw err;
  }
}

/* Seed MRS from the last list we saw, so names appear instantly on a
   return visit instead of waiting for the network. */
function primeMastersFromCache() {
  try {
    const c = JSON.parse(localStorage.getItem("snt_mrs") || "null");
    if (Array.isArray(c) && c.length) { MRS = c; return true; }
  } catch (e) {}
  return false;
}

/* Pull the live MR list from the Master tab. Falls back silently. */
async function loadMaster() {
  try {
    const out = await apiFetch(API_URL + "?config=1&t=" + Date.now());
    if (out && out.ok && Array.isArray(out.mrs) && out.mrs.length) {
      MRS = out.mrs;
      MRS_SOURCE = "sheet";
      try { localStorage.setItem("snt_mrs", JSON.stringify(out.mrs)); } catch (e) {}
      return true;
    }
  } catch (e) { /* keep fallback */ }
  MRS_SOURCE = "fallback";
  return false;
}
