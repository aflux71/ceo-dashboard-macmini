import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { logAuditAction } from "@/components/audit/auditLogger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  ScanBarcode, Package, CheckCircle2, AlertCircle, Search, Plus,
  ClipboardList, Loader2, ArrowUpCircle, Edit2, History, Truck
} from "lucide-react";
import { format } from "date-fns";

const today = new Date().toISOString().split("T")[0];

export default function ReceiveShipment() {
  const queryClient = useQueryClient();
  const scanInputRef = useRef(null);

  const [user, setUser] = useState(null);
  const [scanQuery, setScanQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);

  // Receive form state
  const [receiveQty, setReceiveQty] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [receivedDate, setReceivedDate] = useState(today);
  const [receiveNotes, setReceiveNotes] = useState("");
  const [scanError, setScanError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Manual adjustment state
  const [adjustDialog, setAdjustDialog] = useState(null);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
    scanInputRef.current?.focus();
  }, []);

  const { data: allInventory = [] } = useQuery({
    queryKey: ["inventory_all"],
    queryFn: () => base44.entities.Inventory.filter({ type: { $in: ["raw_material", "packaging"] } }),
  });

  const { data: recentLogs = [] } = useQuery({
    queryKey: ["receive_audit_logs"],
    queryFn: () => base44.entities.AuditLog.filter(
      { category: "inventory", action: { $in: ["shipment_received", "manual_adjustment"] } },
      "-created_date",
      50
    ),
  });

  const handleScan = (e) => {
    e.preventDefault();
    const q = scanQuery.trim().toUpperCase();
    if (!q) return;
    const matches = allInventory.filter(
      (item) =>
        item.sku?.toUpperCase() === q ||
        item.supplier_sku?.toUpperCase() === q ||
        item.name?.toUpperCase().includes(q)
    );
    if (matches.length === 1) {
      selectItem(matches[0]);
      setScanError("");
    } else if (matches.length > 1) {
      setSearchResults(matches);
      setScanError("");
      setSelectedItem(null);
    } else {
      setScanError(`No inventory item found for "${scanQuery}"`);
      setSearchResults([]);
    }
  };

  const selectItem = (item) => {
    setSelectedItem(item);
    setSearchResults([]);
    setScanQuery(item.sku);
    setReceiveQty("");
    setLotNumber("");
    setExpirationDate("");
    setReceiveNotes("");
    setSuccessMsg("");
    setScanError("");
  };

  const receiveMutation = useMutation({
    mutationFn: async () => {
      const qty = parseFloat(receiveQty);
      const newQty = (selectedItem.quantity || 0) + qty;

      // Build updated lot_numbers
      const existingLots = selectedItem.lot_numbers || [];
      let updatedLots = existingLots;
      if (lotNumber) {
        const existingLotIdx = existingLots.findIndex((l) => l.lot === lotNumber);
        if (existingLotIdx >= 0) {
          updatedLots = existingLots.map((l, i) =>
            i === existingLotIdx ? { ...l, quantity: (l.quantity || 0) + qty } : l
          );
        } else {
          updatedLots = [
            ...existingLots,
            {
              lot: lotNumber,
              quantity: qty,
              expiration_date: expirationDate || undefined,
              received_date: receivedDate,
            },
          ];
        }
      }

      await base44.entities.Inventory.update(selectedItem.id, {
        quantity: newQty,
        last_restock_date: receivedDate,
        ...(updatedLots !== existingLots ? { lot_numbers: updatedLots } : {}),
      });

      await logAuditAction({
        action: "shipment_received",
        category: "inventory",
        description: `Received ${qty} ${selectedItem.unit} of ${selectedItem.name} (SKU: ${selectedItem.sku})${lotNumber ? ` · Lot: ${lotNumber}` : ""}`,
        entityType: "Inventory",
        entityId: selectedItem.id,
        oldValue: { quantity: selectedItem.quantity },
        newValue: { quantity: newQty, lot: lotNumber || null },
        user,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory_all"] });
      queryClient.invalidateQueries({ queryKey: ["receive_audit_logs"] });
      setSuccessMsg(`✓ Added ${receiveQty} ${selectedItem.unit} to ${selectedItem.name}`);
      setReceiveQty("");
      setLotNumber("");
      setExpirationDate("");
      setReceiveNotes("");
      // refresh selected item
      base44.entities.Inventory.filter({ sku: selectedItem.sku }).then((res) => {
        if (res[0]) setSelectedItem(res[0]);
      });
    },
  });

  const adjustMutation = useMutation({
    mutationFn: async () => {
      const item = adjustDialog;
      const newQty = parseFloat(adjustQty);
      await base44.entities.Inventory.update(item.id, { quantity: newQty });
      await logAuditAction({
        action: "manual_adjustment",
        category: "inventory",
        description: `Manual stock adjustment for ${item.name} (SKU: ${item.sku}): ${item.quantity} → ${newQty}${adjustReason ? ` · Reason: ${adjustReason}` : ""}`,
        entityType: "Inventory",
        entityId: item.id,
        oldValue: { quantity: item.quantity },
        newValue: { quantity: newQty },
        user,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory_all"] });
      queryClient.invalidateQueries({ queryKey: ["receive_audit_logs"] });
      setAdjustDialog(null);
      setAdjustQty("");
      setAdjustReason("");
    },
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Truck className="w-6 h-6 text-orange-400" />
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Receive Shipment</h1>
          <p className="text-sm text-zinc-500">Scan or search a SKU to record incoming stock</p>
        </div>
      </div>

      <Tabs defaultValue="receive">
        <TabsList className="bg-zinc-800 border-zinc-700">
          <TabsTrigger value="receive" className="data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-400">
            <ScanBarcode className="w-4 h-4 mr-2" />Receive
          </TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-400">
            <History className="w-4 h-4 mr-2" />Audit Trail
          </TabsTrigger>
        </TabsList>

        {/* ── RECEIVE TAB ── */}
        <TabsContent value="receive" className="space-y-4 mt-4">
          {/* Scan bar */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-5">
              <form onSubmit={handleScan} className="flex gap-2">
                <div className="relative flex-1">
                  <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <Input
                    ref={scanInputRef}
                    value={scanQuery}
                    onChange={(e) => { setScanQuery(e.target.value); setScanError(""); setSuccessMsg(""); }}
                    placeholder="Scan barcode or type SKU / supplier SKU / name…"
                    className="pl-9 bg-zinc-800 border-zinc-700 text-zinc-100 h-11 text-base"
                    autoFocus
                  />
                </div>
                <Button type="submit" className="bg-orange-500 hover:bg-orange-600 h-11 px-6">
                  <Search className="w-4 h-4 mr-2" />Search
                </Button>
              </form>

              {scanError && (
                <div className="mt-3 flex items-center gap-2 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4" />{scanError}
                </div>
              )}
              {successMsg && (
                <div className="mt-3 flex items-center gap-2 text-green-400 text-sm">
                  <CheckCircle2 className="w-4 h-4" />{successMsg}
                </div>
              )}

              {/* Multiple matches */}
              {searchResults.length > 1 && (
                <div className="mt-3 space-y-1">
                  <p className="text-xs text-zinc-500 mb-2">{searchResults.length} matches — select one:</p>
                  {searchResults.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => selectItem(item)}
                      className="w-full text-left px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm text-zinc-200 font-medium">{item.name}</p>
                        <p className="text-xs text-zinc-500">{item.sku} · {item.supplier}</p>
                      </div>
                      <Badge variant="outline" className="text-xs border-zinc-600 text-zinc-400">{item.quantity} {item.unit}</Badge>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Receive form */}
          {selectedItem && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Item details */}
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-zinc-200 flex items-center gap-2">
                    <Package className="w-4 h-4 text-orange-400" />Item Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-zinc-500">Name</span><span className="text-zinc-200 font-medium">{selectedItem.name}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">SKU</span><span className="text-zinc-200">{selectedItem.sku}</span></div>
                  {selectedItem.supplier_sku && <div className="flex justify-between"><span className="text-zinc-500">Supplier SKU</span><span className="text-zinc-200">{selectedItem.supplier_sku}</span></div>}
                  <div className="flex justify-between"><span className="text-zinc-500">Supplier</span><span className="text-zinc-200">{selectedItem.supplier || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">Type</span><Badge variant="outline" className="text-xs border-zinc-600 text-zinc-400 capitalize">{selectedItem.type?.replace("_", " ")}</Badge></div>
                  <hr className="border-zinc-800" />
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">Current Stock</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-lg font-bold ${selectedItem.quantity <= (selectedItem.reorder_point || 0) ? "text-red-400" : "text-green-400"}`}>
                        {selectedItem.quantity?.toLocaleString()}
                      </span>
                      <span className="text-zinc-400">{selectedItem.unit}</span>
                      <button
                        onClick={() => { setAdjustDialog(selectedItem); setAdjustQty(String(selectedItem.quantity)); setAdjustReason(""); }}
                        className="p-1 hover:bg-zinc-700 rounded text-zinc-500 hover:text-orange-400"
                        title="Manual adjustment"
                      ><Edit2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  {selectedItem.reorder_point && (
                    <div className="flex justify-between"><span className="text-zinc-500">Reorder Point</span><span className="text-zinc-400">{selectedItem.reorder_point} {selectedItem.unit}</span></div>
                  )}
                </CardContent>
              </Card>

              {/* Receive form */}
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-zinc-200 flex items-center gap-2">
                    <ArrowUpCircle className="w-4 h-4 text-green-400" />Record Receipt
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-zinc-400 text-xs">Quantity Received *</Label>
                    <div className="flex gap-2 items-center">
                      <Input
                        type="number"
                        min="0.01"
                        step="any"
                        value={receiveQty}
                        onChange={(e) => setReceiveQty(e.target.value)}
                        placeholder="0"
                        className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9"
                      />
                      <span className="text-zinc-400 text-sm whitespace-nowrap">{selectedItem.unit}</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-zinc-400 text-xs">Lot Number</Label>
                    <Input value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} placeholder="e.g. LOT-2026-001" className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-zinc-400 text-xs">Expiration Date</Label>
                    <Input type="date" value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-zinc-400 text-xs">Received Date</Label>
                    <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-zinc-400 text-xs">Notes</Label>
                    <Input value={receiveNotes} onChange={(e) => setReceiveNotes(e.target.value)} placeholder="Optional" className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9" />
                  </div>
                  <Button
                    onClick={() => receiveMutation.mutate()}
                    disabled={!receiveQty || parseFloat(receiveQty) <= 0 || receiveMutation.isPending}
                    className="w-full bg-green-600 hover:bg-green-700 text-white mt-1"
                  >
                    {receiveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                    Confirm Receipt
                  </Button>
                  {receiveQty && parseFloat(receiveQty) > 0 && (
                    <p className="text-xs text-zinc-500 text-center">
                      New stock: <span className="text-zinc-300 font-medium">{((selectedItem.quantity || 0) + parseFloat(receiveQty)).toLocaleString()} {selectedItem.unit}</span>
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ── AUDIT TRAIL TAB ── */}
        <TabsContent value="history" className="mt-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-zinc-200 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-orange-400" />Recent Inventory Changes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentLogs.length === 0 ? (
                <p className="text-zinc-500 text-sm text-center py-8">No records yet.</p>
              ) : (
                <div className="space-y-2">
                  {recentLogs.map((log) => {
                    const isReceive = log.action === "shipment_received";
                    return (
                      <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg bg-zinc-800 border border-zinc-700">
                        <div className={`mt-0.5 p-1.5 rounded-md ${isReceive ? "bg-green-500/10" : "bg-amber-500/10"}`}>
                          {isReceive
                            ? <Truck className="w-3.5 h-3.5 text-green-400" />
                            : <Edit2 className="w-3.5 h-3.5 text-amber-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-zinc-200">{log.description}</p>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <span className="text-xs text-zinc-500">{log.performed_by_name}</span>
                            {log.created_date && (
                              <span className="text-xs text-zinc-600">
                                {format(new Date(log.created_date), "MMM d, yyyy · h:mm a")}
                              </span>
                            )}
                          </div>
                          {log.old_value && log.new_value && (() => {
                            try {
                              const ov = JSON.parse(log.old_value);
                              const nv = JSON.parse(log.new_value);
                              return (
                                <p className="text-xs text-zinc-500 mt-0.5">
                                  Qty: <span className="text-zinc-400">{ov.quantity}</span>
                                  {" → "}
                                  <span className="text-zinc-300 font-medium">{nv.quantity}</span>
                                </p>
                              );
                            } catch { return null; }
                          })()}
                        </div>
                        <Badge variant="outline" className={`text-xs whitespace-nowrap ${isReceive ? "border-green-700 text-green-400" : "border-amber-700 text-amber-400"}`}>
                          {isReceive ? "Received" : "Adjustment"}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Manual adjustment dialog */}
      <Dialog open={!!adjustDialog} onOpenChange={(open) => { if (!open) setAdjustDialog(null); }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-sm">
          {adjustDialog && (
            <>
              <DialogHeader><DialogTitle>Manual Stock Adjustment</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <div className="p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-sm">
                  <p className="font-medium text-zinc-200">{adjustDialog.name}</p>
                  <p className="text-zinc-500 text-xs">{adjustDialog.sku} · Current: {adjustDialog.quantity} {adjustDialog.unit}</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">New Quantity ({adjustDialog.unit}) *</Label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={adjustQty}
                    onChange={(e) => setAdjustQty(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">Reason *</Label>
                  <Input
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    placeholder="e.g. Cycle count correction, spillage…"
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAdjustDialog(null)} className="border-zinc-700">Cancel</Button>
                <Button
                  onClick={() => adjustMutation.mutate()}
                  disabled={adjustMutation.isPending || !adjustQty || !adjustReason}
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                >
                  {adjustMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Edit2 className="w-4 h-4 mr-2" />}
                  Save Adjustment
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}