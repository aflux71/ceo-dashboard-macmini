import React, { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Printer, FileText, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import RecipeBatchSheet from "./RecipeBatchSheet";

export default function PrintRecipesDialog({ open, onOpenChange, recipes }) {
  const [selectedRecipes, setSelectedRecipes] = useState([]);
  const [showVerifyCheckboxes, setShowVerifyCheckboxes] = useState(true);
  const [search, setSearch] = useState("");
  const printRef = useRef();

  const filteredRecipes = recipes.filter(r => 
    !search || 
    r.name?.toLowerCase().includes(search.toLowerCase()) ||
    r.sku?.toLowerCase().includes(search.toLowerCase())
  );

  const toggleRecipe = (recipeId) => {
    setSelectedRecipes(prev => 
      prev.includes(recipeId) 
        ? prev.filter(id => id !== recipeId)
        : [...prev, recipeId]
    );
  };

  const toggleAll = () => {
    if (selectedRecipes.length === filteredRecipes.length) {
      setSelectedRecipes([]);
    } else {
      setSelectedRecipes(filteredRecipes.map(r => r.id));
    }
  };

  const handlePrint = () => {
    const printContent = printRef.current;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Batch Records</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const selectedRecipeData = recipes.filter(r => selectedRecipes.includes(r.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="w-5 h-5" />
            Print Batch Sheets
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Options */}
          <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
            <div className="flex items-center gap-3">
              <Switch
                id="verify-checkboxes"
                checked={showVerifyCheckboxes}
                onCheckedChange={setShowVerifyCheckboxes}
              />
              <Label htmlFor="verify-checkboxes" className="cursor-pointer">
                Include verification checkboxes & signature lines
              </Label>
            </div>
            <div className="text-sm text-zinc-400">
              {selectedRecipes.length} of {recipes.length} selected
            </div>
          </div>

          {/* Search and Select All */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                placeholder="Search recipes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-zinc-800 border-zinc-700"
              />
            </div>
            <Button variant="outline" size="sm" onClick={toggleAll}>
              {selectedRecipes.length === filteredRecipes.length ? 'Deselect All' : 'Select All'}
            </Button>
          </div>

          {/* Recipe List */}
          <div className="flex-1 overflow-y-auto border border-zinc-800 rounded-lg">
            <div className="divide-y divide-zinc-800">
              {filteredRecipes.map((recipe) => (
                <label
                  key={recipe.id}
                  className="flex items-center gap-3 p-3 hover:bg-zinc-800/50 cursor-pointer"
                >
                  <Checkbox
                    checked={selectedRecipes.includes(recipe.id)}
                    onCheckedChange={() => toggleRecipe(recipe.id)}
                  />
                  <FileText className="w-4 h-4 text-zinc-500" />
                  <div className="flex-1">
                    <p className="font-medium text-zinc-200">{recipe.name}</p>
                    <p className="text-xs text-zinc-500">
                      {recipe.sku} • {recipe.category} • {recipe.ingredients?.length || 0} ingredients • {recipe.procedures?.length || 0} steps
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Preview Info */}
          {selectedRecipes.length > 0 && (
            <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg text-sm">
              <p className="text-orange-400">
                <strong>{selectedRecipes.length}</strong> batch sheet{selectedRecipes.length > 1 ? 's' : ''} will be printed.
                Each recipe will start on a new page.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handlePrint}
            disabled={selectedRecipes.length === 0}
            className="bg-orange-500 hover:bg-orange-600"
          >
            <Printer className="w-4 h-4 mr-2" />
            Print {selectedRecipes.length > 0 ? `(${selectedRecipes.length})` : ''}
          </Button>
        </DialogFooter>

        {/* Hidden Print Content */}
        <div className="hidden">
          <div ref={printRef}>
            <RecipeBatchSheet 
              recipes={selectedRecipeData} 
              showVerifyCheckboxes={showVerifyCheckboxes}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}