import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { CheckCircle, X, ArrowRight } from "lucide-react";

function calcDaysOfSupply(item) {
  if (!item.quantity || item.quantity <= 0) return 0;
  if (!item.reorder_point || item.reorder_point <= 0) return 999;
  const dailyUsage = item.reorder_point / 30;
  if (dailyUsage <= 0) return 999;
  return Math.floor(item.quantity / dailyUsage);
}

function DaysLabel({ days }) {
  if (days <= 0) return <span className="text-red-400 font-bold text-xs">OUT</span>;
  if (days <= 3) return <span className="text-red-400 font-semibold text-xs">{days}d</span>;
  if (days <= 14) return <span className="text-orange-400 font-semibold text-xs">{days}d</span>;
  return <span className="text-zinc-400 text-xs">{days}d</span>;
}

function StockLabel({ item, days }) {
  const color = days <= 0 ? "text-red-400" : days <= 3 ? "text-red-400" : days <= 14 ? "text-orange-400" : "text-zinc-400";
  return (
    <span className={`text-xs ${color}`}>
      {item.quantity?.toLocaleString()} {item.unit}
    </span>
  );
}

function StatusPill({ req, po, onClick }) {
  if (po) {
    const isComplete = po.status === "received" || po.status === "complete" || po.status === "cancelled";
    if (isComplete) return null;
    return (
      <button onClick={onClick} className="px-2 py-0.5 rounded text-xs font-medium bg-blue-900/50 text-blue-400 border border-blue-800 hover:bg-blue-900/80 transition-colors">
        PO
      </button>
    );
  }
  if (req) {
    return (
      <button onClick={onClick} className="px-2 py-0.5 rounded text-xs font-medium bg-amber-900/50 text-amber-400 border border-amber-800 hover:bg-amber-900/80 transition-colors">
        REQ
      </button>
    );
  }
  return null;
}

function DetailPopup({ item, req, po, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-5 max-w-sm w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs font-mono text-orange-400">{item.sku}</p>
            <p className="text-sm font-semibold text-zinc-100">{item.name}</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-3 text-sm">
          {req && (
            <div className="p-3 rounded-lg bg-amber-900/20 border border-amber-800/40">
              <p className="text-xs font-semibold text-amber-400 mb-1">Requisition</p>
              <div className="flex items-center justify-between">
                <span className="text-zinc-300 text-xs">{req.item_name}</span>
                <span className="capitalize text-xs px-1.5 py-0.5 rounded bg-amber-900/50 text-amber-400 border border-amber-800">{req.status}</span>
              </div>
              {req.suggested_qty && <p className="text-xs text-zinc-500 mt-1">Qty: {req.suggested_qty?.toLocaleString()}</p>}
            </div>
          )}
          {po && (
            <div className="p-3 rounded-lg bg-blue-900/20 border border-blue-800/40">
              <p className="text-xs font-semibold text-blue-400 mb-1">Purchase Order</p>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-zinc-300">{po.po_number}</span>
                <span className="capitalize text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400 border border-blue-800">{po.status}</span>
              </div>
              {po.supplier && <p className="text-xs text-zinc-500 mt-1">Supplier: {po.supplier}</p>}
              {po.expected_date && <p className="text-xs text-zinc-500">ETA: {new Date(po.expected_date).toLocaleDateString()}</p>}
              {po.total != null && <p className="text-xs text-zinc-500">Total: ${po.total?.toLocaleString()}</p>}
            </div>
          )}
          {!req && !po && (
            <div className="p-3 rounded-lg bg-zinc-800/60 border border-zinc-700">
              <p className="text-xs text-zinc-400">No requisition or PO found for this item.</p>
            </div>
          )}
        </div>
        <div className="flex gap-2 mt-4">
          {req && (
            <Link to={createPageUrl("PurchaseRequisitions")} className="flex-1">
              <button className="w-full flex items-center justify-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-500 rounded-md px-3 py-1.5 transition-colors">
                Requisitions <ArrowRight className="w-3 h-3" />
              </button>
            </Link>
          )}
          {po && (
            <Link to={createPageUrl("PurchaseOrders")} className="flex-1">
              <button className="w-full flex items-center justify-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-500 rounded-md px-3 py-1.5 transition-colors">
                Purchase Orders <ArrowRight className="w-3 h-3" />
              </button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ActionRequired({ inventory = [], requisitions = [], purchaseOrders = [] }) {
  const [showOrdered, setShowOrdered] = useState(false);
  const [detailItem, setDetailItem] = useState(null);

  const enriched = useMemo(() => {
    const lowStock = inventory.filter(i => i.reorder_point && i.quantity <= i.reorder_point);
    return lowStock.map(item => {
      const days = calcDaysOfSupply(item);
      const req = requisitions.find(r => r.item_sku === item.sku && !['ordered', 'rejected'].includes(r.status)) || null;
      const po = purchaseOrders.find(p => {
        const isActive = !['received', 'cancelled'].includes(p.status);
        return isActive && p.items?.some(li => li.sku === item.sku);
      }) || null;
      const isOrdered = !!(req || po);
      return { item, days, req, po, isOrdered };
    }).sort((a, b) => {
      if (a.days !== b.days) return a.days - b.days;
      return (a.isOrdered ? 1 : 0) - (b.isOrdered ? 1 : 0);
    });
  }, [inventory, requisitions, purchaseOrders]);

  const visible = enriched.filter(e => !e.isOrdered);
  const ordered = enriched.filter(e => e.isOrdered);
  const criticalCount = visible.filter(e => e.days <= 3).length;
  const displayList = showOrdered ? enriched : visible;
  const detailEntry = detailItem ? enriched.find(e => e.item.id === detailItem) : null;

  if (enriched.length === 0) {
    return (
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6 flex items-center gap-3">
        <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
        <p className="text-sm text-zinc-400">All materials in stock — no action required.</p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-zinc-100">Action Required</span>
          {visible.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">
              {visible.length}
            </span>
          )}
        </div>
        {ordered.length > 0 && (
          <button
            onClick={() => setShowOrdered(v => !v)}
            className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${showOrdered ? "bg-zinc-800/60 border-zinc-600 text-zinc-300 hover:text-zinc-100" : "bg-zinc-800/60 border-zinc-700 text-zinc-500 hover:text-zinc-300"}`}
          >
            {showOrdered ? `Hide ordered (${ordered.length})` : `Show ordered (${ordered.length})`}
          </button>
        )}
      </div>

      {/* Critical banner */}
      {criticalCount > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-red-950/50 border-b border-red-900/60">
          <span className="text-sm font-semibold text-red-400">
            {criticalCount} critical — requires immediate action
          </span>
          <Link to={createPageUrl("PurchaseRequisitions")} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1">
            Review all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* Empty state when all are ordered and hidden */}
      {visible.length === 0 && ordered.length > 0 && !showOrdered && (
        <div className="px-4 py-5 flex items-center gap-3">
          <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
          <p className="text-sm text-zinc-400">All low-stock items have active orders.</p>
        </div>
      )}

      {/* Item rows */}
      {displayList.length > 0 && (
        <div className="divide-y divide-zinc-800/60">
          {displayList.map(({ item, days, req, po, isOrdered }) => (
            <div
              key={item.id}
              className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${isOrdered ? "opacity-40 bg-zinc-900/20" : "hover:bg-zinc-800/30"}`}
            >
              <span className="font-mono text-xs text-orange-400 w-24 shrink-0 truncate">{item.sku}</span>
              <span className="text-sm text-zinc-300 flex-1 truncate">{item.name}</span>
              <div className="hidden sm:block w-24 shrink-0 text-right">
                <StockLabel item={item} days={days} />
              </div>
              <div className="w-10 shrink-0 text-right">
                <DaysLabel days={days} />
              </div>
              <div className="w-12 shrink-0 flex justify-end">
                <StatusPill req={req} po={po} onClick={() => setDetailItem(item.id)} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail popup */}
      {detailEntry && (
        <DetailPopup
          item={detailEntry.item}
          req={detailEntry.req}
          po={detailEntry.po}
          onClose={() => setDetailItem(null)}
        />
      )}
    </div>
  );
}