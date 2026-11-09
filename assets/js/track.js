/* Intelegistics, Inc. — first-party visit tracker (no dependencies)

   Sends a "load" beacon when a page is viewed and an "exit" beacon with
   time on page when the visitor leaves or hides the tab. Beacons go to
   /api/track on this site; that Vercel function adds IP and location and
   forwards the row to the Google Sheet. No cookies are set.

   To stop logging your own visits on a browser, open any page once with
   ?notrack=1 (undo with ?notrack=0). */
(function () {
  "use strict";

  var ENDPOINT = "/api/track";

  if (!/^https?:$/.test(location.protocol)) return;   // local file previews
  if (navigator.webdriver) return;                      // automated browsers

  // Owner opt-out, remembered per browser.
  try {
    var q = new URLSearchParams(location.search).get("notrack");
    if (q === "1") localStorage.setItem("itg_notrack", "1");
    if (q === "0") localStorage.removeItem("itg_notrack");
    if (localStorage.getItem("itg_notrack") === "1") return;
  } catch (e) { /* storage blocked — keep tracking */ }

  var start, viewId, exited;

  function newView() {
    start = Date.now();
    viewId = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    exited = false;
  }

  function payload(event) {
    var tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
    return {
      event: event,
      vid: viewId,
      url: location.href,
      ref: document.referrer || "",
      screen: (screen.width || 0) + "x" + (screen.height || 0),
      tz: tz,
      lang: navigator.language || "",
      touch: navigator.maxTouchPoints || 0
    };
  }

  function send(data) {
    var body = JSON.stringify(data);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, body)) return;
    } catch (e) {}
    try {
      fetch(ENDPOINT, { method: "POST", body: body, keepalive: true, credentials: "omit" });
    } catch (e) {}
  }

  function sendLoad() { send(payload("load")); }

  // One exit per page view: the first time the tab is hidden or the page is left.
  function sendExit() {
    if (exited) return;
    exited = true;
    var d = payload("exit");
    d.duration = Math.round((Date.now() - start) / 1000);
    send(d);
  }

  newView();
  sendLoad();

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") sendExit();
  });
  window.addEventListener("pagehide", sendExit);

  // Back/forward cache restore counts as a new view.
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) { newView(); sendLoad(); }
  });
})();
