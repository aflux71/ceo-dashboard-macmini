import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";

const FloorPinContext = createContext(null);

const STORAGE_KEY = "neob_floor_session";
const DEFAULT_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours default

// Default role permissions
const DEFAULT_ROLE_PERMISSIONS = {
  owner: ["production", "inventory", "requisitions", "recipes", "recipe_templates", "forecasting", "user_management", "settings", "reports", "batch_history", "review_queue", "purchase_orders", "view_costs", "delete_recipes"],
  admin: ["production", "inventory", "requisitions", "recipes", "recipe_templates", "forecasting", "user_management", "reports", "batch_history", "review_queue", "purchase_orders", "view_costs", "delete_recipes"],
  production_lead: ["production", "inventory", "requisitions", "recipes", "reports", "batch_history", "review_queue"],
  production_labor: ["production", "batch_history"],
  qc: ["review_queue", "batch_history", "inventory", "requisitions"],
  operator: ["production", "batch_history"],
  inventory: ["inventory", "requisitions", "batch_history"]
};

// Export for backward compatibility
export const ROLE_PERMISSIONS = DEFAULT_ROLE_PERMISSIONS;

export function FloorPinProvider({ children }) {
  const [floorUser, setFloorUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [sessionTimeoutMs, setSessionTimeoutMs] = useState(DEFAULT_TIMEOUT_MS);
  const [rolePermissions, setRolePermissions] = useState(DEFAULT_ROLE_PERMISSIONS);

  // Load session from storage
  useEffect(() => {
    const loadSession = async () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const session = JSON.parse(stored);
          // Verify user still exists and is active
          const users = await base44.entities.FloorUser.filter({ id: session.userId });
          if (users.length > 0 && users[0].active) {
            setFloorUser(users[0]);
            setLastActivity(session.lastActivity || Date.now());
          } else {
            localStorage.removeItem(STORAGE_KEY);
          }
        }
        
        // Load timeout setting
        const timeoutSettings = await base44.entities.AppSettings.filter({ key: "session_timeout_minutes" });
        if (timeoutSettings.length > 0) {
          setSessionTimeoutMs(parseInt(timeoutSettings[0].value) * 60 * 1000);
        }
        
        // Load custom role permissions
        const permSettings = await base44.entities.AppSettings.filter({ key: "role_permissions" });
        if (permSettings.length > 0) {
          try {
            setRolePermissions(JSON.parse(permSettings[0].value));
          } catch (e) {
            console.error("Error parsing role permissions:", e);
          }
        }
      } catch (error) {
        console.error("Error loading floor session:", error);
        localStorage.removeItem(STORAGE_KEY);
      }
      setLoading(false);
    };
    
    loadSession();
  }, []);

  // Check for inactivity timeout
  useEffect(() => {
    if (!floorUser) return;

    const checkTimeout = () => {
      const now = Date.now();
      if (now - lastActivity > sessionTimeoutMs) {
        logout();
      }
    };

    const interval = setInterval(checkTimeout, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [floorUser, lastActivity, sessionTimeoutMs]);

  // Track activity
  const trackActivity = useCallback(() => {
    const now = Date.now();
    setLastActivity(now);
    if (floorUser) {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const session = JSON.parse(stored);
        session.lastActivity = now;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      }
    }
  }, [floorUser]);

  // Listen for user activity
  useEffect(() => {
    if (!floorUser) return;
    
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach(event => window.addEventListener(event, trackActivity));
    
    return () => {
      events.forEach(event => window.removeEventListener(event, trackActivity));
    };
  }, [floorUser, trackActivity]);

  const login = async (pin) => {
    try {
      const users = await base44.entities.FloorUser.filter({ pin, active: true });
      if (users.length === 0) {
        return { success: false, error: "Invalid PIN" };
      }
      
      const user = users[0];
      
      // Update last login
      await base44.entities.FloorUser.update(user.id, { 
        last_login: new Date().toISOString() 
      });
      
      // Save session
      const session = {
        userId: user.id,
        lastActivity: Date.now()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      
      setFloorUser(user);
      setLastActivity(Date.now());
      
      return { success: true, user };
    } catch (error) {
      console.error("Login error:", error);
      return { success: false, error: "Login failed" };
    }
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setFloorUser(null);
  };

  const hasPermission = (permission) => {
    if (!floorUser) return false;
    const permissions = rolePermissions[floorUser.role] || [];
    return permissions.includes(permission);
  };

  return (
    <FloorPinContext.Provider value={{
      floorUser,
      loading,
      login,
      logout,
      hasPermission,
      lastActivity,
      sessionTimeoutMs,
      setSessionTimeoutMs
    }}>
      {children}
    </FloorPinContext.Provider>
  );
}

export function useFloorPin() {
  const context = useContext(FloorPinContext);
  if (!context) {
    throw new Error("useFloorPin must be used within FloorPinProvider");
  }
  return context;
}