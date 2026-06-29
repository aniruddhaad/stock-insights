(function initializeAddStockPage(window, document, app) {
  if (!app || !app.requireAuth()) {
    return;
  }

  app.mountNav("add-stock");

  const flashContainer = document.getElementById("pageFlash");
  const form = document.getElementById("addStockForm");
  const formStatus = document.getElementById("formStatus");
  const symbolInput = document.getElementById("symbol");
  const quantityInput = document.getElementById("quantity");
  const buyPriceInput = document.getElementById("buyPrice");
  const currentPriceInput = document.getElementById("currentPrice");
  const buyDateInput = document.getElementById("buyDate");

  app.showFlash(flashContainer);

  function validateForm() {
    const symbolPattern = /^[A-Za-z.\-]{1,15}$/;
    const trimmedSymbol = symbolInput.value.trim();

    symbolInput.value = trimmedSymbol.toUpperCase();
    symbolInput.setCustomValidity(symbolPattern.test(trimmedSymbol) ? "" : "Use 1-15 letters, dots, or hyphens.");
    quantityInput.setCustomValidity(Number(quantityInput.value) > 0 ? "" : "Quantity must be greater than 0.");
    buyPriceInput.setCustomValidity(Number(buyPriceInput.value) > 0 ? "" : "Buy price must be greater than 0.");

    if (currentPriceInput.value) {
      currentPriceInput.setCustomValidity(
        Number(currentPriceInput.value) > 0 ? "" : "Current price must be greater than 0."
      );
    } else {
      currentPriceInput.setCustomValidity("");
    }

    buyDateInput.setCustomValidity(buyDateInput.value ? "" : "Buy date is required.");

    return form.reportValidity();
  }

  form.addEventListener("submit", async function submitForm(event) {
    event.preventDefault();
    app.renderAlert(formStatus, "", "");

    if (!validateForm()) {
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    const payload = {
      symbol: symbolInput.value.trim().toUpperCase(),
      quantity: Number(quantityInput.value),
      buyPrice: Number(buyPriceInput.value),
      buyDate: buyDateInput.value
    };

    if (currentPriceInput.value) {
      payload.currentPrice = Number(currentPriceInput.value);
    }

    if (form.note.value.trim()) {
      payload.note = form.note.value.trim();
    }

    try {
      app.setButtonLoading(submitButton, true, "Saving stock...");
      const stock = await app.apiFetch("/stocks", {
        method: "POST",
        body: payload
      });

      app.setFlash("success", "Added " + stock.symbol + " to the portfolio.");
      window.location.href = "/dashboard";
    } catch (error) {
      app.renderAlert(formStatus, "danger", app.extractErrorMessage(error));
    } finally {
      app.setButtonLoading(submitButton, false);
    }
  });
})(window, document, window.StockInsightsApp);
