import React, { useState, useEffect } from "react";
import { Ban, Upload, X, Plus, Save, FolderOpen, Search, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Badge from "@/components/ui/Badge";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import Papa from "papaparse";

const EXCLUSION_LISTS_KEY = "exclusion_lists";

export default function ExclusionsManager({ exclusions = [], onExclusionsChange, availableSkus = [] }) {
  const [uploading, setUploading] = useState(false);
  const [manualSku, setManualSku] = useState("");
  const [search, setSearch] = useState("");
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [listName, setListName] = useState("");
  const [savedLists, setSavedLists] = useState([]);
  const [skuSuggestions, setSkuSuggestions] = useState([]);

  // Load saved exclusion lists from AppSettings
  useEffect(() => {
    loadSavedLists();
  }, []);

  const loadSavedLists = async () => {
    try {
      const settings = await base44.entities.AppSettings.filter({ key: EXCLUSION_LISTS_KEY });
      if (settings.length > 0) {
        setSavedLists(JSON.parse(settings[0].value || "[]"));
      }
    } catch (error) {
      console.error("Error loading exclusion lists:", error);
    }
  };

  const saveLists = async (lists) => {
    try {
      const settings = await base44.entities.AppSettings.filter({ key: EXCLUSION_LISTS_KEY });
      if (settings.length > 0) {
        await base44.entities.AppSettings.update(settings[0].id, { value: JSON.stringify(lists) });
      } else {
        await base44.entities.AppSettings.create({
          key: EXCLUSION_LISTS_KEY,
          value: JSON.stringify(lists),
          description: "Saved exclusion lists for forecasting"
        });
      }
      setSavedLists(lists);
    } catch (error) {
      console.error("Error saving exclusion lists:", error);
      toast.error("Failed to save exclusion list");
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: function(results) {
        const skus = new Set(exclusions);
        
        results.data.forEach(row => {
          const sku = row.SKU || row.sku || row['Product SKU'] || row.Sku;
          if (sku && sku.trim()) {
            skus.add(sku.trim());
          }
        });
        
        onExclusionsChange(Array.from(skus));
        setUploading(false);
        toast.success(`Added ${results.data.length} SKUs from CSV`);
      },
      error: function(error) {
        toast.error('Error parsing CSV: ' + error.message);
        setUploading(false);
      }
    });
    
    // Reset file input
    e.target.value = '';
  };

  const handleAddManualSku = () => {
    const sku = manualSku.trim();
    if (!sku) return;
    
    if (exclusions.includes(sku)) {
      toast.error("SKU already in exclusion list");
      return;
    }
    
    onExclusionsChange([...exclusions, sku]);
    setManualSku("");
    toast.success(`Added ${sku} to exclusions`);
  };

  const handleAddFromSuggestion = (sku) => {
    if (exclusions.includes(sku)) {
      toast.error("SKU already in exclusion list");
      return;
    }
    onExclusionsChange([...exclusions, sku]);
    setManualSku("");
    setSkuSuggestions([]);
    toast.success(`Added ${sku} to exclusions`);
  };

  const handleManualSkuChange = (value) => {
    setManualSku(value);
    if (value.length > 1 && availableSkus.length > 0) {
      const matches = availableSkus
        .filter(sku => 
          sku.toLowerCase().includes(value.toLowerCase()) && 
          !exclusions.includes(sku)
        )
        .slice(0, 5);
      setSkuSuggestions(matches);
    } else {
      setSkuSuggestions([]);
    }
  };

  const handleRemove = (sku) => {
    onExclusionsChange(exclusions.filter(s => s !== sku));
  };

  const handleClearAll = () => {
    if (confirm('Remove all exclusions?')) {
      onExclusionsChange([]);
    }
  };

  const handleSaveList = async () => {
    if (!listName.trim()) {
      toast.error("Please enter a name for the list");
      return;
    }
    
    const newList = {
      id: Date.now().toString(),
      name: listName.trim(),
      skus: [...exclusions],
      createdAt: new Date().toISOString()
    };
    
    const updatedLists = [...savedLists.filter(l => l.name !== listName.trim()), newList];
    await saveLists(updatedLists);
    
    setShowSaveDialog(false);
    setListName("");
    toast.success(`Saved "${newList.name}" with ${exclusions.length} SKUs`);
  };

  const handleLoadList = (list) => {
    onExclusionsChange([...new Set([...exclusions, ...list.skus])]);
    setShowLoadDialog(false);
    toast.success(`Loaded ${list.skus.length} SKUs from "${list.name}"`);
  };

  const handleReplaceWithList = (list) => {
    onExclusionsChange([...list.skus]);
    setShowLoadDialog(false);
    toast.success(`Replaced with ${list.skus.length} SKUs from "${list.name}"`);
  };

  const handleDeleteSavedList = async (listId) => {
    if (!confirm("Delete this saved list?")) return;
    const updatedLists = savedLists.filter(l => l.id !== listId);
    await saveLists(updatedLists);
    toast.success("List deleted");
  };

  const filteredExclusions = exclusions.filter(sku => 
    !search || sku.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Ban className="w-4 h-4" />
              Exclusions
            </CardTitle>
            <p className="text-xs text-zinc-500 mt-1">SKUs to skip</p>
          </div>
          <div className="flex items-center gap-2">
            {exclusions.length > 0 && (
              <Badge variant="green">✓ {exclusions.length} SKUs</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Manual Add */}
        <div className="relative">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                value={manualSku}
                onChange={(e) => handleManualSkuChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddManualSku()}
                onBlur={() => setTimeout(() => setSkuSuggestions([]), 200)}
                placeholder="Enter SKU to exclude..."
                className="bg-zinc-800 border-zinc-700"
              />
              {skuSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg z-50 max-h-40 overflow-y-auto">
                  {skuSuggestions.map(sku => (
                    <button
                      key={sku}
                      onClick={() => handleAddFromSuggestion(sku)}
                      className="w-full text-left px-3 py-2 hover:bg-zinc-700 text-sm font-mono text-zinc-300"
                    >
                      {sku}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button onClick={handleAddManualSku} size="sm" className="bg-orange-500 hover:bg-orange-600">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Upload CSV */}
        <label className="block">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="hidden"
            disabled={uploading}
          />
          <div className="flex items-center justify-center p-3 border-2 border-dashed border-zinc-700 rounded-lg cursor-pointer hover:border-orange-500/50 transition-colors">
            <Upload className="w-4 h-4 text-zinc-600 mr-2" />
            <span className="text-sm text-zinc-400">
              {uploading ? 'Processing...' : 'Upload CSV'}
            </span>
          </div>
        </label>

        {/* Save/Load Buttons */}
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowSaveDialog(true)}
            disabled={exclusions.length === 0}
            className="flex-1"
          >
            <Save className="w-4 h-4 mr-2" />
            Save List
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => {
              loadSavedLists();
              setShowLoadDialog(true);
            }}
            className="flex-1"
          >
            <FolderOpen className="w-4 h-4 mr-2" />
            Load List
          </Button>
        </div>

        {/* Exclusions List */}
        {exclusions.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="pl-7 h-7 text-xs bg-zinc-800 border-zinc-700"
                />
              </div>
              <button
                onClick={handleClearAll}
                className="text-xs text-zinc-500 hover:text-red-400"
              >
                Clear all
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
              {filteredExclusions.length === 0 ? (
                <p className="text-xs text-zinc-500 text-center py-2">No matches</p>
              ) : (
                filteredExclusions.map((sku) => (
                  <div key={sku} className="flex items-center justify-between p-2 bg-zinc-800 rounded">
                    <span className="text-sm font-mono text-zinc-300">{sku}</span>
                    <button
                      onClick={() => handleRemove(sku)}
                      className="text-zinc-500 hover:text-red-400"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              {filteredExclusions.length} of {exclusions.length} shown
            </p>
          </div>
        )}

        <p className="text-xs text-zinc-500">
          Add SKUs manually or upload a CSV to exclude from forecast
        </p>
      </CardContent>

      {/* Save Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md">
          <DialogHeader>
            <DialogTitle>Save Exclusion List</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-zinc-400">List Name</label>
              <Input
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                placeholder="e.g., Discontinued Items"
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            
            {savedLists.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm text-zinc-400">Or overwrite existing list:</label>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {savedLists.map(list => (
                    <button
                      key={list.id}
                      onClick={() => setListName(list.name)}
                      className={`w-full text-left px-3 py-2 rounded text-sm ${
                        listName === list.name 
                          ? 'bg-orange-500/20 border border-orange-500/50 text-orange-300' 
                          : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                      }`}
                    >
                      {list.name} ({list.skus.length} SKUs)
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            <p className="text-sm text-zinc-500">
              This will save {exclusions.length} SKUs that can be loaded later.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveList} className="bg-orange-500 hover:bg-orange-600">
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Load Dialog */}
      <Dialog open={showLoadDialog} onOpenChange={setShowLoadDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md">
          <DialogHeader>
            <DialogTitle>Load Exclusion List</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {savedLists.length === 0 ? (
              <p className="text-zinc-500 text-center py-4">No saved lists yet</p>
            ) : (
              savedLists.map(list => (
                <div key={list.id} className="p-3 bg-zinc-800 rounded-lg border border-zinc-700">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-zinc-200">{list.name}</h4>
                    <button
                      onClick={() => handleDeleteSavedList(list.id)}
                      className="text-zinc-500 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-zinc-500 mb-3">
                    {list.skus.length} SKUs · Saved {new Date(list.createdAt).toLocaleDateString()}
                  </p>
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleLoadList(list)}
                      className="flex-1"
                    >
                      Add to Current
                    </Button>
                    <Button 
                      size="sm"
                      onClick={() => handleReplaceWithList(list)}
                      className="flex-1 bg-orange-500 hover:bg-orange-600"
                    >
                      Replace
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLoadDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}