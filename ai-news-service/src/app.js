const express = require("express");
const sentimentRoutes = require("./routes/sentiment.routes");

const app = express();

app.use(express.json());
app.use(sentimentRoutes);

module.exports = app;

