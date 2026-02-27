// Unit conversion utilities

// Define unit groups and their base conversions
export const UNIT_GROUPS = {
  weight: {
    units: ['kg', 'Kg', 'KG', 'g', 'gram', 'grams'],
    base: 'g', // base unit is grams
    conversions: {
      'kg': 1000,
      'Kg': 1000,
      'KG': 1000,
      'g': 1,
      'gram': 1,
      'grams': 1,
    }
  },
  volume: {
    units: ['L', 'l', 'ml', 'mL', 'ML'],
    base: 'ml', // base unit is ml
    conversions: {
      'L': 1000,
      'l': 1000,
      'ml': 1,
      'mL': 1,
      'ML': 1,
    }
  }
};

// Normalize unit name for comparison
export function normalizeUnit(unit) {
  if (!unit) return '';
  const u = unit.trim().toLowerCase();
  if (['kg', 'kgs'].includes(u)) return 'kg';
  if (['g', 'gram', 'grams'].includes(u)) return 'g';
  if (['l', 'liter', 'liters', 'litre', 'litres'].includes(u)) return 'L';
  if (['ml', 'milliliter', 'milliliters'].includes(u)) return 'ml';
  return unit;
}

// Get the unit group for a given unit
export function getUnitGroup(unit) {
  const normalized = normalizeUnit(unit);
  for (const [groupName, group] of Object.entries(UNIT_GROUPS)) {
    if (group.units.map(u => normalizeUnit(u)).includes(normalized)) {
      return groupName;
    }
  }
  return null;
}

// Get compatible units for a given unit
export function getCompatibleUnits(unit) {
  const group = getUnitGroup(unit);
  if (!group) return [unit]; // No compatible units, return original
  
  // Return normalized display units
  if (group === 'weight') return ['kg', 'g'];
  if (group === 'volume') return ['L', 'ml'];
  return [unit];
}

// Check if two units are compatible (can be converted)
export function areUnitsCompatible(unit1, unit2) {
  const group1 = getUnitGroup(unit1);
  const group2 = getUnitGroup(unit2);
  return group1 && group2 && group1 === group2;
}

// Convert quantity from one unit to another
export function convertUnit(qty, fromUnit, toUnit) {
  if (!qty || !fromUnit || !toUnit) return qty;
  
  const normalizedFrom = normalizeUnit(fromUnit);
  const normalizedTo = normalizeUnit(toUnit);
  
  if (normalizedFrom === normalizedTo) return qty;
  
  const group = getUnitGroup(fromUnit);
  if (!group) return qty;
  
  const groupData = UNIT_GROUPS[group];
  const fromConversion = groupData.conversions[fromUnit] || groupData.conversions[normalizedFrom];
  const toConversion = groupData.conversions[toUnit] || groupData.conversions[normalizedTo];
  
  if (!fromConversion || !toConversion) return qty;
  
  // Convert to base unit, then to target unit
  const baseValue = qty * fromConversion;
  const result = baseValue / toConversion;
  
  // Round to reasonable precision
  return Math.round(result * 10000) / 10000;
}

// Get display label for conversion
export function getConversionLabel(qty, fromUnit, toUnit) {
  if (!areUnitsCompatible(fromUnit, toUnit) || normalizeUnit(fromUnit) === normalizeUnit(toUnit)) {
    return null;
  }
  const converted = convertUnit(qty, fromUnit, toUnit);
  return `${converted} ${toUnit}`;
}