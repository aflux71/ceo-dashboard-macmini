import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  GitBranch,
  Search,
  Eye,
  RotateCcw,
  ArrowLeftRight,
  History,
  Package,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  X
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Badge from "@/components/ui/Badge";
import { toast } from "sonner";

export default function RecipeVersions() {
  const [search, setSearch] = useState("");
  const [selectedSku, setSelectedSku] = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareVersions, setCompareVersions] = useState([null, null]);
  const [showRevertDialog, setShowRevertDialog] = useState(false);
  const [revertTarget, setRevertTarget] = useState(null);
  const queryClient = useQueryClient();

  const { data: allRecipes = [], isLoading } = useQuery({
    queryKey: ['recipes-all'],
    queryFn: () => base44.entities.Recipe.list('-created_date'),
  });

  const { data: batches = [] } = useQuery({
    queryKey: ['batches'],
    queryFn: () => base44.entities.Batch.list(),
  });

  // Group recipes by SKU
  const recipesBySku = useMemo(() => {
    const grouped = {};
    allRecipes.forEach(recipe => {
      if (!grouped[recipe.sku]) {
        grouped[recipe.sku] = [];
      }
      grouped[recipe.sku].push(recipe);
    });
    // Sort each group by version descending
    Object.keys(grouped).forEach(sku => {
      grouped[sku].sort((a, b) => (b.version || 1) - (a.version || 1));
    });
    return grouped;
  }, [allRecipes]);

  // Get unique SKUs with version count
  const skuList = useMemo(() => {
    return Object.entries(recipesBySku)
      .map(([sku, versions]) => ({
        sku,
        name: versions[0]?.name,
        category: versions[0]?.category,
        versionCount: versions.length,
        latestVersion: versions[0]?.version || 1,
        hasMultipleVersions: versions.length > 1
      }))
      .filter(item => 
        !search || 
        item.sku.toLowerCase().includes(search.toLowerCase()) ||
        item.name?.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => b.versionCount - a.versionCount);
  }, [recipesBySku, search]);

  // Get versions for selected SKU
  const selectedVersions = selectedSku ? recipesBySku[selectedSku] || [] : [];

  // Get batches for a specific recipe version
  const getBatchesForRecipe = (recipeId) => {
    return batches.filter(b => b.recipe_id === recipeId);
  };

  // Revert mutation
  const revertMutation = useMutation({
    mutationFn: async ({ oldVersion, newVersionData }) => {
      // Mark current active version as inactive
      const currentActive = selectedVersions.find(v => v.active !== false);
      if (currentActive) {
        await base44.entities.Recipe.update(currentActive.id, { active: false });
      }
      // Create new version based on old one
      const newRecipe = {
        ...newVersionData,
        version: (selectedVersions[0]?.version || 1) + 1,
        version_notes: `Reverted from version ${oldVersion.version || 1}`,
        previous_version_id: currentActive?.id,
        active: true
      };
      delete newRecipe.id;
      delete newRecipe.created_date;
      delete newRecipe.updated_date;
      delete newRecipe.created_by;
      return await base44.entities.Recipe.create(newRecipe);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes-all'] });
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      setShowRevertDialog(false);
      setRevertTarget(null);
      toast.success("Recipe reverted successfully");
    }
  });

  const handleRevert = () => {
    if (!revertTarget) return;
    revertMutation.mutate({ 
      oldVersion: revertTarget, 
      newVersionData: revertTarget 
    });
  };

  const handleCompareSelect = (index, recipeId) => {
    const newCompare = [...compareVersions];
    newCompare[index] = selectedVersions.find(v => v.id === recipeId);
    setCompareVersions(newCompare);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <GitBranch className="w-6 h-6 text-orange-400" />
            Recipe Versions
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            View version history, compare changes, and revert to previous versions
          </p>
        </div>
        <Link to={createPageUrl("Recipes")}>
          <Button variant="outline" className="border-zinc-700">
            Back to Recipes
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SKU List */}
        <Card className="bg-zinc-900 border-zinc-800 lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Products</CardTitle>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                placeholder="Search SKU or name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-zinc-800 border-zinc-700"
              />
            </div>
          </CardHeader>
          <CardContent className="max-h-[600px] overflow-y-auto">
            {isLoading ? (
              <p className="text-zinc-500 text-center py-4">Loading...</p>
            ) : (
              <div className="space-y-1">
                {skuList.map(item => (
                  <button
                    key={item.sku}
                    onClick={() => {
                      setSelectedSku(item.sku);
                      setCompareMode(false);
                      setCompareVersions([null, null]);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                      selectedSku === item.sku
                        ? "bg-orange-500/20 border border-orange-500/30"
                        : "hover:bg-zinc-800"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-mono text-sm text-orange-400">{item.sku}</span>
                        <p className="text-sm text-zinc-300 truncate">{item.name}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.hasMultipleVersions && (
                          <Badge variant="purple">
                            <History className="w-3 h-3 mr-1" />
                            {item.versionCount}
                          </Badge>
                        )}
                        <ChevronRight className="w-4 h-4 text-zinc-600" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Version Details */}
        <Card className="bg-zinc-900 border-zinc-800 lg:col-span-2">
          {!selectedSku ? (
            <CardContent className="py-16 text-center">
              <GitBranch className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
              <p className="text-zinc-400">Select a product to view its version history</p>
            </CardContent>
          ) : (
            <>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{selectedVersions[0]?.name}</CardTitle>
                    <p className="text-sm text-zinc-500 font-mono">{selectedSku}</p>
                  </div>
                  {selectedVersions.length > 1 && (
                    <Button
                      variant={compareMode ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setCompareMode(!compareMode);
                        setCompareVersions([null, null]);
                      }}
                      className={compareMode ? "bg-orange-600" : "border-zinc-700"}
                    >
                      <ArrowLeftRight className="w-4 h-4 mr-1" />
                      {compareMode ? "Exit Compare" : "Compare Versions"}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {compareMode ? (
                  <VersionComparison
                    versions={selectedVersions}
                    compareVersions={compareVersions}
                    onSelectVersion={handleCompareSelect}
                  />
                ) : (
                  <div className="space-y-3">
                    {selectedVersions.map((version, idx) => {
                      const versionBatches = getBatchesForRecipe(version.id);
                      const isActive = version.active !== false;
                      const isLatest = idx === 0;
                      
                      return (
                        <div
                          key={version.id}
                          className={`p-4 rounded-lg border ${
                            isActive
                              ? "bg-green-500/5 border-green-500/30"
                              : "bg-zinc-800/50 border-zinc-700"
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                                isActive ? "bg-green-500/20 text-green-400" : "bg-zinc-700 text-zinc-400"
                              }`}>
                                v{version.version || 1}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-zinc-200">
                                    Version {version.version || 1}
                                  </span>
                                  {isActive && (
                                    <Badge variant="green">
                                      <CheckCircle className="w-3 h-3 mr-1" />
                                      Active
                                    </Badge>
                                  )}
                                  {isLatest && !isActive && (
                                    <Badge variant="amber">Latest</Badge>
                                  )}
                                </div>
                                {version.version_notes && (
                                  <p className="text-sm text-zinc-400 mt-1">{version.version_notes}</p>
                                )}
                                <p className="text-xs text-zinc-500 mt-1">
                                  Created: {new Date(version.created_date).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {versionBatches.length > 0 && (
                                <Badge variant="blue">
                                  <Package className="w-3 h-3 mr-1" />
                                  {versionBatches.length} batches
                                </Badge>
                              )}
                              {!isActive && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setRevertTarget(version);
                                    setShowRevertDialog(true);
                                  }}
                                  className="border-zinc-700"
                                >
                                  <RotateCcw className="w-4 h-4 mr-1" />
                                  Revert
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* Version Details Summary */}
                          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-zinc-500">Batch Size</span>
                              <p className="text-zinc-200">{version.batch_size} units</p>
                            </div>
                            <div>
                              <span className="text-zinc-500">Ingredients</span>
                              <p className="text-zinc-200">{version.ingredients?.length || 0}</p>
                            </div>
                            <div>
                              <span className="text-zinc-500">Packaging</span>
                              <p className="text-zinc-200">{version.packaging?.length || 0}</p>
                            </div>
                            <div>
                              <span className="text-zinc-500">QC Checks</span>
                              <p className="text-zinc-200">{version.qc_checks?.length || 0}</p>
                            </div>
                          </div>

                          {/* Linked Batches */}
                          {versionBatches.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-zinc-700">
                              <p className="text-xs text-zinc-500 mb-2">Production Batches:</p>
                              <div className="flex flex-wrap gap-2">
                                {versionBatches.slice(0, 5).map(batch => (
                                  <Link
                                    key={batch.id}
                                    to={createPageUrl(`BatchHistory?batch=${batch.batch_id}`)}
                                    className="text-xs px-2 py-1 bg-zinc-800 rounded hover:bg-zinc-700 transition-colors"
                                  >
                                    {batch.batch_id}
                                  </Link>
                                ))}
                                {versionBatches.length > 5 && (
                                  <span className="text-xs text-zinc-500 px-2 py-1">
                                    +{versionBatches.length - 5} more
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </div>

      {/* Revert Confirmation Dialog */}
      <Dialog open={showRevertDialog} onOpenChange={setShowRevertDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Revert to Version {revertTarget?.version || 1}?
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-zinc-400 text-sm">
              This will create a new version based on version {revertTarget?.version || 1}. 
              The current active version will be marked as inactive.
            </p>
            <p className="text-zinc-500 text-xs mt-2">
              All existing production batches will remain linked to their original recipe versions.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRevertDialog(false)} className="border-zinc-700">
              Cancel
            </Button>
            <Button 
              onClick={handleRevert}
              disabled={revertMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700"
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              {revertMutation.isPending ? "Reverting..." : "Revert"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Version Comparison Component
function VersionComparison({ versions, compareVersions, onSelectVersion }) {
  const [v1, v2] = compareVersions;

  const getDiff = (field) => {
    if (!v1 || !v2) return null;
    const val1 = v1[field];
    const val2 = v2[field];
    if (JSON.stringify(val1) === JSON.stringify(val2)) return "same";
    return "different";
  };

  const renderFieldComparison = (label, field, isArray = false) => {
    const diff = getDiff(field);
    const val1 = v1?.[field];
    const val2 = v2?.[field];

    return (
      <div className="grid grid-cols-3 gap-4 py-2 border-b border-zinc-800">
        <div className="text-sm text-zinc-400">{label}</div>
        <div className={`text-sm ${diff === "different" ? "text-amber-400" : "text-zinc-300"}`}>
          {isArray ? `${val1?.length || 0} items` : (val1 ?? "-")}
        </div>
        <div className={`text-sm ${diff === "different" ? "text-amber-400" : "text-zinc-300"}`}>
          {isArray ? `${val2?.length || 0} items` : (val2 ?? "-")}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Version Selectors */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Version A</label>
          <Select
            value={v1?.id || ""}
            onValueChange={(val) => onSelectVersion(0, val)}
          >
            <SelectTrigger className="bg-zinc-800 border-zinc-700">
              <SelectValue placeholder="Select version..." />
            </SelectTrigger>
            <SelectContent>
              {versions.map(v => (
                <SelectItem key={v.id} value={v.id}>
                  Version {v.version || 1} {v.active !== false ? "(Active)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Version B</label>
          <Select
            value={v2?.id || ""}
            onValueChange={(val) => onSelectVersion(1, val)}
          >
            <SelectTrigger className="bg-zinc-800 border-zinc-700">
              <SelectValue placeholder="Select version..." />
            </SelectTrigger>
            <SelectContent>
              {versions.map(v => (
                <SelectItem key={v.id} value={v.id}>
                  Version {v.version || 1} {v.active !== false ? "(Active)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Comparison Table */}
      {v1 && v2 ? (
        <div className="bg-zinc-800/50 rounded-lg p-4">
          <div className="grid grid-cols-3 gap-4 pb-2 border-b border-zinc-700 mb-2">
            <div className="text-sm font-medium text-zinc-300">Field</div>
            <div className="text-sm font-medium text-zinc-300">v{v1.version || 1}</div>
            <div className="text-sm font-medium text-zinc-300">v{v2.version || 1}</div>
          </div>
          {renderFieldComparison("Batch Size", "batch_size")}
          {renderFieldComparison("Production Line", "production_line")}
          {renderFieldComparison("Category", "category")}
          {renderFieldComparison("Ingredients", "ingredients", true)}
          {renderFieldComparison("Packaging", "packaging", true)}
          {renderFieldComparison("Procedures", "procedures", true)}
          {renderFieldComparison("QC Checks", "qc_checks", true)}

          {/* Ingredient Details */}
          {getDiff("ingredients") === "different" && (
            <div className="mt-4 pt-4 border-t border-zinc-700">
              <p className="text-sm font-medium text-zinc-300 mb-2">Ingredient Differences:</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-900 p-3 rounded text-xs">
                  <p className="text-zinc-500 mb-2">Version {v1.version || 1}:</p>
                  {v1.ingredients?.map((ing, i) => (
                    <p key={i} className="text-zinc-400">{ing.material}: {ing.qty} {ing.unit}</p>
                  ))}
                </div>
                <div className="bg-zinc-900 p-3 rounded text-xs">
                  <p className="text-zinc-500 mb-2">Version {v2.version || 1}:</p>
                  {v2.ingredients?.map((ing, i) => (
                    <p key={i} className="text-zinc-400">{ing.material}: {ing.qty} {ing.unit}</p>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-8 text-zinc-500">
          Select two versions to compare
        </div>
      )}
    </div>
  );
}