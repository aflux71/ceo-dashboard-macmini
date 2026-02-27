import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import Badge from "@/components/ui/Badge";
import { Send, Search, CheckSquare, Square } from "lucide-react";

const urgencyConfig = {
  critical: { color: "red", label: "Critical" },
  event: { color: "purple", label: "Event" },
  soon: { color: "amber", label: "Soon" },
  ok: { color: "green", label: "OK" }
};

export default function PushToRunPlanner({ 
  open, 
  onOpenChange, 
  results = [], 
  workspaceId, 
  workspaceName 
}) {
  const [selected, setSelected] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const [lineFilter, setLineFilter] = useState("all");
  const queryClient = useQueryClient();

  // Filter results with orderQty > 0
  const filteredResults = results.filter(item => {
    if (item.orderQty <= 0) return false;
    const matchesSearch = !searchTerm || 
      item.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.product?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesUrgency = urgencyFilter === "all" || item.urgency === urgencyFilter;
    const matchesLine = lineFilter === "all" || item.production_line === parseInt(lineFilter);
    return matchesSearch && matchesUrgency && matchesLine;
  });

  const pushMutation = useMutation({
    mutationFn: async () => {
      const user = await base44.auth.me();
      const itemsToPush = filteredResults.filter(item => selected.has(item.sku));
      
      const suggestions = itemsToPush.map(item => ({
        workspace_id: workspaceId,
        workspace_name: workspaceName,
        sku: item.sku,
        product_name: item.product,
        category: item.category,
        production_line: item.production_line || 1,
        forecast_qty: item.forecastTotal || 0,
        event_qty: item.eventDemand || 0,
        on_hand: item.onHand || 0,
        suggested_qty: item.orderQty,
        urgency: item.urgency || "ok",
        status: "suggested",
        pushed_by: user.full_name || user.email,
        pushed_at: new Date().toISOString()
      }));

      return await base44.entities.ForecastSuggestion.bulkCreate(suggestions);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["forecast_suggestions"] });
      toast.success(`${selected.size} items pushed to Run Planner`);
      setSelected(new Set());
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Failed to push: " + error.message);
    }
  });

  const toggleAll = () => {
    if (selected.size === filteredResults.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredResults.map(r => r.sku)));
    }
  };

  const toggleItem = (sku) => {
    const newSelected = new Set(selected);
    if (newSelected.has(sku)) {
      newSelected.delete(sku);
    } else {
      newSelected.add(sku);
    }
    setSelected(newSelected);
  };

  const selectByUrgency = (urgency) => {
    const skus = filteredResults.filter(r => r.urgency === urgency).map(r => r.sku);
    setSelected(new Set([...selected, ...skus]));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5 text-orange-400" />
            Push to Run Planner
          </DialogTitle>
        </DialogHeader>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 py-3 border-b border-zinc-800">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              placeholder="Search SKU or product..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-zinc-800 border-zinc-700"
            />
          </div>
          <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
            <SelectTrigger className="w-36 bg-zinc-800 border-zinc-700">
              <SelectValue placeholder="Urgency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Urgency</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="event">Event</SelectItem>
              <SelectItem value="soon">Soon</SelectItem>
              <SelectItem value="ok">OK</SelectItem>
            </SelectContent>
          </Select>
          <Select value={lineFilter} onValueChange={setLineFilter}>
            <SelectTrigger className="w-32 bg-zinc-800 border-zinc-700">
              <SelectValue placeholder="Line" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Lines</SelectItem>
              <SelectItem value="1">Line 1</SelectItem>
              <SelectItem value="2">Line 2</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Quick Select */}
        <div className="flex items-center gap-2 py-2">
          <Button variant="ghost" size="sm" onClick={toggleAll}>
            {selected.size === filteredResults.length ? (
              <CheckSquare className="w-4 h-4 mr-1" />
            ) : (
              <Square className="w-4 h-4 mr-1" />
            )}
            {selected.size === filteredResults.length ? "Deselect All" : "Select All"}
          </Button>
          <span className="text-zinc-600">|</span>
          <Button variant="ghost" size="sm" onClick={() => selectByUrgency("critical")} className="text-red-400">
            + Critical
          </Button>
          <Button variant="ghost" size="sm" onClick={() => selectByUrgency("event")} className="text-purple-400">
            + Events
          </Button>
          <div className="ml-auto text-sm text-zinc-500">
            {selected.size} of {filteredResults.length} selected
          </div>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto space-y-2 py-2">
          {filteredResults.length === 0 ? (
            <p className="text-center text-zinc-500 py-8">No items match filters</p>
          ) : (
            filteredResults.map((item) => (
              <div
                key={item.sku}
                onClick={() => toggleItem(item.sku)}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  selected.has(item.sku)
                    ? "bg-orange-500/10 border-orange-500/30"
                    : "bg-zinc-800/50 border-zinc-700 hover:border-zinc-600"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Checkbox checked={selected.has(item.sku)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-orange-400">{item.sku}</span>
                      <Badge variant={urgencyConfig[item.urgency]?.color}>
                        {urgencyConfig[item.urgency]?.label}
                      </Badge>
                      {item.production_line && (
                        <Badge variant="default">Line {item.production_line}</Badge>
                      )}
                    </div>
                    <p className="text-sm text-zinc-300 truncate">{item.product}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-orange-400">{item.orderQty}</p>
                    <p className="text-xs text-zinc-500">to produce</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <DialogFooter className="border-t border-zinc-800 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => pushMutation.mutate()}
            disabled={selected.size === 0 || pushMutation.isPending}
            className="bg-orange-500 hover:bg-orange-600"
          >
            <Send className="w-4 h-4 mr-2" />
            {pushMutation.isPending ? "Pushing..." : `Push ${selected.size} Items`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}