import React from "react";
import { cn } from "@/lib/utils";

const variants = {
  default: "bg-zinc-800 text-zinc-300 border-zinc-700",
  orange: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  green: "bg-green-500/20 text-green-400 border-green-500/30",
  amber: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  red: "bg-red-500/20 text-red-400 border-red-500/30",
  blue: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  purple: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  cyan: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
};

function Badge({ children, variant = "default", className }) {
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border",
      variants[variant],
      className
    )}>
      {children}
    </span>
  );
}

export default Badge;
export { Badge };