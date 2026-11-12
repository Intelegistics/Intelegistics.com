/* Phone-only categories: continuous 24px/second motion with explicit Pause/Play. */
(function () {
  document.querySelectorAll('[data-device-slideshow]').forEach((slideshow, slideshowIndex) => {
    const track = slideshow.querySelector('.device-grid');
    const cards = Array.from(track.children);
    const controls = slideshow.querySelector('.device-controls');
    const status = slideshow.querySelector('[data-device-status]');
    const count = slideshow.querySelector('[data-device-count]');
    const rotation = slideshow.querySelector('[data-device-rotation]');
    const pauseIcon = rotation.querySelector('[data-device-pause]');
    const playIcon = rotation.querySelector('[data-device-play]');
    const mobile = window.matchMedia('(max-width: 640px)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const speed = 24;
    const buffer = 2;
    let active = false;
    let inView = !('IntersectionObserver' in window);
    let wantsToPlay = !reducedMotion.matches;
    let index = 0;
    let stride = 0;
    let start = 0;
    let span = 0;
    let width = 0;
    let position = 0;
    let autoFrame = null;
    let manualFrame = null;
    let settleTimer;
    let settling = false;
    let gesture = null;
    let clones = [];
    let renderedPlaying;

    const leftAt = (physicalIndex) => track.children[physicalIndex].getBoundingClientRect().left - track.children[0].getBoundingClientRect().left;
    const measure = () => {
      stride = leftAt(buffer + 1) - leftAt(buffer);
      const centerInset = (track.clientWidth - cards[0].getBoundingClientRect().width) / 2;
      start = leftAt(buffer) - centerInset;
      span = leftAt(cards.length + buffer) - leftAt(buffer);
      width = track.getBoundingClientRect().width;
    };
    const update = () => {
      index = ((Math.round((position - start) / stride) % cards.length) + cards.length) % cards.length;
      const text = `${index + 1} / ${cards.length}`;
      if (count.textContent !== text) count.textContent = text;
      if (renderedPlaying !== wantsToPlay) {
        renderedPlaying = wantsToPlay;
        status.setAttribute('aria-live', wantsToPlay ? 'off' : 'polite');
        rotation.setAttribute('aria-label', wantsToPlay ? 'Pause automatic slideshow' : 'Play automatic slideshow');
        rotation.setAttribute('title', wantsToPlay ? 'Pause' : 'Play');
        // SVGElement.hidden is not a reflected HTML property; update real attributes.
        if (wantsToPlay) { pauseIcon.removeAttribute('hidden'); playIcon.setAttribute('hidden', ''); }
        else { pauseIcon.setAttribute('hidden', ''); playIcon.removeAttribute('hidden'); }
      }
    };
    const applyPosition = (next) => {
      if (!span) return;
      position = start + ((next - start) % span + span) % span;
      track.classList.add('is-moving');
      track.scrollLeft = position;
      update();
    };
    const stopAuto = () => {
      if (autoFrame !== null) window.cancelAnimationFrame(autoFrame);
      autoFrame = null;
    };
    const stopAll = () => {
      stopAuto();
      if (manualFrame !== null) window.cancelAnimationFrame(manualFrame);
      manualFrame = null;
      window.clearTimeout(settleTimer);
    };
    const canPlay = () => active && inView && wantsToPlay && !document.hidden &&
      !document.body.classList.contains('nav-open') && !settling && manualFrame === null &&
      (!gesture || gesture.axis === 'vertical');

    const syncPlayback = () => {
      if (!active) return;
      update();
      if (!canPlay()) { stopAuto(); return; }
      if (autoFrame !== null) return;
      // Each resume starts a new clock; time spent offscreen never causes a leap.
      let previous = performance.now();
      position = track.scrollLeft;
      track.classList.add('is-moving');
      const tick = (now) => {
        if (!canPlay()) { autoFrame = null; return; }
        const seconds = Math.min(Math.max(now - previous, 0), 100) / 1000;
        previous = now;
        // Keep fractional progress instead of rereading possibly rounded scrollLeft.
        applyPosition(position + speed * seconds);
        autoFrame = window.requestAnimationFrame(tick);
      };
      autoFrame = window.requestAnimationFrame(tick);
    };

    const moveTo = (target, from = track.scrollLeft) => {
      stopAll();
      settling = false;
      if (!active) return;
      track.classList.add('is-moving');
      const started = performance.now();
      const duration = reducedMotion.matches ? 0 : 650;
      const finish = () => { manualFrame = null; applyPosition(target); syncPlayback(); };
      if (!duration || Math.abs(target - from) < 1) { finish(); return; }
      const tick = (now) => {
        const progress = Math.min(1, (now - started) / duration);
        position = from + (target - from) * (1 - Math.pow(1 - progress, 3));
        track.scrollLeft = position;
        update();
        if (progress < 1) manualFrame = window.requestAnimationFrame(tick);
        else finish();
      };
      manualFrame = window.requestAnimationFrame(tick);
    };
    const navigate = (direction) => {
      if (!active) return;
      stopAll();
      applyPosition(track.scrollLeft);
      let from = position;
      let nearest = Math.round((from - start) / stride);
      // Rebase before easing across the seam so both neighboring cards exist.
      if (nearest === cards.length) { from -= span; nearest -= cards.length; }
      moveTo(start + (nearest + direction) * stride, from);
    };

    const cloneCard = (card, cloneIndex) => {
      const clone = card.cloneNode(true);
      const ids = new Map();
      const elements = [clone, ...clone.querySelectorAll('*')];
      // Keep SVG paint servers and other internal references local to each clone.
      elements.forEach((element) => {
        if (!element.id) return;
        const original = element.id;
        const unique = `device-clone-${slideshowIndex}-${cloneIndex}-${original}`;
        ids.set(original, unique);
        element.id = unique;
      });
      elements.forEach((element) => {
        Array.from(element.attributes).forEach((attribute) => {
          let value = attribute.value.replace(/url\(\s*(['"]?)#([^'"\)\s]+)\1\s*\)/g,
            (reference, quote, id) => ids.has(id) ? `url(#${ids.get(id)})` : reference);
          if (attribute.name === 'href' || attribute.name === 'xlink:href') {
            if (value.startsWith('#') && ids.has(value.slice(1))) value = `#${ids.get(value.slice(1))}`;
          } else if (/^(aria-labelledby|aria-describedby|aria-controls|aria-owns|aria-activedescendant|headers|for)$/.test(attribute.name)) {
            value = value.split(/\s+/).map((id) => ids.get(id) || id).join(' ');
          }
          if (value !== attribute.value) element.setAttribute(attribute.name, value);
        });
        if (element.hasAttribute('autofocus')) element.removeAttribute('autofocus');
      });
      clone.setAttribute('aria-hidden', 'true');
      clone.setAttribute('inert', '');
      clone.inert = true;
      clone.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex], [contenteditable]')
        .forEach((element) => element.setAttribute('tabindex', '-1'));
      return clone;
    };

    const configure = () => {
      if (active === mobile.matches) return;
      stopAll();
      gesture = null;
      settling = false;
      active = mobile.matches;
      controls.hidden = !active;
      slideshow.classList.toggle('is-enhanced', active);
      if (active) {
        const before = cards.slice(-buffer).map((card, cloneIndex) => cloneCard(card, cloneIndex));
        const after = cards.slice(0, buffer).map((card, cloneIndex) => cloneCard(card, cloneIndex + buffer));
        clones = [...before, ...after];
        track.prepend(...before);
        track.append(...after);
        track.setAttribute('tabindex', '0');
        track.setAttribute('aria-label', 'Device categories. Use left and right arrow keys to browse.');
        slideshow.setAttribute('role', 'group');
        slideshow.setAttribute('aria-roledescription', 'carousel');
        slideshow.setAttribute('aria-label', 'Device categories, alphabetically ordered');
        cards.forEach((card, cardIndex) => {
          card.setAttribute('role', 'group');
          card.setAttribute('aria-roledescription', 'slide');
          card.setAttribute('aria-label', `${cardIndex + 1} of ${cards.length}`);
        });
        measure();
        applyPosition(start + stride * index);
        syncPlayback();
      } else {
        track.classList.remove('is-moving');
        clones.forEach((clone) => clone.remove());
        clones = [];
        track.scrollLeft = 0;
        ['tabindex', 'aria-label'].forEach((name) => track.removeAttribute(name));
        ['role', 'aria-roledescription', 'aria-label'].forEach((name) => slideshow.removeAttribute(name));
        cards.forEach((card) => ['role', 'aria-roledescription', 'aria-label'].forEach((name) => card.removeAttribute(name)));
      }
    };
    const resize = () => {
      if (!active || Math.abs(track.getBoundingClientRect().width - width) < .5) return;
      const progress = (track.scrollLeft - start) / stride;
      stopAll();
      settling = false;
      gesture = null;
      measure();
      applyPosition(start + progress * stride);
      syncPlayback();
    };

    slideshow.querySelector('[data-device-prev]').addEventListener('click', () => navigate(-1));
    slideshow.querySelector('[data-device-next]').addEventListener('click', () => navigate(1));
    rotation.addEventListener('click', () => {
      if (!active) return;
      stopAll();
      wantsToPlay = !wantsToPlay;
      settling = false;
      applyPosition(track.scrollLeft);
      syncPlayback();
    });
    slideshow.addEventListener('keydown', (event) => {
      if (!active || event.altKey || event.ctrlKey || event.metaKey) return;
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Home' || event.key === 'End') moveTo(start + stride * (event.key === 'Home' ? 0 : cards.length - 1));
      else navigate(event.key === 'ArrowLeft' ? -1 : 1);
    });

    const settleNativeScroll = () => {
      if (!active || track.classList.contains('is-moving')) return;
      settling = true;
      stopAuto();
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        if (!active || (gesture && gesture.axis !== 'vertical')) return;
        settling = false;
        applyPosition(track.scrollLeft);
        syncPlayback();
      }, 180);
    };
    track.addEventListener('pointerdown', (event) => {
      if (!active) return;
      stopAll();
      settling = false;
      gesture = { x: event.clientX, y: event.clientY, axis: 'pending' };
      track.classList.add('is-moving');
    }, { passive: true });
    track.addEventListener('pointermove', (event) => {
      if (!gesture || gesture.axis !== 'pending') return;
      const dx = Math.abs(event.clientX - gesture.x);
      const dy = Math.abs(event.clientY - gesture.y);
      if (Math.max(dx, dy) < 8) return;
      gesture.axis = dx > dy ? 'horizontal' : 'vertical';
      if (gesture.axis === 'horizontal') track.classList.remove('is-moving');
      else syncPlayback();
    }, { passive: true });
    ['pointerup', 'pointercancel'].forEach((name) => window.addEventListener(name, () => {
      if (!gesture) return;
      const horizontal = gesture.axis === 'horizontal';
      gesture = null;
      if (horizontal) settleNativeScroll();
      else syncPlayback();
    }, { passive: true }));
    track.addEventListener('wheel', (event) => {
      if (!active || (!event.shiftKey && Math.abs(event.deltaX) <= Math.abs(event.deltaY))) return;
      stopAll();
      track.classList.remove('is-moving');
      settleNativeScroll();
    }, { passive: true });
    track.addEventListener('scroll', settleNativeScroll, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!active) return;
      stopAll();
      settling = false;
      gesture = null;
      syncPlayback();
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => { inView = entries[0].isIntersecting; syncPlayback(); }, { threshold: 0 }).observe(slideshow);
    }
    if ('MutationObserver' in window) {
      new MutationObserver(syncPlayback).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
    mobile.addEventListener('change', configure);
    reducedMotion.addEventListener('change', () => {
      if (!reducedMotion.matches) return;
      wantsToPlay = false;
      stopAll();
      syncPlayback();
    });
    configure();
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(track);
    else window.addEventListener('resize', resize);
  });
})();
