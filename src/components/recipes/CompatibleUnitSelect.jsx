import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getCompatibleUnits, getUnitGroup } from "@/components/utils/unitConversion";

export default function CompatibleUnitSelect({ value, onChange, inventoryUnit, allUnits = [] }) {
  // Get compatible units based on inventory unit
  const compatibleUnits = inventoryUnit ? getCompatibleUnits(inventoryUnit) : [];
  
  // If no inventory unit or no compatible units found, show all units
  const unitGroup = getUnitGroup(inventoryUnit);
  const unitsToShow = unitGroup ? compatibleUnits : (allUnits.length > 0 ? allUnits : [value || 'units']);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="bg-zinc-800 border-zinc-700">
        <SelectValue placeholder="Unit" />
      </SelectTrigger>
      <SelectContent>
        {unitsToShow.map(unit => (
          <SelectItem key={unit} value={unit}>{unit}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}