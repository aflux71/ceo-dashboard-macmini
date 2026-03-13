import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  ShoppingCart,
  Plus,
  Search,
  Download,
  Eye,
  Edit,
  Trash2,
  Send,
  Check,
  Truck,
  Package,
  AlertTriangle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Badge from "@/components/ui/Badge";
import PODocument from "@/components/purchase/PODocument";
import SuggestedReorders from "@/components/purchase/SuggestedReorders";

export default function PurchaseOrders() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [itemSearches, setItemSearches] = useState({});
  const [openItemDropdown, setOpenItemDropdown] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedPO, setSelectedPO] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [formData, setFormData] = useState({
    supplier: "",
    supplier_contact: "",
    currency: "CAD",
    order_date: new Date().toISOString().split('T')[0],
    expected_date: "",
    items: [],
    tax: 0,
    shipping: 0,
    notes: ""
  });

  const CURRENCIES = ["CAD", "USD", "EUR", "GBP"];

  const queryClient = useQueryClient();

  const { data: purchaseOrders = [], isLoading } = useQuery({
    queryKey: ['purchase_orders'],
    queryFn: () => base44.entities.PurchaseOrder.list('-created_date'),
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => base44.entities.Inventory.list(),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
  });

  const { data: appSettings = [] } = useQuery({
    queryKey: ['app_settings'],
    queryFn: () => base44.entities.AppSettings.list(),
  });

  const companyName = appSettings.find(s => s.key === 'company_name')?.value || 'neōb';
  const taxRates = (() => {
    const setting = appSettings.find(s => s.key === 'tax_rates');
    if (setting?.value) {
      try { return JSON.parse(setting.value); } catch { return []; }
    }
    return [];
  })();

  // Check URL params for new PO action
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'new') {
      openNewModal();
    }
  }, []);

  const generatePONumber = () => {
    const year = new Date().getFullYear();
    // Get all POs from current year and find the highest number
    const yearPOs = purchaseOrders.filter(po => po.po_number?.startsWith(`PO-${year}`));
    const highestNumber = yearPOs.reduce((max, po) => {
      const match = po.po_number.match(/PO-\d{4}-(\d{3})/);
      if (match) {
        const num = parseInt(match[1]);
        return num > max ? num : max;
      }
      return max;
    }, 0);
    return `PO-${year}-${String(highestNumber + 1).padStart(3, '0')}`;
  };

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const user = await base44.auth.me();
      const subtotal = data.items.reduce((sum, item) => sum + (item.total_cost || 0), 0);
      const total = subtotal + (data.tax || 0) + (data.shipping || 0);
      return base44.entities.PurchaseOrder.create({
        ...data,
        po_number: generatePONumber(),
        subtotal: subtotal,
        total: total,
        created_by_name: user.full_name || user.email
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      closeModal();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => {
      const subtotal = data.items.reduce((sum, item) => sum + (item.total_cost || 0), 0);
      const total = subtotal + (data.tax || 0) + (data.shipping || 0);
      return base44.entities.PurchaseOrder.update(id, {
        ...data,
        subtotal: subtotal,
        total: total
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      closeModal();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.PurchaseOrder.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase_orders'] })
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }) => {
      await base44.entities.PurchaseOrder.update(id, {
        status,
        ...(status === 'received' ? { received_date: new Date().toISOString().split('T')[0] } : {})
      });

      // When marking as received, update inventory quantities
      if (status === 'received') {
        const po = purchaseOrders.find(p => p.id === id);
        if (po?.items?.length) {
          for (const item of po.items) {
            // Find matching inventory record by SKU
            const invItem = inventory.find(i => i.sku === item.sku || i.id === item.inventory_id);
            if (invItem) {
              const receivedQty = item.received_qty || item.quantity || 0;
              await base44.entities.Inventory.update(invItem.id, {
                quantity: (invItem.quantity || 0) + receivedQty,
                last_restock_date: new Date().toISOString().split('T')[0]
              });
            }
          }
        }
      }
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      if (status === 'received') {
        queryClient.invalidateQueries({ queryKey: ['inventory'] });
      }
    }
  });

  const openNewModal = () => {
    setSelectedPO(null);
    setFormData({
      supplier: "",
      supplier_contact: "",
      currency: "CAD",
      order_date: new Date().toISOString().split('T')[0],
      expected_date: "",
      items: [],
      tax: 0,
      shipping: 0,
      notes: ""
    });
    setShowModal(true);
  };

  const openEditModal = (po) => {
    setSelectedPO(po);
    setFormData({
      supplier: po.supplier || "",
      supplier_contact: po.supplier_contact || "",
      currency: po.currency || "CAD",
      order_date: po.order_date || "",
      expected_date: po.expected_date || "",
      items: po.items || [],
      tax: po.tax || 0,
      shipping: po.shipping || 0,
      notes: po.notes || ""
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedPO(null);
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { sku: "", name: "", quantity: 1, unit: "", unit_cost: 0, total_cost: 0 }]
    });
  };

  const updateItem = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index][field] = value;
    
    // Auto-calculate total
    if (field === 'quantity' || field === 'unit_cost') {
      newItems[index].total_cost = (newItems[index].quantity || 0) * (newItems[index].unit_cost || 0);
    }
    
    // Auto-fill from inventory
    if (field === 'inventory_id') {
      const inv = inventory.find(i => i.id === value);
      if (inv) {
        newItems[index].sku = inv.sku;
        newItems[index].name = inv.name;
        newItems[index].unit = inv.unit;
        newItems[index].unit_cost = inv.cost_per_unit || 0;
        newItems[index].quantity = inv.reorder_qty || 1;
        newItems[index].total_cost = (inv.reorder_qty || 1) * (inv.cost_per_unit || 0);
      }
    }
    
    setFormData({ ...formData, items: newItems });
  };

  const removeItem = (index) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index)
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (selectedPO) {
      updateMutation.mutate({ id: selectedPO.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const addSuggestedItems = (items) => {
    setFormData({
      ...formData,
      items: [...formData.items, ...items.map(item => ({
        inventory_id: item.id,
        sku: item.sku,
        name: item.name,
        quantity: item.orderQty || item.reorder_qty || item.reorder_point || 10,
        unit: item.unit,
        unit_cost: item.cost_per_unit || 0,
        total_cost: (item.orderQty || item.reorder_qty || item.reorder_point || 10) * (item.cost_per_unit || 0)
      }))]
    });
    setShowSuggestions(false);
  };

  const createPOFromSuggestions = (data) => {
    const { supplier, supplierInfo, items } = data;
    
    // Calculate expected delivery based on lead time
    const expectedDate = new Date();
    if (supplierInfo?.lead_time_days) {
      expectedDate.setDate(expectedDate.getDate() + supplierInfo.lead_time_days);
    } else {
      expectedDate.setDate(expectedDate.getDate() + 14); // Default 2 weeks
    }

    setFormData({
      supplier: supplier,
      supplier_contact: supplierInfo?.email || "",
      order_date: new Date().toISOString().split('T')[0],
      expected_date: expectedDate.toISOString().split('T')[0],
      items: items.map(item => ({
        inventory_id: item.id,
        sku: item.sku,
        name: item.name,
        quantity: item.orderQty || item.reorder_qty || item.reorder_point || 10,
        unit: item.unit,
        unit_cost: item.cost_per_unit || 0,
        total_cost: (item.orderQty || item.reorder_qty || item.reorder_point || 10) * (item.cost_per_unit || 0)
      })),
      notes: `Auto-generated from low stock alerts. Lead time: ${supplierInfo?.lead_time_days || 14} days.`
    });
    setShowSuggestions(false);
    setShowModal(true);
  };

  const filtered = purchaseOrders.filter(po => {
    const matchesSearch = !search || 
      po.po_number?.toLowerCase().includes(search.toLowerCase()) ||
      po.supplier?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || po.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status) => {
    const badges = {
      draft: { variant: 'default', icon: Edit },
      submitted: { variant: 'amber', icon: Send },
      confirmed: { variant: 'blue', icon: Check },
      shipped: { variant: 'cyan', icon: Truck },
      received: { variant: 'green', icon: Package },
      cancelled: { variant: 'red', icon: AlertTriangle }
    };
    const config = badges[status] || badges.draft;
    const Icon = config.icon;
    return <Badge variant={config.variant}><Icon className="w-3 h-3 mr-1" />{status}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Purchase Orders</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Create and manage purchase orders with suggested reorder points
          </p>
        </div>
        <Button onClick={openNewModal} className="bg-orange-500 hover:bg-orange-600 text-white">
          <Plus className="w-4 h-4 mr-2" />
          New Purchase Order
        </Button>
      </div>

      {/* Filters & Quick Actions */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                placeholder="Search by PO number or supplier..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-zinc-800 border-zinc-700 text-zinc-100"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-48 bg-zinc-800 border-zinc-700 text-zinc-100">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="shipped">Shipped</SelectItem>
                <SelectItem value="received">Received</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Button 
              variant="outline" 
              onClick={() => setShowSuggestions(true)}
              className="relative"
            >
              <AlertTriangle className="w-4 h-4 mr-2 text-amber-500" />
              Low Stock
              {inventory.filter(i => i.reorder_point && i.quantity <= i.reorder_point).length > 0 && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">
                  {inventory.filter(i => i.reorder_point && i.quantity <= i.reorder_point).length}
                </span>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* PO Table */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-800/50">
                  <th className="text-left p-4 text-xs font-semibold text-zinc-400 uppercase">PO Number</th>
                  <th className="text-left p-4 text-xs font-semibold text-zinc-400 uppercase">Supplier</th>
                  <th className="text-left p-4 text-xs font-semibold text-zinc-400 uppercase">Status</th>
                  <th className="text-center p-4 text-xs font-semibold text-zinc-400 uppercase">Items</th>
                  <th className="text-right p-4 text-xs font-semibold text-zinc-400 uppercase">Total</th>
                  <th className="text-left p-4 text-xs font-semibold text-zinc-400 uppercase">Expected</th>
                  <th className="text-right p-4 text-xs font-semibold text-zinc-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-zinc-500">Loading...</td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-zinc-500">No purchase orders found</td>
                  </tr>
                ) : (
                  filtered.map((po) => (
                    <tr key={po.id} className="border-b border-zinc-800 hover:bg-zinc-800/30">
                      <td className="p-4">
                        <span className="font-mono text-sm font-semibold text-orange-400">
                          {po.po_number}
                        </span>
                      </td>
                      <td className="p-4 text-zinc-200">{po.supplier}</td>
                      <td className="p-4">{getStatusBadge(po.status)}</td>
                      <td className="p-4 text-center text-zinc-400">{po.items?.length || 0}</td>
                      <td className="p-4 text-right font-semibold text-zinc-200">
                        {po.currency || 'CAD'} {po.total?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}
                      </td>
                      <td className="p-4 text-zinc-400">
                        {po.expected_date ? new Date(po.expected_date).toLocaleDateString() : '-'}
                      </td>
                      <td className="p-4">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { setSelectedPO(po); setShowViewModal(true); }}
                            className="text-zinc-400 hover:text-zinc-100"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {po.status === 'draft' && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openEditModal(po)}
                                className="text-zinc-400 hover:text-zinc-100"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => updateStatusMutation.mutate({ id: po.id, status: 'submitted' })}
                                className="text-amber-500 hover:text-amber-400"
                              >
                                <Send className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          {po.status === 'submitted' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => updateStatusMutation.mutate({ id: po.id, status: 'confirmed' })}
                              className="text-blue-500 hover:text-blue-400"
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                          )}
                          {po.status === 'confirmed' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => updateStatusMutation.mutate({ id: po.id, status: 'shipped' })}
                              className="text-cyan-500 hover:text-cyan-400"
                            >
                              <Truck className="w-4 h-4" />
                            </Button>
                          )}
                          {po.status === 'shipped' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => updateStatusMutation.mutate({ id: po.id, status: 'received' })}
                              className="text-green-500 hover:text-green-400"
                            >
                              <Package className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit PO Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedPO ? 'Edit Purchase Order' : 'New Purchase Order'}</DialogTitle>
          </DialogHeader>
          {openItemDropdown !== null && (
            <div className="fixed inset-0 z-40" onClick={() => setOpenItemDropdown(null)} />
          )}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Supplier</Label>
                <Select 
                  value={formData.supplier} 
                  onValueChange={(v) => {
                    const sup = suppliers.find(s => s.name === v);
                    setFormData({
                      ...formData, 
                      supplier: v,
                      supplier_contact: sup?.email || ""
                    });
                  }}
                >
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
                <Label>Contact Email</Label>
                <Input
                  value={formData.supplier_contact}
                  onChange={(e) => setFormData({...formData, supplier_contact: e.target.value})}
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
                <Label>Order Date</Label>
                <Input
                  type="date"
                  value={formData.order_date}
                  onChange={(e) => setFormData({...formData, order_date: e.target.value})}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
              <div className="space-y-2">
                <Label>Expected Delivery</Label>
                <Input
                  type="date"
                  value={formData.expected_date}
                  onChange={(e) => setFormData({...formData, expected_date: e.target.value})}
                  className="bg-zinc-800 border-zinc-700"
                />
                {formData.supplier && suppliers.find(s => s.name === formData.supplier)?.lead_time_days && (
                  <p className="text-xs text-zinc-500">
                    Typical lead time: {suppliers.find(s => s.name === formData.supplier).lead_time_days} days
                  </p>
                )}
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="text-base">Line Items</Label>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowSuggestions(true)}>
                    <AlertTriangle className="w-4 h-4 mr-1 text-amber-500" /> 
                    Suggested Items
                    {inventory.filter(i => i.reorder_point && i.quantity <= i.reorder_point).length > 0 && (
                      <span className="ml-2 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">
                        {inventory.filter(i => i.reorder_point && i.quantity <= i.reorder_point).length}
                      </span>
                    )}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={addItem}>
                    <Plus className="w-4 h-4 mr-1" /> Add Item
                  </Button>
                </div>
              </div>
              
              <div className="space-y-2">
              {formData.items.map((item, idx) => {
                const q = (itemSearches[idx] ?? "").toLowerCase();
                const filtered = q
                  ? inventory.filter(inv =>
                      inv.sku?.toLowerCase().includes(q) ||
                      inv.name?.toLowerCase().includes(q) ||
                      inv.supplier_sku?.toLowerCase().includes(q)
                    )
                  : inventory;

                return (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end p-3 bg-zinc-800/50 rounded-lg">
                  <div className="col-span-4 relative">
                    <Label className="text-xs">Item</Label>
                    <div
                      className="flex items-center bg-zinc-800 border border-zinc-700 rounded-md px-3 h-9 cursor-pointer"
                      onClick={() => setOpenItemDropdown(openItemDropdown === idx ? null : idx)}
                    >
                      <span className={`flex-1 truncate text-sm ${item.name ? "text-zinc-100" : "text-zinc-500"}`}>
                        {item.name ? `${item.sku} - ${item.name}` : "Select item"}
                      </span>
                      <Search className="w-3.5 h-3.5 text-zinc-500 ml-2 flex-shrink-0" />
                    </div>
                    {openItemDropdown === idx && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
                        <div className="p-2 border-b border-zinc-700">
                          <Input
                            autoFocus
                            value={itemSearches[idx] ?? ""}
                            onChange={(e) => setItemSearches(prev => ({ ...prev, [idx]: e.target.value }))}
                            placeholder="Search SKU or name…"
                            className="bg-zinc-900 border-zinc-600 text-zinc-100 h-8 text-sm"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div className="max-h-52 overflow-y-auto">
                          {filtered.length === 0 ? (
                            <p className="text-xs text-zinc-500 text-center py-3">No items found</p>
                          ) : filtered.map(inv => (
                            <button
                              key={inv.id}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-700 transition-colors"
                              onClick={() => {
                                updateItem(idx, 'inventory_id', inv.id);
                                setOpenItemDropdown(null);
                                setItemSearches(prev => ({ ...prev, [idx]: "" }));
                              }}
                            >
                              <span className="text-orange-400 font-mono text-xs">{inv.sku}</span>
                              <span className="text-zinc-300 ml-2">{inv.name}</span>
                              {inv.supplier && <span className="text-zinc-500 text-xs ml-1">· {inv.supplier}</span>}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Quantity</Label>
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                        className="bg-zinc-800 border-zinc-700"
                      />
                    </div>
                    <div className="col-span-1">
                      <Label className="text-xs">Unit</Label>
                      <Input
                        value={item.unit}
                        readOnly
                        className="bg-zinc-800 border-zinc-700 text-zinc-500"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Unit Cost</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.unit_cost}
                        onChange={(e) => updateItem(idx, 'unit_cost', parseFloat(e.target.value) || 0)}
                        className="bg-zinc-800 border-zinc-700"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Total</Label>
                      <Input
                        value={`$${item.total_cost?.toFixed(2) || '0.00'}`}
                        readOnly
                        className="bg-zinc-800 border-zinc-700 text-zinc-400"
                      />
                    </div>
                    <div className="col-span-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem(idx)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
                })}
                {formData.items.length === 0 && (
                  <p className="text-center text-zinc-500 py-4">No items added yet</p>
                )}
              </div>

              {/* Totals */}
              <div className="pt-4 border-t border-zinc-700 space-y-3">
                <div className="flex justify-end items-center gap-4">
                  <span className="text-zinc-400">Subtotal:</span>
                  <span className="text-lg font-semibold text-zinc-200 w-32 text-right">
                    {formData.currency} {formData.items.reduce((sum, item) => sum + (item.total_cost || 0), 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-end items-center gap-4">
                  <Label className="text-zinc-400">Tax:</Label>
                  <div className="flex gap-2 items-center">
                    {taxRates.length > 0 && (
                      <Select
                        value=""
                        onValueChange={(v) => {
                          const subtotal = formData.items.reduce((sum, item) => sum + (item.total_cost || 0), 0);
                          const taxAmount = subtotal * (parseFloat(v) / 100);
                          setFormData({...formData, tax: Math.round(taxAmount * 100) / 100});
                        }}
                      >
                        <SelectTrigger className="bg-zinc-800 border-zinc-700 w-24">
                          <SelectValue placeholder="Rate" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">0%</SelectItem>
                          {taxRates.map(rate => (
                            <SelectItem key={rate.value} value={String(rate.value)}>{rate.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.tax}
                      onChange={(e) => setFormData({...formData, tax: parseFloat(e.target.value) || 0})}
                      className="bg-zinc-800 border-zinc-700 w-32 text-right"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="flex justify-end items-center gap-4">
                  <Label className="text-zinc-400">Shipping:</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.shipping}
                    onChange={(e) => setFormData({...formData, shipping: parseFloat(e.target.value) || 0})}
                    className="bg-zinc-800 border-zinc-700 w-32 text-right"
                    placeholder="0.00"
                  />
                </div>
                <div className="flex justify-end items-center gap-4 pt-2 border-t border-zinc-700">
                  <span className="text-zinc-200 font-semibold">Total:</span>
                  <span className="text-xl font-bold text-orange-400 w-32 text-right">
                    {formData.currency} {(formData.items.reduce((sum, item) => sum + (item.total_cost || 0), 0) + (formData.tax || 0) + (formData.shipping || 0)).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
              <Button type="submit" className="bg-orange-500 hover:bg-orange-600" disabled={formData.items.length === 0}>
                {selectedPO ? 'Update' : 'Create'} PO
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View PO Modal */}
      <Dialog open={showViewModal} onOpenChange={setShowViewModal}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Purchase Order - {selectedPO?.po_number}</DialogTitle>
          </DialogHeader>
          {selectedPO && (
            <PODocument 
              po={selectedPO}
              companyName={companyName}
              onEdit={() => {
                setShowViewModal(false);
                openEditModal(selectedPO);
              }}
              onDelete={() => {
                if (confirm('Are you sure you want to delete this purchase order?')) {
                  deleteMutation.mutate(selectedPO.id);
                  setShowViewModal(false);
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Suggested Reorders Modal */}
      <Dialog open={showSuggestions} onOpenChange={setShowSuggestions}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Suggested Reorders - Low Stock Items</DialogTitle>
          </DialogHeader>
          <SuggestedReorders 
            inventory={inventory} 
            suppliers={suppliers}
            onAdd={addSuggestedItems}
            onCreatePO={createPOFromSuggestions}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}