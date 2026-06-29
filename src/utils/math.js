const roundTo = (value, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};

const percentage = (value, total) => {
  if (!total) {
    return 0;
  }

  return roundTo((value / total) * 100);
};

module.exports = {
  roundTo,
  percentage
};

