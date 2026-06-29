const { GenericCsvProvider } = require("./generic-csv.provider");

class ZerodhaCsvProvider extends GenericCsvProvider {
  constructor() {
    super({ providerName: "zerodha", broker: "zerodha" });
  }
}

module.exports = ZerodhaCsvProvider;
