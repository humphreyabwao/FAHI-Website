/* FAHI — main.js
   Clean nav controller:
   - Mobile burger toggle (with morph)
   - Click-to-open dropdowns on mobile (accordion)
   - Outside click + Escape close on desktop
*/

(function () {
  const MOBILE = () => window.matchMedia("(max-width: 960px)").matches;

  /**
   * Fixed header: tier-1 collapses with smooth CSS grid animation; spacer tracks real height.
   * Scroll hysteresis avoids rapid toggle/jank; ResizeObserver keeps spacer flush with hero.
   */
  function initSiteHeaderFixed() {
    const siteHeader = document.getElementById("site-header");
    const spacer = document.getElementById("site-header-spacer");
    const tier1 = siteHeader && siteHeader.querySelector(".site-header__tier1");
    if (!siteHeader) return function noop() {};

    const SCROLL_COLLAPSE_BELOW = 36;
    const SCROLL_EXPAND_ABOVE = 8;
    let scrollRaf = false;
    let tierCollapsed = false;
    let roRaf = null;

    function syncSpacer() {
      const rect = siteHeader.getBoundingClientRect();
      const h = Math.max(0, Math.round(rect.height * 1000) / 1000);
      if (spacer) {
        spacer.style.height = `${h}px`;
      }
      document.documentElement.style.setProperty("--site-header-h", `${Math.ceil(h)}px`);
    }

    function scheduleSpacerSync() {
      if (roRaf != null) return;
      roRaf = requestAnimationFrame(() => {
        roRaf = null;
        syncSpacer();
      });
    }

    function applyScrollHysteresis() {
      const y = window.scrollY;
      let next = tierCollapsed;
      if (!tierCollapsed && y > SCROLL_COLLAPSE_BELOW) next = true;
      else if (tierCollapsed && y < SCROLL_EXPAND_ABOVE) next = false;

      if (next !== tierCollapsed) {
        tierCollapsed = next;
        siteHeader.classList.toggle("site-header--scrolled", next);
        scheduleSpacerSync();
      }
      scrollRaf = false;
    }

    function onScroll() {
      if (!scrollRaf) {
        scrollRaf = true;
        requestAnimationFrame(applyScrollHysteresis);
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", scheduleSpacerSync, { passive: true });

    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(scheduleSpacerSync).observe(siteHeader);
    }

    if (tier1) {
      tier1.addEventListener("transitionend", (e) => {
        if (e.propertyName === "grid-template-rows") syncSpacer();
      });
    }

    /* Initial state from scroll position */
    tierCollapsed = window.scrollY > SCROLL_COLLAPSE_BELOW;
    siteHeader.classList.toggle("site-header--scrolled", tierCollapsed);
    syncSpacer();
    scheduleSpacerSync();

    return scheduleSpacerSync;
  }

  function initFahiNavigation() {
    const scheduleSpacerSync = initSiteHeaderFixed();

    const burger = document.querySelector(".nav__burger");
    const menu = document.querySelector(".nav__menu");
    const items = document.querySelectorAll(".nav__item--has-sub, .nav__item--mega");

    if (!burger || !menu) return;

    /* ---- Burger ---- */
    burger.addEventListener("click", () => {
      const open = menu.classList.toggle("is-open");
      burger.classList.toggle("is-open", open);
      burger.setAttribute("aria-expanded", open ? "true" : "false");
      scheduleSpacerSync();
    });

    /* ---- Dropdown / Mega open ---- */
    items.forEach((item) => {
      const trigger = item.querySelector(".nav__link--toggle");
      if (!trigger) return;

      trigger.addEventListener("click", (e) => {
        e.preventDefault();
        const isOpen = item.classList.toggle("is-open");
        trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");

        items.forEach((other) => {
          if (other !== item && other.classList.contains("is-open")) {
            other.classList.remove("is-open");
            const t = other.querySelector(".nav__link--toggle");
            if (t) t.setAttribute("aria-expanded", "false");
          }
        });
        scheduleSpacerSync();
      });
    });

    /* ---- Close on outside click ---- */
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".nav")) {
        items.forEach((item) => {
          item.classList.remove("is-open");
          const t = item.querySelector(".nav__link--toggle");
          if (t) t.setAttribute("aria-expanded", "false");
        });
        scheduleSpacerSync();
      }
    });

    /* ---- Close on Escape ---- */
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      items.forEach((item) => {
        item.classList.remove("is-open");
        const t = item.querySelector(".nav__link--toggle");
        if (t) t.setAttribute("aria-expanded", "false");
      });
      if (MOBILE() && menu.classList.contains("is-open")) {
        menu.classList.remove("is-open");
        burger.classList.remove("is-open");
        burger.setAttribute("aria-expanded", "false");
      }
      scheduleSpacerSync();
    });

    /* ---- Close menu when a leaf link is clicked (mobile) ---- */
    document.querySelectorAll(".nav__menu a").forEach((a) => {
      a.addEventListener("click", () => {
        if (!MOBILE()) return;
        const parent = a.closest(".nav__item--has-sub, .nav__item--mega");
        if (parent && a.classList.contains("nav__link--toggle")) return;
        menu.classList.remove("is-open");
        burger.classList.remove("is-open");
        burger.setAttribute("aria-expanded", "false");
        scheduleSpacerSync();
      });
    });
  }

  function initFahiFab() {
    const fabTop = document.querySelector(".fab__btn--top");

    if (!fabTop) return;

    const SHOW_AFTER = 320;
    let fabTicking = false;

    function updateFabTop() {
      const show = window.scrollY > SHOW_AFTER;
      fabTop.classList.toggle("is-visible", show);
      fabTop.setAttribute("aria-hidden", show ? "false" : "true");
      fabTop.tabIndex = show ? 0 : -1;
      fabTicking = false;
    }

    fabTop.addEventListener("click", () => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    });

    window.addEventListener(
      "scroll",
      () => {
        if (!fabTicking) {
          window.requestAnimationFrame(updateFabTop);
          fabTicking = true;
        }
      },
      { passive: true }
    );

    updateFabTop();
  }

  /**
   * FAB is injected inside #site-footer-mount; on some mobile browsers nested fixed
   * layout can scroll with the page. Attaching .fab directly to body fixes viewport anchoring.
   */
  function promoteFabToBody() {
    const fab = document.querySelector(".fab");
    if (fab && fab.parentElement !== document.body) {
      document.body.appendChild(fab);
    }
  }

  function initChromeDependent() {
    promoteFabToBody();
    initFahiNavigation();
    initFahiFab();
  }

  if (document.getElementById("site-header-mount") || document.getElementById("site-footer-mount")) {
    document.addEventListener("siteChromeLoaded", () => initChromeDependent(), { once: true });
  } else {
    initChromeDependent();
  }

  /* ============================================================
     Hero background slideshow
  ============================================================ */
  const slides = document.querySelectorAll(".hero__slide");
  const pips   = document.querySelectorAll(".hero__pip");

  if (slides.length > 1) {
    let current  = 0;
    let interval = null;
    const DELAY  = 5000;

    function goTo(index) {
      slides[current].classList.remove("is-active");
      pips[current].classList.remove("is-active");
      current = index % slides.length;
      slides[current].classList.add("is-active");
      pips[current].classList.add("is-active");
    }

    function next() { goTo(current + 1); }

    function startAuto() {
      clearInterval(interval);
      interval = setInterval(next, DELAY);
    }

    pips.forEach((pip) => {
      pip.addEventListener("click", () => {
        goTo(Number(pip.dataset.slide));
        startAuto();
      });
    });

    startAuto();
  }

  /* ============================================================
     Rotating headline words
  ============================================================ */
  const words = document.querySelectorAll(".hero__word");

  if (words.length > 1) {
    let wi        = 0;
    const WORD_MS = 3000;

    setInterval(() => {
      const curr = words[wi];
      const next = words[(wi + 1) % words.length];

      curr.classList.add("is-leaving");
      curr.classList.remove("is-active");

      next.classList.add("is-active");
      next.classList.remove("is-leaving");

      setTimeout(() => curr.classList.remove("is-leaving"), 500);

      wi = (wi + 1) % words.length;
    }, WORD_MS);
  }

  /* ============================================================
     About stats counter animation
  ============================================================ */
  const counters = document.querySelectorAll("[data-count-target]");

  if (counters.length) {
    const formatNumber = (value) => {
      if (value >= 1000) {
        return `${Math.floor(value / 1000)}K`;
      }
      return String(value);
    };

    const animateCounter = (counter) => {
      if (counter.dataset.counted === "true") return;

      counter.dataset.counted = "true";
      const target = Number(counter.dataset.countTarget) || 0;
      const suffix = counter.dataset.countSuffix || "";
      const duration = 1400;
      const startedAt = performance.now();

      const tick = (now) => {
        const progress = Math.min((now - startedAt) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(target * eased);

        counter.textContent = `${formatNumber(current)}${suffix}`;

        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          counter.textContent = `${formatNumber(target)}${suffix}`;
        }
      };

      requestAnimationFrame(tick);
    };

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.35 });

      counters.forEach((counter) => observer.observe(counter));
    } else {
      counters.forEach(animateCounter);
    }
  }

  /* ============================================================
     Programs scroll arrows — visible only when scrollable
  ============================================================ */
  const scrollEl = document.querySelector(".programs__scroll");
  const arrowL = document.querySelector(".pscroll-arrow--left");
  const arrowR = document.querySelector(".pscroll-arrow--right");

  if (scrollEl && arrowL && arrowR) {
    const updateArrows = () => {
      const { scrollLeft, scrollWidth, clientWidth } = scrollEl;
      arrowL.classList.toggle("is-visible", scrollLeft > 4);
      arrowR.classList.toggle("is-visible", scrollLeft + clientWidth < scrollWidth - 4);
    };

    arrowL.addEventListener("click", () => {
      scrollEl.scrollBy({ left: -320, behavior: "smooth" });
    });

    arrowR.addEventListener("click", () => {
      scrollEl.scrollBy({ left: 320, behavior: "smooth" });
    });

    scrollEl.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    updateArrows();
  }

  /* ============================================================
     Our courses — mobile (≤640px): first 6 tabs (2×3), “View all”
  ============================================================ */
  const courseTabsOuter = document.getElementById("course-tabs-nav-outer");
  const courseTabsList = document.getElementById("course-tabs-nav-list");
  const courseTabsToggle = document.getElementById("course-tabs-view-all");

  if (courseTabsOuter && courseTabsList && courseTabsToggle) {
    const mqMobile = window.matchMedia("(max-width: 640px)");
    const MAX_VISIBLE = 6;
    const label = courseTabsToggle.querySelector(".course-tabs-band__view-all-text");

    function syncCourseTabsCollapse() {
      const count = courseTabsList.querySelectorAll(":scope > li").length;
      const needs = mqMobile.matches && count > MAX_VISIBLE;
      courseTabsToggle.classList.toggle("is-visible", needs);
      courseTabsToggle.setAttribute("aria-hidden", needs ? "false" : "true");
      courseTabsToggle.tabIndex = needs ? 0 : -1;
      if (!needs) {
        courseTabsOuter.classList.remove("is-expanded");
        courseTabsToggle.setAttribute("aria-expanded", "false");
        if (label) label.textContent = "View all";
      }
    }

    courseTabsToggle.addEventListener("click", () => {
      if (!courseTabsToggle.classList.contains("is-visible")) return;
      const next = !courseTabsOuter.classList.contains("is-expanded");
      courseTabsOuter.classList.toggle("is-expanded", next);
      courseTabsToggle.setAttribute("aria-expanded", next ? "true" : "false");
      if (label) label.textContent = next ? "Show less" : "View all";
      if (!next) {
        courseTabsOuter.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });

    if (typeof mqMobile.addEventListener === "function") {
      mqMobile.addEventListener("change", syncCourseTabsCollapse);
    } else {
      mqMobile.addListener(syncCourseTabsCollapse);
    }
    window.addEventListener("resize", syncCourseTabsCollapse);
    syncCourseTabsCollapse();
  }
})();
