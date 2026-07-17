/* ============================================================
   SNT FIELD BOARD — CONFIG
   ============================================================ */

/* 1. Your Apps Script Web App URL (ends with /exec) */
const API_URL = "https://script.google.com/macros/s/AKfycbxGoArXIdlJ2Qy7prS1gOalJXQKAIALhT20kd2X1zf84piIrcrNaCLpSlBSV-rkQzKk/exec";

/* 2. Cutoff hour (24h, IST). Entries at/after this are tagged LATE. */
const CUTOFF_HOUR = 11;

/* 3. MR list — FALLBACK ONLY.
      The live list comes from the "Master" tab of your Google Sheet.
      This copy is used only if the sheet cannot be reached, so the form
      still works on a bad connection. Refresh it now and then. */
let MRS = [
  { id: "mr01", name: "Rohit",       division: "Alkem - Novokem" },
  { id: "mr02", name: "Hiten",       division: "Alkem - Novokem" },
  { id: "mr03", name: "Jayesh",      division: "Alkem - Novokem" },
  { id: "mr04", name: "Krishna",     division: "Alkem - Novokem" },
  { id: "mr05", name: "Pawan",       division: "Alkem - Novokem" },
  { id: "mr06", name: "Siddharth",   division: "Alkem - Novokem" },
  { id: "mr07", name: "Bhavik",      division: "Alkem - Novokem" },
  { id: "mr08", name: "Shukla",      division: "Alkem - Maxxio" },
  { id: "mr09", name: "Mandip",      division: "Alkem - Maxxio" },
  { id: "mr10", name: "Shiv Tiwari", division: "Alkem - Healthcare" },
  { id: "mr11", name: "Siddharth",   division: "Ranbaxy" },
  { id: "mr12", name: "Rahul",       division: "Ranbaxy" },
  { id: "mr13", name: "Vishal",      division: "Ranbaxy" },
  { id: "mr14", name: "Nilesh",      division: "Ranbaxy" },
  { id: "mr15", name: "Vinayak",     division: "Lupin" },
  { id: "mr16", name: "Haresh",      division: "Lupin" },
  { id: "mr17", name: "Sanjay",      division: "Torque" },
  { id: "mr18", name: "Jagdish",     division: "Torque" },
];
let MRS_SOURCE = "fallback";

/* 4. Zones and towns — from Gujarat_MR_Towns_Mapped.xlsx.
      Add a town here, then push to GitHub. An MR can pick several towns
      across several zones in one day (multi-select on the form).
      Note: a town may sit in two zones (e.g. Gandhinagar), so each mark
      records the zone the town was picked under — see index.html. */
const ZONES = {
  "Ahmedabad": [
    "Maninagar", "Narol-Naroda", "Paldi - Ratnamani", "Chandkhera - Gota", "Gandhinagar",
  ],
  "North Gujarat": [
    "Bechraji", "Chanasma", "Chhatral", "Deesa", "Dehgam", "Deodar", "Dhanera",
    "Diyodar", "Gandhinagar", "Harij", "Himmatnagar", "Idar", "Kadi", "Kalol",
    "Mansa", "Mehsana", "Modasa", "Palanpur", "Patan", "Prantij", "Radhanpur",
    "Sanand", "Satlasana", "Shihori", "Thara", "Tharad", "Vadali", "Vadgam",
    "Vijapur", "Viramgam", "Visnagar",
  ],
  "South Gujarat": [
    "Anand", "Asodar", "Balasinor", "Baria", "Borsad", "Dahod", "Dakor",
    "Godhra", "Halol", "Jhalod", "Kapadvanj", "Khambhat", "Lunavada", "Nadiad",
    "Sevalia", "Vadodara", "Ankleshwar", "Bardoli", "Bharuch", "Chikhli",
    "Dharampur", "Kosamba", "Navsari", "Palej", "Silvasa", "Songadh", "Surat",
    "Valsad", "Vansda", "Vapi", "Vyara",
  ],
  "Saurashtra": [
    "Amreli", "Babra", "Bagasara", "Bhavnagar", "Bhuj", "Botad", "Chorwad",
    "Dhoraji", "Dhrangadhra", "Gadhda", "Gandhidham", "Gariadhar", "Gondal",
    "Halvad", "Jamkhambhalia", "Jamnagar", "Jasdan", "Jetpur", "Junagadh",
    "Kalavad", "Keshod", "Kodinar", "Limdi", "Mahuva", "Mandvi-Kutch",
    "Mangrol", "Morbi", "Palitana", "Porbandar", "Prachi", "Rajkot", "Rajula",
    "Rapar", "Savarkundla", "Sihor", "Surendranagar", "Talaja", "Talala",
    "Una", "Veraval", "Wankaner",
  ],
};

/* Order the zones appear on the form */
const ZONE_ORDER = ["Ahmedabad", "North Gujarat", "South Gujarat", "Saurashtra"];

/* Order the zones appear on the dashboard */
const BOARD_ORDER = ["Ahmedabad", "North Gujarat", "South Gujarat", "Saurashtra"];

const ZONE_KEY = {
  "Ahmedabad":     { var: "--z-ahmedabad" },
  "North Gujarat": { var: "--z-north" },
  "South Gujarat": { var: "--z-south" },
  "Saurashtra":    { var: "--z-west" },
};

/* Which zone each town belongs to — a fallback for older marks that
   didn't record a zone per town. A town in two zones resolves to the
   last zone listed above; new marks store the exact zone, so this only
   affects legacy rows. */
const CITY_TO_ZONE = {};
Object.keys(ZONES).forEach(function (z) {
  ZONES[z].forEach(function (c) { if (!(c in CITY_TO_ZONE)) CITY_TO_ZONE[c] = z; });
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
