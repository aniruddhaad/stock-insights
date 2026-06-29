const { GenericCsvProvider } = require("./providers/csv/generic-csv.provider");
const SamcoCsvProvider = require("./providers/csv/samco-csv.provider");
const ZerodhaCsvProvider = require("./providers/csv/zerodha-csv.provider");
const SamcoBrokerProvider = require("./providers/brokers/samco.provider");
const ZerodhaBrokerProvider = require("./providers/brokers/zerodha.provider");
const ApiError = require("../../utils/api-error");

function getCsvProvider(providerName) {
  const normalized = String(providerName || "generic").toLowerCase();

  if (normalized === "generic") {
    return new GenericCsvProvider();
  }

  if (normalized === "samco") {
    return new SamcoCsvProvider();
  }

  if (normalized === "zerodha") {
    return new ZerodhaCsvProvider();
  }

  throw new ApiError(400, "PROVIDER_UNSUPPORTED", `Unsupported CSV provider: ${providerName}`);
}

function getBrokerProvider(providerName, options = {}) {
  const normalized = String(providerName || "").toLowerCase();

  if (normalized === "samco") {
    return new SamcoBrokerProvider(options);
  }

  if (normalized === "zerodha") {
    return new ZerodhaBrokerProvider(options);
  }

  throw new ApiError(400, "BROKER_UNSUPPORTED", `Unsupported broker provider: ${providerName}`);
}

module.exports = {
  getBrokerProvider,
  getCsvProvider
};
