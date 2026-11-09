/* Intelegistics, Inc. — site behaviour (no dependencies) */

/* ==========================================================
   SITE SETTINGS — edit these values
   FORM_ENDPOINT: the Google Apps Script web app URL (ends in
   /exec). The contact form posts here and the script emails
   the inquiry to sales@intelegistics.com.
   CONTACT_EMAIL: shown on the page as a mailto link and offered
   as a fallback if the form can't send. Leave "" to hide it and
   point people to LinkedIn instead.
   ========================================================== */
const FORM_ENDPOINT = "https://script.google.com/macros/s/AKfycbxmOdLZ7Hb3yp2NomUx21wCRMiunZjtiwxdO-ufRcQNIJz4Vftmz0VkcR1dtso1fxZ2/exec"; // e.g. "https://script.google.com/macros/s/XXXXXXXX/exec"
const CONTACT_EMAIL = "";
const LINKEDIN_URL  = "https://www.linkedin.com/company/109301424/";

(function () {
  const root = document.documentElement;
  root.classList.add("js");

  /* ---- Header: solid background after scrolling ---- */
  const header = document.querySelector(".site-header");
  const onScroll = () => header && header.classList.toggle("is-scrolled", window.scrollY > 24);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---- Mobile nav ---- */
  const toggle = document.querySelector(".nav-toggle");
  const closeNav = () => {
    document.body.classList.remove("nav-open");
    toggle && toggle.setAttribute("aria-expanded", "false");
  };
  if (toggle) {
    toggle.addEventListener("click", () => {
      const open = document.body.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeNav();
      document.querySelectorAll(".has-dropdown.is-open").forEach((d) => {
        d.classList.remove("is-open");
        d.querySelector(".nav-link").setAttribute("aria-expanded", "false");
      });
    }
  });
  window.addEventListener("resize", () => { if (window.innerWidth > 960) closeNav(); });

  /* ---- Services dropdown: click/tap + keyboard ---- */
  document.querySelectorAll(".has-dropdown > .nav-link").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const li = btn.parentElement;
      const open = li.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", String(open));
    });
  });
  document.addEventListener("click", (e) => {
    document.querySelectorAll(".has-dropdown.is-open").forEach((d) => {
      if (!d.contains(e.target) && window.innerWidth > 960) {
        d.classList.remove("is-open");
        d.querySelector(".nav-link").setAttribute("aria-expanded", "false");
      }
    });
  });

  /* ---- Scroll reveal ---- */
  const revealEls = document.querySelectorAll(".reveal, .reveal-stagger");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("is-visible"));
  }

  /* ---- Footer year ---- */
  document.querySelectorAll("[data-year]").forEach((el) => { el.textContent = new Date().getFullYear(); });

  /* ---- Contact details driven by settings ---- */
  document.querySelectorAll("[data-linkedin]").forEach((a) => { a.href = LINKEDIN_URL; });
  document.querySelectorAll("[data-email-item]").forEach((el) => {
    if (!CONTACT_EMAIL) { el.remove(); return; }
    const a = el.querySelector("a");
    if (a) { a.href = "mailto:" + CONTACT_EMAIL; a.textContent = CONTACT_EMAIL; }
  });

  /* ---- Contact form ----
     With FORM_ENDPOINT set: posts to the Apps Script web app, which emails sales@.
     Without it: falls back to opening the visitor's email app (CONTACT_EMAIL),
     or to a LinkedIn note if neither is set. */
  const form = document.querySelector("#contact-form");
  if (form) {
    const status = form.querySelector(".form-status");
    const button = form.querySelector('button[type="submit"]');
    const loadedAt = Date.now();
    let sending = false;

    const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const setStatus = (html, isError) => {
      status.innerHTML = html;
      status.style.color = isError ? "#ff4b4f" : "";
    };
    const altContact = () => CONTACT_EMAIL
      ? 'email us at <a href="mailto:' + CONTACT_EMAIL + '" style="color:#ff4b4f">' + CONTACT_EMAIL + "</a>"
      : 'reach us on <a href="' + LINKEDIN_URL + '" target="_blank" rel="noopener" style="color:#ff4b4f">LinkedIn</a>';

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (sending) return;
      if (!form.reportValidity()) return;
      const d = new FormData(form);

      /* -- Send through the Apps Script web app -- */
      if (FORM_ENDPOINT) {
        sending = true;
        if (button) button.disabled = true;
        setStatus("Sending&hellip;");

        // URL-encoded body keeps this a "simple" CORS request (no preflight), which Apps Script requires.
        const body = new URLSearchParams();
        d.forEach((v, k) => body.append(k, typeof v === "string" ? v : ""));
        body.append("elapsed", String(Date.now() - loadedAt));
        body.append("page", window.location.href);

        const ctrl = "AbortController" in window ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), 20000) : null;
        try {
          const res = await fetch(FORM_ENDPOINT, { method: "POST", body, signal: ctrl ? ctrl.signal : undefined });
          const out = await res.json().catch(() => ({}));
          if (res.ok && out.ok) {
            form.reset();
            setStatus("Thanks &mdash; your message is on its way. We&rsquo;ll be in touch shortly.");
          } else {
            setStatus(esc(out.error || "Your message couldn’t be sent.") + " Please try again, or " + altContact() + ".", true);
          }
        } catch (err) {
          setStatus("We couldn&rsquo;t reach our server. Please try again, or " + altContact() + ".", true);
        } finally {
          if (timer) clearTimeout(timer);
          sending = false;
          if (button) button.disabled = false;
        }
        return;
      }

      /* -- Fallbacks when no endpoint is configured -- */
      if (!CONTACT_EMAIL) {
        setStatus('Thanks! Online messages aren’t switched on yet. Please reach us on <a href="' +
          LINKEDIN_URL + '" target="_blank" rel="noopener" style="color:#ff4b4f">LinkedIn</a> for now.');
        return;
      }
      const subject = "Website inquiry: " + (d.get("topic") || "General") + " (" + (d.get("company") || d.get("name")) + ")";
      const mailBody = [
        "Name: " + d.get("name"),
        "Company: " + (d.get("company") || "—"),
        "Email: " + d.get("email"),
        "Phone: " + (d.get("phone") || "—"),
        "Topic: " + (d.get("topic") || "—"),
        "",
        d.get("message") || ""
      ].join("\n");
      window.location.href = "mailto:" + CONTACT_EMAIL +
        "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(mailBody);
      setStatus("Opening your email app… If nothing happens, email us at " + CONTACT_EMAIL + ".");
    });
  }
})();
