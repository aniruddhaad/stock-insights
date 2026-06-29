const express = require("express");
const cors = require("cors");
const path = require("path");
const routes = require("./routes");
const notFoundHandler = require("./middleware/not-found.middleware");
const errorHandler = require("./middleware/error.middleware");

const app = express();
const publicDir = path.join(__dirname, "..", "public");

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false, limit: "2mb" }));

app.use("/api", routes);
app.use(express.static(publicDir, { extensions: ["html"] }));
app.get(["/login", "/signup", "/import-portfolio", "/broker-connections"], (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
