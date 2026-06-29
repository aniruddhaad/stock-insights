const { GenericCsvProvider } = require("./generic-csv.provider");

class SamcoCsvProvider extends GenericCsvProvider {
  constructor() {
    super({ providerName: "samco", broker: "samco" });
  }
}

module.exports = SamcoCsvProvider;
