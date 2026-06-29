(function initializeImportPortfolioPage(window, document, app) {
  if (!app || !app.requireAuth()) {
    return;
  }

  app.mountNav("import");

  const flashContainer = document.getElementById("pageFlash");
  const importForm = document.getElementById("importForm");
  const importStatus = document.getElementById("importStatus");
  const previewContainer = document.getElementById("previewContainer");
  const previewButton = document.getElementById("previewButton");
  const commitButton = document.getElementById("commitButton");
  let lastPayload = null;

  app.showFlash(flashContainer);
  previewContainer.innerHTML = app.createEmptyMarkup("Choose an import file to see normalized transactions.");

  function readTextFile(file) {
    return new Promise(function resolveFile(resolve, reject) {
      const reader = new window.FileReader();
      reader.onload = function handleLoad() {
        resolve(String(reader.result || ""));
      };
      reader.onerror = function handleError() {
        reject(new Error("Unable to read import file"));
      };
      reader.readAsText(file);
    });
  }

  function readBase64File(file) {
    return new Promise(function resolveFile(resolve, reject) {
      const reader = new window.FileReader();
      reader.onload = function handleLoad() {
        const result = String(reader.result || "");
        resolve(result.slice(result.indexOf(",") + 1));
      };
      reader.onerror = function handleError() {
        reject(new Error("Unable to read import file"));
      };
      reader.readAsDataURL(file);
    });
  }

  function getFileExtension(file) {
    const match = String(file.name || "").toLowerCase().match(/\.([^.]+)$/);
    return match ? match[1] : "";
  }

  function renderPreview(preview) {
    const rows = Array.isArray(preview.rows) ? preview.rows : [];

    if (rows.length === 0) {
      commitButton.classList.add("d-none");
      previewContainer.innerHTML = app.createEmptyMarkup("No transactions were found in this file.");
      return;
    }

    commitButton.classList.toggle("d-none", preview.validRows === 0);

    const tableRows = rows
      .map(function mapRow(entry) {
        const transaction = entry.transaction || {};
        const status = entry.duplicate ? "Duplicate" : entry.valid ? "Ready" : "Invalid";
        const badgeClass = entry.duplicate ? "text-bg-warning" : entry.valid ? "text-bg-success" : "text-bg-danger";
        const errors = Array.isArray(entry.errors) ? entry.errors.map(function mapError(error) { return error.code; }).join(", ") : "";

        return [
          "<tr>",
          '<td><span class="badge ' + badgeClass + '">' + app.escapeHtml(status) + "</span></td>",
          "<td>" + app.escapeHtml(transaction.symbol || "N/A") + "</td>",
          "<td>" + app.escapeHtml(transaction.type || "N/A") + "</td>",
          "<td>" + app.escapeHtml(app.formatNumber(transaction.quantity)) + "</td>",
          "<td>" + app.escapeHtml(app.formatCurrency(transaction.price)) + "</td>",
          "<td>" + app.escapeHtml(app.formatDateTime(transaction.transactionDate)) + "</td>",
          "<td>" + app.escapeHtml(app.formatCurrency(transaction.netAmount)) + "</td>",
          "<td>" + app.escapeHtml(errors || transaction.externalTransactionId || "N/A") + "</td>",
          "</tr>"
        ].join("");
      })
      .join("");

    previewContainer.innerHTML = [
      '<div class="surface-card mb-3">',
      '<div class="row g-3">',
      '<div class="col-6 col-lg-3"><div class="metric-label">Rows</div><div class="h5 mb-0">' + app.escapeHtml(preview.totalRows) + "</div></div>",
      '<div class="col-6 col-lg-3"><div class="metric-label">Valid</div><div class="h5 mb-0">' + app.escapeHtml(preview.validRows) + "</div></div>",
      '<div class="col-6 col-lg-3"><div class="metric-label">Invalid</div><div class="h5 mb-0">' + app.escapeHtml(preview.invalidRows) + "</div></div>",
      '<div class="col-6 col-lg-3"><div class="metric-label">Duplicates</div><div class="h5 mb-0">' + app.escapeHtml(preview.duplicates) + "</div></div>",
      "</div>",
      "</div>",
      '<div class="surface-card p-0 overflow-hidden">',
      '<div class="table-responsive">',
      '<table class="table table-hover mb-0">',
      "<thead><tr class=\"table-light\"><th>Status</th><th>Symbol</th><th>Type</th><th>Qty</th><th>Price</th><th>Date</th><th>Net amount</th><th>Reference</th></tr></thead>",
      "<tbody>",
      tableRows,
      "</tbody>",
      "</table>",
      "</div>",
      "</div>"
    ].join("");
  }

  importForm.addEventListener("submit", async function handlePreview(event) {
    event.preventDefault();

    const file = document.getElementById("importFile").files[0];

    if (!file) {
      app.renderAlert(importStatus, "warning", "Select an import file first.");
      return;
    }

    try {
      app.setButtonLoading(previewButton, true, "Parsing...");
      const fileExtension = getFileExtension(file);
      const isExcel = fileExtension === "xlsx" || fileExtension === "xls";
      const provider = document.getElementById("provider").value;

      if (isExcel && provider !== "samco") {
        throw new Error("Excel workbooks are supported for the Samco Export format.");
      }

      const fileContent = isExcel ? await readBase64File(file) : await readTextFile(file);
      lastPayload = {
        provider: provider,
        fileContent: fileContent,
        fileEncoding: isExcel ? "base64" : "utf8",
        fileExtension: fileExtension,
        fileName: file.name,
        fileType: file.type,
        allowPartial: true
      };
      const preview = await app.apiFetch("/import/portfolio", {
        method: "POST",
        body: {
          ...lastPayload,
          mode: "preview"
        }
      });
      app.renderAlert(importStatus, "", "");
      renderPreview(preview);
    } catch (error) {
      app.renderAlert(importStatus, "danger", app.extractErrorMessage(error));
    } finally {
      app.setButtonLoading(previewButton, false);
    }
  });

  commitButton.addEventListener("click", async function handleCommit() {
    if (!lastPayload) {
      return;
    }

    try {
      app.setButtonLoading(commitButton, true, "Importing...");
      const result = await app.apiFetch("/import/portfolio", {
        method: "POST",
        body: {
          ...lastPayload,
          mode: "commit"
        }
      });
      const removed = Number(result.removedBootstrapTransactions || 0);
      const message = "Imported " + result.imported + " transactions." +
        (removed > 0 ? " Removed " + removed + " synthetic Samco bootstrap transactions." : "");
      app.renderAlert(importStatus, "success", message);
      renderPreview(result);
    } catch (error) {
      app.renderAlert(importStatus, "danger", app.extractErrorMessage(error));
    } finally {
      app.setButtonLoading(commitButton, false);
    }
  });
})(window, document, window.StockInsightsApp);
