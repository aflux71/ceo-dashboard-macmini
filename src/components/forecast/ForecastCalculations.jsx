/**
 * Core forecast calculation utilities
 * Based on neōb v6.6 specification
 */

/**
 * Detect product category from name
 */
export function detectCategory(productName) {
  const name = (productName || '').toLowerCase();
  
  if (name.includes('bath bomb') || name.includes('bathbomb')) return 'Bath Bombs';
  if (name.includes('body wash') || name.includes('bodywash')) return 'Body Wash';
  if (name.includes('hand soap') || name.includes('handsoap')) return 'Hand Soap';
  if (name.includes('shampoo bar')) return 'Shampoo Bars';
  if (name.includes('scrub')) return 'Scrubs';
  if (name.includes('lotion')) return 'Lotions';
  if (name.includes('butter')) return 'Body Butters';
  if (name.includes('candle')) return 'Candles';
  
  return 'Other';
}

/**
 * Aggregate sales data from retail and online sources
 */
export function aggregateSales(retailData, onlineData, exclusions = []) {
  const skuData = {};
  const allSales = [...(retailData || []), ...(onlineData || [])];
  
  let minDate = null;
  let maxDate = null;
  
  allSales.forEach(row => {
    const sku = row.sku;
    
    if (exclusions.includes(sku)) return;
    
    const date = new Date(row.day);
    if (!minDate || date < minDate) minDate = date;
    if (!maxDate || date > maxDate) maxDate = date;
    
    if (!skuData[sku]) {
      skuData[sku] = {
        sku: sku,
        product: row.product,
        total: 0,
        byMonth: {},
        byLocation: {},
        category: detectCategory(row.product)
      };
    }
    
    skuData[sku].total += row.qty;
    
    const month = date.getMonth() + 1;
    skuData[sku].byMonth[month] = (skuData[sku].byMonth[month] || 0) + row.qty;
    
    if (row.location) {
      if (!skuData[sku].byLocation[row.location]) {
        skuData[sku].byLocation[row.location] = { total: 0, byMonth: {} };
      }
      skuData[sku].byLocation[row.location].total += row.qty;
      skuData[sku].byLocation[row.location].byMonth[month] = 
        (skuData[sku].byLocation[row.location].byMonth[month] || 0) + row.qty;
    }
  });
  
  return { skuData, minDate, maxDate };
}

/**
 * Calculate daily sales velocity
 */
export function calculateVelocity(totalSales, minDate, maxDate) {
  if (!minDate || !maxDate) return 0;
  
  const daySpan = Math.max(1, 
    (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  return totalSales / daySpan;
}

/**
 * Generate monthly forecast
 */
export function generateMonthlyForecast(dailyVelocity, config, category = 'Other', startDate = new Date()) {
  const forecasts = [];
  const monthNames = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];
  
  const overallGrowth = 1 + ((config.growth || 0) / 100);
  const monthlyGrowth = config.monthly_growth || {};
  const categoryGrowthAdj = (config.category_growth || {})[category] || 0;
  
  for (let i = 0; i < (config.forecast_months || 12); i++) {
    const targetMonth = (startDate.getMonth() + i) % 12;
    const targetYear = startDate.getFullYear() + Math.floor((startDate.getMonth() + i) / 12);
    
    const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    
    let forecast = dailyVelocity * daysInMonth;
    forecast *= overallGrowth;
    
    const monthAdj = monthlyGrowth[targetMonth + 1] || 0;
    forecast *= (1 + monthAdj / 100);
    
    forecast *= (1 + categoryGrowthAdj / 100);
    
    forecasts.push({
      month: monthNames[targetMonth] + ' ' + targetYear,
      monthNum: targetMonth + 1,
      year: targetYear,
      forecast: Math.round(forecast)
    });
  }
  
  return forecasts;
}

/**
 * Calculate event demand for a SKU
 */
export function calculateEventDemand(events, sku) {
  let totalQty = 0;
  const eventDetails = [];
  
  (events || []).forEach(event => {
    const item = (event.items || []).find(i => i.sku === sku);
    if (item) {
      totalQty += item.qty || 0;
      eventDetails.push({
        eventName: event.name,
        eventType: event.type,
        stockDate: event.stock_date,
        qty: item.qty
      });
    }
  });
  
  return {
    totalQty,
    hasEvent: totalQty > 0,
    eventDetails,
    earliestDate: eventDetails.length > 0 
      ? eventDetails.reduce((min, e) => !min || e.stockDate < min ? e.stockDate : min, null)
      : null
  };
}

/**
 * Calculate order quantity
 */
export function calculateOrderQty(forecastTotal, eventQty, onHand, safetyPct) {
  const safety = Math.round(forecastTotal * (safetyPct / 100));
  const gross = forecastTotal + eventQty + safety;
  const net = gross - onHand;
  const orderQty = Math.max(0, net);
  
  return {
    forecastTotal,
    eventQty,
    onHand,
    safety,
    gross,
    net,
    orderQty
  };
}

/**
 * Assign urgency level based on months of stock coverage
 * 
 * Urgency thresholds:
 * - Critical: < 1 month coverage OR event within lead time
 * - Event: Has upcoming event (outside lead time)
 * - Soon: 1-3 months coverage
 * - OK: 3+ months coverage
 */
export function assignUrgency(orderData, hasEvent, earliestEventDate, config, monthsCoverOverride = null) {
  const monthlyForecast = orderData.forecastTotal / (config.forecast_months || 12);
  const monthsCover = monthsCoverOverride !== null 
    ? monthsCoverOverride 
    : (monthlyForecast > 0 ? orderData.onHand / monthlyForecast : 999);
  
  // Critical if event is within lead time AND we don't have enough stock for the event
  if (hasEvent && earliestEventDate) {
    const now = new Date();
    const leadTimeMs = (config.lead_time || 3) * 7 * 24 * 60 * 60 * 1000;
    const leadTimeDate = new Date(now.getTime() + leadTimeMs);
    
    // Only critical if event is soon AND we need to produce more
    if (new Date(earliestEventDate) <= leadTimeDate && orderData.onHand < (orderData.eventQty || 0)) {
      return 'critical';
    }
  }
  
  // Critical only if less than 1 month of stock coverage
  if (monthsCover < 1) {
    return 'critical';
  }
  
  // Event urgency if has upcoming event (but not critical timing)
  if (hasEvent) {
    return 'event';
  }
  
  // Soon if less than 3 months coverage
  if (monthsCover < 3) {
    return 'soon';
  }
  
  return 'ok';
}

/**
 * Generate production schedule
 */
export function generateProductionSchedule(item, monthlyForecasts, config) {
  const schedule = [];
  const leadTimeWeeks = config.lead_time || 3;
  
  monthlyForecasts.forEach((monthData, idx) => {
    const productionDate = new Date();
    productionDate.setMonth(productionDate.getMonth() + idx);
    productionDate.setDate(1);
    productionDate.setDate(productionDate.getDate() - (leadTimeWeeks * 7));
    
    schedule.push({
      month: monthData.month,
      demand: monthData.forecast,
      produce: monthData.forecast,
      productionDate: productionDate.toISOString().split('T')[0]
    });
  });
  
  return schedule;
}

/**
 * Main forecast calculation - orchestrates all steps
 */
export function calculateCompleteForecast(salesData, inventoryData, events, config, exclusions) {
  const results = [];
  
  // Aggregate sales
  const { skuData, minDate, maxDate } = aggregateSales(
    salesData?.retail, 
    salesData?.online, 
    exclusions
  );
  
  // Get all unique SKUs from sales or inventory
  const allSkus = new Set([
    ...Object.keys(skuData),
    ...(inventoryData || []).map(i => i.sku)
  ]);
  
  allSkus.forEach(sku => {
    const salesInfo = skuData[sku];
    // Try multiple field names for SKU matching
    const invInfo = (inventoryData || []).find(i => 
      i.sku === sku || 
      String(i.sku) === String(sku) ||
      i.sku?.trim() === sku?.trim()
    );
    
    // Skip if no sales data and no inventory
    if (!salesInfo && !invInfo) return;
    
    // Calculate velocity
    const totalSales = salesInfo?.total || 0;
    const dailyVelocity = calculateVelocity(totalSales, minDate, maxDate);
    
    // Generate monthly forecasts
    const category = salesInfo?.category || 'Other';
    const monthlyForecasts = generateMonthlyForecast(dailyVelocity, config, category);
    const forecastTotal = monthlyForecasts.reduce((sum, m) => sum + m.forecast, 0);
    
    // Calculate event demand
    const eventDemand = calculateEventDemand(events, sku);
    
    // Get current inventory - check multiple possible field names
    const onHand = invInfo?.quantity ?? invInfo?.on_hand ?? invInfo?.Available ?? invInfo?.available ?? 0;
    
    // Calculate order quantity
    const orderCalc = calculateOrderQty(
      forecastTotal,
      eventDemand.totalQty,
      onHand,
      config.safety_stock_percent || 20
    );
    
    // Calculate months cover based on FIRST 3 MONTHS of forecast (more accurate for urgency)
    const first3MonthsDemand = monthlyForecasts.slice(0, 3).reduce((sum, m) => sum + m.forecast, 0);
    const avgMonthlyDemand = first3MonthsDemand / 3;
    const monthsCover = avgMonthlyDemand > 0 ? onHand / avgMonthlyDemand : 999;
    
    // Assign urgency using calculated months cover
    const urgency = assignUrgency(
      { ...orderCalc, eventQty: eventDemand.totalQty },
      eventDemand.hasEvent,
      eventDemand.earliestDate,
      config,
      monthsCover
    );
    
    // Debug logging for items that seem incorrectly marked critical
    if (urgency === 'critical' && monthsCover > 3) {
      console.warn(`[Forecast Warning] ${sku} marked critical but has ${monthsCover.toFixed(1)} months coverage. onHand=${onHand}, avgMonthly=${avgMonthlyDemand.toFixed(1)}, hasEvent=${eventDemand.hasEvent}, eventQty=${eventDemand.totalQty}`);
    }
    
    // Generate production schedule
    const productionSchedule = generateProductionSchedule(
      { sku, name: salesInfo?.product || invInfo?.name },
      monthlyForecasts,
      config
    );
    
    // Calculate days of stock based on daily velocity
    const daysOfStock = dailyVelocity > 0 ? Math.round(onHand / dailyVelocity) : 999;
    
    results.push({
      sku,
      product: salesInfo?.product || invInfo?.name || sku,
      category: salesInfo?.category || 'Other',
      dailyVelocity: Math.round(dailyVelocity * 100) / 100,
      monthlyForecasts,
      forecastTotal,
      forecastQty: forecastTotal, // alias for compatibility
      eventDemand: eventDemand.totalQty,
      eventDetails: eventDemand.eventDetails,
      onHand,
      safetyStock: orderCalc.safety,
      grossNeed: orderCalc.gross,
      netNeed: orderCalc.net,
      orderQty: orderCalc.orderQty,
      urgency,
      monthsCover,
      daysOfStock,
      productionSchedule
    });
  });
  
  // Sort by urgency
  const urgencyOrder = { critical: 0, event: 1, soon: 2, ok: 3 };
  results.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);
  
  return results;
}