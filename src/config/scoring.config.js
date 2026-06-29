const DEFAULT_SCORE_WEIGHTS = Object.freeze({
  technicalScore: 0.35,
  fundamentalScore: 0.25,
  sentimentScore: 0.15,
  portfolioSignals: 0.25
});

const SCORING_WEIGHT_KEYS = Object.freeze(Object.keys(DEFAULT_SCORE_WEIGHTS));
const MODERATE_OVEREXPOSURE_ADJUSTMENT = Object.freeze({
  reasonCode: "overexposure_emphasis",
  shifts: Object.freeze({
    technicalScore: -0.05,
    fundamentalScore: -0.05,
    sentimentScore: -0.05,
    portfolioSignals: 0.15
  })
});
const HIGH_OVEREXPOSURE_ADJUSTMENT = Object.freeze({
  reasonCode: "overexposure_emphasis",
  shifts: Object.freeze({
    technicalScore: -0.08,
    fundamentalScore: -0.08,
    sentimentScore: -0.08,
    portfolioSignals: 0.24
  })
});

module.exports = Object.freeze({
  defaultWeights: DEFAULT_SCORE_WEIGHTS,
  weightKeys: SCORING_WEIGHT_KEYS,
  minimumWeight: 0.05,
  dynamicAdjustments: Object.freeze({
    allocation: Object.freeze({
      overexposureThresholdPct: 40,
      highOverexposureThresholdPct: 60,
      moderatePenaltyRate: 0.1,
      highPenaltyRate: 0.2,
      minimumPenalty: -5,
      maximumPenalty: 0,
      overexposed: MODERATE_OVEREXPOSURE_ADJUSTMENT,
      moderateOverexposure: MODERATE_OVEREXPOSURE_ADJUSTMENT,
      highOverexposure: HIGH_OVEREXPOSURE_ADJUSTMENT
    }),
    holdingDuration: Object.freeze({
      shortTermMaxDays: 180,
      longTermMinDays: 365,
      shortTerm: Object.freeze({
        reasonCode: "short_term_technical_emphasis",
        shifts: Object.freeze({
          technicalScore: 0.1,
          fundamentalScore: -0.1,
          sentimentScore: 0.05,
          portfolioSignals: -0.05
        })
      }),
      longTerm: Object.freeze({
        reasonCode: "long_term_fundamental_emphasis",
        shifts: Object.freeze({
          technicalScore: -0.05,
          fundamentalScore: 0.1,
          sentimentScore: -0.02,
          portfolioSignals: -0.03
        })
      })
    }),
    sentimentStrength: Object.freeze({
      strongThreshold: 2,
      strong: Object.freeze({
        reasonCode: "strong_sentiment_emphasis",
        shifts: Object.freeze({
          technicalScore: -0.03,
          fundamentalScore: -0.02,
          sentimentScore: 0.1,
          portfolioSignals: -0.05
        })
      })
    })
  })
});
