import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Badge from "@/components/ui/Badge";

export default function LotNumberSelect({ inventoryItem, value, onChange, disabled }) {
  const lots = inventoryItem?.lot_numbers || [];
  
  if (lots.length === 0) {
    return (
      <div className="text-xs text-zinc-500 italic">No lots available</div>
    );
  }

  // Sort by expiration date (FIFO - oldest first)
  const sortedLots = [...lots].sort((a, b) => {
    if (!a.expiration_date) return 1;
    if (!b.expiration_date) return -1;
    return new Date(a.expiration_date) - new Date(b.expiration_date);
  });

  const isExpiringSoon = (date) => {
    if (!date) return false;
    const exp = new Date(date);
    const now = new Date();
    const diff = (exp - now) / (1000 * 60 * 60 * 24);
    return diff <= 30 && diff > 0;
  };

  const isExpired = (date) => {
    if (!date) return false;
    return new Date(date) < new Date();
  };

  return (
    <Select value={value || ""} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="bg-zinc-800 border-zinc-700 h-8 text-sm">
        <SelectValue placeholder="Select lot" />
      </SelectTrigger>
      <SelectContent>
        {sortedLots.map((lot, idx) => (
          <SelectItem key={idx} value={lot.lot} disabled={lot.quantity <= 0}>
            <div className="flex items-center gap-2">
              <span className="font-mono">{lot.lot}</span>
              <span className="text-zinc-500">({lot.quantity} {inventoryItem?.unit})</span>
              {isExpired(lot.expiration_date) && (
                <Badge variant="red" className="text-xs py-0">Expired</Badge>
              )}
              {isExpiringSoon(lot.expiration_date) && !isExpired(lot.expiration_date) && (
                <Badge variant="amber" className="text-xs py-0">Exp Soon</Badge>
              )}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}