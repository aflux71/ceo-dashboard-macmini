import React, { createContext, useContext, useState } from "react";

const ForecastContext = createContext(null);

export function ForecastProvider({ children }) {
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [retailData, setRetailData] = useState(null);
  const [onlineData, setOnlineData] = useState(null);
  const [inventorySnapshot, setInventorySnapshot] = useState(null);
  const [events, setEvents] = useState([]);
  const [exclusions, setExclusions] = useState([]);
  const [config, setConfig] = useState({
    growth: 0,
    lead_time: 3,
    safety_stock_percent: 20,
    forecast_months: 12,
    monthly_growth: {}
  });

  const resetWorkspace = () => {
    setActiveWorkspace(null);
    setRetailData(null);
    setOnlineData(null);
    setInventorySnapshot(null);
    setEvents([]);
    setExclusions([]);
    setConfig({
      growth: 0,
      lead_time: 3,
      safety_stock_percent: 20,
      forecast_months: 12,
      monthly_growth: {}
    });
  };

  const value = {
    activeWorkspace,
    setActiveWorkspace,
    retailData,
    setRetailData,
    onlineData,
    setOnlineData,
    inventorySnapshot,
    setInventorySnapshot,
    events,
    setEvents,
    exclusions,
    setExclusions,
    config,
    setConfig,
    resetWorkspace
  };

  return (
    <ForecastContext.Provider value={value}>
      {children}
    </ForecastContext.Provider>
  );
}

export function useForecast() {
  const context = useContext(ForecastContext);
  if (!context) {
    throw new Error("useForecast must be used within a ForecastProvider");
  }
  return context;
}