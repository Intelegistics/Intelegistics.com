/* Hidden-cost cards: centered pages, neighboring peeks, and seamless manual looping. */
(function () {
  document.querySelectorAll('[data-leak-carousel]').forEach((carousel) => {
    const track = carousel.querySelector('.leak-grid');
    const cards = Array.from(track.children);
    const controls = carousel.querySelector('.leak-controls');
    const pagination = carousel.querySelector('.leak-pagination');
    const count = carousel.querySelector('[data-leak-count]');
    const announcement = carousel.querySelector('[data-leak-announcement]');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = 0;
    let page = 0;
    let pages = 0;
    let prefix = 0;
    let stride = 0;
    let inset = 0;
    let width = 0;
    let clones = [];
    let scrollTimer;

    cards.forEach((card, index) => {
      card.setAttribute('role', 'group');
      card.setAttribute('aria-roledescription', 'slide');
      card.setAttribute('aria-label', `${index + 1} of ${cards.length}`);
    });
    const targetLeft = (physicalPage) => (prefix + physicalPage * visible) * stride - inset;
    const modulo = (value) => (value % pages + pages) % pages;

    const update = () => {
      const first = page * visible + 1;
      const last = Math.min(first + visible - 1, cards.length);
      const text = first === last ? `${first} / ${cards.length}` : `${first}–${last} / ${cards.length}`;
      if (count.textContent !== text) count.textContent = text;
      const spoken = first === last ? `Showing card ${first} of ${cards.length}.` : `Showing cards ${first} to ${last} of ${cards.length}.`;
      if (announcement.textContent !== spoken) announcement.textContent = spoken;
      Array.from(pagination.children).forEach((button, index) => {
        if (index === page) button.setAttribute('aria-current', 'true');
        else button.removeAttribute('aria-current');
      });
    };
    const rebase = (left) => {
      track.classList.add('is-rebasing');
      track.scrollTo({ left, behavior: 'auto' });
      track.classList.remove('is-rebasing');
    };
    const normalize = () => {
      const start = targetLeft(0);
      const span = cards.length * stride;
      const current = track.scrollLeft;
      const tolerance = .75;
      // CSS snap offsets and measured card widths can differ by a subpixel.
      if (Math.abs(current - start) <= tolerance) return;
      if (current >= start + span - tolerance) rebase(start + Math.max(0, current - start - span));
      else if (current < start - tolerance) rebase(current + span);
    };
    const goTo = (requestedPage, animate = true) => {
      window.clearTimeout(scrollTimer);
      normalize();
      page = modulo(requestedPage);
      let physicalPage = requestedPage < 0 ? -1 : requestedPage >= pages ? pages : requestedPage;
      let distance = Math.abs(track.scrollLeft - targetLeft(physicalPage));
      // Rapid reversals use the nearest equivalent page instead of sweeping past the set.
      for (const candidate of [page - pages, page, page + pages]) {
        if (candidate < -1 || candidate > pages) continue;
        const candidateDistance = Math.abs(track.scrollLeft - targetLeft(candidate));
        if (candidateDistance < distance - .5) { physicalPage = candidate; distance = candidateDistance; }
      }
      track.scrollTo({ left: targetLeft(physicalPage), behavior: animate && !reducedMotion.matches ? 'smooth' : 'auto' });
      if (!animate || reducedMotion.matches) normalize();
      update();
    };
    const clone = (card) => {
      const copy = card.cloneNode(true);
      copy.setAttribute('aria-hidden', 'true');
      copy.setAttribute('data-leak-clone', '');
      copy.removeAttribute('data-leak-page-start');
      copy.inert = true;
      return copy;
    };

    const resize = () => {
      const nextVisible = Math.max(1, Number.parseInt(getComputedStyle(track).getPropertyValue('--leak-visible'), 10) || 1);
      if (visible === nextVisible && Math.abs(track.clientWidth - width) < .5) return;
      window.clearTimeout(scrollTimer);
      const firstIndex = page * visible;
      const changed = visible !== nextVisible;
      visible = nextVisible;
      pages = Math.ceil(cards.length / visible);
      width = track.clientWidth;
      if (changed) {
        clones.forEach((copy) => copy.remove());
        // A full boundary page plus its outer neighbor must exist on both sides.
        prefix = Math.min(cards.length, visible + 1);
        const before = cards.slice(-prefix).map(clone);
        const after = cards.slice(0, prefix).map(clone);
        clones = [...before, ...after];
        track.prepend(...before);
        track.append(...after);
        track.classList.add('is-looping');
        Array.from(track.children).forEach((card, index) => {
          if ((index - prefix) % visible === 0 && index + visible <= track.children.length) card.setAttribute('data-leak-page-start', '');
          else card.removeAttribute('data-leak-page-start');
        });
        pagination.replaceChildren();
        for (let index = 0; index < pages; index++) {
          const button = document.createElement('button');
          const first = index * visible + 1;
          const last = Math.min(first + visible - 1, cards.length);
          button.type = 'button';
          button.className = 'leak-page';
          button.setAttribute('aria-controls', track.id);
          button.setAttribute('aria-label', first === last ? `Show card ${first}` : `Show cards ${first} to ${last}`);
          button.addEventListener('click', () => goTo(index));
          pagination.append(button);
        }
      }
      const firstRect = cards[0].getBoundingClientRect();
      stride = cards[1].getBoundingClientRect().left - firstRect.left;
      const gap = stride - firstRect.width;
      inset = (width - (visible * firstRect.width + (visible - 1) * gap)) / 2;
      page = Math.min(pages - 1, Math.floor(firstIndex / visible));
      rebase(targetLeft(page));
      update();
      controls.hidden = pages < 2;
    };

    carousel.querySelector('[data-leak-prev]').addEventListener('click', () => goTo(page - 1));
    carousel.querySelector('[data-leak-next]').addEventListener('click', () => goTo(page + 1));
    carousel.addEventListener('keydown', (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Home') goTo(0);
      else if (event.key === 'End') goTo(pages - 1);
      else goTo(page + (event.key === 'ArrowRight' ? 1 : -1));
    });
    track.addEventListener('scroll', () => {
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        const physicalPage = Math.round((track.scrollLeft - targetLeft(0)) / (stride * visible));
        page = modulo(physicalPage);
        normalize();
        update();
      }, 150);
    }, { passive: true });

    resize();
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(track);
    else window.addEventListener('resize', resize);
  });
})();
