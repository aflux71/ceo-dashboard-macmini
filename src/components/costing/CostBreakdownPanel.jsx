import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmt } from "./costingEngine";

function Row({ label, value, bold, accent }) {
  return (
    <div
      className={`flex justify-between py-1.5 text-sm ${
        bold ? "font-semibold text-zinc-100" : "text-zinc-300"
      } ${accent ? "text-orange-400" : ""}`}
    >
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

export default function CostBreakdownPanel({ breakdown }) {
  if (!breakdown) return null;
  const b = breakdown;

  return (
    <div className="space-y-4">
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-zinc-100">Cost Breakdown (per batch)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <Row label="Raw Materials" value={fmt(b.rawMaterialsCost)} />
          <Row label={`Labor (${b.laborHours}h × ${fmt(b.laborRate)})`} value={fmt(b.laborCost)} />
          <Row label="Custom Overheads" value={fmt(b.customOverheadsCost)} />
          <div className="border-t border-zinc-800 my-2" />
          <Row label="Finished Cost / Batch" value={fmt(b.finishedCostPerBatch)} bold />
          <Row label="Packaging / Batch" value={fmt(b.packagingCostPerBatch)} />
          <Row label="Shipping + Other Variable / Batch" value={fmt(b.variablePerBatch)} />
          <div className="border-t border-zinc-800 my-2" />
          <Row label="Total Cost / Batch" value={fmt(b.totalCostPerBatch)} bold accent />
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-zinc-100">Per-Unit Costs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <Row label="Finished Cost / Unit" value={fmt(b.finishedCostPerUnit)} />
          <Row label="Packaging / Unit" value={fmt(b.packagingCostPerUnit)} />
          <Row label="Shipping / Unit" value={fmt(b.shippingPerUnit)} />
          <Row label="Other Variable / Unit" value={fmt(b.otherVariablePerUnit)} />
          <div className="border-t border-zinc-800 my-2" />
          <Row label="Total Cost / Unit" value={fmt(b.totalCostPerUnit)} bold accent />
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-zinc-100">Pricing Tiers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <Row label="GP Target Price" value={fmt(b.gpTargetPrice)} />
          <Row label="Wholesale Price" value={fmt(b.wholesalePrice)} />
          <Row label="Private Brand Price" value={fmt(b.privateBrandPrice)} />
          <Row label="Retail Price" value={fmt(b.retailPrice)} bold accent />
        </CardContent>
      </Card>
    </div>
  );
}