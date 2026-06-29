const axios = require("axios");
const PortfolioIngestionProvider = require("../../provider.interface");
const { normalizeTransaction } = require("../../normalization/transaction-normalizer");

class ZerodhaBrokerProvider extends PortfolioIngestionProvider {
  constructor(options = {}) {
    super();
    this.credentials = options.credentials || {};
    this.providerName = "zerodha";
  }

  async authenticate() {
    if (Array.isArray(this.credentials.transactions)) {
      return { authenticated: true };
    }

    if (!this.credentials.apiKey || !this.credentials.apiSecret || (!this.credentials.requestToken && !this.credentials.sessionToken)) {
      throw new Error("Zerodha credentials require apiKey, apiSecret, and requestToken or sessionToken");
    }

    return { authenticated: true };
  }

  async fetchTransactions(options = {}) {
    if (Array.isArray(this.credentials.transactions)) {
      return this.credentials.transactions;
    }

    if (!this.credentials.apiBaseUrl) {
      return [];
    }

    const response = await axios.get(`${this.credentials.apiBaseUrl}/transactions`, {
      headers: { Authorization: `Bearer ${this.credentials.sessionToken || this.credentials.requestToken}` },
      params: { from: options.since || undefined }
    });

    return response.data && response.data.data ? response.data.data : response.data;
  }

  async fetchHoldings() {
    if (Array.isArray(this.credentials.holdings)) {
      return this.credentials.holdings;
    }

    if (!this.credentials.apiBaseUrl) {
      return [];
    }

    const response = await axios.get(`${this.credentials.apiBaseUrl}/holdings`, {
      headers: { Authorization: `Bearer ${this.credentials.sessionToken || this.credentials.requestToken}` }
    });

    return response.data && response.data.data ? response.data.data : response.data;
  }

  normalize(rows, context = {}) {
    return rows.map((row) =>
      normalizeTransaction(row, {
        ...context,
        providerName: this.providerName,
        broker: this.providerName,
        source: "broker"
      })
    );
  }
}

module.exports = ZerodhaBrokerProvider;
