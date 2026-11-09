/* Intelegistics, Inc. — background photo preloader (no dependencies)

   Once the current page has finished loading and the browser is idle, this
   quietly downloads the photos used on the site's OTHER pages, so they are
   already in the browser cache and appear instantly when a visitor clicks
   through.

   How it works
   - Finds the other pages from this page's own links (same-site .html links),
     fetches each page's HTML and reads its photo <img> tags. Nothing to
     maintain: add a photo to any page and it gets preloaded automatically.
   - Downloads two photos at a time at low priority, so it never competes
     with the page the visitor is looking at.
   - Hovering, focusing or touching a link moves that page's photos to the
     front of the line, and asks supporting browsers (Chrome/Edge) to
     prefetch that page's HTML too.
   - Skips visitors with Data Saver on or on very slow (2G) connections,
     and automated browsers.
   - Remembers what it has fetched for the rest of the browser session, so
     moving between pages doesn't repeat the work.

   Fetching HTML with fetch() and parsing it with DOMParser never runs that
   page's scripts, so preloading does not trigger the visit tracker. */
(function () {
  "use strict";

  if (!/^https?:$/.test(location.protocol)) return;   // local file previews
  if (navigator.webdriver) return;                      // automated browsers

  var conn = navigator.connection || {};
  if (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || "")) return;

  var PHOTO_SELECTOR = 'img[src*="assets/img/photos/"]';
  var CONCURRENCY = 2;
  var STORE_KEY = "itg_preload_v1";

  /* ---- session memory: pages already read + photos already fetched ---- */
  var mem = { pages: {}, imgs: {} };
  try { mem = JSON.parse(sessionStorage.getItem(STORE_KEY)) || mem; } catch (e) {}
  mem.pages = mem.pages || {};
  mem.imgs = mem.imgs || {};
  function save() { try { sessionStorage.setItem(STORE_KEY, JSON.stringify(mem)); } catch (e) {} }

  function pagePath(href) {
    var u = new URL(href, location.href);
    var p = u.pathname;
    if (p.slice(-1) === "/") p += "index.html";
    return { url: u.origin + p, path: p, origin: u.origin };
  }

  var here = pagePath(location.href).path;

  // This page's own photos are already loading here; don't fetch them twice.
  Array.prototype.forEach.call(document.querySelectorAll(PHOTO_SELECTOR), function (img) {
    mem.imgs[img.src] = 1;
  });

  /* ---- other pages, in the order they appear in this page's links ---- */
  var pages = [];
  var seen = {};
  Array.prototype.forEach.call(document.querySelectorAll("a[href]"), function (a) {
    var p;
    try { p = pagePath(a.href); } catch (e) { return; }
    if (p.origin !== location.origin) return;
    if (!/\.html$/.test(p.path)) return;
    if (p.path === here || /\/404\.html$/.test(p.path) || seen[p.path]) return;
    seen[p.path] = 1;
    pages.push(p);
  });
  if (!pages.length) return;

  /* ---- download queue ---- */
  var queue = [];
  var active = 0;

  function enqueue(urls, urgent) {
    urls.forEach(function (u) {
      if (mem.imgs[u]) return;
      var i = queue.indexOf(u);
      if (i !== -1) {
        if (!urgent) return;
        queue.splice(i, 1);
      }
      if (urgent) queue.unshift(u); else queue.push(u);
    });
    pump();
  }

  function pump() {
    while (active < CONCURRENCY && queue.length) {
      var url = queue.shift();
      if (mem.imgs[url]) continue;
      active++;
      fetchImage(url);
    }
  }

  function fetchImage(url) {
    var img = new Image();
    img.decoding = "async";
    try { img.fetchPriority = "low"; } catch (e) {}
    img.onload = img.onerror = function () {
      mem.imgs[url] = 1;   // a missing file is marked done too, so it isn't retried
      save();
      active--;
      pump();
    };
    img.src = url;
  }

  /* ---- read a page's HTML for its photo URLs ---- */
  var pending = {};

  function readPage(p) {
    if (mem.pages[p.path]) return Promise.resolve(mem.pages[p.path]);
    if (pending[p.path]) return pending[p.path];
    var opts = { credentials: "same-origin" };
    try { opts.priority = "low"; } catch (e) {}
    pending[p.path] = fetch(p.url, opts)
      .then(function (r) { return r.ok ? r.text() : ""; })
      .then(function (html) {
        var urls = [];
        if (html) {
          var doc = new DOMParser().parseFromString(html, "text/html");
          Array.prototype.forEach.call(doc.querySelectorAll(PHOTO_SELECTOR), function (img) {
            urls.push(new URL(img.getAttribute("src"), p.url).href);
          });
        }
        mem.pages[p.path] = urls;
        save();
        return urls;
      })
      .catch(function () { return []; });
    return pending[p.path];
  }

  /* ---- background pass: one page at a time, in link order ---- */
  var started = false;

  function start() {
    if (started) return;
    started = true;
    pages.reduce(function (chain, p) {
      return chain.then(function () { return readPage(p).then(function (urls) { enqueue(urls, false); }); });
    }, Promise.resolve());
  }

  /* ---- intent: hover / focus / touch on a link jumps the line ---- */
  function onIntent(e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    var p;
    try { p = pagePath(a.href); } catch (err) { return; }
    if (!seen[p.path]) return;
    readPage(p).then(function (urls) { enqueue(urls, true); });
  }
  document.addEventListener("pointerover", onIntent, { passive: true });
  document.addEventListener("focusin", onIntent);
  document.addEventListener("touchstart", onIntent, { passive: true });

  /* ---- Chrome/Edge: prefetch a page's HTML when the visitor shows intent ----
     "prefetch" only downloads the HTML; it does not run the page's scripts. */
  try {
    if (HTMLScriptElement.supports && HTMLScriptElement.supports("speculationrules")) {
      var rules = document.createElement("script");
      rules.type = "speculationrules";
      rules.textContent = JSON.stringify({
        prefetch: [{
          source: "document",
          where: { and: [{ href_matches: "/*.html" }, { not: { href_matches: "/api/*" } }] },
          eagerness: "moderate"
        }]
      });
      document.head.appendChild(rules);
    }
  } catch (e) {}

  /* ---- kick off once this page is loaded and the browser is idle ---- */
  function whenIdle() {
    if ("requestIdleCallback" in window) requestIdleCallback(start, { timeout: 4000 });
    else setTimeout(start, 1500);
  }
  if (document.readyState === "complete") whenIdle();
  else window.addEventListener("load", whenIdle, { once: true });
})();
