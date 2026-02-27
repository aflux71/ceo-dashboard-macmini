import React, { useState } from "react";
import { AlertTriangle, Check, Truck, DollarSign, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import Badge from "@/components/ui/Badge";

export default function SuggestedReorders({ inventory, suppliers, onAdd, onCreatePO }) {
  const [selected, setSelected] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState("all");

  const lowStockItems = inventory.filter(item => 
    item.reorder_point && item.quantity <= item.reorder_point
  ).map(item => {
    const urgency = item.quantity / item.reorder_point;
    const daysUntilStockout = item.quantity > 0 ? Math.ceil((item.quantity / item.reorder_point) * 30) : 0;
    const orderQty = item.reorder_qty || Math.ceil(item.reorder_point * 1.5);
    const estimatedCost = (item.cost_per_unit || 0) * orderQty;
    
    return {
      ...item,
      urgency,
      daysUntilStockout,
      orderQty,
      estimatedCost
    };
  }).sort((a, b) => a.urgency - b.urgency);

  // Group by supplier
  const itemsBySupplier = lowStockItems.reduce((acc, item) => {
    const supplier = item.supplier || "Unknown";
    if (!acc[supplier]) acc[supplier] = [];
    acc[supplier].push(item);
    return acc;
  }, {});

  const filteredItems = selectedSupplier === "all" 
    ? lowStockItems 
    : lowStockItems.filter(item => item.supplier === selectedSupplier);

  const suppliersList = Object.keys(itemsBySupplier).sort();

  const toggleItem = (itemId) => {
    setSelected(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const toggleAll = () => {
    const currentFiltered = filteredItems.map(i => i.id);
    const allSelected = currentFiltered.every(id => selected.includes(id));
    
    if (allSelected) {
      setSelected(prev => prev.filter(id => !currentFiltered.includes(id)));
    } else {
      setSelected(prev => [...new Set([...prev, ...currentFiltered])]);
    }
  };

  const toggleSupplier = (supplier) => {
    const supplierItems = itemsBySupplier[supplier].map(i => i.id);
    const allSelected = supplierItems.every(id => selected.includes(id));
    
    if (allSelected) {
      setSelected(prev => prev.filter(id => !supplierItems.includes(id)));
    } else {
      setSelected(prev => [...new Set([...prev, ...supplierItems])]);
    }
  };

  const handleAdd = () => {
    const items = lowStockItems.filter(i => selected.includes(i.id));
    onAdd(items);
  };

  const handleCreatePO = (supplier) => {
    const supplierInfo = suppliers?.find(s => s.name === supplier);
    const items = itemsBySupplier[supplier].filter(i => selected.includes(i.id));
    
    if (items.length === 0) return;
    
    onCreatePO({
      supplier,
      supplierInfo,
      items
    });
  };

  const getTotalCost = (items) => {
    return items.reduce((sum, item) => sum + (item.estimatedCost || 0), 0);
  };

  const getSelectedInSupplier = (supplier) => {
    return itemsBySupplier[supplier].filter(i => selected.includes(i.id)).length;
  };

  if (lowStockItems.length === 0) {
    return (
      <div className="text-center py-8">
        <Check className="w-12 h-12 text-green-500 mx-auto mb-3" />
        <p className="text-zinc-300">All inventory levels are healthy!</p>
        <p className="text-sm text-zinc-500 mt-1">No items below reorder point</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-xs text-red-400 mb-1">Critical</p>
          <p className="text-xl font-bold text-red-400">
            {lowStockItems.filter(i => i.urgency <= 0.25).length}
          </p>
        </div>
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <p className="text-xs text-amber-400 mb-1">Low</p>
          <p className="text-xl font-bold text-amber-400">
            {lowStockItems.filter(i => i.urgency > 0.25 && i.urgency <= 0.5).length}
          </p>
        </div>
        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <p className="text-xs text-blue-400 mb-1">Est. Cost</p>
          <p className="text-xl font-bold text-blue-400">
            ${getTotalCost(lowStockItems.filter(i => selected.includes(i.id))).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
          </p>
        </div>
      </div>

      {/* Filter by Supplier */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span className="text-sm text-zinc-400">
            {selected.length} of {filteredItems.length} selected
          </span>
        </div>
        <select
          value={selectedSupplier}
          onChange={(e) => setSelectedSupplier(e.target.value)}
          className="text-sm bg-zinc-800 border border-zinc-700 rounded px-3 py-1 text-zinc-300"
        >
          <option value="all">All Suppliers</option>
          {suppliersList.map(sup => (
            <option key={sup} value={sup}>{sup}</option>
          ))}
        </select>
      </div>

      {/* Group by Supplier */}
      <div className="space-y-4 max-h-[500px] overflow-y-auto">
        {suppliersList
          .filter(supplier => selectedSupplier === "all" || selectedSupplier === supplier)
          .map((supplier) => {
          const supplierItems = itemsBySupplier[supplier];
          const supplierInfo = suppliers?.find(s => s.name === supplier);
          const selectedCount = getSelectedInSupplier(supplier);
          const totalCost = getTotalCost(supplierItems.filter(i => selected.includes(i.id)));

          return (
            <div key={supplier} className="border border-zinc-700 rounded-lg overflow-hidden">
              {/* Supplier Header */}
              <div className="bg-zinc-800/50 p-4 border-b border-zinc-700">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <Truck className="w-5 h-5 text-orange-400" />
                    <div>
                      <h3 className="font-semibold text-zinc-100">{supplier}</h3>
                      <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                        {supplierInfo?.lead_time_days && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {supplierInfo.lead_time_days} days lead time
                          </span>
                        )}
                        {supplierInfo?.payment_terms && (
                          <span>{supplierInfo.payment_terms}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={selectedCount > 0 ? "orange" : "default"}>
                      {selectedCount}/{supplierItems.length} selected
                    </Badge>
                    {selectedCount > 0 && (
                      <p className="text-xs text-orange-400 mt-1 font-semibold">
                        ${totalCost.toLocaleString(undefined, {minimumFractionDigits: 2})}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleSupplier(supplier)}
                    className="text-xs"
                  >
                    {selectedCount === supplierItems.length ? 'Deselect All' : 'Select All'}
                  </Button>
                  {selectedCount > 0 && onCreatePO && (
                    <Button
                      size="sm"
                      onClick={() => handleCreatePO(supplier)}
                      className="bg-orange-500 hover:bg-orange-600 text-xs"
                    >
                      Create PO for {supplier}
                    </Button>
                  )}
                </div>
              </div>

              {/* Items List */}
              <div className="divide-y divide-zinc-800">
                {supplierItems.map((item) => {
                  const urgencyColor = item.urgency <= 0.25 ? 'red' : item.urgency <= 0.5 ? 'amber' : 'orange';
                  
                  return (
                    <div
                      key={item.id}
                      onClick={() => toggleItem(item.id)}
                      className={`
                        flex items-start gap-3 p-3 cursor-pointer transition-colors
                        ${selected.includes(item.id) 
                          ? 'bg-orange-500/5' 
                          : 'hover:bg-zinc-800/30'}
                      `}
                    >
                      <Checkbox
                        checked={selected.includes(item.id)}
                        onCheckedChange={() => toggleItem(item.id)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-sm text-orange-400">{item.sku}</span>
                          <span className="text-zinc-200 truncate">{item.name}</span>
                          <Badge variant={urgencyColor} className="ml-auto shrink-0">
                            {item.daysUntilStockout <= 0 ? 'OUT' : `${item.daysUntilStockout}d left`}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-xs">
                          <div>
                            <span className="text-zinc-500">Current: </span>
                            <span className={`text-${urgencyColor}-400 font-medium`}>
                              {item.quantity} {item.unit}
                            </span>
                          </div>
                          <div>
                            <span className="text-zinc-500">Reorder: </span>
                            <span className="text-zinc-300">{item.reorder_point} {item.unit}</span>
                          </div>
                          <div>
                            <span className="text-zinc-500">Order qty: </span>
                            <span className="text-zinc-300 font-medium">{item.orderQty} {item.unit}</span>
                          </div>
                          <div>
                            <span className="text-zinc-500">Cost: </span>
                            <span className="text-green-400 font-semibold">
                              ${item.estimatedCost.toLocaleString(undefined, {minimumFractionDigits: 2})}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Actions */}
      <div className="flex justify-between items-center pt-4 border-t border-zinc-700">
        <div className="text-sm text-zinc-400">
          Total estimated cost: <span className="text-green-400 font-semibold">
            ${getTotalCost(lowStockItems.filter(i => selected.includes(i.id))).toLocaleString(undefined, {minimumFractionDigits: 2})}
          </span>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline"
            onClick={toggleAll} 
            disabled={filteredItems.length === 0}
          >
            {filteredItems.every(i => selected.includes(i.id)) ? 'Deselect All' : 'Select All'}
          </Button>
          <Button 
            onClick={handleAdd} 
            disabled={selected.length === 0}
            className="bg-orange-500 hover:bg-orange-600"
          >
            Add {selected.length} to Current PO
          </Button>
        </div>
      </div>
    </div>
  );
}