(function initializeInsightsPage(window, document, app) {
  if (!app || !app.requireAuth()) {
    return;
  }

  app.mountNav("insights");

  const flashContainer = document.getElementById("pageFlash");
  const overviewContainer = document.getElementById("insightsOverview");
  const narrativeContainer = document.getElementById("portfolioNarrative");
  const scenariosContainer = document.getElementById("scenarioSection");
  const rankingsContainer = document.getElementById("rankingsSection");
  const positionsContainer = document.getElementById("positionsSection");

  app.showFlash(flashContainer);
  overviewContainer.innerHTML = app.createLoadingMarkup("Loading portfolio insights...");
  narrativeContainer.innerHTML = app.createLoadingMarkup("Preparing explanation...");
  scenariosContainer.innerHTML = app.createLoadingMarkup("Calculating scenarios...");
  rankingsContainer.innerHTML = app.createLoadingMarkup("Ranking positions...");
  positionsContainer.innerHTML = app.createLoadingMarkup("Reviewing stock-level insights...");

  function renderOverview(summary) {
    const profitLossClass = app.getPerformanceClass(summary.totalProfitLossPct);

    overviewContainer.innerHTML = [
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
      '<div class="metric-label">Holdings</div>',
      '<div class="metric-value">' + app.escapeHtml(app.formatNumber(summary.holdingsCount)) + "</div>",
      "</div>",
      "</div>"
    ].join("");
  }

  function renderNarrative(summary) {
    const explanation = summary.explanation || "No portfolio-level explanation is available.";

    narrativeContainer.innerHTML = [
      '<div class="surface-card">',
      '<h2 class="h5 mb-3">Portfolio summary</h2>',
      '<p class="mb-0 lh-lg">' + app.escapeHtml(explanation) + "</p>",
      "</div>"
    ].join("");
  }

  function renderScenarios(projection) {
    const scenarios = Array.isArray(projection && projection.scenarios) ? projection.scenarios : [];

    if (scenarios.length === 0) {
      scenariosContainer.innerHTML = app.createEmptyMarkup("Scenario projections are not available.");
      return;
    }

    scenariosContainer.innerHTML = scenarios
      .map(function mapScenario(scenario) {
        return [
          '<div class="col-md-4">',
          '<div class="scenario-card">',
          '<div class="d-flex justify-content-between align-items-start mb-3">',
          '<h3 class="h5 text-capitalize mb-0">' + app.escapeHtml(scenario.name) + "</h3>",
          '<span class="badge text-bg-light border">' +
            app.escapeHtml(app.formatPercent(scenario.annualRatePct)) +
            " / year</span>",
          "</div>",
          '<div class="metric-label">Projected value</div>',
          '<div class="metric-value mb-3">' +
            app.escapeHtml(app.formatCurrency(scenario.nominalFutureValue)) +
            "</div>",
          '<div class="small text-secondary">Inflation-adjusted: ' +
            app.escapeHtml(app.formatCurrency(scenario.inflationAdjustedFutureValue)) +
            "</div>",
          "</div>",
          "</div>"
        ].join("");
      })
      .join("");
  }

  function renderRankings(rankings) {
    const topPerformers = Array.isArray(rankings.topPerformers) ? rankings.topPerformers : [];
    const overexposed = Array.isArray(rankings.overexposure) ? rankings.overexposure : [];

    const topMarkup =
      topPerformers.length === 0
        ? '<div class="list-group-item text-secondary">No ranked performers available.</div>'
        : topPerformers
            .map(function mapTop(item) {
              return [
                '<div class="list-group-item py-3">',
                '<div class="d-flex justify-content-between align-items-start gap-3">',
                "<div>",
                '<div class="fw-semibold">' + app.escapeHtml(item.symbol) + "</div>",
                '<div class="small text-secondary">Allocation ' +
                  app.escapeHtml(app.formatPercent(item.allocationPct)) +
                  " • P/L " +
                  '<span class="' +
                  app.getPerformanceClass(item.profitLossPct) +
                  '">' +
                  app.escapeHtml(app.formatPercent(item.profitLossPct, { signed: true })) +
                  "</span></div>",
                "</div>",
                '<span class="badge text-bg-success">Score ' +
                  app.escapeHtml(app.formatNumber(item.finalScore)) +
                  "</span>",
                "</div>",
                "</div>"
              ].join("");
            })
            .join("");

    const overexposedMarkup =
      overexposed.length === 0
        ? '<div class="list-group-item text-secondary">No overexposed holdings detected.</div>'
        : overexposed
            .map(function mapOverexposed(item) {
              return [
                '<div class="list-group-item py-3">',
                '<div class="d-flex justify-content-between align-items-start gap-3">',
                "<div>",
                '<div class="fw-semibold">' + app.escapeHtml(item.symbol) + "</div>",
                '<div class="small text-secondary">Allocation ' +
                  app.escapeHtml(app.formatPercent(item.allocationPct)) +
                  " • Penalty " +
                  app.escapeHtml(app.formatNumber(item.overexposurePenalty)) +
                  "</div>",
                "</div>",
                '<span class="badge ' +
                  app.getSeverityBadgeClass(item.severity) +
                  '">' +
                  app.escapeHtml(app.normalizeSeverityLabel(item.severity)) +
                  "</span>",
                "</div>",
                "</div>"
              ].join("");
            })
            .join("");

    rankingsContainer.innerHTML = [
      '<div class="col-lg-6">',
      '<div class="list-panel overflow-hidden">',
      '<div class="p-3 border-bottom"><h2 class="h5 mb-0">Top performers</h2></div>',
      '<div class="list-group list-group-flush">',
      topMarkup,
      "</div>",
      "</div>",
      "</div>",
      '<div class="col-lg-6">',
      '<div class="list-panel overflow-hidden">',
      '<div class="p-3 border-bottom"><h2 class="h5 mb-0">Overexposed stocks</h2></div>',
      '<div class="list-group list-group-flush">',
      overexposedMarkup,
      "</div>",
      "</div>",
      "</div>"
    ].join("");
  }

  function renderPositions(positions) {
    if (!Array.isArray(positions) || positions.length === 0) {
      positionsContainer.innerHTML = app.createEmptyMarkup(
        "Add stocks to generate stock-level explanations.",
        "/add-stock",
        "Add stock"
      );
      return;
    }

    positionsContainer.innerHTML = positions
      .map(function mapPosition(position) {
        const metrics = position.metrics || {};
        const prices = position.prices || {};
        const holding = position.holding || {};
        const decision = position.decision || {};
        const portfolioAction = decision.portfolioAction || position.portfolioAction || {};
        const decisionConfidence = decision.confidence || position.confidence || {};
        const priceSource = app.formatPriceSource(prices.dataSource);
        const priceLastUpdated = app.formatDateTime(prices.lastUpdated);
        const scoring = position.scoring || {};
        const explanation = decision.explanation || position.explanation || "";
        const overexposureSeverity =
          scoring.portfolioSignals &&
          scoring.portfolioSignals.overexposureSeverity;
        const holdingNote = app.buildHoldingEstimateNote(holding);
        const holdingNoteMarkup = holdingNote
          ? ' <span class="text-secondary" title="' + app.escapeHtml(holdingNote) + '">(estimated)</span>'
          : "";

        const explanationMarkup =
          !explanation
            ? '<p class="mb-0 text-secondary">No explanation returned for this stock.</p>'
            : '<p class="mb-0 lh-lg">' + app.escapeHtml(explanation) + "</p>";

        return [
          '<div class="col-12">',
          '<div class="insight-card card">',
          '<div class="card-body">',
          '<div class="d-flex flex-column flex-lg-row justify-content-between gap-3 mb-4">',
          "<div>",
          '<div class="d-flex align-items-center flex-wrap gap-2 mb-2">',
          '<h2 class="h4 mb-0">' + app.escapeHtml(position.symbol) + "</h2>",
          portfolioAction.label
            ? '<span class="badge text-bg-primary">' + app.escapeHtml(portfolioAction.label) + "</span>"
            : "",
          '<span class="badge ' +
            app.getHoldingTypeBadgeClass(holding.holdingType) +
            '">' +
            app.escapeHtml(app.formatHoldingType(holding.holdingType)) +
            "</span>",
          '<span class="badge ' +
            app.getConfidenceBadgeClass(decisionConfidence.label) +
            '">' +
            app.escapeHtml(decisionConfidence.label || "signal unavailable") +
            "</span>",
          overexposureSeverity
            ? '<span class="badge ' +
              app.getSeverityBadgeClass(overexposureSeverity) +
              '">' +
              app.escapeHtml(app.normalizeSeverityLabel(overexposureSeverity)) +
              "</span>"
            : "",
          "</div>",
          '<div class="text-secondary small">Quantity ' +
            app.escapeHtml(app.formatNumber(position.quantity)) +
            " &bull; Current value " +
            app.escapeHtml(app.formatCurrency(metrics.currentValue)) +
            " &bull; Price source " +
            app.escapeHtml(priceSource) +
            " &bull; Updated " +
            app.escapeHtml(priceLastUpdated) +
            " &bull; Holding " +
            app.escapeHtml(app.formatHoldingPeriod(holding)) +
            " &bull; Acquired " +
            app.escapeHtml(app.formatDate(holding.acquisitionDate || holding.buyDate)) +
            holdingNoteMarkup +
            "</div>",
          "</div>",
          '<div class="text-lg-end">',
          '<div class="metric-label">Final score</div>',
          '<div class="metric-value">' + app.escapeHtml(app.formatNumber(scoring.finalScore)) + "</div>",
          "</div>",
          "</div>",
          '<div class="row g-3 mb-4">',
          '<div class="col-sm-6 col-lg-3"><div class="metric-card"><div class="metric-label">Allocation</div><div class="h4 mb-0">' +
            app.escapeHtml(app.formatPercent(metrics.allocationPct)) +
            "</div></div></div>",
          '<div class="col-sm-6 col-lg-3"><div class="metric-card"><div class="metric-label">Profit / loss %</div><div class="h4 mb-0 ' +
            app.getPerformanceClass(metrics.profitLossPct) +
            '">' +
            app.escapeHtml(app.formatPercent(metrics.profitLossPct, { signed: true })) +
            "</div></div></div>",
          '<div class="col-sm-6 col-lg-3"><div class="metric-card"><div class="metric-label">Buy price</div><div class="h4 mb-0">' +
            app.escapeHtml(app.formatCurrency(prices.buyPrice)) +
            "</div></div></div>",
          '<div class="col-sm-6 col-lg-3"><div class="metric-card"><div class="metric-label">Current price</div><div class="h4 mb-0">' +
            app.escapeHtml(app.formatCurrency(prices.currentPrice)) +
            '</div><div class="small text-secondary mt-2">' +
            app.escapeHtml(priceSource) +
            " &bull; " +
            app.escapeHtml(priceLastUpdated) +
            "</div></div></div>",
          "</div>",
          '<div class="insight-explanation">',
          '<h3>Explanation</h3>',
          explanationMarkup,
          "</div>",
          "</div>",
          "</div>",
          "</div>"
        ].join("");
      })
      .join("");
  }

  (async function loadInsights() {
    try {
      const data = await app.apiFetch("/portfolio/insights");
      renderOverview(data.portfolioSummary || {});
      renderNarrative(data.portfolioSummary || {});
      renderScenarios(data.portfolioScenarioProjection || {});
      renderRankings(data.rankings || {});
      renderPositions(data.positions || []);
    } catch (error) {
      const message = app.extractErrorMessage(error);
      overviewContainer.innerHTML =
        '<div class="col-12"><div class="alert alert-danger mb-0" role="alert">' +
        app.escapeHtml(message) +
        "</div></div>";
      narrativeContainer.innerHTML =
        '<div class="alert alert-danger mb-0" role="alert">' +
        app.escapeHtml(message) +
        "</div>";
      scenariosContainer.innerHTML =
        '<div class="col-12"><div class="alert alert-danger mb-0" role="alert">' +
        app.escapeHtml(message) +
        "</div></div>";
      rankingsContainer.innerHTML =
        '<div class="col-12"><div class="alert alert-danger mb-0" role="alert">' +
        app.escapeHtml(message) +
        "</div></div>";
      positionsContainer.innerHTML =
        '<div class="alert alert-danger mb-0" role="alert">' +
        app.escapeHtml(message) +
        "</div>";
    }
  })();
})(window, document, window.StockInsightsApp);
