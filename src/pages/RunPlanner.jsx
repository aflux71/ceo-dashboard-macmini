import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Badge from "@/components/ui/Badge";
import {
  Play,
  AlertTriangle,
  Calendar,
  Search,
  Lightbulb,
  CheckCircle,
  X,
  ListPlus
} from "lucide-react";
import { toast } from "sonner";
import { useFloorPin } from "@/components/auth/FloorPinContext";
import ManualPlanner from "@/components/planner/ManualPlanner";

const urgencyConfig = {
  critical: { color: "red", label: "Critical", bg: "bg-red-950/20 border-red-800/30" },
  event: { color: "purple", label: "Event", bg: "bg-purple-950/20 border-purple-800/30" },
  soon: { color: "amber", label: "Soon", bg: "bg-amber-950/20 border-amber-800/30" },
  ok: { color: "green", label: "OK", bg: "bg-zinc-900 border-zinc-800" }
};

export default function RunPlanner() {
  const { floorUser } = useFloorPin();
  const [activeTab, setActiveTab] = useState("manual");
  const [filterLine, setFilterLine] = useState("all");
  const [filterUrgency, setFilterUrgency] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const queryClient = useQueryClient();

  // Fetch forecast suggestions
  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ["forecast_suggestions"],
    queryFn: () => base44.entities.ForecastSuggestion.filter({ status: "suggested" }, "-created_date")
  });

  // Fetch recipes for batch size info
  const { data: recipes = [] } = useQuery({
    queryKey: ["recipes"],
    queryFn: () => base44.entities.Recipe.list()
  });

  // Create batch from suggestion
  const scheduleMutation = useMutation({
    mutationFn: async (suggestion) => {
      const recipe = recipes.find(r => r.sku === suggestion.sku);
      const batchId = `${suggestion.sku.substring(0, 6)}-${Date.now().toString(36).toUpperCase()}`;
      const productionLine = suggestion.production_line || 1;
      
      // Calculate default schedule dates
      const startDate = new Date();
      startDate.setHours(8, 0, 0, 0); // Default to 8 AM today
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1); // Default 1 day duration
      
      const batch = await base44.entities.Batch.create({
        batch_id: batchId,
        recipe_id: recipe?.id,
        sku: suggestion.sku,
        product_name: suggestion.product_name,
        quantity: suggestion.suggested_qty,
        production_line: productionLine,
        operator: floorUser?.name || "TBD",
        status: "pending",
        production_date: new Date().toISOString(),
        notes: `From forecast: ${suggestion.workspace_name || "Unknown"}`
      });

      // Update with scheduling info needed for Gantt view
      await base44.entities.ForecastSuggestion.update(suggestion.id, {
        status: "scheduled",
        scheduled_batch_id: batchId,
        scheduled_start_date: startDate.toISOString(),
        scheduled_end_date: endDate.toISOString(),
        assigned_production_line: productionLine
      });

      return batch;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forecast_suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["scheduled-production"] });
      toast.success("Production batch created");
    }
  });

  // Dismiss suggestion
  const dismissMutation = useMutation({
    mutationFn: async (suggestionId) => {
      return await base44.entities.ForecastSuggestion.update(suggestionId, {
        status: "dismissed"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forecast_suggestions"] });
      toast.success("Suggestion dismissed");
    }
  });

  // Filter suggestions
  const filteredSuggestions = suggestions.filter(item => {
    const matchesSearch = !searchTerm ||
      item.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.product_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesLine = filterLine === "all" || item.production_line === parseInt(filterLine);
    const matchesUrgency = filterUrgency === "all" || item.urgency === filterUrgency;
    return matchesSearch && matchesLine && matchesUrgency;
  });

  // Group by line
  const line1Items = filteredSuggestions.filter(s => s.production_line === 1);
  const line2Items = filteredSuggestions.filter(s => s.production_line === 2 || !s.production_line);

  // Stats
  const criticalCount = suggestions.filter(s => s.urgency === "critical").length;
  const eventCount = suggestions.filter(s => s.urgency === "event").length;
  const totalQty = suggestions.reduce((sum, s) => sum + (s.suggested_qty || 0), 0);

  // Check if SKU has a recipe
  const recipeSKUs = new Set(recipes.map(r => r.sku));
  const hasRecipe = (sku) => recipeSKUs.has(sku);

  const renderSuggestionCard = (item) => {
    const noRecipe = !hasRecipe(item.sku);
    
    return (
    <div
      key={item.id}
      className={`p-4 rounded-lg border transition-colors ${urgencyConfig[item.urgency]?.bg || "bg-zinc-900 border-zinc-800"}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono text-sm font-semibold text-orange-400">
              {item.sku}
            </span>
            <Badge variant={urgencyConfig[item.urgency]?.color}>
              {urgencyConfig[item.urgency]?.label}
            </Badge>
            {item.production_line && (
              <Badge variant="default">Line {item.production_line}</Badge>
            )}
            {noRecipe && (
              <Badge variant="red">No Recipe</Badge>
            )}
          </div>
          <h3 className="font-medium text-zinc-100 mb-2 truncate">{item.product_name}</h3>

          <div className="grid grid-cols-4 gap-3 text-sm">
            <div>
              <span className="text-xs text-zinc-500 block">Forecast</span>
              <span className="font-semibold text-zinc-300">{item.forecast_qty || 0}</span>
            </div>
            <div>
              <span className="text-xs text-zinc-500 block">Events</span>
              <span className="font-semibold text-purple-400">{item.event_qty || 0}</span>
            </div>
            <div>
              <span className="text-xs text-zinc-500 block">On Hand</span>
              <span className="font-semibold text-blue-400">{item.on_hand || 0}</span>
            </div>
            <div>
              <span className="text-xs text-zinc-500 block">Produce</span>
              <span className="font-bold text-lg text-orange-400">{item.suggested_qty}</span>
            </div>
          </div>

          {item.workspace_name && (
            <p className="text-xs text-zinc-500 mt-2">
              From: {item.workspace_name} • {new Date(item.pushed_at).toLocaleDateString()}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Button
            onClick={() => scheduleMutation.mutate(item)}
            disabled={scheduleMutation.isPending}
            className="bg-green-600 hover:bg-green-700"
            size="sm"
          >
            <Play className="w-4 h-4 mr-1" />
            Schedule
          </Button>
          <Button
            onClick={() => dismissMutation.mutate(item.id)}
            variant="ghost"
            size="sm"
            className="text-zinc-500 hover:text-red-400"
          >
            <X className="w-4 h-4 mr-1" />
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Run Planner</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Schedule production runs from forecast suggestions
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-2xl font-bold text-orange-400">{suggestions.length}</p>
            <p className="text-xs text-zinc-500">Suggestions</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/20 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-100">{criticalCount}</p>
                <p className="text-xs text-zinc-500">Critical</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Calendar className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-100">{eventCount}</p>
                <p className="text-xs text-zinc-500">Event Orders</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500/20 rounded-lg">
                <Lightbulb className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-100">{totalQty.toLocaleString()}</p>
                <p className="text-xs text-zinc-500">Total Units</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-100">
                  {line1Items.length} / {line2Items.length}
                </p>
                <p className="text-xs text-zinc-500">Line 1 / Line 2</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            placeholder="Search SKU or product..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-zinc-900 border-zinc-800"
          />
        </div>
        <Select value={filterLine} onValueChange={setFilterLine}>
          <SelectTrigger className="w-36 bg-zinc-900 border-zinc-800">
            <SelectValue placeholder="Line" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Lines</SelectItem>
            <SelectItem value="1">Line 1</SelectItem>
            <SelectItem value="2">Line 2</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterUrgency} onValueChange={setFilterUrgency}>
          <SelectTrigger className="w-36 bg-zinc-900 border-zinc-800">
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
      </div>

      {/* Tabs for Line View */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-zinc-800">
          <TabsTrigger value="manual" className="gap-2">
            <ListPlus className="w-4 h-4" />
            Manual Plan
          </TabsTrigger>
          <TabsTrigger value="suggestions">
            Suggestions ({filteredSuggestions.length})
          </TabsTrigger>
          <TabsTrigger value="line1">
            Line 1 ({line1Items.length})
          </TabsTrigger>
          <TabsTrigger value="line2">
            Line 2 ({line2Items.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="mt-4">
          <ManualPlanner />
        </TabsContent>

        <TabsContent value="suggestions" className="mt-4">
          <ManualPlanner filterLine="all" />
        </TabsContent>

        <TabsContent value="line1" className="mt-4">
          <ManualPlanner filterLine={1} />
        </TabsContent>

        <TabsContent value="line2" className="mt-4">
          <ManualPlanner filterLine={2} />
        </TabsContent>
      </Tabs>
    </div>
  );
}