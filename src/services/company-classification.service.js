const SUPER_SECTORS = Object.freeze({
  CYCLICAL: "cyclical",
  DEFENSIVE: "defensive",
  SENSITIVE: "sensitive",
  UNKNOWN: "unknown"
});

const SECTOR_TO_SUPER_SECTOR = Object.freeze({
  "basic materials": SUPER_SECTORS.CYCLICAL,
  "consumer cyclical": SUPER_SECTORS.CYCLICAL,
  "financial services": SUPER_SECTORS.CYCLICAL,
  "real estate": SUPER_SECTORS.CYCLICAL,
  "consumer defensive": SUPER_SECTORS.DEFENSIVE,
  healthcare: SUPER_SECTORS.DEFENSIVE,
  utilities: SUPER_SECTORS.DEFENSIVE,
  "communication services": SUPER_SECTORS.SENSITIVE,
  energy: SUPER_SECTORS.SENSITIVE,
  industrials: SUPER_SECTORS.SENSITIVE,
  technology: SUPER_SECTORS.SENSITIVE
});

function normalizeText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function normalizeSectorKey(sector) {
  const text = normalizeText(sector);
  if (!text) return "";
  return text.toLowerCase().replace(/\s+/g, " ");
}

function resolveSuperSector(sector) {
  return SECTOR_TO_SUPER_SECTOR[normalizeSectorKey(sector)] || SUPER_SECTORS.UNKNOWN;
}

function normalizeSuperSector(superSector, sector = null) {
  const normalized = normalizeSectorKey(superSector);
  if (Object.values(SUPER_SECTORS).includes(normalized)) {
    return normalized;
  }
  return resolveSuperSector(sector);
}

function normalizeClassification(classification) {
  if (!classification || typeof classification !== "object") {
    return {
      sector: null,
      industry: null,
      superSector: SUPER_SECTORS.UNKNOWN
    };
  }

  const sector = normalizeText(classification.sector);
  const industry = normalizeText(classification.industry);

  return {
    sector,
    industry,
    superSector: normalizeSuperSector(classification.superSector, sector)
  };
}

async function getCompanyClassification() {
  return null;
}

module.exports = {
  SECTOR_TO_SUPER_SECTOR,
  SUPER_SECTORS,
  getCompanyClassification,
  normalizeClassification,
  resolveSuperSector
};
