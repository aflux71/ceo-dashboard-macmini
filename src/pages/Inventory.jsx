import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Package,
  Search,
  Plus,
  AlertTriangle,
  Filter,
  Download,
  Edit,
  Trash2,
  Copy,
  Link2,
  Layers,
  Factory,
  Barcode as BarcodeIcon
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Badge from "@/components/ui/Badge";
import LotNumbersDialog from "@/components/inventory/LotNumbersDialog";
import BarcodePrintDialog from "@/components/inventory/BarcodePrintDialog";
import PhotoCaptureMode from "@/components/inventory/PhotoCaptureMode";
import { Camera } from "lucide-react";

const DEFAULT_UNITS = ["units", "Cases", "L", "ml", "Kg", "gram"];
const DEFAULT_INVENTORY_TYPES = [
  { value: "raw_material", label: "Raw Material", color: "orange" },
  { value: "packaging", label: "Packaging", color: "blue" },
  { value: "finished_product", label: "Finished Product", color: "green" }
];

export default function Inventory() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all"); // all | low_stock | in_stock
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [materialTypeFilter, setMaterialTypeFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [formData, setFormData] = useState({
    sku: "",
    name: "",
    type: "raw_material",
    material_type: "",
    quantity: 0,
    unit: "",
    reorder_point: 0,
    reorder_qty: 0,
    supplier: "",
    supplier_sku: "",
    cost_per_unit: 0,
    currency: "CAD",
    lead_time_days: 0,
    location: "",
    notes: "",
    paired_item_sku: "",
    paired_item_id: "",
    paired_item_name: "",
    paired_qty: 1
  });
  const [pairedItemSearch, setPairedItemSearch] = useState("");
  const [showLotDialog, setShowLotDialog] = useState(false);
  const [selectedItemForLots, setSelectedItemForLots] = useState(null);
  const [dismissedDuplicates, setDismissedDuplicates] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('dismissedDuplicates') || '[]');
    } catch { return []; }
  });
  const [showAllDuplicates, setShowAllDuplicates] = useState(false);
  const [showLowStockList, setShowLowStockList] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState(null);
  const [showPhotoCaptureMode, setShowPhotoCaptureMode] = useState(false);
  const [barcodeItem, setBarcodeItem] = useState(null);
  const [pushToProdItem, setPushToProdItem] = useState(null);
  const [pushQty, setPushQty] = useState(0);
  const [pushNotes, setPushNotes] = useState("");
  const [isPushing, setIsPushing] = useState(false);

  const CURRENCIES = ["CAD", "USD", "EUR", "GBP"];

  const MATERIAL_TYPES = [
    "Oil",
    "Butter",
    "Fragrance",
    "Essential Oil",
    "Color/Dye",
    "Additive",
    "Preservative",
    "Emulsifier",
    "Wax",
    "Clay",
    "Salt",
    "Sugar",
    "Botanical",
    "Powder",
    "Other"
  ];

  const queryClient = useQueryClient();

  // Fetch custom settings (units and types)
  const { data: inventorySettings } = useQuery({
    queryKey: ['settings', 'inventory_config'],
    queryFn: async () => {
      const allSettings = await base44.entities.AppSettings.list();
      return {
        units: allSettings.find(s => s.key === 'measurement_units'),
        types: allSettings.find(s => s.key === 'inventory_types')
      };
    }
  });

  const UNITS = React.useMemo(() => {
    if (inventorySettings?.units?.value) {
      try {
        const parsed = JSON.parse(inventorySettings.units.value);
        return Array.isArray(parsed) ? parsed : DEFAULT_UNITS;
      } catch {
        return DEFAULT_UNITS;
      }
    }
    return DEFAULT_UNITS;
  }, [inventorySettings]);

  const INVENTORY_TYPES = React.useMemo(() => {
    if (inventorySettings?.types?.value) {
      try {
        const parsed = JSON.parse(inventorySettings.types.value);
        return Array.isArray(parsed) ? parsed : DEFAULT_INVENTORY_TYPES;
      } catch {
        return DEFAULT_INVENTORY_TYPES;
      }
    }
    return DEFAULT_INVENTORY_TYPES;
  }, [inventorySettings]);

  const { data: inventory = [], isLoading } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => base44.entities.Inventory.list(),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      // Generate SKU at submission time to avoid conflicts
      if (!editItem) {
        const currentInventory = await base44.entities.Inventory.list();
        const rmPattern = /^RM-(\d+)$/i;
        let maxNum = 0;
        currentInventory.forEach(item => {
          const match = item.sku?.match(rmPattern);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) maxNum = num;
          }
        });
        data.sku = `RM-${String(maxNum + 1).padStart(3, '0')}`;
      }
      return base44.entities.Inventory.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      closeModal();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Inventory.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      closeModal();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Inventory.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inventory'] })
  });

  // Generate next SKU in RM-xxx sequence
  const generateNextSKU = () => {
    const rmPattern = /^RM-(\d+)$/i;
    let maxNum = 0;
    
    inventory.forEach(item => {
      const match = item.sku?.match(rmPattern);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    });
    
    const nextNum = maxNum + 1;
    return `RM-${String(nextNum).padStart(3, '0')}`;
  };

  // Find paired item by SKU
  const findPairedItem = (sku) => {
    if (!sku) return null;
    return inventory.find(item => item.sku?.toLowerCase() === sku.toLowerCase());
  };

  // Handle paired item SKU change
  const handlePairedSkuChange = (sku) => {
    setPairedItemSearch(sku);
    const found = findPairedItem(sku);
    if (found) {
      setFormData(prev => ({
        ...prev,
        paired_item_sku: found.sku,
        paired_item_id: found.id,
        paired_item_name: found.name
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        paired_item_sku: sku,
        paired_item_id: "",
        paired_item_name: ""
      }));
    }
  };

  // Clear paired item
  const clearPairedItem = () => {
    setPairedItemSearch("");
    setFormData(prev => ({
      ...prev,
      paired_item_sku: "",
      paired_item_id: "",
      paired_item_name: "",
      paired_qty: 1
    }));
  };

  const openModal = (item = null) => {
    if (item) {
      setEditItem(item);
      setFormData({
        sku: item.sku || "",
        name: item.name || "",
        type: item.type || "raw_material",
        material_type: item.material_type || "",
        quantity: item.quantity || 0,
        unit: item.unit || "",
        reorder_point: item.reorder_point || 0,
        reorder_qty: item.reorder_qty || 0,
        supplier: item.supplier || "",
        supplier_sku: item.supplier_sku || "",
        cost_per_unit: item.cost_per_unit || 0,
        currency: item.currency || "CAD",
        lead_time_days: item.lead_time_days || 0,
        location: item.location || "",
        notes: item.notes || "",
        paired_item_sku: item.paired_item_sku || "",
        paired_item_id: item.paired_item_id || "",
        paired_item_name: item.paired_item_name || "",
        paired_qty: item.paired_qty || 1
      });
      setPairedItemSearch(item.paired_item_sku || "");
    } else {
      setEditItem(null);
      setFormData({
        sku: "(auto-generated)",
        name: "",
        type: "raw_material",
        material_type: "",
        quantity: 0,
        unit: "",
        reorder_point: 0,
        reorder_qty: 0,
        supplier: "",
        supplier_sku: "",
        cost_per_unit: 0,
        currency: "CAD",
        lead_time_days: 0,
        location: "",
        notes: "",
        paired_item_sku: "",
        paired_item_id: "",
        paired_item_name: "",
        paired_qty: 1
      });
      setPairedItemSearch("");
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditItem(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editItem) {
      updateMutation.mutate({ id: editItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  // Reset page on filter change
  React.useEffect(() => { setCurrentPage(1); }, [search, typeFilter, statusFilter, supplierFilter, materialTypeFilter, locationFilter, pageSize]);

  const filtered = React.useMemo(() => inventory.filter(item => {
    const q = search.toLowerCase();
    const matchesSearch = !search ||
      item.name?.toLowerCase().includes(q) ||
      item.sku?.toLowerCase().includes(q) ||
      item.supplier?.toLowerCase().includes(q) ||
      item.location?.toLowerCase().includes(q);
    const matchesType = typeFilter === "all" || item.type === typeFilter;
    const isLow = item.reorder_point && item.quantity <= item.reorder_point;
    const matchesStatus = statusFilter === "all" || (statusFilter === "low_stock" ? isLow : !isLow);
    const matchesSupplier = supplierFilter === "all" || item.supplier === supplierFilter;
    const matchesMaterialType = materialTypeFilter === "all" || item.material_type === materialTypeFilter;
    const matchesLocation = locationFilter === "all" || item.location === locationFilter;
    return matchesSearch && matchesType && matchesStatus && matchesSupplier && matchesMaterialType && matchesLocation;
  }), [inventory, search, typeFilter, statusFilter, supplierFilter, materialTypeFilter, locationFilter]);

  const totalPages = pageSize === -1 ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = pageSize === -1 ? filtered : filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Unique values for filter dropdowns
  const uniqueSuppliers = React.useMemo(() => [...new Set(inventory.map(i => i.supplier).filter(Boolean))].sort(), [inventory]);
  const uniqueMaterialTypes = React.useMemo(() => [...new Set(inventory.map(i => i.material_type).filter(Boolean))].sort(), [inventory]);
  const uniqueLocations = React.useMemo(() => [...new Set(inventory.map(i => i.location).filter(Boolean))].sort(), [inventory]);

  const lowStock = filtered.filter(i => i.reorder_point && i.quantity <= i.reorder_point);

  // Detect potential duplicates — group by SKU, one entry per duplicate SKU
  const findDuplicates = () => {
    const skuGroups = {};
    const nameGroups = {};
    const normalize = (str) => str?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';

    inventory.forEach((item) => {
      const skuKey = normalize(item.sku);
      if (skuKey) {
        if (!skuGroups[skuKey]) skuGroups[skuKey] = [];
        skuGroups[skuKey].push(item);
      }
      const nameKey = normalize(item.name);
      if (nameKey && nameKey.length >= 12) {
        const typeNameKey = `${item.type}||${nameKey}`;
        if (!nameGroups[typeNameKey]) nameGroups[typeNameKey] = [];
        nameGroups[typeNameKey].push(item);
      }
    });

    const duplicates = [];

    // Same SKU across multiple records
    Object.values(skuGroups).forEach((group) => {
      if (group.length >= 2) {
        duplicates.push({ items: [group[0], group[1]], count: group.length, reason: 'Same SKU' });
      }
    });

    // Same normalized name (different SKUs)
    Object.values(nameGroups).forEach((group) => {
      if (group.length >= 2) {
        const uniqueSkus = new Set(group.map(i => normalize(i.sku)));
        if (uniqueSkus.size >= 2) {
          duplicates.push({ items: [group[0], group[1]], count: group.length, reason: 'Same name' });
        }
      }
    });

    return duplicates;
  };

  const allDuplicates = findDuplicates();
  
  // Filter out dismissed duplicates
  const getDuplicateKey = (dup) => [dup.items[0].id, dup.items[1].id].sort().join('-');
  const duplicates = allDuplicates.filter(dup => !dismissedDuplicates.includes(getDuplicateKey(dup)));
  
  const dismissDuplicate = (dup) => {
    const key = getDuplicateKey(dup);
    const newDismissed = [...dismissedDuplicates, key];
    setDismissedDuplicates(newDismissed);
    localStorage.setItem('dismissedDuplicates', JSON.stringify(newDismissed));
  };

  const handleMergeAll = async () => {
    if (!confirm(`This will merge all ${duplicates.filter(d => d.reason === 'Same SKU').length} duplicate SKU groups — combining their quantities into one record each and deleting the extras. Continue?`)) return;
    setIsMerging(true);
    setMergeResult(null);
    const res = await base44.functions.invoke('mergeInventoryDuplicates', {});
    setMergeResult(res.data);
    setIsMerging(false);
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
  };

  const getTypeColor = (type) => {
    const found = INVENTORY_TYPES.find(t => t.value === type);
    return found?.color || 'default';
  };

  const getTypeLabel = (type) => {
    const found = INVENTORY_TYPES.find(t => t.value === type);
    return found?.label || type?.replace('_', ' ') || 'Unknown';
  };

  const openLotDialog = (item) => {
    setSelectedItemForLots(item);
    setShowLotDialog(true);
  };

  const handlePushToProd = async () => {
    if (!pushToProdItem || !pushQty) return;
    setIsPushing(true);
    try {
      await base44.entities.ProductionRequest.create({
        sku: pushToProdItem.sku,
        product_name: pushToProdItem.name,
        quantity_needed: Number(pushQty),
        status: "pending",
        notes: pushNotes || undefined,
        requested_by: "Inventory",
        source: "manual"
      });
      setPushToProdItem(null);
      setPushQty(0);
      setPushNotes("");
      alert(`✓ "${pushToProdItem.name}" pushed to Production Planning`);
    } finally {
      setIsPushing(false);
    }
  };

  const exportRawMaterialsCSV = () => {
    const rawMaterials = inventory.filter(i => i.type === 'raw_material');
    const headers = ['SKU', 'Name', 'Material Type', 'Quantity', 'Unit', 'Cost Per Unit', 'Currency', 'Total Value (COG)', 'Supplier', 'Location'];
    const escape = (v) => {
      const s = (v ?? '').toString();
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = rawMaterials.map(item => {
      const qty = Number(item.quantity) || 0;
      const cost = Number(item.cost_per_unit) || 0;
      const total = qty * cost;
      return [
        item.sku, item.name, item.material_type, qty, item.unit,
        cost.toFixed(2), item.currency || 'CAD', total.toFixed(2),
        item.supplier, item.location
      ].map(escape).join(',');
    });
    const grandTotal = rawMaterials.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.cost_per_unit) || 0), 0);
    rows.push(['', '', '', '', '', '', 'TOTAL', grandTotal.toFixed(2), '', ''].map(escape).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `raw-materials-cog-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveLots = (lots, totalQty) => {
    if (!selectedItemForLots) return;
    updateMutation.mutate({
      id: selectedItemForLots.id,
      data: { lot_numbers: lots, quantity: totalQty }
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Inventory</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Manage raw materials, packaging, and finished products
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={exportRawMaterialsCSV}
            variant="outline"
            className="border-zinc-700 text-zinc-400 hover:text-zinc-100"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Raw Materials (CSV)
          </Button>
          <Button
            onClick={() => setShowPhotoCaptureMode(true)}
            variant="outline"
            className="border-zinc-700 text-zinc-400 hover:text-zinc-100"
          >
            <Camera className="w-4 h-4 mr-2" />
            Capture Photos ({inventory.filter(i => !i.component_photo).length})
          </Button>
          <Button onClick={() => openModal()} className="bg-orange-500 hover:bg-orange-600 text-white">
            <Plus className="w-4 h-4 mr-2" />
            Add Item
          </Button>
        </div>
      </div>

      {/* Low Stock Alert */}
      {lowStock.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowLowStockList(v => !v)}
            className="w-full flex items-center justify-between gap-2 text-red-400 p-4 hover:bg-red-500/5 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              <span className="font-semibold">{lowStock.length} items below reorder point</span>
            </div>
            <span className="text-xs text-red-400/70">{showLowStockList ? '▲ Hide' : '▼ Show'}</span>
          </button>
          {showLowStockList && (
            <div className="border-t border-red-500/20">
              {lowStock.map(item => (
                <div
                  key={item.id}
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-red-500/5 border-b border-red-500/10 last:border-b-0 cursor-pointer"
                  onClick={() => openModal(item)}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-orange-400">{item.sku}</span>
                    <span className="text-sm text-zinc-300">{item.name}</span>
                  </div>
                  <div className="text-xs text-right">
                    <span className="text-red-400 font-semibold">{item.quantity} {item.unit}</span>
                    <span className="text-zinc-500 ml-1">/ {item.reorder_point} {item.unit} reorder</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Merge Result Banner */}
      {mergeResult && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 flex items-center justify-between">
          <span className="text-green-400 text-sm">{mergeResult.message}</span>
          <button onClick={() => setMergeResult(null)} className="text-zinc-500 hover:text-zinc-300 ml-4">×</button>
        </div>
      )}

      {/* Duplicate Alert */}
      {duplicates.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
          <div className="flex items-center justify-between gap-2 text-amber-400 mb-2">
            <div className="flex items-center gap-2">
              <Copy className="w-5 h-5" />
              <span className="font-semibold">{duplicates.length} potential duplicate(s) detected</span>
            </div>
            {duplicates.some(d => d.reason === 'Same SKU') && (
              <Button
                size="sm"
                onClick={handleMergeAll}
                disabled={isMerging}
                className="bg-amber-500 hover:bg-amber-600 text-black text-xs h-7 px-3"
              >
                {isMerging ? 'Merging...' : 'Auto-Merge All Duplicates'}
              </Button>
            )}
          </div>
          <div className="space-y-2 mt-3">
            {(showAllDuplicates ? duplicates : duplicates.slice(0, 5)).map((dup, idx) => (
              <div 
                key={idx} 
                className="flex items-center gap-2 text-sm text-amber-300/80 bg-amber-500/5 rounded px-3 py-2 group"
              >
                <button
                  onClick={() => openModal(dup.items[0])}
                  className="font-mono text-amber-400 hover:text-amber-300 hover:underline cursor-pointer"
                >
                  {dup.items[0].sku}
                </button>
                <span className="text-zinc-500">({dup.items[0].name})</span>
                <span className="text-zinc-600">↔</span>
                <button
                  onClick={() => openModal(dup.items[1])}
                  className="font-mono text-amber-400 hover:text-amber-300 hover:underline cursor-pointer"
                >
                  {dup.items[1].sku}
                </button>
                <span className="text-zinc-500">({dup.items[1].name})</span>
                <Badge variant="amber" className="ml-auto">{dup.reason}</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => dismissDuplicate(dup)}
                  className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-300 h-6 px-2"
                >
                  ×
                </Button>
              </div>
            ))}
            {duplicates.length > 5 && !showAllDuplicates && (
              <button
                onClick={() => setShowAllDuplicates(true)}
                className="text-xs text-amber-500/70 hover:text-amber-400 cursor-pointer"
              >
                ...and {duplicates.length - 5} more
              </button>
            )}
            {showAllDuplicates && duplicates.length > 5 && (
              <button
                onClick={() => setShowAllDuplicates(false)}
                className="text-xs text-amber-500/70 hover:text-amber-400 cursor-pointer"
              >
                Show less
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col gap-3">
            {/* Row 1: Search + Type + Status */}
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  placeholder="Search name, SKU, supplier, location..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 bg-zinc-800 border-zinc-700 text-zinc-100"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full md:w-44 bg-zinc-800 border-zinc-700 text-zinc-100">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {INVENTORY_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-40 bg-zinc-800 border-zinc-700 text-zinc-100">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="in_stock">In Stock</SelectItem>
                  <SelectItem value="low_stock">Low Stock</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Row 2: Supplier + Material Type + Location + Page size */}
            <div className="flex flex-col md:flex-row gap-3 items-center">
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger className="w-full md:w-44 bg-zinc-800 border-zinc-700 text-zinc-100">
                  <SelectValue placeholder="All Suppliers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Suppliers</SelectItem>
                  {uniqueSuppliers.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(typeFilter === "all" || typeFilter === "raw_material") && (
                <Select value={materialTypeFilter} onValueChange={setMaterialTypeFilter}>
                  <SelectTrigger className="w-full md:w-44 bg-zinc-800 border-zinc-700 text-zinc-100">
                    <SelectValue placeholder="All Material Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Material Types</SelectItem>
                    {uniqueMaterialTypes.map(mt => (
                      <SelectItem key={mt} value={mt}>{mt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger className="w-full md:w-40 bg-zinc-800 border-zinc-700 text-zinc-100">
                  <SelectValue placeholder="All Locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {uniqueLocations.map(loc => (
                    <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 ml-auto shrink-0">
                <span className="text-xs text-zinc-500 whitespace-nowrap">Per page:</span>
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger className="w-24 bg-zinc-800 border-zinc-700 text-zinc-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="250">250</SelectItem>
                    <SelectItem value="-1">All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(search || typeFilter !== "all" || statusFilter !== "all" || supplierFilter !== "all" || materialTypeFilter !== "all" || locationFilter !== "all") && (
                <button
                  onClick={() => { setSearch(""); setTypeFilter("all"); setStatusFilter("all"); setSupplierFilter("all"); setMaterialTypeFilter("all"); setLocationFilter("all"); }}
                  className="text-xs text-zinc-500 hover:text-orange-400 whitespace-nowrap transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>
            {/* Results count */}
            <div className="text-xs text-zinc-500">
              Showing {filtered.length} of {inventory.length} items
              {pageSize !== -1 && filtered.length > pageSize && ` · Page ${currentPage} of ${totalPages}`}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Table */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-800/50">
                  <th className="text-left p-4 text-xs font-semibold text-zinc-400 uppercase">SKU</th>
                  <th className="text-left p-4 text-xs font-semibold text-zinc-400 uppercase">Name</th>
                  <th className="text-left p-4 text-xs font-semibold text-zinc-400 uppercase">Type</th>
                  <th className="text-right p-4 text-xs font-semibold text-zinc-400 uppercase">Quantity</th>
                  <th className="text-center p-4 text-xs font-semibold text-zinc-400 uppercase">Lots</th>
                  <th className="text-right p-4 text-xs font-semibold text-zinc-400 uppercase">Reorder Point</th>
                  <th className="text-left p-4 text-xs font-semibold text-zinc-400 uppercase">Status</th>
                  <th className="text-right p-4 text-xs font-semibold text-zinc-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-zinc-500">Loading...</td>
                  </tr>
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-zinc-500">No inventory items found</td>
                  </tr>
                ) : (
                  paginated.map((item) => {
                    const isLow = item.reorder_point && item.quantity <= item.reorder_point;
                    return (
                      <tr key={item.id} className="border-b border-zinc-800 hover:bg-zinc-800/30">
                        <td className="p-4">
                          <span className="font-mono text-sm font-semibold text-orange-400">
                            {item.sku}
                          </span>
                        </td>
                        <td className="p-4 text-zinc-200">{item.name}</td>
                        <td className="p-4">
                          <Badge variant={getTypeColor(item.type)}>
                            {getTypeLabel(item.type)}
                          </Badge>
                        </td>
                        <td className="p-4 text-right">
                          <span className={`font-semibold ${isLow ? 'text-red-400' : 'text-zinc-200'}`}>
                            {item.quantity}
                          </span>
                          <span className="text-zinc-500 ml-1">{item.unit}</span>
                        </td>
                        <td className="p-4 text-center">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openLotDialog(item)}
                            className="text-zinc-400 hover:text-orange-400"
                          >
                            <Layers className="w-4 h-4 mr-1" />
                            {item.lot_numbers?.length || 0}
                          </Button>
                        </td>
                        <td className="p-4 text-right text-zinc-400">
                          {item.reorder_point || '-'} {item.reorder_point ? item.unit : ''}
                        </td>
                        <td className="p-4">
                          {isLow ? (
                            <Badge variant="red">Low Stock</Badge>
                          ) : (
                            <Badge variant="green">In Stock</Badge>
                          )}
                        </td>
                        <td className="p-4">
                         <div className="flex justify-end gap-2">
                           {item.type === "finished_product" && (
                             <Button
                               size="sm"
                               variant="ghost"
                               onClick={() => { setPushToProdItem(item); setPushQty(0); setPushNotes(""); }}
                               className="text-zinc-400 hover:text-orange-400"
                               title="Push to Production Planning"
                             >
                               <Factory className="w-4 h-4" />
                             </Button>
                           )}
                           <Button
                             size="sm"
                             variant="ghost"
                             onClick={() => setBarcodeItem(item)}
                             className="text-zinc-400 hover:text-orange-400"
                             title="Print barcode label"
                           >
                             <BarcodeIcon className="w-4 h-4" />
                           </Button>
                           <Button
                             size="sm"
                             variant="ghost"
                             onClick={() => openModal(item)}
                             className="text-zinc-400 hover:text-zinc-100"
                           >
                             <Edit className="w-4 h-4" />
                           </Button>
                           <Button
                             size="sm"
                             variant="ghost"
                             onClick={() => {
                               if (confirm('Delete this item?')) {
                                 deleteMutation.mutate(item.id);
                               }
                             }}
                             className="text-zinc-400 hover:text-red-400"
                           >
                             <Trash2 className="w-4 h-4" />
                           </Button>
                         </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {pageSize !== -1 && totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-zinc-400">
          <span>{filtered.length} items · Page {currentPage} of {totalPages}</span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="border-zinc-700 h-8 px-2 text-xs"
            >«</Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="border-zinc-700 h-8 px-3 text-xs"
            >Prev</Button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
              const page = start + i;
              if (page > totalPages) return null;
              return (
                <Button
                  key={page}
                  variant={page === currentPage ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCurrentPage(page)}
                  className={`border-zinc-700 h-8 px-3 text-xs ${page === currentPage ? "bg-orange-500 hover:bg-orange-600 text-white border-transparent" : ""}`}
                >{page}</Button>
              );
            })}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="border-zinc-700 h-8 px-3 text-xs"
            >Next</Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="border-zinc-700 h-8 px-2 text-xs"
            >»</Button>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Edit Item' : 'Add Inventory Item'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>SKU</Label>
                <Input
                  value={formData.sku}
                  onChange={(e) => setFormData({...formData, sku: e.target.value})}
                  required
                  disabled={!editItem}
                  className="bg-zinc-800 border-zinc-700 disabled:opacity-50"
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData({...formData, type: v})}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INVENTORY_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {formData.type === "raw_material" && (
              <div className="space-y-2">
                <Label>Material Type</Label>
                <Select value={formData.material_type} onValueChange={(v) => setFormData({...formData, material_type: v})}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700">
                    <SelectValue placeholder="Select material type" />
                  </SelectTrigger>
                  <SelectContent>
                    {MATERIAL_TYPES.map((mt) => (
                      <SelectItem key={mt} value={mt}>{mt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                required
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => setFormData({...formData, quantity: parseFloat(e.target.value) || 0})}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Select value={formData.unit} onValueChange={(v) => setFormData({...formData, unit: v})}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700">
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map(u => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reorder Point</Label>
                <Input
                  type="number"
                  value={formData.reorder_point}
                  onChange={(e) => setFormData({...formData, reorder_point: parseFloat(e.target.value) || 0})}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Supplier</Label>
                <Select value={formData.supplier} onValueChange={(v) => setFormData({...formData, supplier: v})}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700">
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => (
                      <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Supplier SKU</Label>
                <Input
                  value={formData.supplier_sku}
                  onChange={(e) => setFormData({...formData, supplier_sku: e.target.value})}
                  placeholder="Supplier's part number"
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Location</Label>
                <Input
                  value={formData.location}
                  onChange={(e) => setFormData({...formData, location: e.target.value})}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
              <div className="space-y-2">
                <Label>Lead Time (days)</Label>
                <Input
                  type="number"
                  value={formData.lead_time_days}
                  onChange={(e) => setFormData({...formData, lead_time_days: parseInt(e.target.value) || 0})}
                  placeholder="Overrides supplier default"
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Cost per Unit</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.cost_per_unit}
                  onChange={(e) => setFormData({...formData, cost_per_unit: parseFloat(e.target.value) || 0})}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={formData.currency} onValueChange={(v) => setFormData({...formData, currency: v})}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reorder Qty</Label>
                <Input
                  type="number"
                  value={formData.reorder_qty}
                  onChange={(e) => setFormData({...formData, reorder_qty: parseFloat(e.target.value) || 0})}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                placeholder="Additional notes about this item"
                className="bg-zinc-800 border-zinc-700"
              />
            </div>

            {/* Paired Item Section */}
            <div className="border-t border-zinc-700 pt-4 mt-4">
              <Label className="flex items-center gap-2 mb-3">
                <Link2 className="w-4 h-4 text-blue-400" />
                Paired Item (Cap/Lid)
              </Label>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-500">Paired SKU</Label>
                  <div className="relative">
                    <Input
                      value={pairedItemSearch}
                      onChange={(e) => handlePairedSkuChange(e.target.value)}
                      placeholder="Enter SKU"
                      className="bg-zinc-800 border-zinc-700"
                    />
                    {formData.paired_item_id && (
                      <button
                        type="button"
                        onClick={clearPairedItem}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-500">Paired Item Name</Label>
                  <Input
                    value={formData.paired_item_name}
                    disabled
                    placeholder={formData.paired_item_id ? "" : "Auto-filled"}
                    className="bg-zinc-800/50 border-zinc-700 text-zinc-400"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-500">Qty per Unit</Label>
                  <Input
                    type="number"
                    min="1"
                    value={formData.paired_qty}
                    onChange={(e) => setFormData({...formData, paired_qty: parseInt(e.target.value) || 1})}
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
              </div>
              {pairedItemSearch && !formData.paired_item_id && (
                <p className="text-xs text-amber-400 mt-2">No item found with SKU "{pairedItemSearch}"</p>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
              <Button type="submit" className="bg-orange-500 hover:bg-orange-600">
                {editItem ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Lot Numbers Dialog */}
      <LotNumbersDialog
        open={showLotDialog}
        onOpenChange={setShowLotDialog}
        item={selectedItemForLots}
        onSave={handleSaveLots}
      />

      {/* Push to Production Dialog */}
      <Dialog open={!!pushToProdItem} onOpenChange={(o) => { if (!o) setPushToProdItem(null); }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Factory className="w-5 h-5 text-orange-400" />
              Push to Production
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm text-zinc-400">
              <span className="text-zinc-200 font-medium">{pushToProdItem?.name}</span>
              <span className="text-zinc-600 mx-2">·</span>
              <span className="font-mono text-zinc-500">{pushToProdItem?.sku}</span>
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">Units to Produce</Label>
              <Input
                type="number"
                min="1"
                value={pushQty || ""}
                onChange={(e) => setPushQty(e.target.value)}
                placeholder="e.g. 200"
                className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">Notes (optional)</Label>
              <Textarea
                value={pushNotes}
                onChange={(e) => setPushNotes(e.target.value)}
                placeholder="Reason or context..."
                className="bg-zinc-800 border-zinc-700 text-zinc-100 resize-none text-sm"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPushToProdItem(null)} className="border-zinc-700">Cancel</Button>
            <Button
              onClick={handlePushToProd}
              disabled={!pushQty || isPushing}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              <Factory className="w-4 h-4 mr-1" />
              {isPushing ? "Pushing..." : "Push to Planning"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Photo Capture Mode */}
      <PhotoCaptureMode
        open={showPhotoCaptureMode}
        onClose={() => setShowPhotoCaptureMode(false)}
        inventory={inventory}
      />

      {/* Barcode Print Dialog */}
      <BarcodePrintDialog
        open={!!barcodeItem}
        item={barcodeItem}
        onClose={() => setBarcodeItem(null)}
      />
    </div>
  );
}