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
  GripVertical,
  Snowflake,
  Package,
  Copy
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import Badge from "@/components/ui/Badge";
import IngredientSkuSelect from "@/components/recipes/IngredientSkuSelect";
import CompatibleUnitSelect from "@/components/recipes/CompatibleUnitSelect";
import PackagingSkuSelect from "@/components/recipes/PackagingSkuSelect";
import { useFloorPin } from "@/components/auth/FloorPinContext";
import { Shield } from "lucide-react";
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

const CATEGORIES = ["Bath Bombs", "Body Wash", "Scrubs", "Lotions", "Oils", "Soaps", "Shampoo Bars", "Candles", "Other"];
const SEASONS = ["Spring", "Summer", "Fall", "Winter"];
const HOLIDAYS = ["Christmas", "Valentine's Day", "Easter", "Mother's Day", "Halloween", "Thanksgiving", "New Year", "Other"];

export default function RecipeTemplates() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [deleteConfirmTemplate, setDeleteConfirmTemplate] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    category: "Other",
    description: "",
    batch_size: 0,
    production_line: 1,
    ingredients: [],
    packaging: [],
    procedures: [],
    qc_checks: [],
    is_seasonal: false,
    season: "",
    holiday: "",
    active: true
  });
  
  const { hasPermission } = useFloorPin();
  const [appUser, setAppUser] = useState(null);
  const queryClient = useQueryClient();

  React.useEffect(() => {
    base44.auth.me().then(setAppUser).catch(() => setAppUser(null));
  }, []);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['recipe-templates'],
    queryFn: () => base44.entities.RecipeTemplate.list(),
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => base44.entities.Inventory.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.RecipeTemplate.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipe-templates'] });
      closeModal();
      toast.success("Template created successfully");
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.RecipeTemplate.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipe-templates'] });
      closeModal();
      toast.success("Template updated successfully");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.RecipeTemplate.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipe-templates'] });
      toast.success("Template deleted successfully");
    }
  });

  const openModal = (template = null) => {
    if (template) {
      setEditItem(template);
      setFormData({
        name: template.name || "",
        category: template.category || "Other",
        description: template.description || "",
        batch_size: template.batch_size || 0,
        production_line: template.production_line || 1,
        ingredients: template.ingredients || [],
        packaging: template.packaging || [],
        procedures: template.procedures || [],
        qc_checks: template.qc_checks || [],
        is_seasonal: template.is_seasonal || false,
        season: template.season || "",
        holiday: template.holiday || "",
        active: template.active !== false
      });
    } else {
      setEditItem(null);
      setFormData({
        name: "",
        category: "Other",
        description: "",
        batch_size: 0,
        production_line: 1,
        ingredients: [],
        packaging: [],
        procedures: [],
        qc_checks: [],
        is_seasonal: false,
        season: "",
        holiday: "",
        active: true
      });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditItem(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editItem) {
      updateMutation.mutate({ id: editItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDragEnd = (result, listName) => {
    if (!result.destination) return;
    const items = Array.from(formData[listName]);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
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

  const addPackaging = () => {
    setFormData({
      ...formData,
      packaging: [...formData.packaging, { sku: "", name: "", qty_per_unit: 1, qty_per_batch: formData.batch_size || 0 }]
    });
  };

  const updatePackaging = (index, field, value) => {
    const newPackaging = [...formData.packaging];
    newPackaging[index][field] = value;
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

  const duplicateTemplate = (template) => {
    openModal({
      ...template,
      id: null,
      name: template.name + ' (Copy)'
    });
    setEditItem(null);
  };

  const cloneToRecipe = async (template) => {
    const newRecipeName = prompt("Enter recipe name:", template.name);
    if (!newRecipeName) return;

    const newSkuBase = newRecipeName.toUpperCase().replace(/\s+/g, '-').slice(0, 10);
    const newSku = prompt("Enter product SKU:", newSkuBase);
    if (!newSku) return;

    // Check for duplicate SKU
    const existingRecipe = templates.find(t => t.sku === newSku);
    if (existingRecipe) {
      const confirmed = window.confirm(
        `A recipe for SKU "${newSku}" already exists: "${existingRecipe.name}".\n\nDo you want to create a new version instead?`
      );
      if (!confirmed) return;
    }

    try {
      const recipeData = {
        sku: newSku,
        name: newRecipeName,
        category: template.category,
        batch_size: template.batch_size,
        production_line: template.production_line,
        ingredients: template.ingredients || [],
        packaging: template.packaging || [],
        procedures: template.procedures || [],
        qc_checks: template.qc_checks || [],
        active: true,
        version: 1,
        version_notes: `Created from template: ${template.name}`
      };

      await base44.entities.Recipe.create(recipeData);
      toast.success(`Recipe "${newRecipeName}" created from template`);
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
    } catch (error) {
      toast.error("Failed to create recipe from template");
    }
  };

  const filtered = templates.filter(template => {
    const matchesSearch = !search || 
      template.name?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === "all" || template.category === categoryFilter;
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

  const hasAccess = hasPermission("recipe_templates") || appUser?.role === "admin";

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Shield className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-zinc-300">Access Denied</h2>
          <p className="text-zinc-500 mt-2">Only owners and admins can manage templates</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Recipe Templates</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Manage base formulation templates for creating new recipes
          </p>
        </div>
        <Button onClick={() => openModal()} className="bg-orange-500 hover:bg-orange-600 text-white">
          <Plus className="w-4 h-4 mr-2" />
          Add Template
        </Button>
      </div>

      {/* Filters */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                placeholder="Search templates..."
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

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <p className="col-span-full text-center text-zinc-500 py-8">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="col-span-full text-center text-zinc-500 py-8">No templates found</p>
        ) : (
          filtered.map((template) => (
            <Card key={template.id} className={`bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors ${!template.active ? 'opacity-50' : ''}`}>
              <CardContent className="pt-6">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Beaker className="w-4 h-4 text-orange-400" />
                      <h3 className="font-semibold text-zinc-100">{template.name}</h3>
                    </div>
                    {template.description && (
                      <p className="text-xs text-zinc-500 mt-1">{template.description}</p>
                    )}
                  </div>
                  <Badge variant={getCategoryColor(template.category)}>{template.category}</Badge>
                </div>
                
                <div className="space-y-2 text-sm text-zinc-400 mb-4">
                  {template.batch_size > 0 && (
                    <p>Batch size: <span className="text-zinc-200">{template.batch_size} units</span></p>
                  )}
                  <p>Line: <span className="text-zinc-200">{template.production_line || 1}</span></p>
                  <p>Ingredients: <span className="text-zinc-200">{template.ingredients?.length || 0}</span></p>
                  {template.packaging?.length > 0 && (
                    <p>Packaging: <span className="text-zinc-200">{template.packaging.length} items</span></p>
                  )}
                  {template.is_seasonal && (
                    <div className="flex items-center gap-2 mt-1">
                      <Snowflake className="w-3 h-3 text-blue-400" />
                      <span className="text-blue-400">
                        {template.season && template.holiday ? `${template.season} / ${template.holiday}` : template.season || template.holiday}
                      </span>
                    </div>
                  )}
                  {!template.active && (
                    <Badge variant="red">Inactive</Badge>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setSelectedTemplate(template); setShowViewModal(true); }}
                    className="flex-1"
                  >
                    <Eye className="w-4 h-4 mr-1" /> View
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openModal(template)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => duplicateTemplate(template)}
                    title="Duplicate"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteConfirmTemplate(template)}
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Add/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Edit Template' : 'Add Template'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label>Template Name</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  required
                  placeholder="e.g., Bath Bomb Base"
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="What is this template for?"
                  className="bg-zinc-800 border-zinc-700"
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
              <div className="space-y-2">
                <Label>Default Batch Size (units)</Label>
                <Input
                  type="number"
                  value={formData.batch_size}
                  onChange={(e) => setFormData({...formData, batch_size: parseInt(e.target.value) || 0})}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
              <div className="space-y-2">
                <Label>Default Production Line</Label>
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
              <div className="space-y-2 flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={formData.active}
                    onCheckedChange={(checked) => setFormData({...formData, active: checked})}
                  />
                  <span className="text-sm">Active</span>
                </label>
              </div>
            </div>

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
                  Seasonal / Holiday Template
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
              <Label className="text-base">Default Ingredients</Label>
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
                Default Packaging
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
              <Button type="button" variant="outline" size="sm" onClick={addPackaging} className="w-full">
                <Plus className="w-4 h-4 mr-1" /> Add Packaging
              </Button>
            </div>

            {/* Procedures */}
            <div className="space-y-3">
              <Label className="text-base">Default Procedures</Label>
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
              <Label className="text-base">Default QC Checkpoints</Label>
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
                {editItem ? 'Update' : 'Create'} Template
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Modal */}
      <Dialog open={showViewModal} onOpenChange={setShowViewModal}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Beaker className="w-5 h-5 text-orange-400" />
              {selectedTemplate?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedTemplate && (
            <div className="space-y-6">
              {selectedTemplate.description && (
                <p className="text-zinc-400 text-sm">{selectedTemplate.description}</p>
              )}
              
              <div className="grid grid-cols-2 gap-4 p-4 bg-zinc-800/50 rounded-lg">
                <div>
                  <p className="text-sm text-zinc-500">Category</p>
                  <p className="text-zinc-200">{selectedTemplate.category}</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Default Batch Size</p>
                  <p className="text-zinc-200">{selectedTemplate.batch_size || 0} units</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Production Line</p>
                  <p className="text-zinc-200">Line {selectedTemplate.production_line || 1}</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Status</p>
                  <p className={selectedTemplate.active ? "text-green-400" : "text-red-400"}>
                    {selectedTemplate.active ? "Active" : "Inactive"}
                  </p>
                </div>
              </div>

              {selectedTemplate.ingredients?.length > 0 && (
                <div>
                  <h3 className="font-semibold text-zinc-200 mb-3">Default Ingredients</h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-700">
                        <th className="text-left py-2 text-zinc-400">SKU</th>
                        <th className="text-left py-2 text-zinc-400">Material</th>
                        <th className="text-right py-2 text-zinc-400">Quantity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTemplate.ingredients.map((ing, idx) => (
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

              {selectedTemplate.packaging?.length > 0 && (
                <div>
                  <h3 className="font-semibold text-zinc-200 mb-3 flex items-center gap-2">
                    <Package className="w-4 h-4 text-blue-400" />
                    Default Packaging
                  </h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-700">
                        <th className="text-left py-2 text-zinc-400">SKU</th>
                        <th className="text-left py-2 text-zinc-400">Item</th>
                        <th className="text-right py-2 text-zinc-400">Per Unit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTemplate.packaging.map((pkg, idx) => (
                        <tr key={idx} className="border-b border-zinc-800">
                          <td className="py-2 font-mono text-blue-400">{pkg.sku}</td>
                          <td className="py-2 text-zinc-200">{pkg.name}</td>
                          <td className="py-2 text-right text-zinc-200">{pkg.qty_per_unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedTemplate.procedures?.length > 0 && (
                <div>
                  <h3 className="font-semibold text-zinc-200 mb-3">Default Procedures</h3>
                  <div className="space-y-3">
                    {selectedTemplate.procedures.map((proc, idx) => (
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

              {selectedTemplate.qc_checks?.length > 0 && (
                <div>
                  <h3 className="font-semibold text-zinc-200 mb-3">Default QC Checkpoints</h3>
                  <div className="space-y-2">
                    {selectedTemplate.qc_checks.map((qc, idx) => (
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
      <AlertDialog open={!!deleteConfirmTemplate} onOpenChange={(open) => !open && setDeleteConfirmTemplate(null)}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-100">Delete Template</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to delete <span className="font-semibold text-zinc-200">{deleteConfirmTemplate?.name}</span>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 border-zinc-700 hover:bg-zinc-700">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                deleteMutation.mutate(deleteConfirmTemplate.id);
                setDeleteConfirmTemplate(null);
              }} 
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}