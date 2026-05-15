import React from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Package } from "lucide-react";

export default function PortalProductCard({ product, quantity, onChange }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col hover:border-zinc-700 transition-colors">
      <div className="aspect-square bg-zinc-800 flex items-center justify-center overflow-hidden">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <Package className="w-12 h-12 text-zinc-600" />
        )}
      </div>

      <div className="p-4 flex-1 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-white text-sm leading-tight">{product.name}</h3>
          {product.category && (
            <Badge variant="orange" className="text-[10px] shrink-0">
              {product.category}
            </Badge>
          )}
        </div>

        <p className="text-xs text-zinc-500">SKU: {product.sku}</p>

        {product.description && (
          <p className="text-xs text-zinc-400 line-clamp-2">{product.description}</p>
        )}

        <div className="mt-auto pt-3">
          <label className="text-xs text-zinc-400 mb-1 block">Quantity</label>
          <Input
            type="number"
            min="0"
            value={quantity || ""}
            onChange={(e) => onChange(product.id, e.target.value)}
            placeholder="0"
            className="bg-zinc-800 border-zinc-700 text-white text-center font-semibold"
          />
        </div>
      </div>
    </div>
  );
}