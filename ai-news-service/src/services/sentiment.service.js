const mockNews = require("../data/mock-news");

const positiveKeywords = [
  "win",
  "wins",
  "growth",
  "strong",
  "improved",
  "positive",
  "upgrade",
  "expands",
  "healthy",
  "profit",
  "resilient",
  "momentum"
];

const negativeKeywords = [
  "pressure",
  "weak",
  "downgrade",
  "uncertainty",
  "mixed",
  "concern",
  "volatile",
  "soft",
  "risk",
  "scrutiny"
];

function classifyHeadline(headline) {
  const normalizedHeadline = String(headline).toLowerCase();
  const positiveMatches = positiveKeywords.filter((keyword) => normalizedHeadline.includes(keyword)).length;
  const negativeMatches = negativeKeywords.filter((keyword) => normalizedHeadline.includes(keyword)).length;

  if (positiveMatches > negativeMatches) {
    return {
      label: "positive",
      score: 2
    };
  }

  if (negativeMatches > positiveMatches) {
    return {
      label: "negative",
      score: -2
    };
  }

  return {
    label: "neutral",
    score: 0
  };
}

function normalizeHeadlines(symbol, queryHeadlines) {
  if (Array.isArray(queryHeadlines) && queryHeadlines.length > 0) {
    return queryHeadlines;
  }

  if (typeof queryHeadlines === "string" && queryHeadlines.trim().length > 0) {
    return queryHeadlines
      .split("||")
      .map((headline) => headline.trim())
      .filter(Boolean);
  }

  return mockNews[symbol] || mockNews.DEFAULT;
}

function summarizeSentiment(classifiedHeadlines) {
  const totalHeadlineScore = classifiedHeadlines.reduce((sum, headline) => sum + headline.sentiment.score, 0);
  const averageHeadlineScore = classifiedHeadlines.length
    ? totalHeadlineScore / classifiedHeadlines.length
    : 0;

  let label = "neutral";
  let score = 0;

  if (averageHeadlineScore > 0.5) {
    label = "positive";
    score = 2;
  } else if (averageHeadlineScore < -0.5) {
    label = "negative";
    score = -2;
  }

  return {
    label,
    score,
    totalHeadlineScore,
    averageHeadlineScore
  };
}

function buildSentimentResponse(symbol, queryHeadlines) {
  const normalizedSymbol = String(symbol).toUpperCase();
  const headlines = normalizeHeadlines(normalizedSymbol, queryHeadlines);
  const classifiedHeadlines = headlines.map((headline) => ({
    text: headline,
    sentiment: classifyHeadline(headline)
  }));
  const summary = summarizeSentiment(classifiedHeadlines);

  return {
    symbol: normalizedSymbol,
    sentiment: {
      label: summary.label,
      score: summary.score
    },
    aggregate: {
      headlineCount: classifiedHeadlines.length,
      totalHeadlineScore: summary.totalHeadlineScore,
      averageHeadlineScore: Number(summary.averageHeadlineScore.toFixed(2))
    },
    source: {
      service: "ai-news-service",
      status: "ok"
    },
    headlines: classifiedHeadlines
  };
}

module.exports = {
  classifyHeadline,
  buildSentimentResponse
};

