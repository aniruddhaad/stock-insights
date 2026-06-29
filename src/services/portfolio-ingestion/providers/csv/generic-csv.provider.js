const PortfolioIngestionProvider = require("../../provider.interface");
const { normalizeTransaction } = require("../../normalization/transaction-normalizer");

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function parseCsv(content) {
  const lines = String(content || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());

  return lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    return headers.reduce(
      (row, header, columnIndex) => {
        row[header] = values[columnIndex] || "";
        return row;
      },
      { rowNumber: index + 2 }
    );
  });
}

class GenericCsvProvider extends PortfolioIngestionProvider {
  constructor(options = {}) {
    super();
    this.providerName = options.providerName || "generic";
    this.broker = options.broker || this.providerName;
  }

  parse(content) {
    return parseCsv(content);
  }

  normalize(rows, context = {}) {
    return rows.map((row) =>
      normalizeTransaction(row, {
        ...context,
        providerName: this.providerName,
        broker: this.broker,
        source: "csv"
      })
    );
  }
}

module.exports = {
  GenericCsvProvider,
  parseCsv
};
