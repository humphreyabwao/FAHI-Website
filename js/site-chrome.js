/**
 * FAHI — shared top bar, primary nav, footer, and FAB.
 * Pages set body[data-site-root] to "" | "../" | "../../" then include mounts + this script before main.js.
 * Replaces __ROOT__ in partial HTML with data-site-root for correct asset and home links.
 */
(function () {
  function rootPrefix() {
    return document.body.getAttribute("data-site-root") || "";
  }

  function applyRoot(html) {
    const root = rootPrefix();
    return html.split("__ROOT__").join(root);
  }

  function dispatchLoaded() {
    document.dispatchEvent(new Event("siteChromeLoaded"));
  }

  const headerMount = document.getElementById("site-header-mount");
  const footerMount = document.getElementById("site-footer-mount");

  if (!headerMount && !footerMount) {
    queueMicrotask(dispatchLoaded);
    return;
  }

  const root = rootPrefix();
  const headerUrl = `${root}partials/site-header.html`;
  const footerUrl = `${root}partials/site-footer.html`;

  const tasks = [];

  if (headerMount) {
    tasks.push(
      fetch(headerUrl)
        .then((r) => {
          if (!r.ok) throw new Error("header");
          return r.text();
        })
        .then((html) => {
          headerMount.innerHTML = applyRoot(html);
          if (!rootPrefix()) {
            const home = headerMount.querySelector(".nav__menu > .nav__item:first-child .nav__link");
            if (home) home.classList.add("is-active");
          }
        })
        .catch(() => {
          headerMount.innerHTML =
            '<p class="container" style="padding:1rem;font-weight:600;color:#b42318">Could not load site navigation. Serve the site over HTTP (not file://) and refresh.</p>';
        })
    );
  }

  if (footerMount) {
    tasks.push(
      fetch(footerUrl)
        .then((r) => {
          if (!r.ok) throw new Error("footer");
          return r.text();
        })
        .then((html) => {
          footerMount.innerHTML = applyRoot(html);
        })
        .catch(() => {
          footerMount.innerHTML =
            '<p class="container" style="padding:1rem;font-weight:600;color:#b42318">Could not load site footer.</p>';
        })
    );
  }

  Promise.all(tasks).finally(dispatchLoaded);
})();
