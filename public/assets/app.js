(function initializeApp(window, document) {
  const TOKEN_KEY = "stockInsightsToken";
  const USER_KEY = "stockInsightsUser";
  const FLASH_KEY = "stockInsightsFlash";
  const currencyFormatter = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
  const numberFormatter = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

  function safeJsonParse(value, fallback = null) {
    if (!value) {
      return fallback;
    }

    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }

  function isAuthPage() {
    const pathName = window.location.pathname.replace(/\/$/, "") || "/";
    return pathName === "/" || pathName === "/index.html" || pathName === "/login" || pathName === "/signup";
  }

  function getToken() {
    return window.localStorage.getItem(TOKEN_KEY);
  }

  function getUser() {
    return safeJsonParse(window.localStorage.getItem(USER_KEY), null);
  }

  function setSession(session) {
    if (!session || !session.token) {
      return;
    }

    window.localStorage.setItem(TOKEN_KEY, session.token);

    if (session.user) {
      window.localStorage.setItem(USER_KEY, JSON.stringify(session.user));
    }
  }

  function clearSession() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
  }

  function setFlash(type, message) {
    window.sessionStorage.setItem(
      FLASH_KEY,
      JSON.stringify({
        type: type || "info",
        message: message || ""
      })
    );
  }

  function consumeFlash() {
    const flash = safeJsonParse(window.sessionStorage.getItem(FLASH_KEY), null);
    window.sessionStorage.removeItem(FLASH_KEY);
    return flash;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderAlert(container, type, message) {
    if (!container) {
      return;
    }

    if (!message) {
      container.innerHTML = "";
      container.classList.add("d-none");
      return;
    }

    const alertType = type || "info";
    container.classList.remove("d-none");
    container.innerHTML = [
      '<div class="alert alert-' + escapeHtml(alertType) + ' mb-0" role="alert">',
      escapeHtml(message),
      "</div>"
    ].join("");
  }

  function showFlash(container) {
    const flash = consumeFlash();

    if (flash && flash.message) {
      renderAlert(container, flash.type, flash.message);
    }
  }

  function formatCurrency(value) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return "N/A";
    }

    return currencyFormatter.format(numericValue);
  }

  function formatNumber(value) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return "N/A";
    }

    return numberFormatter.format(numericValue);
  }

  function formatPercent(value, options) {
    const numericValue = Number(value);
    const settings = options || {};

    if (!Number.isFinite(numericValue)) {
      return "N/A";
    }

    const absoluteValue = numberFormatter.format(Math.abs(numericValue));

    if (numericValue < 0) {
      return "-" + absoluteValue + "%";
    }

    if (settings.signed && numericValue > 0) {
      return "+" + numberFormatter.format(numericValue) + "%";
    }

    return numberFormatter.format(numericValue) + "%";
  }

  function formatDateTime(value) {
    if (!value) {
      return "N/A";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "N/A";
    }

    return date.toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short"
    });
  }

  function formatDate(value) {
    if (!value) {
      return "N/A";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "N/A";
    }

    return date.toLocaleDateString("en-IN", {
      dateStyle: "medium"
    });
  }

  function formatHoldingPeriod(holding) {
    const details = holding || {};

    if (details.holdingType === "unknown" || details.holdingAgeSource === "unknown" || details.holdingDays === null) {
      return "Holding period unavailable";
    }

    const days = Number(details.holdingDays);

    if (!Number.isFinite(days)) {
      return "Holding period unavailable";
    }

    const years = Number(details.holdingYears || 0);
    const months = Number(details.holdingMonths || 0) % 12;

    if (years > 0) {
      return years + "y " + months + "m (" + formatNumber(days) + " days)";
    }

    if (Number(details.holdingMonths) > 0) {
      return Number(details.holdingMonths) + "m (" + formatNumber(days) + " days)";
    }

    return formatNumber(days) + " days";
  }

  function formatHoldingType(value) {
    if (String(value || "") === "unknown") {
      return "Unknown";
    }

    return String(value || "") === "long_term" ? "Long-term" : "Short-term";
  }

  function getHoldingTypeBadgeClass(value) {
    if (String(value || "") === "unknown") {
      return "text-bg-secondary";
    }

    return String(value || "") === "long_term" ? "text-bg-success" : "text-bg-warning";
  }

  function buildHoldingEstimateNote(holding) {
    const details = holding || {};

    if (details.holdingAgeSource === "estimated") {
      return "Acquisition date estimated from broker holding-age metadata.";
    }

    if (details.holdingAgeSource === "unknown") {
      return "Acquisition date was unavailable from broker data.";
    }

    return "";
  }

  function formatPriceSource(value) {
    const normalized = String(value || "").toLowerCase();

    if (normalized === "live") {
      return "Live";
    }

    if (normalized === "stored") {
      return "Stored";
    }

    if (normalized === "mock") {
      return "Mock";
    }

    return "Unknown";
  }

  function getPerformanceClass(value) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue) || numericValue === 0) {
      return "text-body";
    }

    return numericValue > 0 ? "profit-text" : "loss-text";
  }

  function getConfidenceBadgeClass(label) {
    const normalized = String(label || "").toLowerCase();

    if (normalized.includes("strong")) {
      return "text-bg-success";
    }

    if (normalized.includes("weak")) {
      return "text-bg-danger";
    }

    return "text-bg-secondary";
  }

  function normalizeSeverityLabel(value) {
    return String(value || "")
      .replace(/_/g, " ")
      .trim();
  }

  function getSeverityBadgeClass(value) {
    const normalized = String(value || "").toLowerCase();

    if (normalized.includes("high")) {
      return "text-bg-danger";
    }

    if (normalized.includes("moderate")) {
      return "text-bg-warning";
    }

    return "text-bg-secondary";
  }

  function createLoadingMarkup(message) {
    return [
      '<div class="state-card text-center py-5">',
      '<div class="spinner-border text-primary mb-3" role="status" aria-hidden="true"></div>',
      '<p class="text-secondary mb-0">' + escapeHtml(message || "Loading...") + "</p>",
      "</div>"
    ].join("");
  }

  function createEmptyMarkup(message, actionHref, actionLabel) {
    const actionMarkup =
      actionHref && actionLabel
        ? '<a class="btn btn-primary mt-3" href="' +
          escapeHtml(actionHref) +
          '">' +
          escapeHtml(actionLabel) +
          "</a>"
        : "";

    return [
      '<div class="state-card text-center py-5">',
      '<h3 class="h5 mb-2">Nothing to show yet</h3>',
      '<p class="text-secondary mb-0">' + escapeHtml(message || "No data is available.") + "</p>",
      actionMarkup,
      "</div>"
    ].join("");
  }

  function setButtonLoading(button, isLoading, loadingText) {
    if (!button) {
      return;
    }

    if (!button.dataset.originalText) {
      button.dataset.originalText = button.innerHTML;
    }

    button.disabled = Boolean(isLoading);
    button.innerHTML = isLoading
      ? '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>' +
        escapeHtml(loadingText || "Working...")
      : button.dataset.originalText;
  }

  function extractErrorMessage(error) {
    if (!error) {
      return "Unexpected error";
    }

    if (typeof error === "string") {
      return error;
    }

    if (error.details && Array.isArray(error.details) && error.details.length > 0) {
      return error.details
        .map(function mapDetail(detail) {
          return detail.field ? detail.field + ": " + detail.code : detail.code;
        })
        .join(", ");
    }

    return error.message || "Unexpected error";
  }

  async function apiFetch(path, options) {
    const requestOptions = options || {};
    const headers = new window.Headers(requestOptions.headers || {});
    const token = getToken();
    const hasJsonBody =
      requestOptions.body &&
      typeof requestOptions.body === "object" &&
      !(requestOptions.body instanceof window.FormData);

    if (token && !requestOptions.skipAuth) {
      headers.set("Authorization", "Bearer " + token);
    }

    if (hasJsonBody) {
      headers.set("Content-Type", "application/json");
    }

    const response = await window.fetch("/api" + path, {
      method: requestOptions.method || "GET",
      headers: headers,
      body: hasJsonBody ? JSON.stringify(requestOptions.body) : requestOptions.body
    });

    const payloadText = await response.text();
    const payload = safeJsonParse(payloadText, {});

    if (!response.ok) {
      const error = {
        status: response.status,
        code: payload && payload.error ? payload.error.code : "REQUEST_FAILED",
        message:
          payload && payload.error && payload.error.message
            ? payload.error.message
            : "Request failed",
        details: payload && payload.error ? payload.error.details : null
      };

      if (response.status === 401 && !isAuthPage()) {
        clearSession();
        setFlash("warning", "Your session expired. Log in again to continue.");
        window.location.href = "/";
      }

      throw error;
    }

    return payload && Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload;
  }

  function requireAuth() {
    if (getToken()) {
      return true;
    }

    setFlash("warning", "Log in to access the portfolio.");
    window.location.href = "/";
    return false;
  }

  function redirectIfAuthenticated() {
    if (!getToken()) {
      return;
    }

    window.location.href = "/dashboard";
  }

  function mountNav(activePage) {
    const navContainer = document.querySelector("[data-app-nav]");

    if (!navContainer) {
      return;
    }

    const currentUser = getUser();
    const links = [
      { href: "/dashboard", label: "Dashboard", key: "dashboard" },
      { href: "/add-stock", label: "Add Stock", key: "add-stock" },
      { href: "/import-portfolio", label: "Import", key: "import" },
      { href: "/broker-connections", label: "Brokers", key: "brokers" },
      { href: "/transactions", label: "Transactions", key: "transactions" },
      { href: "/insights", label: "Insights", key: "insights" }
    ];

    navContainer.innerHTML = [
      '<nav class="navbar navbar-expand-lg navbar-light app-navbar border-bottom">',
      '<div class="container">',
      '<a class="navbar-brand fw-semibold" href="/dashboard">Stock Insights</a>',
      '<button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#appNavbar" aria-controls="appNavbar" aria-expanded="false" aria-label="Toggle navigation">',
      '<span class="navbar-toggler-icon"></span>',
      "</button>",
      '<div class="collapse navbar-collapse" id="appNavbar">',
      '<ul class="navbar-nav me-auto mb-2 mb-lg-0">',
      links
        .map(function mapLink(link) {
          return (
            '<li class="nav-item">' +
            '<a class="nav-link ' +
            (activePage === link.key ? "active" : "") +
            '" href="' +
            escapeHtml(link.href) +
            '">' +
            escapeHtml(link.label) +
            "</a>" +
            "</li>"
          );
        })
        .join(""),
      "</ul>",
      '<div class="d-flex align-items-center gap-3">',
      '<span class="small text-secondary">' +
        escapeHtml(currentUser && currentUser.email ? currentUser.email : "Authenticated") +
        "</span>",
      '<button class="btn btn-outline-secondary btn-sm" type="button" id="logoutButton">Logout</button>',
      "</div>",
      "</div>",
      "</div>",
      "</nav>"
    ].join("");

    const logoutButton = document.getElementById("logoutButton");

    if (logoutButton) {
      logoutButton.addEventListener("click", function handleLogout() {
        clearSession();
        setFlash("success", "You have been logged out.");
        window.location.href = "/";
      });
    }
  }

  window.StockInsightsApp = {
    apiFetch: apiFetch,
    clearSession: clearSession,
    consumeFlash: consumeFlash,
    createEmptyMarkup: createEmptyMarkup,
    createLoadingMarkup: createLoadingMarkup,
    escapeHtml: escapeHtml,
    extractErrorMessage: extractErrorMessage,
    formatCurrency: formatCurrency,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    formatHoldingPeriod: formatHoldingPeriod,
    formatHoldingType: formatHoldingType,
    formatNumber: formatNumber,
    formatPercent: formatPercent,
    formatPriceSource: formatPriceSource,
    getConfidenceBadgeClass: getConfidenceBadgeClass,
    getHoldingTypeBadgeClass: getHoldingTypeBadgeClass,
    getPerformanceClass: getPerformanceClass,
    getSeverityBadgeClass: getSeverityBadgeClass,
    getToken: getToken,
    getUser: getUser,
    mountNav: mountNav,
    normalizeSeverityLabel: normalizeSeverityLabel,
    buildHoldingEstimateNote: buildHoldingEstimateNote,
    redirectIfAuthenticated: redirectIfAuthenticated,
    renderAlert: renderAlert,
    requireAuth: requireAuth,
    setButtonLoading: setButtonLoading,
    setFlash: setFlash,
    setSession: setSession,
    showFlash: showFlash
  };
})(window, document);
