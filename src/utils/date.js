function differenceInDays(startDate, endDate = new Date()) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const milliseconds = end.getTime() - start.getTime();

  return Math.max(0, Math.floor(milliseconds / (1000 * 60 * 60 * 24)));
}

module.exports = {
  differenceInDays
};

