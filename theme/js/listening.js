/* Currently listening.
   Data comes from a gist; cover art from Spotify oEmbed.
   Both are cached in localStorage so navigating around the site doesn't refetch:
     - gist payload: 1 hour (you might edit it)
     - cover art: 30 days (immutable for a given album)
   Every layer is optional. Nothing cached, nothing reachable -> section stays hidden. */
(function () {
  "use strict";

  var list = document.querySelector("[data-listening]");
  if (!list) return;

  var remote = list.dataset.remote || "";
  var HOUR = 36e5;
  var TTL_DATA = 1 * HOUR;
  var TTL_ART = 30 * 24 * HOUR;

  /* --- tiny cache ------------------------------------------------------ */

  function cacheGet(key, ttl) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || typeof o.t !== "number") return null;
      if (Date.now() - o.t > ttl) { localStorage.removeItem(key); return null; }
      return o.v;
    } catch (e) { return null; }
  }

  function cacheSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value }));
    } catch (e) { /* full or blocked - carry on uncached */ }
  }

  /* --- rendering ------------------------------------------------------- */

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  /* All four rows always render, even when empty, so subgrid keeps the
     album / artist / track lines aligned across cards. */
  function inner(r) {
    var meta = [r.artist, r.year].filter(Boolean).map(esc).join(" &middot; ");
    return (
      '<div class="album-card__art">' +
        (r.cover
          ? '<img src="' + esc(r.cover) + '" alt="" loading="lazy">'
          : '<span class="album-card__fallback" aria-hidden="true"></span>') +
      "</div>" +
      '<p class="album-card__album">' + esc(r.album || "") + "</p>" +
      '<p class="album-card__meta">' + meta + "</p>" +
      '<p class="album-card__track">' + esc(r.track || "") + "</p>"
    );
  }

  function card(r) {
    var li = document.createElement("li");
    li.className = "album-card";
    if (r.spotify) li.dataset.spotify = r.spotify;

    if (r.spotify) {
      var a = document.createElement("a");
      a.className = "album-card__link";
      a.href = r.spotify;
      a.target = "_blank";
      a.rel = "noopener";
      a.innerHTML = inner(r);
      li.appendChild(a);
    } else {
      li.innerHTML = inner(r);
    }
    return li;
  }

  /* --- cover art ------------------------------------------------------- */

  function applyArt(li, d) {
    var art = li.querySelector(".album-card__art");
    if (art && d.thumbnail_url && !art.querySelector("img")) {
      var img = new Image();
      img.loading = "lazy";
      img.alt = "";
      img.src = d.thumbnail_url;
      art.innerHTML = "";
      art.appendChild(img);
    }
    var name = li.querySelector(".album-card__album");
    if (d.title && name && !name.textContent.trim()) name.textContent = d.title;
  }

  function hydrate(li) {
    var url = li.dataset.spotify;
    if (!url) return;

    var key = "listening:art:" + url;
    var hit = cacheGet(key, TTL_ART);
    if (hit) { applyArt(li, hit); return; }

    fetch("https://open.spotify.com/oembed?url=" + encodeURIComponent(url))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        var slim = { thumbnail_url: d.thumbnail_url, title: d.title };
        cacheSet(key, slim);
        applyArt(li, slim);
      })
      .catch(function () { /* placeholder stays */ });
  }

  function hydrateAll() {
    list.querySelectorAll("[data-spotify]").forEach(hydrate);
  }

  function render(rows) {
    list.innerHTML = "";
    rows.forEach(function (r) { list.appendChild(card(r)); });
  }

  function reveal() {
    var section = list.closest("section");
    if (section) section.hidden = !list.children.length;
  }

  /* --- go -------------------------------------------------------------- */

  if (!remote) { reveal(); hydrateAll(); return; }

  var cached = cacheGet("listening:data", TTL_DATA);
  if (cached) {
    render(cached);
    reveal();
    hydrateAll();
    return;
  }

  fetch(remote)
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (rows) {
      if (Array.isArray(rows) && rows.length) {
        cacheSet("listening:data", rows);
        render(rows);
      }
    })
    .catch(function () { /* build-time cards, if any, stay */ })
    .then(function () { reveal(); hydrateAll(); });
})();
