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
            body { font-family: Arial, sans-serif; font-size: 12px; line-height: 1.4; color: black; background: white; }
            .print-batch-sheet { font-family: Arial, sans-serif; font-size: 12px; line-height: 1.4; padding: 32px; }
            .batch-header { border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 16px; }
            .flex { display: flex; }
            .justify-between { justify-content: space-between; }
            .items-start { align-items: flex-start; }
            .text-right { text-align: right; }
            .text-2xl { font-size: 1.4em; }
            .font-bold { font-weight: bold; }
            .mb-1 { margin-bottom: 4px; }
            .mb-6 { margin-bottom: 24px; }
            .text-gray-600 { color: #4b5563; }
            .text-sm { font-size: 0.85em; }
            .text-xs { font-size: 0.75em; }
            .uppercase { text-transform: uppercase; }
            .text-gray-500 { color: #6b7280; }
            .text-gray-400 { color: #9ca3af; }
            .text-gray-700 { color: #374151; }
            .text-center { text-align: center; }
            .grid { display: grid; }
            .grid-cols-3 { grid-template-columns: repeat(3, 1fr); }
            .grid-cols-2 { grid-template-columns: repeat(2, 1fr); }
            .gap-4 { gap: 16px; }
            .gap-8 { gap: 32px; }
            .p-4 { padding: 16px; }
            .p-3 { padding: 12px; }
            .p-2 { padding: 8px; }
            .pt-4 { padding-top: 16px; }
            .pb-1 { padding-bottom: 4px; }
            .mt-2 { margin-top: 8px; }
            .mt-4 { margin-top: 16px; }
            .ml-4 { margin-left: 16px; }
            .mx-auto { margin-left: auto; margin-right: auto; }
            .min-h-6 { min-height: 24px; }
            .min-h-24 { min-height: 96px; }
            .min-w-8 { min-width: 32px; }
            .flex-1 { flex: 1; }
            .flex-shrink-0 { flex-shrink: 0; }
            .italic { font-style: italic; }
            .font-medium { font-weight: 500; }
            .font-mono { font-family: monospace; }
            .inline-block { display: inline-block; }
            .border { border: 1px solid #d1d5db; }
            .border-2 { border: 2px solid; }
            .border-b { border-bottom: 1px solid; }
            .border-t { border-top: 1px solid; }
            .border-gray-300 { border-color: #d1d5db; }
            .border-gray-400 { border-color: #9ca3af; }
            .border-gray-200 { border-color: #e5e7eb; }
            .rounded { border-radius: 4px; }
            .bg-gray-50 { background-color: #f9fafb; }
            .w-12 { width: 48px; }
            .w-16 { width: 64px; }
            .w-24 { width: 96px; }
            .w-32 { width: 128px; }
            .items-center { align-items: center; }
            .gap-3 { gap: 12px; }
            .gap-4 { gap: 16px; }
            .section-title { background: #f3f4f6; padding: 8px 12px; font-weight: bold; border: 1px solid #d1d5db; margin-bottom: 0; }
            .checkbox-row { display: flex; align-items: flex-start; padding: 8px 12px; border: 1px solid #d1d5db; border-top: none; }
            .checkbox { width: 18px; height: 18px; border: 2px solid #374151; margin-right: 12px; flex-shrink: 0; display: inline-block; }
            .verify-section { margin-top: 8px; padding: 8px 12px; border: 1px solid #d1d5db; border-top: none; background: #fef3c7; }
            .signature-line { border-bottom: 1px solid #374151; min-width: 150px; display: inline-block; margin-left: 8px; }
            .ingredients-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
            .ingredients-table th, .ingredients-table td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
            .ingredients-table th { background: #f3f4f6; font-weight: bold; }
            .recipe-page { margin-bottom: 32px; }
            .page-break { page-break-after: always; break-after: page; }
            @media print {
              .page-break { page-break-after: always; break-after: page; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
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
    }, 500);
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