import React from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function PortalProductRow({ product, quantity, onChange, stock }) {
  const hasStock = typeof stock === "number";
  const stockColor = !hasStock
    ? "text-zinc-600"
    : stock <= 0
      ? "text-red-400"
      : stock < 10
        ? "text-amber-400"
        : "text-green-400";

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
        <Input
          type="number"
          min="0"
          value={quantity || ""}
          onChange={(e) => onChange(product.id, e.target.value)}
          placeholder="0"
          className="bg-zinc-800 border-zinc-700 text-white text-center font-semibold h-9 w-24 ml-auto"
        />
      </td>
    </tr>
  );
}