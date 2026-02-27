import React, { useState, useMemo } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default function IngredientSkuSelect({ inventory, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const rawMaterials = useMemo(() => {
    return inventory.filter(i => i.type === 'raw_material');
  }, [inventory]);

  const filteredItems = useMemo(() => {
    if (!searchTerm) return rawMaterials;
    const lower = searchTerm.toLowerCase();
    return rawMaterials.filter(item => 
      item.sku?.toLowerCase().includes(lower) ||
      item.name?.toLowerCase().includes(lower)
    );
  }, [rawMaterials, searchTerm]);

  const selectedItem = inventory.find(i => i.sku === value);

  const handleSelect = (item) => {
    onChange(item.sku);
    setOpen(false);
    setSearchTerm("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between bg-zinc-800 border-zinc-700 text-left font-normal hover:bg-zinc-700"
        >
          <span className="truncate">
            {selectedItem ? (
              <span>
                <span className="text-orange-400 font-mono">{selectedItem.sku}</span>
                <span className="text-zinc-400 ml-2">- {selectedItem.name}</span>
              </span>
            ) : (
              <span className="text-zinc-500">Select</span>
            )}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[350px] p-0 bg-zinc-900 border-zinc-700" align="start">
        <div className="p-2 border-b border-zinc-700">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input
              placeholder="Search SKU or name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 bg-zinc-800 border-zinc-700"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-[250px] overflow-y-auto">
          {filteredItems.length === 0 ? (
            <div className="py-6 text-center text-sm text-zinc-500">
              No materials found
            </div>
          ) : (
            filteredItems.map((item) => (
              <div
                key={item.id}
                onClick={() => handleSelect(item)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-zinc-800 transition-colors",
                  value === item.sku && "bg-orange-500/10"
                )}
              >
                <Check
                  className={cn(
                    "h-4 w-4 shrink-0",
                    value === item.sku ? "opacity-100 text-orange-400" : "opacity-0"
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-orange-400">{item.sku}</span>
                    <span className="text-zinc-300 truncate">{item.name}</span>
                  </div>
                  <div className="text-xs text-zinc-500">
                    {item.quantity} {item.unit} in stock
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}