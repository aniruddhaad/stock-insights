const path = require("path");
const dotenv = require("dotenv");
const app = require("./app");

dotenv.config({
  path: path.resolve(__dirname, "../../.env")
});

const port = Number(process.env.AI_NEWS_SERVICE_PORT || 4001);

app.listen(port, () => {
  console.log(`ai-news-service listening on port ${port}`);
});
