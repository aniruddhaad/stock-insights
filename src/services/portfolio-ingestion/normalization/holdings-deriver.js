const { roundTo } = require("../../../utils/math");
const { normalizeConfidence } = require("../../../utils/holding-period");

function sortTransactions(transactions) {
  return [...transactions].sort((left, right) => {
    const dateDelta = new Date(left.transactionDate).getTime() - new Date(right.transactionDate).getTime();

    if (dateDelta !== 0) {
      return dateDelta;
    }

    return String(left.externalTransactionId || "").localeCompare(String(right.externalTransactionId || ""));
  });
}

function deriveHoldingsFromTransactions(transactions) {
  const lotsBySymbol = new Map();

  for (const transaction of sortTransactions(transactions).filter((entry) => entry.active !== false)) {
    const symbol = String(transaction.symbol || "").toUpperCase();

    if (!symbol) {
      continue;
    }

    if (!lotsBySymbol.has(symbol)) {
      lotsBySymbol.set(symbol, []);
    }

    const lots = lotsBySymbol.get(symbol);
    const quantity = Number(transaction.quantity);

    if (transaction.type === "BUY") {
      const netAmount = Number(transaction.netAmount || quantity * Number(transaction.price));
      lots.push({
        quantity,
        remainingQuantity: quantity,
        cost: netAmount,
        remainingCost: netAmount,
        buyDate: transaction.transactionDate,
        acquisitionDate: transaction.acquisitionDate || null,
        broker: transaction.broker,
        holdingAgeSource: transaction.holdingAgeSource || null,
        inferredHoldingDays:
          transaction.inferredHoldingDays !== undefined && transaction.inferredHoldingDays !== null
            ? Number(transaction.inferredHoldingDays)
            : null,
        acquisitionDateConfidence:
          transaction.acquisitionDateConfidence !== undefined && transaction.acquisitionDateConfidence !== null
            ? normalizeConfidence(transaction.acquisitionDateConfidence)
            : null
      });
      continue;
    }

    if (transaction.type === "SELL") {
      let quantityToSell = quantity;

      for (const lot of lots) {
        if (quantityToSell <= 0) {
          break;
        }

        const consumedQuantity = Math.min(lot.remainingQuantity, quantityToSell);
        const consumedRatio = consumedQuantity / lot.remainingQuantity;
        lot.remainingQuantity = roundTo(lot.remainingQuantity - consumedQuantity, 4);
        lot.remainingCost = roundTo(lot.remainingCost - lot.remainingCost * consumedRatio);
        quantityToSell = roundTo(quantityToSell - consumedQuantity, 4);
      }
    }
  }

  return Array.from(lotsBySymbol.entries())
    .map(([symbol, lots]) => {
      const openLots = lots.filter((lot) => lot.remainingQuantity > 0.00001);
      const quantity = roundTo(
        openLots.reduce((sum, lot) => sum + lot.remainingQuantity, 0),
        4
      );
      const investedAmount = roundTo(openLots.reduce((sum, lot) => sum + lot.remainingCost, 0));

      if (quantity <= 0) {
        return null;
      }

      const datedLots = openLots.filter((lot) => lot.acquisitionDate);
      const lotsForHoldingAge = datedLots.length > 0 ? datedLots : openLots;
      const oldestLot = lotsForHoldingAge.reduce((oldest, lot) => {
        const lotDate = lot.acquisitionDate || lot.buyDate;
        const oldestDate = oldest.acquisitionDate || oldest.buyDate;
        return new Date(lotDate).getTime() < new Date(oldestDate).getTime() ? lot : oldest;
      });

      return {
        _id: `txn:${symbol}`,
        symbol,
        quantity,
        buyPrice: roundTo(investedAmount / quantity),
        buyDate: oldestLot.buyDate,
        acquisitionDate: oldestLot.acquisitionDate || null,
        currentPrice: null,
        note: "Derived from transactions",
        source: "transactions",
        broker: oldestLot.broker,
        holdingAgeSource: oldestLot.holdingAgeSource,
        inferredHoldingDays: oldestLot.inferredHoldingDays,
        acquisitionDateConfidence: oldestLot.acquisitionDateConfidence,
        investedAmount
      };
    })
    .filter(Boolean);
}

module.exports = {
  deriveHoldingsFromTransactions
};
