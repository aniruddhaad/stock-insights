const app = require("./app");
const env = require("./config/env");
const { connectDatabase } = require("./config/database");

async function bootstrap() {
  await connectDatabase();

  app.listen(env.port, () => {
    console.log(`stock-insights API listening on port ${env.port}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start stock-insights API", error);
  process.exit(1);
});

