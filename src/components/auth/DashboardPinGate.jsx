import React from "react";
import { useFloorPin } from "./FloorPinContext";
import PinLoginScreen from "./PinLoginScreen";

/**
 * Forces an authenticated Base44 dashboard user to enter their FloorPin
 * before accessing the app. If no floorUser is active, show the PIN screen.
 * This enforces the nightly 2 AM logout policy — after the epoch bumps,
 * the FloorPin session is cleared and this gate re-appears.
 */
export default function DashboardPinGate({ children }) {
  const { floorUser, loading } = useFloorPin();

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-zinc-950">
        <div className="w-8 h-8 border-4 border-zinc-700 border-t-orange-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!floorUser) {
    return <PinLoginScreen />;
  }

  return children;
}