import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getPortalSession } from "./portalSession";

export default function PortalRouteGuard({ children }) {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const session = getPortalSession();
    if (!session) {
      navigate("/portal/login", { replace: true });
    } else {
      setChecked(true);
    }
  }, [navigate]);

  if (!checked) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-zinc-700 border-t-orange-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return children;
}