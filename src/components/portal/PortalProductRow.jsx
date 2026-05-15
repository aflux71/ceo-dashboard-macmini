import React from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Minus } from "lucide-react";

export default function PortalProductRow({ product, quantity, onChange, stock }) {
  const hasStock = typeof stock === "number";
  const stockColor = !hasStock
    ? "text-zinc-600"
    : stock <= 0
      ? "text-red-400"
      : stock < 10
        ? "text-amber-400"
        : "text-green-400";

  const current = Number(quantity) || 0;

  const increment = () => onChange(product.id, String(current + 1));
  const decrement = () => {
    const next = Math.max(0, current - 1);
    onChange(product.id, next === 0 ? "" : String(next));
  };

  return (
    <tr className="border-t border-zinc-800 hover:bg-zinc-800/30">
      <td className="px-3 py-2 text-white">
        <div className="font-medium">{product.name}</div>
        {product.description && (
          <div className="text-xs text-zinc-500 line-clamp-1">{product.description}</div>
        )}
      </td>
      <td className="px-3 py-2 text-zinc-400 text-sm whitespace-nowrap">{product.sku}</td>
      <td className="px-3 py-2 text-zinc-400 text-sm">
        {product.category ? (
          <Badge variant="orange" className="text-[10px]">{product.category}</Badge>
        ) : (
          <span className="text-zinc-600">—</span>
        )}
      </td>
      <td className={`px-3 py-2 text-right text-sm font-semibold ${stockColor}`}>
        {hasStock ? stock : "—"}
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={decrement}
            disabled={current === 0}
            className="h-9 w-9 shrink-0 bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white"
            aria-label="Decrease quantity"
          >
            <Minus className="w-4 h-4" />
          </Button>
          <Input
            type="number"
            min="0"
            value={quantity || ""}
            onChange={(e) => onChange(product.id, e.target.value)}
            placeholder="0"
            className="bg-zinc-800 border-zinc-700 text-white text-center font-semibold h-9 w-16"
          />
          <Button
            type="button"
            size="icon"
            onClick={increment}
            className="h-9 w-9 shrink-0 bg-orange-500 hover:bg-orange-600 text-white"
            aria-label="Add"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}