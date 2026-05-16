/**
 * Sprint 18N — Scroll animation presets library.
 *
 * A small set of well-tested CSS animations that the DESIGNER + COMPOSER
 * agents can prescribe per element via the `data-anim` HTML attribute,
 * which the ASSEMBLER scaffold reads at runtime via Intersection Observer.
 *
 * USAGE
 * Each preset becomes a CSS class + initial off-state + .is-visible on-state.
 * Elements opt in with:
 *   <section data-anim="slide-up">…</section>             single preset
 *   <ul data-anim="stagger-children">                     parent helper
 *     <li data-anim="fade-in">…</li>
 *     <li data-anim="fade-in">…</li>
 *   </ul>
 *
 * The Intersection Observer runs once on DOMContentLoaded over every
 * [data-anim] element. On intersection ≥ 0.1 it adds `is-visible`, which
 * triggers the relevant CSS transition. Each element is observed exactly
 * once (unobserve after firing) so re-scrolling doesn't replay.
 *
 * REDUCED MOTION
 * @media (prefers-reduced-motion: reduce) collapses every preset to an
 * instant no-transition reveal. The observer JS also short-circuits.
 * Non-negotiable for accessibility.
 *
 * NO DEPENDENCIES
 * Pure CSS transitions + vanilla JS. No GSAP, no Framer Motion, no library.
 * Total scaffold weight: ~4KB inline (CSS + JS combined).
 */

export type AnimationPresetName =
  | 'fade-in'
  | 'slide-up'
  | 'slide-from-left'
  | 'slide-from-right'
  | 'scale-in'
  | 'stagger-children'
  | 'parallax-bg'
  | 'sticky-scroll-reveal'
  | 'count-up'
  | 'text-reveal'

export interface AnimationPreset {
  name: AnimationPresetName
  description: string
  suggested_for: string
}

export const ANIMATION_PRESETS: AnimationPreset[] = [
  {
    name: 'fade-in',
    description: 'Element fades in with no movement. Subtle, safe default.',
    suggested_for: 'Almost any section. Use as the default if unsure which to pick.',
  },
  {
    name: 'slide-up',
    description: 'Element starts ~20px below position and slides up while fading in.',
    suggested_for: 'Cards, testimonials, content blocks. The most common pattern.',
  },
  {
    name: 'slide-from-left',
    description: 'Element starts ~30px left of position and slides right while fading in.',
    suggested_for: 'Image-then-text rows. Pair with slide-from-right on the partner element.',
  },
  {
    name: 'slide-from-right',
    description: 'Element starts ~30px right of position and slides left while fading in.',
    suggested_for: 'Text-then-image rows. Mirror of slide-from-left.',
  },
  {
    name: 'scale-in',
    description: 'Element starts at 95% scale and grows to 100% while fading in.',
    suggested_for: 'CTAs, callout cards, key statistics. Use sparingly — draws attention.',
  },
  {
    name: 'stagger-children',
    description:
      'Parent helper. Each immediate child with its own data-anim animates 100ms after the previous one (up to 6 children, then 600ms cap).',
    suggested_for: 'Lists, card grids, logo clouds. Combine with another preset on the children.',
  },
  {
    name: 'parallax-bg',
    description: 'Background image translates at 50% scroll speed for depth effect (desktop only — disabled on mobile).',
    suggested_for: 'Hero sections with full-bleed background imagery. ONE per page, top-of-fold only.',
  },
  {
    name: 'sticky-scroll-reveal',
    description: 'Section sticks to the top of the viewport while user scrolls past, revealing layered content.',
    suggested_for: 'Long-form narrative sections, multi-step processes, "how it works" with 3-5 stages.',
  },
  {
    name: 'count-up',
    description:
      'Numeric content animates from 0 to its final value over 1.2s when scrolled into view. Element\'s text content must include a parseable number.',
    suggested_for: 'Stat blocks ("10,000+ customers"), large pricing numbers, year counts in trust strips.',
  },
  {
    name: 'text-reveal',
    description:
      'Each word in the element fades in left-to-right with a 40ms-per-word cascade (~600ms total for a 15-word headline).',
    suggested_for: 'Hero headlines. ONE per page maximum. Never on body copy — too distracting.',
  },
]

export const ANIMATION_PRESET_NAMES: readonly AnimationPresetName[] = ANIMATION_PRESETS.map(
  (p) => p.name,
)

/**
 * Bulleted markdown of presets for inclusion in DESIGNER + COMPOSER system
 * prompts. Lets the agent see every option + when to use each at the moment
 * it's drafting markup.
 */
export function animationPresetsForPrompt(): string {
  return ANIMATION_PRESETS.map(
    (p) =>
      `  - \`${p.name}\` — ${p.description} ${p.suggested_for}`,
  ).join('\n')
}

/**
 * CSS injected into the rendered HTML's <style> block.
 *
 * Pattern:
 *   1. [data-anim] sets the base transition + will-change.
 *   2. [data-anim~="X"] sets the off-state transform per preset.
 *   3. [data-anim].is-visible removes the transform (returns to flow).
 *   4. The Intersection Observer adds .is-visible when the element enters
 *      the viewport.
 *
 * `data-anim` values are tokenized — `~=` selector matches whitespace-
 * separated tokens, so `data-anim="slide-up fade-in"` matches both `~="slide-up"`
 * and `~="fade-in"` selectors and combines their effects.
 *
 * stagger-children handles delays via :nth-child() on direct descendants.
 * Up to 6 distinct delays (0/100/.../500ms) then 600ms cap so a 30-card
 * grid doesn't take 3 seconds to fully reveal.
 *
 * count-up + text-reveal need JS scaffolding — handled in
 * INTERSECTION_OBSERVER_SCRIPT.
 */
export const ANIMATION_PRESETS_CSS = `
/* Sprint 18N — scroll animation presets */

[data-anim] {
  opacity: 0;
  transition:
    opacity 700ms ease-out,
    transform 700ms cubic-bezier(0.16, 1, 0.3, 1);
  will-change: opacity, transform;
}
[data-anim].is-visible {
  opacity: 1;
  transform: none;
}

[data-anim~="slide-up"] { transform: translateY(20px); }
[data-anim~="slide-from-left"] { transform: translateX(-30px); }
[data-anim~="slide-from-right"] { transform: translateX(30px); }
[data-anim~="scale-in"] { transform: scale(0.95); }
/* fade-in has no transform — base opacity transition handles it */

/* stagger-children — direct child delays */
[data-anim~="stagger-children"].is-visible > [data-anim]:nth-child(1) { transition-delay: 0ms; }
[data-anim~="stagger-children"].is-visible > [data-anim]:nth-child(2) { transition-delay: 100ms; }
[data-anim~="stagger-children"].is-visible > [data-anim]:nth-child(3) { transition-delay: 200ms; }
[data-anim~="stagger-children"].is-visible > [data-anim]:nth-child(4) { transition-delay: 300ms; }
[data-anim~="stagger-children"].is-visible > [data-anim]:nth-child(5) { transition-delay: 400ms; }
[data-anim~="stagger-children"].is-visible > [data-anim]:nth-child(6) { transition-delay: 500ms; }
[data-anim~="stagger-children"].is-visible > [data-anim]:nth-child(n+7) { transition-delay: 600ms; }

/* parallax-bg — JS-driven scroll. Desktop only — mobile scroll listeners are jittery */
[data-anim~="parallax-bg"] {
  background-attachment: fixed;
  background-size: cover;
  background-position: center;
}
@media (max-width: 768px) {
  [data-anim~="parallax-bg"] {
    background-attachment: scroll;
  }
}

/* sticky-scroll-reveal */
[data-anim~="sticky-scroll-reveal"] {
  position: sticky;
  top: 4rem;
}

/* count-up — text is replaced by JS, but show dimmed pre-fire so layout doesn't shift */
[data-anim~="count-up"]:not(.is-visible) {
  opacity: 0.5;
}

/* text-reveal — word spans inserted by JS */
[data-anim~="text-reveal"] .anim-word {
  display: inline-block;
  opacity: 0;
  transform: translateY(8px);
  transition:
    opacity 400ms ease-out,
    transform 400ms cubic-bezier(0.16, 1, 0.3, 1);
}
[data-anim~="text-reveal"].is-visible .anim-word {
  opacity: 1;
  transform: none;
}

@media (prefers-reduced-motion: reduce) {
  [data-anim],
  [data-anim].is-visible,
  [data-anim] *,
  [data-anim].is-visible * {
    transition: none !important;
    animation: none !important;
    transform: none !important;
    opacity: 1 !important;
  }
}
`.trim()

/**
 * Inline JS appended just before </body>. Vanilla, no dependencies.
 *
 * Behavior:
 *   1. Reduced-motion users: add .is-visible to every [data-anim] immediately,
 *      skip everything else.
 *   2. text-reveal: split element text into per-word <span class="anim-word">
 *      with sequential transition-delay so words cascade.
 *   3. count-up: parse the element's text content for a number, store target,
 *      reset display to "0" so layout is stable, animate on intersection.
 *   4. Intersection Observer over every [data-anim], threshold 0.1 with a
 *      -50px bottom margin so animations fire slightly before full visibility.
 *   5. Parallax-bg: a single passive scroll listener moves background-position
 *      proportional to viewport offset (requestAnimationFrame throttled).
 *
 * All elements unobserved after their first reveal — animations don't replay.
 */
export const INTERSECTION_OBSERVER_SCRIPT = `
(function() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('[data-anim]').forEach(function (el) { el.classList.add('is-visible'); });
    return;
  }

  /* text-reveal: split into per-word spans with cascading delays */
  document.querySelectorAll('[data-anim~="text-reveal"]').forEach(function (el) {
    if (el.dataset.animWordsSplit === '1') return;
    var text = el.textContent || '';
    var parts = text.split(/(\\s+)/);
    el.textContent = '';
    var wordIndex = 0;
    parts.forEach(function (part) {
      if (/^\\s+$/.test(part)) {
        el.appendChild(document.createTextNode(part));
      } else if (part.length > 0) {
        var span = document.createElement('span');
        span.className = 'anim-word';
        span.style.transitionDelay = (wordIndex * 40) + 'ms';
        span.textContent = part;
        el.appendChild(span);
        wordIndex++;
      }
    });
    el.dataset.animWordsSplit = '1';
  });

  /* count-up: parse target, reset to 0 for stable layout */
  document.querySelectorAll('[data-anim~="count-up"]').forEach(function (el) {
    var raw = (el.textContent || '').trim();
    var prefixMatch = raw.match(/^[^0-9.\\-]+/);
    var numMatch = raw.match(/[0-9][0-9,.]*/);
    var suffixMatch = raw.replace(/^[^0-9.\\-]*/, '').replace(/^[0-9.,\\-]+/, '');
    if (numMatch) {
      var clean = numMatch[0].replace(/,/g, '');
      var num = parseFloat(clean);
      if (!isNaN(num)) {
        el.dataset.animCountTarget = String(num);
        el.dataset.animCountPrefix = prefixMatch ? prefixMatch[0] : '';
        el.dataset.animCountSuffix = suffixMatch || '';
        el.dataset.animCountIsInt = String(num % 1 === 0);
        el.textContent = (el.dataset.animCountPrefix || '') + '0' + (el.dataset.animCountSuffix || '');
      }
    }
  });

  function runCountUp(el) {
    var target = parseFloat(el.dataset.animCountTarget || '0');
    var prefix = el.dataset.animCountPrefix || '';
    var suffix = el.dataset.animCountSuffix || '';
    var isInt = el.dataset.animCountIsInt === 'true';
    var start = performance.now();
    var duration = 1200;
    function tick(now) {
      var t = Math.min(1, (now - start) / duration);
      var eased = 1 - Math.pow(1 - t, 3);
      var v = target * eased;
      var rendered = isInt ? Math.round(v).toLocaleString() : v.toFixed(1);
      el.textContent = prefix + rendered + suffix;
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = prefix + (isInt ? target.toLocaleString() : target.toFixed(1)) + suffix;
    }
    requestAnimationFrame(tick);
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.1) {
        entry.target.classList.add('is-visible');
        if (entry.target.matches('[data-anim~="count-up"]') && entry.target.dataset.animCountTarget) {
          runCountUp(entry.target);
        }
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: [0.1, 0.25], rootMargin: '0px 0px -50px 0px' });

  document.querySelectorAll('[data-anim]').forEach(function (el) { observer.observe(el); });

  /* parallax-bg scroll handler */
  var parallaxEls = document.querySelectorAll('[data-anim~="parallax-bg"]');
  if (parallaxEls.length > 0 && window.innerWidth > 768) {
    var ticking = false;
    function updateParallax() {
      parallaxEls.forEach(function (el) {
        var rect = el.getBoundingClientRect();
        var offset = rect.top * -0.5;
        el.style.backgroundPositionY = 'calc(50% + ' + offset + 'px)';
      });
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(updateParallax);
        ticking = true;
      }
    }, { passive: true });
    updateParallax();
  }
})();
`.trim()
