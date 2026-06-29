const { buildSentimentResponse } = require("../services/sentiment.service");

function getSentiment(req, res) {
  const response = buildSentimentResponse(req.params.symbol, req.query.headlines);

  res.json({
    success: true,
    data: response
  });
}

module.exports = {
  getSentiment
};

