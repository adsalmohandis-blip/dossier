/* Dossier site behaviour. Everything here is optional: each piece runs only
   when the element it belongs to is on the page, so one file serves them all. */
(function () {
  "use strict";

  // --- days until the Product Liability Directive applies -----------------
  var count = document.getElementById("count");
  var label = document.getElementById("countLabel");
  if (count && label) {
    var target = Date.UTC(2026, 11, 9);
    var now = new Date();
    var today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    var days = Math.round((target - today) / 86400000);
    if (days > 1) {
      count.textContent = days;
      label.textContent = "days until the Product Liability Directive applies";
    } else if (days === 1) {
      count.textContent = "1";
      label.textContent = "day until the Product Liability Directive applies";
    } else if (days === 0) {
      count.textContent = "Today";
      label.textContent = "the Product Liability Directive applies from today";
    } else {
      count.textContent = Math.abs(days);
      label.textContent = "days since the Product Liability Directive took effect";
    }
  }

  // --- the live record, hashed in the browser -----------------------------
  var verifier = document.getElementById("verifier");
  if (verifier) {
    var fields = ["release", "model", "task", "static", "cov", "actor", "adr"];
    var el = {};
    fields.forEach(function (name) { el[name] = document.getElementById("f-" + name); });

    var original = {};
    fields.forEach(function (name) { original[name] = el[name].textContent; });

    var stateEl = document.getElementById("state");
    var digestEl = document.getElementById("digest");
    var tamperBtn = document.getElementById("tamper");
    var restoreBtn = document.getElementById("restore");
    var recorded = null;

    var current = function () {
      return fields.map(function (name) { return name + "=" + el[name].textContent; }).join("\n");
    };

    var hash = function (text) {
      if (!window.crypto || !window.crypto.subtle) return Promise.resolve(null);
      return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) {
          return b.toString(16).padStart(2, "0");
        }).join("");
      });
    };

    var show = function (unavailable) {
      if (unavailable) {
        digestEl.textContent = "needs a secure connection to compute in the browser";
        tamperBtn.disabled = true;
        return;
      }
      hash(current()).then(function (digest) {
        if (digest === null) { show(true); return; }
        if (recorded === null) recorded = digest;
        digestEl.textContent = digest.slice(0, 32) + "…";
        var ok = digest === recorded;
        stateEl.textContent = ok ? "VERIFIED" : "NOT VERIFIED";
        stateEl.className = ok ? "state" : "state bad";
      });
    };

    tamperBtn.addEventListener("click", function () {
      el.cov.innerHTML = '<mark>84.3%</mark>, minimum 70%';
      tamperBtn.disabled = true;
      restoreBtn.disabled = false;
      show();
    });

    restoreBtn.addEventListener("click", function () {
      el.cov.textContent = original.cov;
      restoreBtn.disabled = true;
      tamperBtn.disabled = false;
      show();
    });

    show(!(window.crypto && window.crypto.subtle));
  }

  // --- copy buttons -------------------------------------------------------
  Array.prototype.forEach.call(document.querySelectorAll("[data-copy]"), function (button) {
    button.addEventListener("click", function () {
      var text = button.getAttribute("data-copy");
      var label = button.textContent;
      var done = function () {
        button.textContent = "Copied";
        setTimeout(function () { button.textContent = label; }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () {
          button.textContent = "Select it manually";
        });
      } else {
        button.textContent = "Select it manually";
      }
    });
  });
})();
