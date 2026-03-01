import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Plus, Minus, Trash2, Tag, Send, LogOut } from "lucide-react";
import { toast } from "sonner";

const REASONS = [
  { value: "production", label: "Production" },
  { value: "damaged", label: "Damaged" },
  { value: "sample", label: "Sample" },
  { value: "adjustment", label: "Adjustment" },
  { value: "other", label: "Other" },
];

export default function LabelUsage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [usageList, setUsageList] = useState([]);
  const [globalReason, setGlobalReason] = useState("production");
  const [globalNotes, setGlobalNotes] = useState("");

  const { data: labels = [], isLoading } = useQuery({
    queryKey: ["labels"],
    queryFn: () => base44.entities.Label.list(),
  });

  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  const submitUsageMutation = useMutation({
    mutationFn: async (usageItems) => {
      const results = [];
      for (const item of usageItems) {
        const label = labels.find((l) => l.id === item.label_id);
        if (!label) continue;

        const newQty = Math.max(0, label.current_quantity - item.quantity);

        await base44.entities.Label.update(item.label_id, {
          current_quantity: newQty,
        });

        const usageRecord = await base44.entities.LabelUsage.create({
          label_id: item.label_id,
          label_name: item.label_name,
          label_sku: item.label_sku,
          quantity_deducted: item.quantity,
          reason: item.reason,
          notes: item.notes,
          deducted_by: user?.full_name || user?.email || "Unknown",
        });
        results.push(usageRecord);
      }
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["labels"] });
      toast.success("Label usage recorded successfully");
      setUsageList([]);
      setGlobalNotes("");
    },
    onError: (error) => {
      toast.error("Failed to record usage: " + error.message);
    },
  });

  const filteredLabels = labels.filter(
    (label) =>
      label.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      label.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      label.product_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const addToList = (label) => {
    const existing = usageList.find((item) => item.label_id === label.id);
    if (existing) {
      setUsageList(
        usageList.map((item) =>
          item.label_id === label.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      setUsageList([
        ...usageList,
        {
          label_id: label.id,
          label_name: label.name,
          label_sku: label.sku,
          current_qty: label.current_quantity,
          quantity: 1,
          reason: globalReason,
          notes: "",
        },
      ]);
    }
  };

  const updateQuantity = (labelId, newQty) => {
    if (newQty < 1) {
      removeFromList(labelId);
      return;
    }
    setUsageList(
      usageList.map((item) =>
        item.label_id === labelId ? { ...item, quantity: newQty } : item
      )
    );
  };

  const updateReason = (labelId, reason) => {
    setUsageList(
      usageList.map((item) =>
        item.label_id === labelId ? { ...item, reason } : item
      )
    );
  };

  const removeFromList = (labelId) => {
    setUsageList(usageList.filter((item) => item.label_id !== labelId));
  };

  const handleSubmit = () => {
    if (usageList.length === 0) {
      toast.error("Please add labels to the list first");
      return;
    }

    const itemsWithNotes = usageList.map((item) => ({
      ...item,
      notes: item.notes || globalNotes,
    }));

    submitUsageMutation.mutate(itemsWithNotes);
  };

  const totalDeductions = usageList.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Label Usage</h1>
          <p className="text-zinc-400">Record label deductions from inventory</p>
        </div>
        <Button
          variant="outline"
          className="border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
          onClick={() => base44.auth.logout()}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Logout
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Label Selection Panel */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <Tag className="w-5 h-5 text-orange-400" />
              Available Labels
            </CardTitle>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                placeholder="Search labels by name, SKU, or product..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-zinc-800 border-zinc-700 text-white"
              />
            </div>
          </CardHeader>
          <CardContent className="max-h-[500px] overflow-y-auto">
            {isLoading ? (
              <div className="text-center py-8 text-zinc-500">Loading labels...</div>
            ) : filteredLabels.length === 0 ? (
              <div className="text-center py-8 text-zinc-500">
                {searchTerm ? "No labels match your search" : "No labels found"}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredLabels.map((label) => {
                  const inList = usageList.find((item) => item.label_id === label.id);
                  return (
                    <div
                      key={label.id}
                      className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                        inList
                          ? "bg-orange-500/10 border-orange-500/30"
                          : "bg-zinc-800/50 border-zinc-700 hover:border-zinc-600"
                      }`}
                      onClick={() => addToList(label)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-white">{label.name}</p>
                          <p className="text-sm text-zinc-400">
                            SKU: {label.sku} • Product: {label.product_name || "N/A"}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className={`text-sm font-medium ${
                              label.current_quantity <= (label.reorder_point || 0)
                                ? "text-amber-400"
                                : "text-green-400"
                            }`}>
                              {label.current_quantity} in stock
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-orange-400 hover:text-orange-300 hover:bg-orange-500/20"
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      {inList && (
                        <p className="text-xs text-orange-400 mt-1">
                          Added: {inList.quantity} to deduct
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Usage List Panel */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-white">
                Usage List ({usageList.length} items)
              </CardTitle>
              {usageList.length > 0 && (
                <span className="text-sm text-orange-400 font-medium">
                  Total: {totalDeductions} labels
                </span>
              )}
            </div>
            <div className="flex gap-2 mt-2">
              <Select value={globalReason} onValueChange={setGlobalReason}>
                <SelectTrigger className="w-[180px] bg-zinc-800 border-zinc-700">
                  <SelectValue placeholder="Default reason" />
                </SelectTrigger>
                <SelectContent>
                  {REASONS.map((reason) => (
                    <SelectItem key={reason.value} value={reason.value}>
                      {reason.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Global notes (optional)"
                value={globalNotes}
                onChange={(e) => setGlobalNotes(e.target.value)}
                className="flex-1 bg-zinc-800 border-zinc-700 text-white"
              />
            </div>
          </CardHeader>
          <CardContent>
            {usageList.length === 0 ? (
              <div className="text-center py-12 text-zinc-500">
                <Tag className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Click on labels to add them to the list</p>
              </div>
            ) : (
              <div className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800">
                      <TableHead className="text-zinc-400">Label</TableHead>
                      <TableHead className="text-zinc-400 text-center">Qty</TableHead>
                      <TableHead className="text-zinc-400">Reason</TableHead>
                      <TableHead className="text-zinc-400 w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usageList.map((item) => (
                      <TableRow key={item.label_id} className="border-zinc-800">
                        <TableCell>
                          <div>
                            <p className="font-medium text-white">{item.label_name}</p>
                            <p className="text-xs text-zinc-500">
                              Stock: {item.current_qty} → {Math.max(0, item.current_qty - item.quantity)}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => updateQuantity(item.label_id, item.quantity - 1)}
                            >
                              <Minus className="w-3 h-3" />
                            </Button>
                            <Input
                              type="number"
                              value={item.quantity}
                              onChange={(e) =>
                                updateQuantity(item.label_id, parseInt(e.target.value) || 0)
                              }
                              className="w-16 h-7 text-center bg-zinc-800 border-zinc-700"
                              min={1}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => updateQuantity(item.label_id, item.quantity + 1)}
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={item.reason}
                            onValueChange={(value) => updateReason(item.label_id, value)}
                          >
                            <SelectTrigger className="h-8 bg-zinc-800 border-zinc-700 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {REASONS.map((reason) => (
                                <SelectItem key={reason.value} value={reason.value}>
                                  {reason.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/20"
                            onClick={() => removeFromList(item.label_id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <div className="flex justify-end pt-4 border-t border-zinc-800">
                  <Button
                    onClick={handleSubmit}
                    disabled={submitUsageMutation.isPending}
                    className="bg-orange-500 hover:bg-orange-600 text-white gap-2"
                  >
                    <Send className="w-4 h-4" />
                    {submitUsageMutation.isPending
                      ? "Recording..."
                      : `Record Usage (${totalDeductions} labels)`}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}