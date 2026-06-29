class PortfolioIngestionProvider {
  authenticate() {
    throw new Error("authenticate() must be implemented by broker providers");
  }

  fetchTransactions() {
    throw new Error("fetchTransactions() must be implemented by broker providers");
  }

  fetchHoldings() {
    throw new Error("fetchHoldings() must be implemented by broker providers");
  }

  parse() {
    throw new Error("parse() must be implemented by CSV providers");
  }

  normalize() {
    throw new Error("normalize() must be implemented by providers");
  }
}

module.exports = PortfolioIngestionProvider;
