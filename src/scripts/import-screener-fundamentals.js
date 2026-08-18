const mongoose = require("mongoose");
const { connectDatabase } = require("../config/database");
const {
  DEFAULT_SCREENER_DIR,
  importScreenerXlsxFiles
} = require("../services/screener-import.service");

async function main() {
  const directoryPath = process.env.SCREENER_XLSX_DIR || DEFAULT_SCREENER_DIR;

  await connectDatabase();
  const summary = await importScreenerXlsxFiles({ directoryPath });

  console.log(JSON.stringify(summary, null, 2));

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("Screener XLSX import failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
