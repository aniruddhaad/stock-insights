const axios = require("axios");
const env = require("../config/env");

function buildNeutralFallback(symbol, reasonCode) {
  return {
    symbol,
    sentiment: {
      label: "neutral",
      score: 0
    },
    aggregate: {
      headlineCount: 0,
      totalHeadlineScore: 0,
      averageHeadlineScore: 0
    },
    source: {
      service: "ai-news-service",
      status: "fallback",
      reasonCode
    },
    headlines: []
  };
}

async function getSentiment(symbol) {
  try {
    const response = await axios.get(`${env.aiNewsServiceUrl}/sentiment/${encodeURIComponent(symbol)}`, {
      timeout: env.aiNewsTimeoutMs
    });

    return response.data.data;
  } catch (error) {
    return buildNeutralFallback(symbol, "SERVICE_UNAVAILABLE");
  }
}

module.exports = {
  getSentiment
};

