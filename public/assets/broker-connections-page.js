(function initializeBrokerConnectionsPage(window, document, app) {
  if (!app || !app.requireAuth()) {
    return;
  }

  app.mountNav("brokers");

  const flashContainer = document.getElementById("pageFlash");
  const brokerForm = document.getElementById("brokerForm");
  const brokerSelect = document.getElementById("broker");
  const brokerFields = document.getElementById("brokerFields");
  const brokerStatus = document.getElementById("brokerStatus");
  const connectButton = document.getElementById("connectButton");
  const refreshButton = document.getElementById("refreshButton");
  const connectionsContainer = document.getElementById("connectionsContainer");
  const brokerAuthForms = {
    samco: [
      { name: "userId", label: "User ID", type: "text", autocomplete: "username", required: true },
      { name: "password", label: "Password", type: "password", autocomplete: "current-password", required: true },
      { name: "secretApiKey", label: "Secret API key", type: "password", autocomplete: "off", required: true },
      { name: "sessionToken", label: "Session token", type: "password", autocomplete: "off", required: false }
    ],
    zerodha: [
      { name: "apiKey", label: "API key", type: "password", autocomplete: "off", required: true },
      { name: "apiSecret", label: "API secret", type: "password", autocomplete: "off", required: true },
      {
        name: "requestToken",
        label: "Request token",
        type: "password",
        autocomplete: "off",
        required: false,
        group: "zerodhaToken"
      },
      {
        name: "sessionToken",
        label: "Session token",
        type: "password",
        autocomplete: "off",
        required: false,
        group: "zerodhaToken"
      }
    ]
  };

  app.showFlash(flashContainer);

  function getStatusMeta(status) {
    const normalized = String(status || "").toLowerCase();

    if (normalized === "connected") {
      return { label: "Connected", badgeClass: "text-bg-success" };
    }

    if (normalized === "syncing") {
      return { label: "Syncing", badgeClass: "text-bg-primary" };
    }

    if (normalized === "auth_failed") {
      return { label: "Auth failed", badgeClass: "text-bg-danger" };
    }

    if (normalized === "token_expired") {
      return { label: "Token expired", badgeClass: "text-bg-warning" };
    }

    return { label: "Failed", badgeClass: "text-bg-secondary" };
  }

  function renderConnections(connections) {
    if (!Array.isArray(connections) || connections.length === 0) {
      connectionsContainer.innerHTML = app.createEmptyMarkup("No broker connections are configured.");
      return;
    }

    connectionsContainer.innerHTML = connections
      .map(function mapConnection(connection) {
        const status = getStatusMeta(connection.status);

        return [
          '<div class="surface-card mb-3">',
          '<div class="d-flex flex-column flex-md-row justify-content-between gap-3 align-items-md-center">',
          "<div>",
          '<h3 class="h5 mb-1 text-capitalize">' + app.escapeHtml(connection.broker) + "</h3>",
          '<div class="text-secondary small">Last synced: ' + app.escapeHtml(app.formatDateTime(connection.lastSyncedAt)) + "</div>",
          connection.lastError ? '<div class="text-danger small">' + app.escapeHtml(connection.lastError) + "</div>" : "",
          "</div>",
          '<div class="d-flex align-items-center gap-2">',
          '<span class="badge ' + status.badgeClass + '">' + app.escapeHtml(status.label) + "</span>",
          '<button class="btn btn-primary btn-sm" data-sync-broker="' + app.escapeHtml(connection.broker) + '" type="button">Sync</button>',
          "</div>",
          "</div>",
          "</div>"
        ].join("");
      })
      .join("");
  }

  async function loadStatus() {
    connectionsContainer.innerHTML = app.createLoadingMarkup("Loading broker status...");
    const connections = await app.apiFetch("/broker/status");
    renderConnections(connections);
  }

  function renderBrokerFields() {
    const broker = brokerSelect.value;
    const fields = brokerAuthForms[broker] || [];

    brokerFields.innerHTML = fields
      .map(function mapField(field) {
        const inputId = "brokerCredential_" + field.name;
        const helpMarkup =
          field.group === "zerodhaToken"
            ? '<div class="form-text">Enter either request token or session token.</div>'
            : "";

        return [
          '<div class="mb-3">',
          '<label class="form-label" for="' + app.escapeHtml(inputId) + '">' +
            app.escapeHtml(field.label) +
            (field.required ? ' <span class="text-danger">*</span>' : "") +
            "</label>",
          '<input class="form-control" id="' +
            app.escapeHtml(inputId) +
            '" name="' +
            app.escapeHtml(field.name) +
            '" data-auth-field="' +
            app.escapeHtml(field.name) +
            '" type="' +
            app.escapeHtml(field.type) +
            '" autocomplete="' +
            app.escapeHtml(field.autocomplete || "off") +
            '" />',
          '<div class="invalid-feedback"></div>',
          helpMarkup,
          "</div>"
        ].join("");
      })
      .join("");
  }

  function setFieldError(fieldName, message) {
    const input = brokerFields.querySelector('[data-auth-field="' + fieldName + '"]');

    if (!input) {
      return;
    }

    input.classList.add("is-invalid");
    const feedback = input.parentElement.querySelector(".invalid-feedback");

    if (feedback) {
      feedback.textContent = message;
    }
  }

  function clearFieldErrors() {
    brokerFields.querySelectorAll(".is-invalid").forEach(function clearInvalid(input) {
      input.classList.remove("is-invalid");
    });
    brokerFields.querySelectorAll(".invalid-feedback").forEach(function clearFeedback(feedback) {
      feedback.textContent = "";
    });
  }

  function readCredentials() {
    const credentials = {};

    brokerFields.querySelectorAll("[data-auth-field]").forEach(function collectField(input) {
      const value = input.value.trim();

      if (value) {
        credentials[input.dataset.authField] = value;
      }
    });

    return credentials;
  }

  function validateCredentials(broker, credentials) {
    const fields = brokerAuthForms[broker] || [];
    let isValid = true;

    clearFieldErrors();

    fields.forEach(function validateRequired(field) {
      if (field.required && !credentials[field.name]) {
        setFieldError(field.name, field.label + " is required.");
        isValid = false;
      }
    });

    if (broker === "zerodha" && !credentials.requestToken && !credentials.sessionToken) {
      setFieldError("requestToken", "Request token or session token is required.");
      setFieldError("sessionToken", "Request token or session token is required.");
      isValid = false;
    }

    return isValid;
  }

  brokerForm.addEventListener("submit", async function handleConnect(event) {
    event.preventDefault();

    try {
      const broker = brokerSelect.value;
      const credentials = readCredentials();

      if (!validateCredentials(broker, credentials)) {
        app.renderAlert(brokerStatus, "danger", "Complete the required authentication fields.");
        return;
      }

      app.setButtonLoading(connectButton, true, "Connecting...");
      await app.apiFetch("/broker/connect", {
        method: "POST",
        body: {
          broker: broker,
          credentials: credentials
        }
      });
      brokerForm.reset();
      brokerSelect.value = broker;
      renderBrokerFields();
      app.renderAlert(brokerStatus, "success", "Broker connected.");
      await loadStatus();
    } catch (error) {
      app.renderAlert(brokerStatus, "danger", app.extractErrorMessage(error));
    } finally {
      app.setButtonLoading(connectButton, false);
    }
  });

  connectionsContainer.addEventListener("click", async function handleSync(event) {
    const button = event.target.closest("[data-sync-broker]");

    if (!button) {
      return;
    }

    try {
      app.setButtonLoading(button, true, "Syncing...");
      const result = await app.apiFetch("/broker/sync", {
        method: "POST",
        body: { broker: button.dataset.syncBroker }
      });
      app.renderAlert(
        brokerStatus,
        "success",
        result.fetched === 0 ? "Connected, no transactions found yet" : "Imported " + result.imported + " new transactions."
      );
      await loadStatus();
    } catch (error) {
      app.renderAlert(brokerStatus, "danger", app.extractErrorMessage(error));
    } finally {
      app.setButtonLoading(button, false);
    }
  });

  brokerSelect.addEventListener("change", function handleBrokerChange() {
    app.renderAlert(brokerStatus, null, "");
    renderBrokerFields();
  });

  brokerFields.addEventListener("input", function handleCredentialInput(event) {
    const input = event.target.closest("[data-auth-field]");

    if (!input) {
      return;
    }

    input.classList.remove("is-invalid");
    const feedback = input.parentElement.querySelector(".invalid-feedback");

    if (feedback) {
      feedback.textContent = "";
    }
  });

  refreshButton.addEventListener("click", function handleRefresh() {
    loadStatus().catch(function handleError(error) {
      connectionsContainer.innerHTML =
        '<div class="alert alert-danger mb-0" role="alert">' + app.escapeHtml(app.extractErrorMessage(error)) + "</div>";
    });
  });

  renderBrokerFields();

  loadStatus().catch(function handleError(error) {
    connectionsContainer.innerHTML =
      '<div class="alert alert-danger mb-0" role="alert">' + app.escapeHtml(app.extractErrorMessage(error)) + "</div>";
  });
})(window, document, window.StockInsightsApp);
