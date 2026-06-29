(function initializeDashboardPage(window, document, app) {
  if (!app || !app.requireAuth()) {
    return;
  }

  app.mountNav("dashboard");

  const flashContainer = document.getElementById("pageFlash");
  const summaryContainer = document.getElementById("summaryCards");
  const holdingsContainer = document.getElementById("holdingsTableContainer");

  app.showFlash(flashContainer);
  summaryContainer.innerHTML = app.createLoadingMarkup("Loading portfolio summary...");
  holdingsContainer.innerHTML = app.createLoadingMarkup("Loading stock positions...");

  function renderSummary(summary) {
    const profitLossClass = app.getPerformanceClass(summary.totalProfitLossPct);

    summaryContainer.innerHTML = [
      '<div class="col-md-6 col-xl-3">',
      '<div class="metric-card">',
      '<div class="metric-label">Total investment</div>',
      '<div class="metric-value">' + app.escapeHtml(app.formatCurrency(summary.totalInvestment)) + "</div>",
      "</div>",
      "</div>",
      '<div class="col-md-6 col-xl-3">',
      '<div class="metric-card">',
      '<div class="metric-label">Current value</div>',
      '<div class="metric-value">' + app.escapeHtml(app.formatCurrency(summary.totalCurrentValue)) + "</div>",
      "</div>",
      "</div>",
      '<div class="col-md-6 col-xl-3">',
      '<div class="metric-card">',
      '<div class="metric-label">Profit / loss</div>',
      '<div class="metric-value ' + profitLossClass + '">' + app.escapeHtml(app.formatCurrency(summary.totalProfitLoss)) + "</div>",
      "</div>",
      "</div>",
      '<div class="col-md-6 col-xl-3">',
      '<div class="metric-card">',
      '<div class="metric-label">Profit / loss %</div>',
      '<div class="metric-value ' + profitLossClass + '">' +
        app.escapeHtml(app.formatPercent(summary.totalProfitLossPct, { signed: true })) +
        "</div>",
      "</div>",
      "</div>"
    ].join("");
  }

  function renderHoldings(positions) {
    if (!Array.isArray(positions) || positions.length === 0) {
      holdingsContainer.innerHTML = app.createEmptyMarkup(
        "No stocks have been added to the portfolio.",
        "/add-stock",
        "Add your first stock"
      );
      return;
    }

    const rows = positions
      .map(function mapPosition(position) {
        const metrics = position.metrics || {};
        const prices = position.prices || {};
        const holding = position.holding || {};
        const profitLossClass = app.getPerformanceClass(metrics.profitLossPct);
        const holdingNote = app.buildHoldingEstimateNote(holding);
        const holdingNoteMarkup = holdingNote
          ? ' <span class="text-secondary" title="' + app.escapeHtml(holdingNote) + '">(est.)</span>'
          : "";

        return [
          "<tr>",
          "<td><span class=\"fw-semibold\">" + app.escapeHtml(position.symbol) + "</span></td>",
          "<td>" + app.escapeHtml(app.formatNumber(position.quantity)) + "</td>",
          "<td>" + app.escapeHtml(app.formatCurrency(prices.buyPrice)) + "</td>",
          "<td>" + app.escapeHtml(app.formatCurrency(prices.currentPrice)) + "</td>",
          "<td>",
          '<span class="badge ' +
            app.getHoldingTypeBadgeClass(holding.holdingType) +
            '">' +
            app.escapeHtml(app.formatHoldingType(holding.holdingType)) +
            "</span>",
          '<div class="small text-secondary mt-1">' +
            app.escapeHtml(app.formatHoldingPeriod(holding)) +
            "</div>",
          "</td>",
          "<td>" + app.escapeHtml(app.formatDate(holding.acquisitionDate || holding.buyDate)) + holdingNoteMarkup + "</td>",
          "<td>" + app.escapeHtml(app.formatPriceSource(prices.dataSource)) + "</td>",
          "<td>" + app.escapeHtml(app.formatDateTime(prices.lastUpdated)) + "</td>",
          '<td><span class="' +
            profitLossClass +
            '">' +
            app.escapeHtml(app.formatPercent(metrics.profitLossPct, { signed: true })) +
            "</span></td>",
          '<td class="text-nowrap">',
          '<a class="btn btn-outline-secondary btn-sm me-1" href="/transactions?symbol=' +
            encodeURIComponent(position.symbol) +
            '">Transactions</a>',
          '<button class="btn btn-outline-primary btn-sm me-1" type="button" data-action="sell" data-symbol="' +
            app.escapeHtml(position.symbol) +
            '" data-quantity="' +
            app.escapeHtml(position.quantity) +
            '">Sell</button>',
          '<button class="btn btn-outline-warning btn-sm me-1" type="button" data-action="close-position" data-symbol="' +
            app.escapeHtml(position.symbol) +
            '" data-quantity="' +
            app.escapeHtml(position.quantity) +
            '">Close</button>',
          '<button class="btn btn-outline-danger btn-sm" type="button" data-action="delete-position" data-symbol="' +
            app.escapeHtml(position.symbol) +
            '">Delete</button>',
          "</td>",
          "</tr>"
        ].join("");
      })
      .join("");

    holdingsContainer.innerHTML = [
      '<div class="surface-card p-0 overflow-hidden">',
      '<div class="table-responsive">',
      '<table class="table table-hover mb-0">',
      "<thead>",
      '<tr class="table-light">',
      "<th>Symbol</th>",
      "<th>Quantity</th>",
      "<th>Buy price</th>",
      "<th>Current price</th>",
      "<th>Holding period</th>",
      "<th>Acquired</th>",
      "<th>Source</th>",
      "<th>Last updated</th>",
      "<th>Profit / loss %</th>",
      "<th>Manage</th>",
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

  async function addSellTransaction(symbol, maxQuantity, closePosition) {
    const quantity = closePosition ? maxQuantity : window.prompt("Sell quantity for " + symbol, maxQuantity || "");

    if (!quantity) {
      return;
    }

    const price = window.prompt((closePosition ? "Close price" : "Sell price") + " for " + symbol);

    if (!price) {
      return;
    }

    const transactionDate = window.prompt("Transaction date (YYYY-MM-DD)", new Date().toISOString().slice(0, 10));

    if (!transactionDate) {
      return;
    }

    await app.apiFetch("/transactions", {
      method: "POST",
      body: {
        symbol: symbol,
        type: "SELL",
        quantity: Number(quantity),
        price: Number(price),
        transactionDate: transactionDate
      }
    });

    app.setFlash("success", "Sell transaction added. Portfolio was recomputed.");
    window.location.reload();
  }

  async function deletePosition(symbol, force) {
    await app.apiFetch("/portfolio/positions/" + encodeURIComponent(symbol), {
      method: "DELETE",
      body: force
        ? {
            force: true,
            confirmation: "DELETE"
          }
        : {}
    });

    app.setFlash("success", "Position deleted. Portfolio was recomputed.");
    window.location.reload();
  }

  holdingsContainer.addEventListener("click", async function handleHoldingAction(event) {
    const button = event.target.closest("button[data-action]");

    if (!button) {
      return;
    }

    const symbol = button.dataset.symbol;

    try {
      if (button.dataset.action === "sell") {
        await addSellTransaction(symbol, button.dataset.quantity);
        return;
      }

      if (button.dataset.action === "close-position") {
        if (!window.confirm("Close " + symbol + " by adding a sell transaction for the full quantity?")) {
          return;
        }

        await addSellTransaction(symbol, button.dataset.quantity, true);
        return;
      }

      if (button.dataset.action === "delete-position") {
        if (!window.confirm("Delete " + symbol + " from the portfolio? Manual transactions will be removed.")) {
          return;
        }

        try {
          await deletePosition(symbol, false);
        } catch (error) {
          if (error.code !== "FORCED_CONFIRMATION_REQUIRED") {
            throw error;
          }

          const confirmation = window.prompt(
            "This position includes imported transactions. Type DELETE to mark imported transactions inactive."
          );

          if (confirmation !== "DELETE") {
            return;
          }

          await deletePosition(symbol, true);
        }
      }
    } catch (error) {
      app.renderAlert(flashContainer, "danger", app.extractErrorMessage(error));
    }
  });

  (async function loadDashboard() {
    try {
      const data = await app.apiFetch("/portfolio/summary");
      renderSummary(data.summary || {});
      renderHoldings(data.positions || []);
    } catch (error) {
      const message = app.extractErrorMessage(error);
      summaryContainer.innerHTML =
        '<div class="col-12"><div class="alert alert-danger mb-0" role="alert">' +
        app.escapeHtml(message) +
        "</div></div>";
      holdingsContainer.innerHTML =
        '<div class="alert alert-danger mb-0" role="alert">' +
        app.escapeHtml(message) +
        "</div>";
    }
  })();
})(window, document, window.StockInsightsApp);
