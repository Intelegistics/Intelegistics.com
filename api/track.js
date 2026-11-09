/**
 * POST /api/track — Vercel Function
 *
 * Receives page-view beacons from assets/js/track.js, adds the visitor's IP,
 * location (from Vercel's edge headers) and device/OS/browser (from the
 * User-Agent), then forwards one row to the Google Apps Script visitor tracker.
 * The Apps Script URL never reaches the browser.
 *
 * Environment variables (Vercel → Project → Settings → Environment Variables):
 *   TRACKER_URL   required  Apps Script web app URL ending in /exec
 *   TRACKER_KEY   required  shared secret; must match the script's TRACKER_KEY (run setup())
 *   IPINFO_TOKEN  optional  IPinfo Lite token (free) — fills the "ISP / Org" column
 *
 * Scope the variables to Production only if preview deployments shouldn't be logged.
 */

const BOT_RE = /bot|crawl|spider|slurp|archiver|facebookexternalhit|embedly|preview|headless|phantom|lighthouse|pagespeed|pingdom|uptime|monitor|curl|wget|python-requests|go-http-client|axios|node-fetch/i;

export async function POST(request) {
  const h = request.headers;
  const done = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

  const target = process.env.TRACKER_URL;
  if (!target) return done();

  // Only accept beacons sent by this site's own pages.
  const fetchSite = h.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return done();

  const ua = h.get("user-agent") || "";
  if (!ua || BOT_RE.test(ua)) return done();

  let b = {};
  try {
    const raw = await request.text();
    if (raw && raw.length <= 8000) b = JSON.parse(raw);
  } catch { /* malformed beacon — log what we can */ }
  if (!b || typeof b !== "object" || Array.isArray(b)) b = {};

  const ip = (h.get("x-real-ip") || (h.get("x-forwarded-for") || "").split(",")[0] || "").trim();
  const event = b.event === "exit" ? "exit" : "load";
  const { device, os, browser } = parseUA(ua, Number(b.touch) || 0);

  const row = {
    key: process.env.TRACKER_KEY || "",
    ip,
    city: decode(h.get("x-vercel-ip-city")),
    region: h.get("x-vercel-ip-country-region") || "",
    country: h.get("x-vercel-ip-country") || "",
    isp: await lookupOrg(ip),
    device,
    os,
    browser,
    screen: str(b.screen, 20),
    tz: str(b.tz, 64),
    lang: str(b.lang, 35),
    ref: str(b.ref, 500),
    url: str(b.url, 500),
    event,
    duration: event === "exit" ? Math.max(0, Math.min(86400, Math.round(Number(b.duration) || 0))) : "",
    vid: str(b.vid, 40),
  };

  try {
    const res = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row),
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    const text = (await res.text()).trim();
    if (!res.ok || text !== "ok") console.error("Tracker rejected row:", res.status, text.slice(0, 120));
  } catch (err) {
    console.error("Tracker forward failed:", err && err.message);
  }
  return done();
}

export function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}


/* ---------------- helpers ---------------- */

function str(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

// Vercel percent-encodes non-ASCII city names (RFC 3986).
function decode(v) {
  if (!v) return "";
  try { return decodeURIComponent(v); } catch { return v; }
}

// ISP / organization via IPinfo Lite (country + ASN data, free). Skipped when no token is set.
async function lookupOrg(ip) {
  const token = process.env.IPINFO_TOKEN;
  if (!token || !ip) return "";
  try {
    const res = await fetch(
      "https://api.ipinfo.io/lite/" + encodeURIComponent(ip) + "?token=" + encodeURIComponent(token),
      { signal: AbortSignal.timeout(1500) }
    );
    if (!res.ok) return "";
    const j = await res.json();
    return j.as_name || "";
  } catch {
    return "";
  }
}

// Lightweight User-Agent parsing — good enough for a visitor log, no dependencies.
function parseUA(ua, touchPoints) {
  let m;

  let os = "Other";
  if ((m = ua.match(/Windows NT ([\d.]+)/))) {
    os = { "10.0": "Windows 10/11", "6.3": "Windows 8.1", "6.2": "Windows 8", "6.1": "Windows 7" }[m[1]] || "Windows";
  } else if ((m = ua.match(/iPhone OS (\d+)[_.](\d+)/))) {
    os = "iOS " + m[1] + "." + m[2];
  } else if ((m = ua.match(/iPad.*?CPU OS (\d+)[_.](\d+)/))) {
    os = "iPadOS " + m[1] + "." + m[2];
  } else if ((m = ua.match(/Android (\d+(?:\.\d+)?)/))) {
    os = "Android " + m[1];
  } else if (/CrOS/.test(ua)) {
    os = "ChromeOS";
  } else if (/Mac OS X/.test(ua)) {
    os = touchPoints > 1 ? "iPadOS" : "macOS";   // iPads in desktop mode report a Mac UA
  } else if (/Linux/.test(ua)) {
    os = "Linux";
  }

  let device = "Desktop";
  if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua) ||
      (/Android/.test(ua) && !/Mobile/.test(ua)) ||
      (/Macintosh/.test(ua) && touchPoints > 1)) {
    device = "Tablet";
  } else if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)) {
    device = "Mobile";
  }

  const rules = [
    [/LinkedInApp/, "LinkedIn in-app"],
    [/FBAN|FBAV/, "Facebook in-app"],
    [/Instagram/, "Instagram in-app"],
    [/Edg(?:e|A|iOS)?\/(\d+)/, "Edge"],
    [/OPR\/(\d+)|OPiOS\/(\d+)/, "Opera"],
    [/SamsungBrowser\/(\d+)/, "Samsung Internet"],
    [/(?:Firefox|FxiOS)\/(\d+)/, "Firefox"],
    [/CriOS\/(\d+)/, "Chrome"],
    [/Chrome\/(\d+)/, "Chrome"],
    [/Version\/(\d+)[\d.]*.*Safari/, "Safari"],
  ];
  let browser = "Other";
  for (const [re, name] of rules) {
    const r = ua.match(re);
    if (r) {
      const ver = r.slice(1).find(Boolean);
      browser = ver ? name + " " + ver : name;
      break;
    }
  }

  return { device, os, browser };
}
