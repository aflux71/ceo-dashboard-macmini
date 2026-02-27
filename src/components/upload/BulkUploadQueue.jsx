import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import Badge from "@/components/ui/Badge";
import {
  Search,
  CheckCheck,
  Trash2,
  Edit,
  Package,
  Beaker,
  RefreshCw,
  AlertTriangle,
  X,
  TrendingUp
} from "lucide-react";
import { toast } from "sonner";

// Field definitions for each entity type
const ENTITY_FIELDS = {
  inventory: {
    required: ["sku", "name", "quantity", "unit"],
    optional: ["type", "material_type", "reorder_point", "reorder_qty", "supplier", "cost_per_unit", "location"],
    enums: {
      type: ["raw_material", "packaging", "finished_product"],
      unit: ["kg", "L", "g", "mL", "units", "pcs"]
    }
  },
  recipe: {
    required: ["sku", "name", "category", "batch_size"],
    optional: ["production_line", "ingredients"],
    enums: {
      category: ["Bath Bombs", "Body Wash", "Scrubs", "Lotions", "Oils", "Soaps", "Candles", "Other"],
      production_line: [1, 2]
    }
  }
};

export default function BulkUploadQueue({ items, isLoading, onRefresh }) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [editItem, setEditItem] = useState(null);
  const [editData, setEditData] = useState({});
  const queryClient = useQueryClient();

  // Approve mutation - creates actual entity and deletes queue item
  const approveMutation = useMutation({
    mutationFn: async (queueItem) => {
      const { entity_type, data } = queueItem;
      
      if (entity_type === "inventory") {
        await base44.entities.Inventory.create({ ...data, type: data.type || "raw_material" });
      } else if (entity_type === "recipe") {
        await base44.entities.Recipe.create({ ...data, active: true, version: 1 });
      }
      
      await base44.entities.BulkUploadQueue.delete(queueItem.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bulkUploadQueue'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
    }
  });

  // Bulk approve
  const handleBulkApprove = async () => {
    const toApprove = items.filter(i => selectedIds.includes(i.id));
    let successCount = 0;
    
    for (const item of toApprove) {
      try {
        await approveMutation.mutateAsync(item);
        successCount++;
      } catch (err) {
        console.error(`Failed to approve item ${item.id}:`, err);
      }
    }
    
    toast.success(`Approved ${successCount} of ${toApprove.length} items`);
    setSelectedIds([]);
  };

  // Bulk delete
  const handleBulkDelete = async () => {
    const toDelete = items.filter(i => selectedIds.includes(i.id));
    
    for (const item of toDelete) {
      await base44.entities.BulkUploadQueue.delete(item.id);
    }
    
    queryClient.invalidateQueries({ queryKey: ['bulkUploadQueue'] });
    toast.success(`Deleted ${toDelete.length} items from queue`);
    setSelectedIds([]);
  };

  // Single approve
  const handleApprove = async (item) => {
    try {
      await approveMutation.mutateAsync(item);
      toast.success("Item approved and added");
    } catch (err) {
      toast.error(`Failed to approve: ${err.message}`);
    }
  };

  // Single delete
  const handleDelete = async (item) => {
    await base44.entities.BulkUploadQueue.delete(item.id);
    queryClient.invalidateQueries({ queryKey: ['bulkUploadQueue'] });
    toast.success("Item removed from queue");
  };

  // Edit item
  const handleEdit = (item) => {
    setEditItem(item);
    setEditData(item.data);
  };

  const saveEdit = async () => {
    await base44.entities.BulkUploadQueue.update(editItem.id, { data: editData });
    queryClient.invalidateQueries({ queryKey: ['bulkUploadQueue'] });
    setEditItem(null);
    toast.success("Item updated");
  };

  // Toggle selection
  const toggleSelect = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredItems.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredItems.map(i => i.id));
    }
  };

  // Filter items
  const filteredItems = items.filter(item => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    const data = item.data || {};
    return (
      data.sku?.toLowerCase().includes(searchLower) ||
      data.name?.toLowerCase().includes(searchLower) ||
      item.batch_id?.toLowerCase().includes(searchLower)
    );
  });

  // Group by batch
  const batches = filteredItems.reduce((acc, item) => {
    const batchId = item.batch_id || 'unknown';
    if (!acc[batchId]) acc[batchId] = [];
    acc[batchId].push(item);
    return acc;
  }, {});

  const getEntityIcon = (type) => {
    if (type === "inventory") return <Package className="w-4 h-4 text-blue-400" />;
    if (type === "recipe") return <Beaker className="w-4 h-4 text-orange-400" />;
    if (type === "forecasting") return <TrendingUp className="w-4 h-4 text-purple-400" />;
    return <Package className="w-4 h-4 text-zinc-400" />;
  };

  // Check if item has all required fields
  const getItemStatus = (item) => {
    const fields = ENTITY_FIELDS[item.entity_type];
    if (!fields) return { complete: true, missing: [] };
    
    const missing = fields.required.filter(f => !item.data?.[f] || item.data[f] === '');
    return { complete: missing.length === 0, missing };
  };

  if (isLoading) {
    return <div className="text-center py-8 text-zinc-500">Loading queue...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="py-4">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative flex-1 w-full md:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                placeholder="Search by SKU, name, or batch ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onRefresh} className="border-zinc-700">
                <RefreshCw className="w-4 h-4 mr-1" />
                Refresh
              </Button>
              {selectedIds.length > 0 && (
                <>
                  <Button 
                    size="sm" 
                    onClick={handleBulkApprove}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <CheckCheck className="w-4 h-4 mr-1" />
                    Approve ({selectedIds.length})
                  </Button>
                  <Button 
                    size="sm" 
                    variant="destructive"
                    onClick={handleBulkDelete}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete ({selectedIds.length})
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Queue Items */}
      {filteredItems.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="py-12 text-center">
            <Package className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
            <p className="text-zinc-400">No items in the review queue</p>
            <p className="text-zinc-600 text-sm mt-1">Upload a CSV to add items for review</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <span>{filteredItems.length} items pending review</span>
              </CardTitle>
              <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
                <Checkbox
                  checked={selectedIds.length === filteredItems.length && filteredItems.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
                Select all
              </label>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(batches).map(([batchId, batchItems]) => (
                <div key={batchId} className="border border-zinc-800 rounded-lg overflow-hidden">
                  <div className="bg-zinc-800/50 px-4 py-2 flex items-center justify-between">
                    <span className="text-xs text-zinc-400 font-mono">{batchId}</span>
                    <Badge variant="default">{batchItems.length} items</Badge>
                  </div>
                  <div className="divide-y divide-zinc-800">
                    {batchItems.map((item) => (
                      <div 
                        key={item.id} 
                        className="px-4 py-3 flex items-center gap-4 hover:bg-zinc-800/30 transition-colors"
                      >
                        <Checkbox
                          checked={selectedIds.includes(item.id)}
                          onCheckedChange={() => toggleSelect(item.id)}
                        />
                        {getEntityIcon(item.entity_type)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm text-orange-400">{item.data?.sku}</span>
                            <span className="text-zinc-300 truncate">{item.data?.name}</span>
                          </div>
                          <div className="flex gap-4 text-xs text-zinc-500 mt-1">
                            {item.data?.quantity !== undefined && (
                              <span>Qty: {item.data.quantity} {item.data.unit}</span>
                            )}
                            {item.data?.batch_size !== undefined && (
                              <span>Batch: {item.data.batch_size}</span>
                            )}
                            {item.data?.category && (
                              <span>{item.data.category}</span>
                            )}
                          </div>
                        </div>
                        {(() => {
                          const status = getItemStatus(item);
                          if (!status.complete) {
                            return (
                              <Badge variant="amber" className="flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                Incomplete
                              </Badge>
                            );
                          }
                          return (
                            <Badge variant="green" className="flex items-center gap-1">
                              <CheckCheck className="w-3 h-3" />
                              Ready
                            </Badge>
                          );
                        })()}
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => handleEdit(item)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="text-green-400 hover:text-green-300"
                            onClick={() => handleApprove(item)}
                          >
                            <CheckCheck className="w-4 h-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="text-red-400 hover:text-red-300"
                            onClick={() => handleDelete(item)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editItem} onOpenChange={() => setEditItem(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editItem && getEntityIcon(editItem.entity_type)}
              Edit {editItem?.entity_type === 'inventory' ? 'Inventory Item' : editItem?.entity_type === 'recipe' ? 'Recipe' : 'Item'}
            </DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-6">
              {/* Required Fields */}
              <div>
                <h4 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
                  Required Fields
                  <span className="text-red-400">*</span>
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  {ENTITY_FIELDS[editItem.entity_type]?.required.map(field => {
                    const enums = ENTITY_FIELDS[editItem.entity_type]?.enums?.[field];
                    const isMissing = !editData[field] || editData[field] === '';
                    
                    return (
                      <div key={field} className="space-y-1">
                        <Label className={`text-xs ${isMissing ? 'text-red-400' : 'text-zinc-400'}`}>
                          {field} {isMissing && <span className="text-red-400">*</span>}
                        </Label>
                        {enums ? (
                          <Select
                            value={String(editData[field] || '')}
                            onValueChange={(v) => setEditData(prev => ({ ...prev, [field]: v }))}
                          >
                            <SelectTrigger className={`bg-zinc-800 ${isMissing ? 'border-red-600/50' : 'border-zinc-700'}`}>
                              <SelectValue placeholder={`Select ${field}...`} />
                            </SelectTrigger>
                            <SelectContent>
                              {enums.map(opt => (
                                <SelectItem key={opt} value={String(opt)}>{opt}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            value={editData[field] || ""}
                            onChange={(e) => setEditData(prev => ({ ...prev, [field]: e.target.value }))}
                            className={`bg-zinc-800 ${isMissing ? 'border-red-600/50' : 'border-zinc-700'}`}
                            placeholder={`Enter ${field}...`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Optional Fields */}
              <div>
                <h4 className="text-sm font-medium text-zinc-300 mb-3">Optional Fields</h4>
                <div className="grid grid-cols-2 gap-4">
                  {ENTITY_FIELDS[editItem.entity_type]?.optional.map(field => {
                    const enums = ENTITY_FIELDS[editItem.entity_type]?.enums?.[field];
                    if (field === 'ingredients') return null; // Skip complex fields
                    
                    return (
                      <div key={field} className="space-y-1">
                        <Label className="text-xs text-zinc-500">{field}</Label>
                        {enums ? (
                          <Select
                            value={String(editData[field] || '')}
                            onValueChange={(v) => setEditData(prev => ({ ...prev, [field]: v }))}
                          >
                            <SelectTrigger className="bg-zinc-800 border-zinc-700">
                              <SelectValue placeholder={`Select ${field}...`} />
                            </SelectTrigger>
                            <SelectContent>
                              {enums.map(opt => (
                                <SelectItem key={opt} value={String(opt)}>{opt}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            value={editData[field] || ""}
                            onChange={(e) => setEditData(prev => ({ ...prev, [field]: e.target.value }))}
                            className="bg-zinc-800 border-zinc-700"
                            placeholder={`Enter ${field}...`}
                            type={['quantity', 'reorder_point', 'reorder_qty', 'cost_per_unit', 'batch_size', 'production_line'].includes(field) ? 'number' : 'text'}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Status indicator */}
              {(() => {
                const status = getItemStatus({ ...editItem, data: editData });
                return status.missing.length > 0 ? (
                  <div className="p-3 bg-amber-950/20 border border-amber-800/30 rounded-lg">
                    <p className="text-xs text-amber-300 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      Missing required fields: {status.missing.join(', ')}
                    </p>
                  </div>
                ) : (
                  <div className="p-3 bg-green-950/20 border border-green-800/30 rounded-lg">
                    <p className="text-xs text-green-300 flex items-center gap-2">
                      <CheckCheck className="w-4 h-4" />
                      All required fields complete - ready to approve
                    </p>
                  </div>
                );
              })()}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditItem(null)} className="border-zinc-700">
              Cancel
            </Button>
            <Button onClick={saveEdit} className="bg-orange-600 hover:bg-orange-700">
              Save Changes
            </Button>
            {editItem && getItemStatus({ ...editItem, data: editData }).complete && (
              <Button 
                onClick={async () => {
                  await saveEdit();
                  handleApprove({ ...editItem, data: editData });
                }} 
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCheck className="w-4 h-4 mr-1" />
                Save & Approve
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}