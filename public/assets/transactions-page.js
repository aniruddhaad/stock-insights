(function initializeTransactionsPage(window, document, app) {
  if (!app || !app.requireAuth()) {
    return;
  }

  app.mountNav("transactions");

  const flashContainer = document.getElementById("pageFlash");
  const container = document.getElementById("transactionsContainer");
  const symbolFilter = document.getElementById("symbolFilter");
  const includeInactiveCheckbox = document.getElementById("includeInactiveCheckbox");
  const applyFilterButton = document.getElementById("applyFilterButton");
  const addTransactionButton = document.getElementById("addTransactionButton");
  const params = new URLSearchParams(window.location.search);

  app.showFlash(flashContainer);
  symbolFilter.value = params.get("symbol") || "";
  includeInactiveCheckbox.checked = params.get("includeInactive") === "true";

  function isManual(transaction) {
    return transaction.source === "manual" && transaction.broker === "manual";
  }

  function sourceLabel(transaction) {
    return transaction.source + (transaction.broker ? " / " + transaction.broker : "");
  }

  function promptTransaction(defaults) {
    const current = defaults || {};
    const symbol = window.prompt("Symbol", current.symbol || "");

    if (!symbol) {
      return null;
    }

    const type = window.prompt("Type (BUY or SELL)", current.type || "BUY");

    if (!type) {
      return null;
    }

    const quantity = window.prompt("Quantity", current.quantity || "");

    if (!quantity) {
      return null;
    }

    const price = window.prompt("Price", current.price || "");

    if (!price) {
      return null;
    }

    const transactionDate = window.prompt(
      "Transaction date (YYYY-MM-DD)",
      current.transactionDate ? new Date(current.transactionDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
    );

    if (!transactionDate) {
      return null;
    }

    const fees = window.prompt("Fees", current.fees || "0");

    return {
      symbol: symbol,
      type: type,
      quantity: Number(quantity),
      price: Number(price),
      transactionDate: transactionDate,
      fees: Number(fees || 0)
    };
  }

  function renderTransactions(transactions) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
      container.innerHTML = app.createEmptyMarkup("No transactions match this view.");
      return;
    }

    const rows = transactions
      .map(function mapTransaction(transaction) {
        const manual = isManual(transaction);
        const inactive = transaction.active === false;

        return [
          "<tr>",
          '<td><span class="badge ' +
            (transaction.type === "BUY" ? "text-bg-success" : "text-bg-warning") +
            '">' +
            app.escapeHtml(transaction.type) +
            "</span></td>",
          '<td class="fw-semibold">' + app.escapeHtml(transaction.symbol) + "</td>",
          "<td>" + app.escapeHtml(app.formatNumber(transaction.quantity)) + "</td>",
          "<td>" + app.escapeHtml(app.formatCurrency(transaction.price)) + "</td>",
          "<td>" + app.escapeHtml(app.formatCurrency(transaction.fees || 0)) + "</td>",
          "<td>" + app.escapeHtml(app.formatDateTime(transaction.transactionDate)) + "</td>",
          "<td>" + app.escapeHtml(sourceLabel(transaction)) + "</td>",
          "<td><code>" + app.escapeHtml(transaction.externalTransactionId) + "</code></td>",
          '<td><span class="badge ' +
            (inactive ? "text-bg-secondary" : "text-bg-primary") +
            '">' +
            (inactive ? "Inactive" : "Active") +
            "</span></td>",
          '<td class="text-nowrap">',
          manual && !inactive
            ? '<button class="btn btn-outline-secondary btn-sm me-1" type="button" data-action="edit" data-id="' +
              app.escapeHtml(transaction._id) +
              '">Edit</button>'
            : "",
          !inactive
            ? '<button class="btn btn-outline-danger btn-sm" type="button" data-action="delete" data-id="' +
              app.escapeHtml(transaction._id) +
              '" data-imported="' +
              String(!manual) +
              '">Delete</button>'
            : "",
          "</td>",
          "</tr>"
        ].join("");
      })
      .join("");

    container.innerHTML = [
      '<div class="surface-card p-0 overflow-hidden">',
      '<div class="table-responsive">',
      '<table class="table table-hover mb-0 align-middle">',
      "<thead>",
      '<tr class="table-light">',
      "<th>Type</th>",
      "<th>Symbol</th>",
      "<th>Quantity</th>",
      "<th>Price</th>",
      "<th>Fees</th>",
      "<th>Date</th>",
      "<th>Import source</th>",
      "<th>External transaction id</th>",
      "<th>Status</th>",
      "<th>Actions</th>",
      "</tr>",
      "</thead>",
      "<tbody>",
      rows,
      "</tbody>",
      "</table>",
      "</div>",
      "</div>"
    ].join("");
  }

  async function loadTransactions() {
    const query = new URLSearchParams();

    if (symbolFilter.value.trim()) {
      query.set("symbol", symbolFilter.value.trim());
    }

    if (includeInactiveCheckbox.checked) {
      query.set("includeInactive", "true");
    }

    container.innerHTML = app.createLoadingMarkup("Loading transactions...");

    try {
      const transactions = await app.apiFetch("/transactions" + (query.toString() ? "?" + query.toString() : ""));
      renderTransactions(transactions);
    } catch (error) {
      app.renderAlert(flashContainer, "danger", app.extractErrorMessage(error));
      container.innerHTML = "";
    }
  }

  async function deleteTransaction(id, imported) {
    const message = imported
      ? "Imported transactions are not removed. They will be marked inactive after confirmation."
      : "Delete this manual transaction?";

    if (!window.confirm(message)) {
      return;
    }

    const body = {};

    if (imported) {
      const confirmation = window.prompt("Type DELETE to mark this imported transaction inactive.");

      if (confirmation !== "DELETE") {
        return;
      }

      body.force = true;
      body.confirmation = "DELETE";
    }

    await app.apiFetch("/transactions/" + encodeURIComponent(id), {
      method: "DELETE",
      body: body
    });

    app.renderAlert(flashContainer, "success", "Transaction updated. Portfolio was recomputed.");
    await loadTransactions();
  }

  addTransactionButton.addEventListener("click", async function handleAddTransaction() {
    const payload = promptTransaction({ symbol: symbolFilter.value.trim() });

    if (!payload) {
      return;
    }

    try {
      await app.apiFetch("/transactions", {
        method: "POST",
        body: payload
      });
      app.renderAlert(flashContainer, "success", "Transaction added. Portfolio was recomputed.");
      await loadTransactions();
    } catch (error) {
      app.renderAlert(flashContainer, "danger", app.extractErrorMessage(error));
    }
  });

  applyFilterButton.addEventListener("click", loadTransactions);
  includeInactiveCheckbox.addEventListener("change", loadTransactions);

  container.addEventListener("click", async function handleTransactionAction(event) {
    const button = event.target.closest("button[data-action]");

    if (!button) {
      return;
    }

    try {
      if (button.dataset.action === "delete") {
        await deleteTransaction(button.dataset.id, button.dataset.imported === "true");
        return;
      }

      if (button.dataset.action === "edit") {
        const row = button.closest("tr");
        const payload = promptTransaction({
          symbol: row.children[1].textContent.trim(),
          type: row.children[0].textContent.trim(),
          quantity: row.children[2].textContent.trim().replace(/,/g, ""),
          price: row.children[3].textContent.trim().replace(/[^\d.]/g, ""),
          fees: row.children[4].textContent.trim().replace(/[^\d.]/g, "")
        });

        if (!payload) {
          return;
        }

        await app.apiFetch("/transactions/" + encodeURIComponent(button.dataset.id), {
          method: "PATCH",
          body: payload
        });
        app.renderAlert(flashContainer, "success", "Transaction edited. Portfolio was recomputed.");
        await loadTransactions();
      }
    } catch (error) {
      app.renderAlert(flashContainer, "danger", app.extractErrorMessage(error));
    }
  });

  loadTransactions();
})(window, document, window.StockInsightsApp);
