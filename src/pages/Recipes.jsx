import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import {
  Beaker,
  Plus,
  Search,
  Edit,
  Trash2,
  Eye,
  Copy,
  DollarSign,
  Printer,
  Package,
  GitBranch,
  GripVertical,
  Snowflake,
  Sun,
  Leaf,
  TreeDeciduous,
  Gift,
  FileInput,
  Save,
  ChevronRight,
  Zap
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import Badge from "@/components/ui/Badge";
import BatchCostDisplay, { BatchCostBadge } from "@/components/recipes/BatchCostCalculator";
import IngredientSkuSelect from "@/components/recipes/IngredientSkuSelect";
import CompatibleUnitSelect from "@/components/recipes/CompatibleUnitSelect";
import PrintRecipesDialog from "@/components/recipes/PrintRecipesDialog";
import PackagingSkuSelect from "@/components/recipes/PackagingSkuSelect";
import IngredientConversionHint from "@/components/recipes/IngredientConversionHint";
import RecipeSkuSearch from "@/components/recipes/RecipeSkuSearch.jsx";
import { useFloorPin } from "@/components/auth/FloorPinContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useProductCategories, DEFAULT_CATEGORY_PREFIXES } from "@/components/utils/useProductCategories";

const SEASONS = ["Spring", "Summer", "Fall", "Winter"];
const HOLIDAYS = ["Christmas", "Valentine's Day", "Easter", "Mother's Day", "Halloween", "Thanksgiving", "New Year", "Other"];

// Expandable Recipe Row Component
function RecipeRow({ recipe, inventory, getCategoryColor, onView, onEdit, onDuplicate, onSaveTemplate, onDelete, canDelete }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-4 p-4 hover:bg-zinc-800/50 transition-colors cursor-pointer"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <span className="font-mono text-sm text-orange-400">{recipe.sku}</span>
            <span className="font-semibold text-zinc-100">{recipe.name}</span>
            <Badge variant={getCategoryColor(recipe.category)}>{recipe.category}</Badge>
            <div className="flex items-center gap-1 text-xs text-zinc-500">
              <GitBranch className="w-3 h-3" />
              v{recipe.version || 1}
            </div>
          </div>
          <p className="text-sm text-zinc-400">
            {recipe.batch_size} units • Line {recipe.production_line || 1} • {recipe.ingredients?.length || 0} ingredients
          </p>
        </div>
        <BatchCostBadge recipe={recipe} inventory={inventory} />
        <ChevronRight className={`w-5 h-5 text-zinc-600 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="px-4 py-4 bg-zinc-800/30 border-t border-zinc-800 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-zinc-500">Batch Size</span>
              <p className="text-zinc-200 font-medium">{recipe.batch_size} units</p>
            </div>
            <div>
              <span className="text-zinc-500">Production Line</span>
              <p className="text-zinc-200 font-medium">Line {recipe.production_line || 1}</p>
            </div>
            <div>
              <span className="text-zinc-500">Ingredients</span>
              <p className="text-zinc-200 font-medium">{recipe.ingredients?.length || 0} items</p>
            </div>
            <div>
              <span className="text-zinc-500">Packaging</span>
              <p className="text-zinc-200 font-medium">{recipe.packaging?.length || 0} items</p>
            </div>
          </div>

          {/* Ingredients Summary */}
          {recipe.ingredients?.length > 0 && (
            <div>
              <p className="text-xs text-zinc-500 uppercase mb-2">Active Ingredients (v{recipe.version || 1})</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {recipe.ingredients.map((ing, idx) => {
                  const invItem = inventory.find(i => i.sku === ing.sku);
                  const needsConversion = invItem?.unit && ing.unit && 
                    invItem.unit.toLowerCase() !== ing.unit.toLowerCase();
                  
                  return (
                    <div key={idx} className="p-2 bg-zinc-900 rounded border border-zinc-700 text-xs">
                      <p className="text-zinc-400">{ing.material}</p>
                      <p className="text-zinc-300 font-mono">{ing.qty} {ing.unit}</p>
                      {needsConversion && (
                        <div className="flex items-center gap-1 mt-1 text-blue-400">
                          <Zap className="w-2.5 h-2.5" />
                          <span>{ing.unit} → {invItem.unit}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={onView}>
              <Eye className="w-4 h-4 mr-1" /> View
            </Button>
            <Button size="sm" variant="ghost" onClick={onEdit}>
              <Edit className="w-4 h-4 mr-1" /> Edit (New Version)
            </Button>
            <Button size="sm" variant="ghost" onClick={onDuplicate}>
              <Copy className="w-4 h-4 mr-1" /> Duplicate
            </Button>
            <Button size="sm" variant="ghost" onClick={onSaveTemplate} className="text-orange-400 hover:text-orange-300">
              <Save className="w-4 h-4 mr-1" /> Save as Template
            </Button>
            {canDelete && (
              <Button size="sm" variant="ghost" onClick={onDelete} className="text-red-400 hover:text-red-300">
                <Trash2 className="w-4 h-4 mr-1" /> Delete
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default function Recipes() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [pendingIssueData, setPendingIssueData] = useState(null);
  const [formData, setFormData] = useState({
    sku: "",
    name: "",
    category: "Other",
    batch_size: 0,
    production_line: 1,
    version: 1,
    version_notes: "",
    ingredients: [],
    packaging: [],
    procedures: [],
    qc_checks: [],
    active: true,
    is_seasonal: false,
    season: "",
    holiday: ""
  });
  const [createNewVersion, setCreateNewVersion] = useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [deleteConfirmRecipe, setDeleteConfirmRecipe] = useState(null);
  const [showTemplateSelect, setShowTemplateSelect] = useState(false);
  const [saveAsTemplateRecipe, setSaveAsTemplateRecipe] = useState(null);
  const [templateName, setTemplateName] = useState("");
  
  const { hasPermission, floorUser } = useFloorPin();
  const { categories: CATEGORIES } = useProductCategories();
  
  // Check if user can delete (owner or admin role)
  const canDeleteRecipe = floorUser?.role === 'owner' || floorUser?.role === 'admin';

  // Auto-generate SKU based on category
  const generateSku = (category) => {
    const prefix = DEFAULT_CATEGORY_PREFIXES[category] || category?.substring(0, 2)?.toUpperCase() || "OT";
    const existingSkus = recipes.filter(r => r.sku?.startsWith(prefix + "-"));
    const numbers = existingSkus.map(r => {
      const match = r.sku.match(new RegExp(`^${prefix}-(\\d+)`));
      return match ? parseInt(match[1]) : 0;
    });
    const nextNum = Math.max(0, ...numbers) + 1;
    return `${prefix}-${String(nextNum).padStart(3, '0')}`;
  };

  const queryClient = useQueryClient();

  const { data: recipes = [], isLoading } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => base44.entities.Recipe.list(),
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => base44.entities.Inventory.list(),
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['recipe-templates'],
    queryFn: () => base44.entities.RecipeTemplate.list()
  });

  // Check for incoming item from Issue Alerts
  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const createNew = urlParams.get('createNew');
    
    if (createNew) {
      const storedData = sessionStorage.getItem('newRecipeFromIssue');
      if (storedData) {
        const issueData = JSON.parse(storedData);
        setPendingIssueData(issueData);
        sessionStorage.removeItem('newRecipeFromIssue');
        window.history.replaceState({}, '', window.location.pathname);
        
        // Open modal with pre-filled data
        setEditItem(null);
        setFormData({
          sku: issueData.sku || "",
          name: issueData.name || "",
          category: issueData.category || "Other",
          batch_size: 0,
          production_line: 1,
          version: 1,
          version_notes: "",
          ingredients: [],
          packaging: [],
          procedures: [],
          qc_checks: [],
          active: true,
          is_seasonal: false,
          season: "",
          holiday: ""
        });
        setShowModal(true);
      }
    }
  }, []);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Recipe.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      closeModal();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Recipe.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      closeModal();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Recipe.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      toast.success("Recipe deleted successfully");
    }
  });

  const saveAsTemplateMutation = useMutation({
    mutationFn: (data) => base44.entities.RecipeTemplate.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipe-templates'] });
      toast.success("Recipe saved as template");
      setSaveAsTemplateRecipe(null);
      setTemplateName("");
    }
  });

  const handleDeleteRecipe = (recipe) => {
    if (!hasPermission("delete_recipes")) {
      toast.error("You don't have permission to delete recipes");
      return;
    }
    setDeleteConfirmRecipe(recipe);
  };

  const confirmDelete = () => {
    if (deleteConfirmRecipe) {
      deleteMutation.mutate(deleteConfirmRecipe.id);
      setDeleteConfirmRecipe(null);
    }
  };

  const openModal = (recipe = null) => {
    setCreateNewVersion(false);
    if (recipe) {
      setEditItem(recipe);
      setFormData({
        sku: recipe.sku || "",
        name: recipe.name || "",
        category: recipe.category || "Other",
        batch_size: recipe.batch_size || 0,
        production_line: recipe.production_line || 1,
        version: recipe.version || 1,
        version_notes: recipe.version_notes || "",
        ingredients: recipe.ingredients || [],
        packaging: recipe.packaging || [],
        procedures: recipe.procedures || [],
        qc_checks: recipe.qc_checks || [],
        active: recipe.active !== false,
        is_seasonal: recipe.is_seasonal || false,
        season: recipe.season || "",
        holiday: recipe.holiday || ""
      });
      setShowModal(true);
    } else {
      // Show template selection for new recipe
      setShowTemplateSelect(true);
    }
  };

  const startFromTemplate = (template) => {
    setEditItem(null);
    setFormData({
      sku: "",
      name: "",
      category: template?.category || "Other",
      batch_size: template?.batch_size || 0,
      production_line: template?.production_line || 1,
      version: 1,
      version_notes: "",
      ingredients: template?.ingredients || [],
      packaging: template?.packaging || [],
      procedures: template?.procedures || [],
      qc_checks: template?.qc_checks || [],
      active: true,
      is_seasonal: template?.is_seasonal || false,
      season: template?.season || "",
      holiday: template?.holiday || ""
    });
    setShowTemplateSelect(false);
    setShowModal(true);
  };

  const handleSaveAsTemplate = () => {
    if (!saveAsTemplateRecipe || !templateName.trim()) return;
    
    saveAsTemplateMutation.mutate({
      name: templateName.trim(),
      category: saveAsTemplateRecipe.category,
      description: `Based on ${saveAsTemplateRecipe.name}`,
      batch_size: saveAsTemplateRecipe.batch_size,
      production_line: saveAsTemplateRecipe.production_line,
      ingredients: saveAsTemplateRecipe.ingredients || [],
      packaging: saveAsTemplateRecipe.packaging || [],
      procedures: saveAsTemplateRecipe.procedures || [],
      qc_checks: saveAsTemplateRecipe.qc_checks || [],
      is_seasonal: saveAsTemplateRecipe.is_seasonal,
      season: saveAsTemplateRecipe.season,
      holiday: saveAsTemplateRecipe.holiday,
      active: true
    });
  };

  const closeModal = () => {
    setShowModal(false);
    setEditItem(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Auto-generate SKU if empty
    const finalFormData = { ...formData };
    if (!finalFormData.sku.trim()) {
      finalFormData.sku = generateSku(finalFormData.category);
    }
    
    if (editItem) {
      // ALWAYS create a new version when editing (auto-create on every edit)
      const newVersionData = {
        ...finalFormData,
        version: (editItem.version || 1) + 1,
        previous_version_id: editItem.id,
        active: true
      };
      // Mark old version as inactive
      await base44.entities.Recipe.update(editItem.id, { active: false });
      createMutation.mutate(newVersionData);
    } else {
      // New recipe: check for duplicates
      const existingBySku = recipes.find(r => r.sku === finalFormData.sku);
      if (existingBySku) {
        const confirm = window.confirm(
          `A recipe for SKU "${finalFormData.sku}" already exists: "${existingBySku.name}".\n\nDo you want to create a new version instead?`
        );
        if (confirm) {
          // Open the existing recipe in edit mode to create a version
          openModal(existingBySku);
          return;
        }
      }
      createMutation.mutate({ ...finalFormData, version: 1, active: true });
    }
  };

  // Drag and drop handler
  const handleDragEnd = (result, listName) => {
    if (!result.destination) return;
    
    const items = Array.from(formData[listName]);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    // Update step numbers for procedures
    if (listName === 'procedures') {
      items.forEach((item, idx) => item.step = idx + 1);
    }
    
    setFormData({ ...formData, [listName]: items });
  };

  const addIngredient = () => {
    setFormData({
      ...formData,
      ingredients: [...formData.ingredients, { material: "", sku: "", qty: 0, unit: "" }]
    });
  };

  const updateIngredient = (index, field, value) => {
    const newIngredients = [...formData.ingredients];
    newIngredients[index][field] = value;
    
    // Auto-fill from inventory
    if (field === 'sku') {
      const inv = inventory.find(i => i.sku === value);
      if (inv) {
        newIngredients[index].material = inv.name;
        newIngredients[index].unit = inv.unit;
      }
    }
    
    setFormData({ ...formData, ingredients: newIngredients });
  };

  const removeIngredient = (index) => {
    setFormData({
      ...formData,
      ingredients: formData.ingredients.filter((_, i) => i !== index)
    });
  };

  const addProcedure = () => {
    const nextStep = formData.procedures.length + 1;
    setFormData({
      ...formData,
      procedures: [...formData.procedures, { step: nextStep, description: "", duration_minutes: 0, notes: "" }]
    });
  };

  const updateProcedure = (index, field, value) => {
    const newProcedures = [...formData.procedures];
    newProcedures[index][field] = value;
    setFormData({ ...formData, procedures: newProcedures });
  };

  const removeProcedure = (index) => {
    setFormData({
      ...formData,
      procedures: formData.procedures.filter((_, i) => i !== index).map((p, i) => ({ ...p, step: i + 1 }))
    });
  };

  const addQCCheck = () => {
    setFormData({
      ...formData,
      qc_checks: [...formData.qc_checks, { checkpoint: "", criteria: "", method: "" }]
    });
  };

  const updateQCCheck = (index, field, value) => {
    const newChecks = [...formData.qc_checks];
    newChecks[index][field] = value;
    setFormData({ ...formData, qc_checks: newChecks });
  };

  const removeQCCheck = (index) => {
    setFormData({
      ...formData,
      qc_checks: formData.qc_checks.filter((_, i) => i !== index)
    });
  };

  // Packaging functions
  const addPackaging = () => {
    setFormData({
      ...formData,
      packaging: [...formData.packaging, { sku: "", name: "", qty_per_unit: 1, qty_per_batch: formData.batch_size || 0 }]
    });
  };

  const updatePackaging = (index, field, value) => {
    const newPackaging = [...formData.packaging];
    newPackaging[index][field] = value;
    
    // Auto-calculate qty_per_batch when qty_per_unit changes
    if (field === 'qty_per_unit') {
      newPackaging[index].qty_per_batch = value * (formData.batch_size || 0);
    }
    
    setFormData({ ...formData, packaging: newPackaging });
  };

  const removePackaging = (index) => {
    setFormData({
      ...formData,
      packaging: formData.packaging.filter((_, i) => i !== index)
    });
  };

  const handlePackagingSelect = (index, sku, item) => {
    const newPackaging = [...formData.packaging];
    newPackaging[index] = {
      ...newPackaging[index],
      sku: sku,
      name: item.name,
      qty_per_unit: 1,
      qty_per_batch: formData.batch_size || 0
    };
    setFormData({ ...formData, packaging: newPackaging });
  };

  const duplicateRecipe = (recipe) => {
    openModal({
      ...recipe,
      id: null,
      sku: recipe.sku + '-COPY',
      name: recipe.name + ' (Copy)'
    });
    setEditItem(null);
  };

  const filtered = recipes.filter(recipe => {
    const matchesSearch = !search || 
      recipe.name?.toLowerCase().includes(search.toLowerCase()) ||
      recipe.sku?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === "all" || recipe.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const getCategoryColor = (category) => {
    const colors = {
      'Bath Bombs': 'purple',
      'Body Wash': 'blue',
      'Scrubs': 'amber',
      'Lotions': 'green',
      'Oils': 'orange',
      'Soaps': 'cyan',
      'Shampoo Bars': 'purple',
      'Candles': 'red',
      'Other': 'default'
    };
    return colors[category] || 'default';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Recipes</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Manage product formulations and manufacturing procedures
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowPrintDialog(true)}>
            <Printer className="w-4 h-4 mr-2" />
            Print Batch Sheets
          </Button>
          <Button onClick={() => openModal()} className="bg-orange-500 hover:bg-orange-600 text-white">
            <Plus className="w-4 h-4 mr-2" />
            Add Recipe
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                placeholder="Search by name or SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-zinc-800 border-zinc-700 text-zinc-100"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full md:w-48 bg-zinc-800 border-zinc-700 text-zinc-100">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORIES.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Recipes Expandable Table */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-0">
          {isLoading ? (
            <p className="text-center text-zinc-500 py-8">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-zinc-500 py-8">No recipes found</p>
          ) : (
            <div className="divide-y divide-zinc-800">
              {filtered.map((recipe) => (
                <RecipeRow 
                  key={recipe.id}
                  recipe={recipe}
                  inventory={inventory}
                  getCategoryColor={getCategoryColor}
                  onView={() => { setSelectedRecipe(recipe); setShowViewModal(true); }}
                  onEdit={() => openModal(recipe)}
                  onDuplicate={() => duplicateRecipe(recipe)}
                  onSaveTemplate={() => { setSaveAsTemplateRecipe(recipe); setTemplateName(recipe.name + " Template"); }}
                  onDelete={() => setDeleteConfirmRecipe(recipe)}
                  canDelete={canDeleteRecipe}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Edit Recipe' : 'Add Recipe'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>SKU <span className="text-xs text-zinc-500">(search or auto-generated if empty)</span></Label>
                <RecipeSkuSearch
                  inventory={inventory}
                  value={formData.sku}
                  onChange={(v) => setFormData({...formData, sku: v})}
                  onSelect={(item) => setFormData(prev => ({
                    ...prev,
                    sku: item.supplier_sku || item.sku,
                    name: prev.name || item.name,
                  }))}
                  placeholder={`Search or type ${DEFAULT_CATEGORY_PREFIXES[formData.category] || formData.category?.substring(0, 2)?.toUpperCase() || "OT"}-001`}
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={formData.category} onValueChange={(v) => setFormData({...formData, category: v})}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Product Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                required
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Batch Size (units)</Label>
                <Input
                  type="number"
                  value={formData.batch_size}
                  onChange={(e) => setFormData({...formData, batch_size: parseInt(e.target.value) || 0})}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
              <div className="space-y-2">
                <Label>Production Line</Label>
                <Select 
                  value={String(formData.production_line)} 
                  onValueChange={(v) => setFormData({...formData, production_line: parseInt(v)})}
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Line 1</SelectItem>
                    <SelectItem value="2">Line 2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Version Info (when editing - auto-create version on edit) */}
            {editItem && (
              <div className="p-4 bg-amber-500/10 rounded-lg border border-amber-500/30">
                <div className="flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-amber-400" />
                  <span className="text-sm text-amber-200">
                    <strong>Creating v{(editItem.version || 1) + 1}</strong> — Changes will save as a new version
                  </span>
                </div>
                <div className="mt-3">
                  <Label className="text-xs text-amber-600">What changed? (Version notes)</Label>
                  <Input
                    value={formData.version_notes}
                    onChange={(e) => setFormData({ ...formData, version_notes: e.target.value })}
                    placeholder="e.g., Updated ingredient X from 5kg to 6kg, improved procedure step 2"
                    className="bg-zinc-800 border-zinc-700 mt-1 text-zinc-100"
                  />
                </div>
              </div>
            )}

            {/* Seasonal Options */}
            <div className="p-4 bg-zinc-800/30 rounded-lg border border-zinc-700 space-y-3">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="is_seasonal"
                  checked={formData.is_seasonal}
                  onCheckedChange={(checked) => setFormData({...formData, is_seasonal: checked})}
                />
                <Label htmlFor="is_seasonal" className="flex items-center gap-2 cursor-pointer">
                  <Snowflake className="w-4 h-4 text-blue-400" />
                  Seasonal / Holiday Product
                </Label>
              </div>
              
              {formData.is_seasonal && (
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div className="space-y-2">
                    <Label className="text-xs text-zinc-500">Season</Label>
                    <Select value={formData.season || "none"} onValueChange={(v) => setFormData({...formData, season: v === "none" ? "" : v})}>
                      <SelectTrigger className="bg-zinc-800 border-zinc-700">
                        <SelectValue placeholder="Select season" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {SEASONS.map(s => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-zinc-500">Holiday</Label>
                    <Select value={formData.holiday || "none"} onValueChange={(v) => setFormData({...formData, holiday: v === "none" ? "" : v})}>
                      <SelectTrigger className="bg-zinc-800 border-zinc-700">
                        <SelectValue placeholder="Select holiday" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {HOLIDAYS.map(h => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            {/* Ingredients */}
            <div className="space-y-3">
              <Label className="text-base">Ingredients</Label>
              <DragDropContext onDragEnd={(result) => handleDragEnd(result, 'ingredients')}>
                <Droppable droppableId="ingredients">
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                      {formData.ingredients.map((ing, idx) => (
                        <Draggable key={idx} draggableId={`ing-${idx}`} index={idx}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`grid grid-cols-12 gap-2 items-end p-3 bg-zinc-800/50 rounded-lg ${snapshot.isDragging ? 'ring-2 ring-orange-500' : ''}`}
                            >
                              <div {...provided.dragHandleProps} className="col-span-1 flex items-center justify-center cursor-grab">
                                <GripVertical className="w-4 h-4 text-zinc-500" />
                              </div>
                              <div className="col-span-3">
                                <Label className="text-xs">SKU</Label>
                                <IngredientSkuSelect
                                  inventory={inventory}
                                  value={ing.sku}
                                  onChange={(v) => updateIngredient(idx, 'sku', v)}
                                />
                              </div>
                              <div className="col-span-3">
                                <Label className="text-xs">Material</Label>
                                <Input
                                  value={ing.material}
                                  onChange={(e) => updateIngredient(idx, 'material', e.target.value)}
                                  className="bg-zinc-800 border-zinc-700"
                                />
                              </div>
                              <div className="col-span-2">
                                <Label className="text-xs">Quantity</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={ing.qty}
                                  onChange={(e) => updateIngredient(idx, 'qty', parseFloat(e.target.value) || 0)}
                                  className="bg-zinc-800 border-zinc-700"
                                />
                              </div>
                              <div className="col-span-2">
                                <Label className="text-xs">Unit</Label>
                                <CompatibleUnitSelect
                                  value={ing.unit}
                                  onChange={(v) => updateIngredient(idx, 'unit', v)}
                                  inventoryUnit={inventory.find(i => i.sku === ing.sku)?.unit}
                                />
                              </div>
                              <div className="col-span-2">
                                <Label className="text-xs">Stock Info</Label>
                                <IngredientConversionHint 
                                  ingredient={ing}
                                  inventoryItem={inventory.find(i => i.sku === ing.sku)}
                                />
                              </div>
                              <div className="col-span-1">
                                <Button type="button" variant="ghost" size="sm" onClick={() => removeIngredient(idx)} className="text-red-400">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
              <Button type="button" variant="outline" size="sm" onClick={addIngredient} className="w-full">
                <Plus className="w-4 h-4 mr-1" /> Add Ingredient
              </Button>
            </div>

            {/* Packaging */}
            <div className="space-y-3">
              <Label className="text-base flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-400" />
                Packaging
              </Label>
              <DragDropContext onDragEnd={(result) => handleDragEnd(result, 'packaging')}>
                <Droppable droppableId="packaging">
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                      {formData.packaging.map((pkg, idx) => (
                        <Draggable key={idx} draggableId={`pkg-${idx}`} index={idx}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`grid grid-cols-12 gap-2 items-end p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg ${snapshot.isDragging ? 'ring-2 ring-blue-500' : ''}`}
                            >
                              <div {...provided.dragHandleProps} className="col-span-1 flex items-center justify-center cursor-grab">
                                <GripVertical className="w-4 h-4 text-zinc-500" />
                              </div>
                              <div className="col-span-4">
                                <Label className="text-xs">Packaging Item</Label>
                                <PackagingSkuSelect
                                  inventory={inventory}
                                  value={pkg.sku}
                                  onChange={(sku, item) => handlePackagingSelect(idx, sku, item)}
                                />
                              </div>
                              <div className="col-span-3">
                                <Label className="text-xs">Qty per Unit</Label>
                                <Input
                                  type="number"
                                  step="1"
                                  min="1"
                                  value={pkg.qty_per_unit}
                                  onChange={(e) => updatePackaging(idx, 'qty_per_unit', parseInt(e.target.value) || 1)}
                                  className="bg-zinc-800 border-zinc-700"
                                />
                              </div>
                              <div className="col-span-3">
                                <Label className="text-xs">Qty per Batch</Label>
                                <Input
                                  type="number"
                                  value={pkg.qty_per_batch}
                                  onChange={(e) => updatePackaging(idx, 'qty_per_batch', parseInt(e.target.value) || 0)}
                                  className="bg-zinc-800 border-zinc-700"
                                />
                              </div>
                              <div className="col-span-1">
                                <Button type="button" variant="ghost" size="sm" onClick={() => removePackaging(idx)} className="text-red-400">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
              {formData.packaging.length === 0 && (
                <p className="text-sm text-zinc-500 text-center py-2">No packaging items added</p>
              )}
              <Button type="button" variant="outline" size="sm" onClick={addPackaging} className="w-full">
                <Plus className="w-4 h-4 mr-1" /> Add Packaging
              </Button>
            </div>

            {/* Procedures */}
            <div className="space-y-3">
              <Label className="text-base">Manufacturing Procedures</Label>
              <DragDropContext onDragEnd={(result) => handleDragEnd(result, 'procedures')}>
                <Droppable droppableId="procedures">
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                      {formData.procedures.map((proc, idx) => (
                        <Draggable key={idx} draggableId={`proc-${idx}`} index={idx}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`p-3 bg-zinc-800/50 rounded-lg ${snapshot.isDragging ? 'ring-2 ring-orange-500' : ''}`}
                            >
                              <div className="flex items-start gap-3">
                                <div {...provided.dragHandleProps} className="cursor-grab mt-2">
                                  <GripVertical className="w-4 h-4 text-zinc-500" />
                                </div>
                                <div className="w-8 h-8 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center font-bold shrink-0">
                                  {proc.step}
                                </div>
                                <div className="flex-1 space-y-2">
                                  <Textarea
                                    value={proc.description}
                                    onChange={(e) => updateProcedure(idx, 'description', e.target.value)}
                                    placeholder="Step description..."
                                    className="bg-zinc-800 border-zinc-700 min-h-16"
                                  />
                                  <div className="grid grid-cols-2 gap-2">
                                    <Input
                                      type="number"
                                      value={proc.duration_minutes}
                                      onChange={(e) => updateProcedure(idx, 'duration_minutes', parseInt(e.target.value) || 0)}
                                      placeholder="Duration (min)"
                                      className="bg-zinc-800 border-zinc-700"
                                    />
                                    <Input
                                      value={proc.notes}
                                      onChange={(e) => updateProcedure(idx, 'notes', e.target.value)}
                                      placeholder="Notes"
                                      className="bg-zinc-800 border-zinc-700"
                                    />
                                  </div>
                                </div>
                                <Button type="button" variant="ghost" size="sm" onClick={() => removeProcedure(idx)} className="text-red-400">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
              <Button type="button" variant="outline" size="sm" onClick={addProcedure} className="w-full">
                <Plus className="w-4 h-4 mr-1" /> Add Step
              </Button>
            </div>

            {/* QC Checks */}
            <div className="space-y-3">
              <Label className="text-base">QC Checkpoints</Label>
              <DragDropContext onDragEnd={(result) => handleDragEnd(result, 'qc_checks')}>
                <Droppable droppableId="qc_checks">
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                      {formData.qc_checks.map((qc, idx) => (
                        <Draggable key={idx} draggableId={`qc-${idx}`} index={idx}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`grid grid-cols-12 gap-2 items-end p-3 bg-zinc-800/50 rounded-lg ${snapshot.isDragging ? 'ring-2 ring-orange-500' : ''}`}
                            >
                              <div {...provided.dragHandleProps} className="col-span-1 flex items-center justify-center cursor-grab">
                                <GripVertical className="w-4 h-4 text-zinc-500" />
                              </div>
                              <div className="col-span-4">
                                <Label className="text-xs">Checkpoint</Label>
                                <Input
                                  value={qc.checkpoint}
                                  onChange={(e) => updateQCCheck(idx, 'checkpoint', e.target.value)}
                                  placeholder="e.g., Visual Inspection"
                                  className="bg-zinc-800 border-zinc-700"
                                />
                              </div>
                              <div className="col-span-3">
                                <Label className="text-xs">Criteria</Label>
                                <Input
                                  value={qc.criteria}
                                  onChange={(e) => updateQCCheck(idx, 'criteria', e.target.value)}
                                  placeholder="e.g., No visible defects"
                                  className="bg-zinc-800 border-zinc-700"
                                />
                              </div>
                              <div className="col-span-3">
                                <Label className="text-xs">Method</Label>
                                <Input
                                  value={qc.method}
                                  onChange={(e) => updateQCCheck(idx, 'method', e.target.value)}
                                  placeholder="e.g., Visual"
                                  className="bg-zinc-800 border-zinc-700"
                                />
                              </div>
                              <div className="col-span-1">
                                <Button type="button" variant="ghost" size="sm" onClick={() => removeQCCheck(idx)} className="text-red-400">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
              <Button type="button" variant="outline" size="sm" onClick={addQCCheck} className="w-full">
                <Plus className="w-4 h-4 mr-1" /> Add Check
              </Button>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
              <Button type="submit" className="bg-orange-500 hover:bg-orange-600">
                {editItem ? 'Update' : 'Create'} Recipe
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Print Dialog */}
      <PrintRecipesDialog
        open={showPrintDialog}
        onOpenChange={setShowPrintDialog}
        recipes={recipes}
      />

      {/* View Modal */}
      <Dialog open={showViewModal} onOpenChange={setShowViewModal}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedRecipe?.name}</DialogTitle>
          </DialogHeader>
          {selectedRecipe && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 p-4 bg-zinc-800/50 rounded-lg">
                <div>
                  <p className="text-sm text-zinc-500">SKU</p>
                  <p className="font-mono text-orange-400">{selectedRecipe.sku}</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Category</p>
                  <p className="text-zinc-200">{selectedRecipe.category}</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Batch Size</p>
                  <p className="text-zinc-200">{selectedRecipe.batch_size} units</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Production Line</p>
                  <p className="text-zinc-200">Line {selectedRecipe.production_line || 1}</p>
                </div>
              </div>

              {/* Version Info */}
              <div className="flex items-center gap-4 p-3 bg-zinc-800/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-orange-400" />
                  <span className="text-sm text-zinc-400">Version:</span>
                  <span className="font-semibold text-zinc-200">{selectedRecipe.version || 1}</span>
                </div>
                {selectedRecipe.version_notes && (
                  <span className="text-sm text-zinc-500">• {selectedRecipe.version_notes}</span>
                )}
              </div>

              {/* Batch Cost Section */}
              <div className="p-4 bg-zinc-800/50 rounded-lg">
                <BatchCostDisplay 
                  recipe={selectedRecipe} 
                  inventory={inventory} 
                  showBreakdown={true}
                />
              </div>

              {selectedRecipe.ingredients?.length > 0 && (
                <div>
                  <h3 className="font-semibold text-zinc-200 mb-3">Ingredients</h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-700">
                        <th className="text-left py-2 text-zinc-400">SKU</th>
                        <th className="text-left py-2 text-zinc-400">Material</th>
                        <th className="text-right py-2 text-zinc-400">Quantity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRecipe.ingredients.map((ing, idx) => (
                        <tr key={idx} className="border-b border-zinc-800">
                          <td className="py-2 font-mono text-orange-400">{ing.sku}</td>
                          <td className="py-2 text-zinc-200">{ing.material}</td>
                          <td className="py-2 text-right text-zinc-200">{ing.qty} {ing.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedRecipe.packaging?.length > 0 && (
                <div>
                  <h3 className="font-semibold text-zinc-200 mb-3 flex items-center gap-2">
                    <Package className="w-4 h-4 text-blue-400" />
                    Packaging
                  </h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-700">
                        <th className="text-left py-2 text-zinc-400">SKU</th>
                        <th className="text-left py-2 text-zinc-400">Item</th>
                        <th className="text-right py-2 text-zinc-400">Per Unit</th>
                        <th className="text-right py-2 text-zinc-400">Per Batch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRecipe.packaging.map((pkg, idx) => (
                        <tr key={idx} className="border-b border-zinc-800">
                          <td className="py-2 font-mono text-blue-400">{pkg.sku}</td>
                          <td className="py-2 text-zinc-200">{pkg.name}</td>
                          <td className="py-2 text-right text-zinc-200">{pkg.qty_per_unit}</td>
                          <td className="py-2 text-right text-zinc-200">{pkg.qty_per_batch}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedRecipe.procedures?.length > 0 && (
                <div>
                  <h3 className="font-semibold text-zinc-200 mb-3">Procedures</h3>
                  <div className="space-y-3">
                    {selectedRecipe.procedures.map((proc, idx) => (
                      <div key={idx} className="flex gap-3">
                        <div className="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-sm font-bold shrink-0">
                          {proc.step}
                        </div>
                        <div>
                          <p className="text-zinc-200">{proc.description}</p>
                          {proc.duration_minutes > 0 && (
                            <p className="text-xs text-zinc-500 mt-1">{proc.duration_minutes} min</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedRecipe.qc_checks?.length > 0 && (
                <div>
                  <h3 className="font-semibold text-zinc-200 mb-3">QC Checkpoints</h3>
                  <div className="space-y-2">
                    {selectedRecipe.qc_checks.map((qc, idx) => (
                      <div key={idx} className="p-3 bg-zinc-800/50 rounded-lg">
                        <p className="font-medium text-zinc-200">{qc.checkpoint}</p>
                        <p className="text-sm text-zinc-400">{qc.criteria}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmRecipe} onOpenChange={(open) => !open && setDeleteConfirmRecipe(null)}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-100">Delete Recipe</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to delete <span className="font-semibold text-zinc-200">{deleteConfirmRecipe?.name}</span> ({deleteConfirmRecipe?.sku})?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 border-zinc-700 hover:bg-zinc-700">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Template Selection Dialog */}
      <Dialog open={showTemplateSelect} onOpenChange={setShowTemplateSelect}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-zinc-100 flex items-center gap-2">
              <FileInput className="w-5 h-5 text-orange-400" />
              Start New Recipe
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <Button
              onClick={() => startFromTemplate(null)}
              variant="outline"
              className="w-full justify-start h-auto py-3"
            >
              <Plus className="w-5 h-5 mr-3" />
              <div className="text-left">
                <p className="font-medium">Start from Scratch</p>
                <p className="text-xs text-zinc-500">Create a blank recipe</p>
              </div>
            </Button>
            
            {templates.length > 0 && (
              <>
                <div className="text-xs text-zinc-500 uppercase tracking-wider pt-2">Or choose a template:</div>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {templates.filter(t => t.active !== false).map(template => (
                    <Button
                      key={template.id}
                      onClick={() => startFromTemplate(template)}
                      variant="outline"
                      className="w-full justify-start h-auto py-3"
                    >
                      <Beaker className="w-5 h-5 mr-3 text-orange-400" />
                      <div className="text-left">
                        <p className="font-medium">{template.name}</p>
                        <p className="text-xs text-zinc-500">
                          {template.category} • {template.ingredients?.length || 0} ingredients
                        </p>
                      </div>
                    </Button>
                  ))}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Save as Template Dialog */}
      <Dialog open={!!saveAsTemplateRecipe} onOpenChange={(open) => !open && setSaveAsTemplateRecipe(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">Save Recipe as Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-zinc-400">
              This will create a template from <span className="text-zinc-200 font-medium">{saveAsTemplateRecipe?.name}</span> that can be used when creating new recipes.
            </p>
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g., Bath Bomb Base"
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveAsTemplateRecipe(null)}>Cancel</Button>
            <Button 
              onClick={handleSaveAsTemplate}
              disabled={!templateName.trim()}
              className="bg-orange-500 hover:bg-orange-600"
            >
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}