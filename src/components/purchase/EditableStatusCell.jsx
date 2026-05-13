import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import Badge from "@/components/ui/Badge";
import { Edit, Send, Check, Truck, Package, AlertTriangle } from "lucide-react";

const STATUS_CONFIG = {
  draft: { variant: "default", icon: Edit, label: "draft" },
  submitted: { variant: "amber", icon: Send, label: "submitted" },
  confirmed: { variant: "blue", icon: Check, label: "confirmed" },
  shipped: { variant: "cyan", icon: Truck, label: "shipped" },
  received: { variant: "green", icon: Package, label: "received" },
  cancelled: { variant: "red", icon: AlertTriangle, label: "cancelled" },
};

const STATUS_OPTIONS = [
  "draft",
  "submitted",
  "confirmed",
  "shipped",
  "received",
  "cancelled",
];

export default function EditableStatusCell({ status, onChange, disabled }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  const Icon = config.icon;

  const handleChange = (next) => {
    if (next === status) return;
    if (next === "received" || status === "received") {
      const msg =
        next === "received"
          ? "Mark as received? This will add the PO quantities to inventory."
          : "Change status away from 'received'? Inventory quantities will NOT be reversed automatically.";
      if (!confirm(msg)) return;
    }
    onChange(next);
  };

  return (
    <Select value={status} onValueChange={handleChange} disabled={disabled}>
      <SelectTrigger
        className="h-auto p-0 border-0 bg-transparent shadow-none focus:ring-0 focus:ring-offset-0 hover:opacity-80 [&>svg]:hidden w-auto"
        title="Click to change status"
      >
        <Badge variant={config.variant}>
          <Icon className="w-3 h-3 mr-1" />
          {config.label}
        </Badge>
      </SelectTrigger>
      <SelectContent>
        {STATUS_OPTIONS.map((s) => {
          const c = STATUS_CONFIG[s];
          const SIcon = c.icon;
          return (
            <SelectItem key={s} value={s}>
              <span className="flex items-center gap-2">
                <SIcon className="w-3 h-3" />
                {c.label}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}