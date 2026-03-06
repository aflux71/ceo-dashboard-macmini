import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  AlertTriangle, 
  Search, 
  Beaker, 
  ChevronRight,
  Tag,
  RefreshCw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Badge from "@/components/ui/Badge";

const ISSUE_TYPES = {
  missing_recipe: {
    label: "No Recipe",
    color: "red",
    icon: Beaker,
    description: "Product scheduled without a matching recipe"
  },
  low_labels: {
    label: "Low Labels",
    color: "amber",
    icon: Tag,
    description: "Label stock is below reorder point"
  },
  out_of_labels: {
    label: "Out of Labels",
    color: "red",
    icon: Tag,
    description: "Label stock is depleted"
  }
};

export default function IssueAlerts() {
  const [searchQuery, setSearchQuery] = useState("");
  const [issueTypeFilter, setIssueTypeFilter] = useState("all");
  const queryClient = useQueryClient();

  // Fetch scheduled items
  const { data: scheduledItems = [], isFetching: fetchingItems } = useQuery({
    queryKey: ['forecast-suggestions-all'],
    queryFn: () => base44.entities.ForecastSuggestion.filter({
      status: { $in: ['suggested', 'scheduled', 'on_hold', 'in_progress'] }
    })
  });

  // Fetch recipes
  const { data: recipes = [], isFetching: fetchingRecipes } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => base44.entities.Recipe.list()
  });

  // Fetch labels
  const { data: labels = [], isFetching: fetchingLabels } = useQuery({
    queryKey: ['labels'],
    queryFn: () => base44.entities.Label.list()
  });

  const isRefreshing = fetchingItems || fetchingRecipes || fetchingLabels;

  const handleRescan = () => {
    queryClient.invalidateQueries({ queryKey: ['forecast-suggestions-all'] });
    queryClient.invalidateQueries({ queryKey: ['recipes'] });
    queryClient.invalidateQueries({ queryKey: ['labels'] });
  };

  // Find items with issues
  const issueItems = useMemo(() => {
    const issues = [];
    const recipeSKUs = new Set(recipes.map(r => r.sku));

    // Check for missing recipes
    scheduledItems.forEach(item => {
      if (!recipeSKUs.has(item.sku)) {
        issues.push({
          id: item.id,
          type: 'missing_recipe',
          sku: item.sku,
          product_name: item.product_name,
          category: item.category,
          suggested_qty: item.suggested_qty,
          status: item.status,
          source: 'ForecastSuggestion',
          sourceData: item
        });
      }
    });

    // Check for low/out of stock labels
    labels.forEach(label => {
      if (label.current_quantity === 0) {
        issues.push({
          id: label.id,
          type: 'out_of_labels',
          sku: label.sku,
          product_name: label.name,
          product_sku: label.product_sku,
          current_quantity: label.current_quantity,
          reorder_point: label.reorder_point,
          supplier_name: label.supplier_name,
          lead_time_days: label.lead_time_days,
          source: 'Label',
          sourceData: label
        });
      } else if (label.current_quantity <= label.reorder_point) {
        issues.push({
          id: label.id,
          type: 'low_labels',
          sku: label.sku,
          product_name: label.name,
          product_sku: label.product_sku,
          current_quantity: label.current_quantity,
          reorder_point: label.reorder_point,
          supplier_name: label.supplier_name,
          lead_time_days: label.lead_time_days,
          source: 'Label',
          sourceData: label
        });
      }
    });

    return issues;
  }, [scheduledItems, recipes, labels]);

  // Filter issues
  const filteredIssues = useMemo(() => {
    return issueItems.filter(issue => {
      if (searchQuery && 
          !issue.product_name?.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !issue.sku?.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (issueTypeFilter !== "all" && issue.type !== issueTypeFilter) {
        return false;
      }
      return true;
    });
  }, [issueItems, searchQuery, issueTypeFilter]);

  // Group by issue type for stats
  const issueStats = useMemo(() => {
    const stats = {};
    issueItems.forEach(issue => {
      stats[issue.type] = (stats[issue.type] || 0) + 1;
    });
    return stats;
  }, [issueItems]);

  const handleCreateRecipe = (issue) => {
    // Store item data for recipe creation
    sessionStorage.setItem('newRecipeFromIssue', JSON.stringify({
      sku: issue.sku,
      name: issue.product_name,
      category: issue.category
    }));
    window.location.href = createPageUrl('Recipes') + '?createNew=true';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-red-400" />
            Issue Alerts
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            Products and items requiring attention
          </p>
        </div>
        <Button
          onClick={handleRescan}
          disabled={isRefreshing}
          variant="outline"
          className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Scanning...' : 'Rescan'}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-red-500/10 border-red-500/30">
          <CardContent className="p-4">
            <p className="text-xs text-red-400">Total Issues</p>
            <p className="text-2xl font-bold text-red-400">{issueItems.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <p className="text-xs text-zinc-500">Missing Recipes</p>
            <p className="text-2xl font-bold text-red-400">
              {issueStats.missing_recipe || 0}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <p className="text-xs text-zinc-500">Low Labels</p>
            <p className="text-2xl font-bold text-amber-400">
              {issueStats.low_labels || 0}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <p className="text-xs text-zinc-500">Out of Labels</p>
            <p className="text-2xl font-bold text-red-400">
              {issueStats.out_of_labels || 0}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <p className="text-xs text-zinc-500">Resolved Today</p>
            <p className="text-2xl font-bold text-green-400">0</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by product or SKU..."
                className="pl-9 bg-zinc-800 border-zinc-700"
              />
            </div>
            
            <Select value={issueTypeFilter} onValueChange={setIssueTypeFilter}>
              <SelectTrigger className="w-[160px] bg-zinc-800 border-zinc-700">
                <SelectValue placeholder="Issue Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Issues</SelectItem>
                <SelectItem value="missing_recipe">Missing Recipe</SelectItem>
                <SelectItem value="low_labels">Low Labels</SelectItem>
                <SelectItem value="out_of_labels">Out of Labels</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Issue List */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg text-zinc-200">
            Issues Requiring Action ({filteredIssues.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filteredIssues.length === 0 ? (
            <div className="p-8 text-center text-zinc-500">
              <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-zinc-600" />
              <p>No issues found</p>
              <p className="text-sm mt-1">All products are properly configured</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {filteredIssues.map(issue => {
                const issueType = ISSUE_TYPES[issue.type];
                const Icon = issueType?.icon || AlertTriangle;
                
                return (
                  <div 
                    key={`${issue.type}-${issue.id}`}
                    className="p-4 hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-lg bg-${issueType?.color || 'red'}-500/20 flex items-center justify-center`}>
                          <Icon className={`w-5 h-5 text-${issueType?.color || 'red'}-400`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm text-orange-400">{issue.sku}</span>
                            <span className="text-zinc-200 font-medium">{issue.product_name}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="red">{issueType?.label}</Badge>
                            {issue.category && (
                              <span className="text-xs text-zinc-500">{issue.category}</span>
                            )}

                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {issue.type === 'missing_recipe' && (
                          <Button
                            onClick={() => handleCreateRecipe(issue)}
                            className="bg-orange-500 hover:bg-orange-600"
                          >
                            <Beaker className="w-4 h-4 mr-2" />
                            Create Recipe
                            <ChevronRight className="w-4 h-4 ml-1" />
                          </Button>
                        )}
                        {(issue.type === 'low_labels' || issue.type === 'out_of_labels') && (
                          <div className="flex items-center gap-3">
                            <div className="text-right text-sm">
                              <p className="text-zinc-400">Stock: <span className={issue.current_quantity === 0 ? 'text-red-400' : 'text-amber-400'}>{issue.current_quantity}</span></p>
                              {issue.supplier_name && <p className="text-zinc-500 text-xs">{issue.supplier_name} • {issue.lead_time_days || '?'} days</p>}
                            </div>
                            <Link to={createPageUrl('Labels')}>
                              <Button className="bg-orange-500 hover:bg-orange-600">
                                <Tag className="w-4 h-4 mr-2" />
                                Manage Labels
                                <ChevronRight className="w-4 h-4 ml-1" />
                              </Button>
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}