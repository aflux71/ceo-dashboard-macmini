import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Save, ArrowLeft, Calendar, Tag, Pencil, Factory, Beaker, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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

const DEFAULT_TAX_RATES = [
  { value: 5, label: "5% GST" },
  { value: 13, label: "13% HST" },
  { value: 15, label: "15% HST" }
];

const DEFAULT_PRODUCTION_TAGS = [
  { value: "urgent", label: "Urgent", color: "red", description: "High priority items that need immediate attention" },
  { value: "wholesale", label: "Wholesale", color: "blue", description: "Bulk orders for wholesale customers" },
  { value: "retail_restock", label: "Retail Restock", color: "green", description: "Regular inventory replenishment" },
  { value: "seasonal", label: "Seasonal", color: "purple", description: "Holiday or seasonal products" },
  { value: "sample", label: "Sample", color: "cyan", description: "Sample batches for testing" },
  { value: "new_product", label: "New Product", color: "amber", description: "First production run of new items" },
  { value: "event", label: "Event", color: "orange", description: "Special event or promotion orders" }
];

const DEFAULT_PRODUCTION_LINES = [
  { id: "line_1", name: "Line 1", description: "Main production line", capacity: "100 units/day", active: true },
  { id: "line_2", name: "Line 2", description: "Secondary production line", capacity: "75 units/day", active: true }
];

const DEFAULT_UNITS = ["units", "Cases", "L", "ml", "Kg", "gram"];
const DEFAULT_INVENTORY_TYPES = [
  { value: "raw_material", label: "Raw Material", color: "orange" },
  { value: "packaging", label: "Packaging", color: "blue" },
  { value: "finished_product", label: "Finished Product", color: "green" }
];

const COLOR_OPTIONS = [
  { value: "orange", label: "Orange", class: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  { value: "blue", label: "Blue", class: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  { value: "green", label: "Green", class: "bg-green-500/20 text-green-400 border-green-500/30" },
  { value: "purple", label: "Purple", class: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  { value: "amber", label: "Amber", class: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  { value: "red", label: "Red", class: "bg-red-500/20 text-red-400 border-red-500/30" },
  { value: "cyan", label: "Cyan", class: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
  { value: "default", label: "Gray", class: "bg-zinc-800 text-zinc-300 border-zinc-700" }
];

export default function MeasurementSettings() {
  const [companyName, setCompanyName] = useState("");
  const [taxRates, setTaxRates] = useState(DEFAULT_TAX_RATES);
  const [newTaxValue, setNewTaxValue] = useState("");
  const [newTaxLabel, setNewTaxLabel] = useState("");
  
  const [units, setUnits] = useState(DEFAULT_UNITS);
  const [newUnit, setNewUnit] = useState("");

  const [inventoryTypes, setInventoryTypes] = useState(DEFAULT_INVENTORY_TYPES);
  const [newTypeValue, setNewTypeValue] = useState("");
  const [newTypeLabel, setNewTypeLabel] = useState("");
  const [newTypeColor, setNewTypeColor] = useState("default");

  // Production Scheduling Settings
  const [defaultDegassingDays, setDefaultDegassingDays] = useState(0);
  const [defaultQcHoldDays, setDefaultQcHoldDays] = useState(0);
  const [productionTags, setProductionTags] = useState(DEFAULT_PRODUCTION_TAGS);
  const [productionLines, setProductionLines] = useState(DEFAULT_PRODUCTION_LINES);
  
  // Tag modal state
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState(null);
  const [tagForm, setTagForm] = useState({ value: "", label: "", color: "default", description: "" });
  const [deleteTagDialog, setDeleteTagDialog] = useState({ open: false, tag: null });
  
  // Production Line modal state
  const [lineModalOpen, setLineModalOpen] = useState(false);
  const [editingLine, setEditingLine] = useState(null);
  const [lineForm, setLineForm] = useState({ id: "", name: "", description: "", capacity: "", active: true });
  const [deleteLineDialog, setDeleteLineDialog] = useState({ open: false, line: null });

  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings', 'inventory_config'],
    queryFn: async () => {
      const allSettings = await base44.entities.AppSettings.list();
      return {
        companyName: allSettings.find(s => s.key === 'company_name'),
        taxRates: allSettings.find(s => s.key === 'tax_rates'),
        units: allSettings.find(s => s.key === 'measurement_units'),
        types: allSettings.find(s => s.key === 'inventory_types'),
        degassingDays: allSettings.find(s => s.key === 'default_degassing_days'),
        qcHoldDays: allSettings.find(s => s.key === 'default_qc_hold_days'),
        productionTags: allSettings.find(s => s.key === 'production_run_tags'),
        productionLines: allSettings.find(s => s.key === 'production_lines')
      };
    }
  });

  useEffect(() => {
    if (settings?.companyName?.value) {
      setCompanyName(settings.companyName.value);
    }
    if (settings?.taxRates?.value) {
      try {
        const parsed = JSON.parse(settings.taxRates.value);
        if (Array.isArray(parsed)) {
          setTaxRates(parsed);
        }
      } catch {
        // Keep defaults
      }
    }
    if (settings?.units?.value) {
      try {
        const parsed = JSON.parse(settings.units.value);
        if (Array.isArray(parsed)) {
          setUnits(parsed);
        }
      } catch {
        // Keep defaults
      }
    }
    if (settings?.types?.value) {
      try {
        const parsed = JSON.parse(settings.types.value);
        if (Array.isArray(parsed)) {
          setInventoryTypes(parsed);
        }
      } catch {
        // Keep defaults
      }
    }
    if (settings?.degassingDays?.value) {
      setDefaultDegassingDays(parseInt(settings.degassingDays.value) || 0);
    }
    if (settings?.qcHoldDays?.value) {
      setDefaultQcHoldDays(parseInt(settings.qcHoldDays.value) || 0);
    }
    if (settings?.productionTags?.value) {
      try {
        const parsed = JSON.parse(settings.productionTags.value);
        if (Array.isArray(parsed)) {
          setProductionTags(parsed);
        }
      } catch {
        // Keep defaults
      }
    }
    if (settings?.productionLines?.value) {
      try {
        const parsed = JSON.parse(settings.productionLines.value);
        if (Array.isArray(parsed)) {
          setProductionLines(parsed);
        }
      } catch {
        // Keep defaults
      }
    }
  }, [settings]);

  const saveCompanyNameMutation = useMutation({
    mutationFn: async (name) => {
      if (settings?.companyName?.id) {
        return base44.entities.AppSettings.update(settings.companyName.id, { value: name });
      } else {
        return base44.entities.AppSettings.create({
          key: 'company_name',
          value: name,
          description: 'Company name for documents'
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'inventory_config'] });
      toast.success('Company name saved');
    },
    onError: () => {
      toast.error('Failed to save company name');
    }
  });

  const saveTaxRatesMutation = useMutation({
    mutationFn: async (rates) => {
      const value = JSON.stringify(rates);
      if (settings?.taxRates?.id) {
        return base44.entities.AppSettings.update(settings.taxRates.id, { value });
      } else {
        return base44.entities.AppSettings.create({
          key: 'tax_rates',
          value,
          description: 'Tax rate presets for purchase orders'
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'inventory_config'] });
      toast.success('Tax rates saved');
    },
    onError: () => {
      toast.error('Failed to save tax rates');
    }
  });

  const saveUnitsMutation = useMutation({
    mutationFn: async (unitsList) => {
      const value = JSON.stringify(unitsList);
      if (settings?.units?.id) {
        return base44.entities.AppSettings.update(settings.units.id, { value });
      } else {
        return base44.entities.AppSettings.create({
          key: 'measurement_units',
          value,
          description: 'Custom measurement units for inventory'
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'inventory_config'] });
      toast.success('Measurement units saved');
    },
    onError: () => {
      toast.error('Failed to save units');
    }
  });

  const saveTypesMutation = useMutation({
    mutationFn: async (typesList) => {
      const value = JSON.stringify(typesList);
      if (settings?.types?.id) {
        return base44.entities.AppSettings.update(settings.types.id, { value });
      } else {
        return base44.entities.AppSettings.create({
          key: 'inventory_types',
          value,
          description: 'Custom inventory types with colors'
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'inventory_config'] });
      toast.success('Inventory types saved');
    },
    onError: () => {
      toast.error('Failed to save types');
    }
  });

  const addUnit = () => {
    if (!newUnit.trim()) return;
    if (units.includes(newUnit.trim())) {
      toast.error('Unit already exists');
      return;
    }
    setUnits([...units, newUnit.trim()]);
    setNewUnit("");
  };

  const removeUnit = (unitToRemove) => {
    setUnits(units.filter(u => u !== unitToRemove));
  };

  const handleSaveUnits = () => {
    saveUnitsMutation.mutate(units);
  };

  const resetUnitsToDefaults = () => {
    setUnits(DEFAULT_UNITS);
  };

  const addInventoryType = () => {
    if (!newTypeValue.trim() || !newTypeLabel.trim()) {
      toast.error('Please enter both value and label');
      return;
    }
    const valueKey = newTypeValue.trim().toLowerCase().replace(/\s+/g, '_');
    if (inventoryTypes.some(t => t.value === valueKey)) {
      toast.error('Type value already exists');
      return;
    }
    setInventoryTypes([...inventoryTypes, { 
      value: valueKey, 
      label: newTypeLabel.trim(), 
      color: newTypeColor 
    }]);
    setNewTypeValue("");
    setNewTypeLabel("");
    setNewTypeColor("default");
  };

  const removeInventoryType = (valueToRemove) => {
    setInventoryTypes(inventoryTypes.filter(t => t.value !== valueToRemove));
  };

  const handleSaveInventoryTypes = () => {
    saveTypesMutation.mutate(inventoryTypes);
  };

  const resetInventoryTypesToDefaults = () => {
    setInventoryTypes(DEFAULT_INVENTORY_TYPES);
  };

  // Production Scheduling Mutations
  const saveProductionSettingsMutation = useMutation({
    mutationFn: async ({ degassing, qcHold }) => {
      const promises = [];
      
      // Save degassing days
      if (settings?.degassingDays?.id) {
        promises.push(base44.entities.AppSettings.update(settings.degassingDays.id, { value: String(degassing) }));
      } else {
        promises.push(base44.entities.AppSettings.create({
          key: 'default_degassing_days',
          value: String(degassing),
          description: 'Default degassing time in days for production'
        }));
      }
      
      // Save QC hold days
      if (settings?.qcHoldDays?.id) {
        promises.push(base44.entities.AppSettings.update(settings.qcHoldDays.id, { value: String(qcHold) }));
      } else {
        promises.push(base44.entities.AppSettings.create({
          key: 'default_qc_hold_days',
          value: String(qcHold),
          description: 'Default QC hold time in days before filling'
        }));
      }
      
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'inventory_config'] });
      toast.success('Production settings saved');
    },
    onError: () => {
      toast.error('Failed to save production settings');
    }
  });

  const saveProductionTagsMutation = useMutation({
    mutationFn: async (tagsList) => {
      const value = JSON.stringify(tagsList);
      if (settings?.productionTags?.id) {
        return base44.entities.AppSettings.update(settings.productionTags.id, { value });
      } else {
        return base44.entities.AppSettings.create({
          key: 'production_run_tags',
          value,
          description: 'Custom tags for production scheduling'
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'inventory_config'] });
      toast.success('Production tags saved');
    },
    onError: () => {
      toast.error('Failed to save tags');
    }
  });

  const saveProductionLinesMutation = useMutation({
    mutationFn: async (linesList) => {
      const value = JSON.stringify(linesList);
      if (settings?.productionLines?.id) {
        return base44.entities.AppSettings.update(settings.productionLines.id, { value });
      } else {
        return base44.entities.AppSettings.create({
          key: 'production_lines',
          value,
          description: 'Production line configurations'
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'inventory_config'] });
      toast.success('Production lines saved');
    },
    onError: () => {
      toast.error('Failed to save production lines');
    }
  });

  // Tag CRUD handlers
  const openTagModal = (tag = null) => {
    if (tag) {
      setEditingTag(tag);
      setTagForm({ value: tag.value, label: tag.label, color: tag.color, description: tag.description || "" });
    } else {
      setEditingTag(null);
      setTagForm({ value: "", label: "", color: "default", description: "" });
    }
    setTagModalOpen(true);
  };

  const handleSaveTag = () => {
    if (!tagForm.label.trim()) {
      toast.error('Please enter a tag name');
      return;
    }
    const valueKey = tagForm.value.trim() || tagForm.label.trim().toLowerCase().replace(/\s+/g, '_');
    
    let updatedTags;
    if (editingTag) {
      updatedTags = productionTags.map(t => 
        t.value === editingTag.value 
          ? { ...tagForm, value: valueKey }
          : t
      );
    } else {
      if (productionTags.some(t => t.value === valueKey)) {
        toast.error('Tag already exists');
        return;
      }
      updatedTags = [...productionTags, { ...tagForm, value: valueKey }];
    }
    
    setProductionTags(updatedTags);
    saveProductionTagsMutation.mutate(updatedTags);
    setTagModalOpen(false);
  };

  const confirmDeleteTag = (tag) => {
    setDeleteTagDialog({ open: true, tag });
  };

  const handleDeleteTag = () => {
    const updatedTags = productionTags.filter(t => t.value !== deleteTagDialog.tag.value);
    setProductionTags(updatedTags);
    saveProductionTagsMutation.mutate(updatedTags);
    setDeleteTagDialog({ open: false, tag: null });
  };

  // Production Line CRUD handlers
  const openLineModal = (line = null) => {
    if (line) {
      setEditingLine(line);
      setLineForm({ ...line });
    } else {
      setEditingLine(null);
      const nextId = `line_${productionLines.length + 1}`;
      setLineForm({ id: nextId, name: "", description: "", capacity: "", active: true });
    }
    setLineModalOpen(true);
  };

  const handleSaveLine = () => {
    if (!lineForm.name.trim()) {
      toast.error('Please enter a line name');
      return;
    }
    
    let updatedLines;
    if (editingLine) {
      updatedLines = productionLines.map(l => 
        l.id === editingLine.id ? { ...lineForm } : l
      );
    } else {
      if (productionLines.some(l => l.id === lineForm.id)) {
        toast.error('Line ID already exists');
        return;
      }
      updatedLines = [...productionLines, { ...lineForm }];
    }
    
    setProductionLines(updatedLines);
    saveProductionLinesMutation.mutate(updatedLines);
    setLineModalOpen(false);
  };

  const confirmDeleteLine = (line) => {
    setDeleteLineDialog({ open: true, line });
  };

  const handleDeleteLine = () => {
    const updatedLines = productionLines.filter(l => l.id !== deleteLineDialog.line.id);
    setProductionLines(updatedLines);
    saveProductionLinesMutation.mutate(updatedLines);
    setDeleteLineDialog({ open: false, line: null });
  };

  const handleSaveProductionSettings = () => {
    saveProductionSettingsMutation.mutate({ 
      degassing: defaultDegassingDays, 
      qcHold: defaultQcHoldDays 
    });
  };

  const resetProductionTagsToDefaults = () => {
    setProductionTags(DEFAULT_PRODUCTION_TAGS);
    saveProductionTagsMutation.mutate(DEFAULT_PRODUCTION_TAGS);
  };

  const resetProductionLinesToDefaults = () => {
    setProductionLines(DEFAULT_PRODUCTION_LINES);
    saveProductionLinesMutation.mutate(DEFAULT_PRODUCTION_LINES);
  };

  const getColorClass = (color) => {
    return COLOR_OPTIONS.find(c => c.value === color)?.class || COLOR_OPTIONS[7].class;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to={createPageUrl("Inventory")}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Inventory
          </Button>
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Settings</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Configure company info, tax rates, measurement units and inventory types
        </p>
      </div>

      {/* Company Settings Card */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg">Company Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Company Name</Label>
            <p className="text-xs text-zinc-500">Used on Purchase Orders and other documents</p>
            <div className="flex gap-2">
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Your Company Name"
                className="bg-zinc-800 border-zinc-700 max-w-sm"
              />
              <Button onClick={() => saveCompanyNameMutation.mutate(companyName)} className="bg-orange-500 hover:bg-orange-600">
                <Save className="w-4 h-4 mr-2" />
                Save
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tax Rates Card */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg">Tax Rate Presets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-zinc-500">
            Define tax rate presets for quick selection on Purchase Orders. You can still enter manual amounts.
          </p>
          <div className="flex flex-wrap gap-2">
            {taxRates.map((rate, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2"
              >
                <span className="text-zinc-200">{rate.label} ({rate.value}%)</span>
                <button
                  onClick={() => setTaxRates(taxRates.filter((_, i) => i !== idx))}
                  className="text-zinc-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-xs text-zinc-500">Rate (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={newTaxValue}
                onChange={(e) => setNewTaxValue(e.target.value)}
                placeholder="13"
                className="bg-zinc-800 border-zinc-700 w-24"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-zinc-500">Label</Label>
              <Input
                value={newTaxLabel}
                onChange={(e) => setNewTaxLabel(e.target.value)}
                placeholder="e.g., 13% HST"
                className="bg-zinc-800 border-zinc-700 w-40"
              />
            </div>
            <Button 
              onClick={() => {
                if (!newTaxValue || !newTaxLabel.trim()) {
                  toast.error('Please enter both rate and label');
                  return;
                }
                setTaxRates([...taxRates, { value: parseFloat(newTaxValue), label: newTaxLabel.trim() }]);
                setNewTaxValue("");
                setNewTaxLabel("");
              }} 
              variant="outline"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add
            </Button>
          </div>
          <div className="flex gap-2 pt-4 border-t border-zinc-800">
            <Button onClick={() => saveTaxRatesMutation.mutate(taxRates)} className="bg-orange-500 hover:bg-orange-600">
              <Save className="w-4 h-4 mr-2" />
              Save Tax Rates
            </Button>
            <Button onClick={() => setTaxRates(DEFAULT_TAX_RATES)} variant="outline">
              Reset to Defaults
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recipe Templates Link */}
      <Link to={createPageUrl("RecipeTemplates")}>
        <Card className="bg-zinc-900 border-zinc-800 hover:border-orange-500/30 transition-colors cursor-pointer">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                <Beaker className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <h3 className="font-medium text-zinc-100">Recipe Templates</h3>
                <p className="text-sm text-zinc-500">Manage base formulations for new recipes</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-zinc-500" />
          </CardContent>
        </Card>
      </Link>

      {/* Measurement Units Card */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg">Measurement Units</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-zinc-500">Loading...</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {units.map((unit) => (
                  <div
                    key={unit}
                    className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2"
                  >
                    <span className="text-zinc-200">{unit}</span>
                    <button
                      onClick={() => removeUnit(unit)}
                      className="text-zinc-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Input
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  placeholder="Add new unit (e.g., oz, lb, box)"
                  className="bg-zinc-800 border-zinc-700 max-w-xs"
                  onKeyDown={(e) => e.key === 'Enter' && addUnit()}
                />
                <Button onClick={addUnit} variant="outline">
                  <Plus className="w-4 h-4 mr-2" />
                  Add
                </Button>
              </div>

              <div className="flex gap-2 pt-4 border-t border-zinc-800">
                <Button onClick={handleSaveUnits} className="bg-orange-500 hover:bg-orange-600">
                  <Save className="w-4 h-4 mr-2" />
                  Save Units
                </Button>
                <Button onClick={resetUnitsToDefaults} variant="outline">
                  Reset to Defaults
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Inventory Types Card */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg">Inventory Types</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-zinc-500">Loading...</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {inventoryTypes.map((type) => (
                  <div
                    key={type.value}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${getColorClass(type.color)}`}
                  >
                    <span>{type.label}</span>
                    <span className="text-xs opacity-60">({type.value})</span>
                    <button
                      onClick={() => removeInventoryType(type.value)}
                      className="opacity-60 hover:opacity-100 hover:text-red-400 transition-colors ml-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="space-y-3 p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
                <Label className="text-sm text-zinc-400">Add New Type</Label>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-zinc-500">Value (key)</Label>
                    <Input
                      value={newTypeValue}
                      onChange={(e) => setNewTypeValue(e.target.value)}
                      placeholder="e.g., component"
                      className="bg-zinc-800 border-zinc-700"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-zinc-500">Display Label</Label>
                    <Input
                      value={newTypeLabel}
                      onChange={(e) => setNewTypeLabel(e.target.value)}
                      placeholder="e.g., Component"
                      className="bg-zinc-800 border-zinc-700"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-zinc-500">Color</Label>
                    <div className="flex gap-1 flex-wrap">
                      {COLOR_OPTIONS.map((color) => (
                        <button
                          key={color.value}
                          onClick={() => setNewTypeColor(color.value)}
                          className={`w-6 h-6 rounded border-2 transition-all ${
                            newTypeColor === color.value ? 'ring-2 ring-white ring-offset-1 ring-offset-zinc-900' : ''
                          } ${color.class}`}
                          title={color.label}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <Button onClick={addInventoryType} variant="outline" size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Type
                </Button>
              </div>

              <div className="flex gap-2 pt-4 border-t border-zinc-800">
                <Button onClick={handleSaveInventoryTypes} className="bg-orange-500 hover:bg-orange-600">
                  <Save className="w-4 h-4 mr-2" />
                  Save Types
                </Button>
                <Button onClick={resetInventoryTypesToDefaults} variant="outline">
                  Reset to Defaults
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Production Scheduling Settings */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="w-5 h-5 text-orange-400" />
            Production Scheduling Defaults
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-zinc-500">Loading...</p>
          ) : (
            <>
              <p className="text-sm text-zinc-500">
                Set default timing values for production scheduling. These can be overridden per recipe or per individual run.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-300">Default Degassing Time (days)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={defaultDegassingDays}
                    onChange={(e) => setDefaultDegassingDays(parseInt(e.target.value) || 0)}
                    className="bg-zinc-800 border-zinc-700"
                  />
                  <p className="text-xs text-zinc-500">Time required for products to degas after blending</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300">Default QC Hold Time (days)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={defaultQcHoldDays}
                    onChange={(e) => setDefaultQcHoldDays(parseInt(e.target.value) || 0)}
                    className="bg-zinc-800 border-zinc-700"
                  />
                  <p className="text-xs text-zinc-500">Time required for QC inspection before filling</p>
                </div>
              </div>
              <div className="flex gap-2 pt-4 border-t border-zinc-800">
                <Button onClick={handleSaveProductionSettings} className="bg-orange-500 hover:bg-orange-600">
                  <Save className="w-4 h-4 mr-2" />
                  Save Defaults
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Production Tags - Table View */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Tag className="w-5 h-5 text-orange-400" />
            Production Run Tags
          </CardTitle>
          <Button onClick={() => openTagModal()} size="sm" className="bg-orange-500 hover:bg-orange-600">
            <Plus className="w-4 h-4 mr-2" />
            Add Tag
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-zinc-500">Loading...</p>
          ) : (
            <>
              <p className="text-sm text-zinc-500 mb-4">
                Define custom tags for categorizing scheduled production runs.
              </p>
              <div className="border border-zinc-800 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-zinc-800/50">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase">Name</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase">Description</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase">Color</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-zinc-400 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {productionTags.map((tag) => (
                      <tr key={tag.value} className="hover:bg-zinc-800/30">
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-1 rounded text-sm border ${getColorClass(tag.color)}`}>
                            {tag.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-zinc-400">
                          {tag.description || "-"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`w-6 h-6 rounded inline-block border ${getColorClass(tag.color)}`} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => openTagModal(tag)}
                              className="p-1.5 text-zinc-400 hover:text-orange-400 hover:bg-zinc-800 rounded transition-colors"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => confirmDeleteTag(tag)}
                              className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2 pt-4 mt-4 border-t border-zinc-800">
                <Button onClick={resetProductionTagsToDefaults} variant="outline" size="sm">
                  Reset to Defaults
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Production Lines - Card View */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Factory className="w-5 h-5 text-orange-400" />
            Production Lines
          </CardTitle>
          <Button onClick={() => openLineModal()} size="sm" className="bg-orange-500 hover:bg-orange-600">
            <Plus className="w-4 h-4 mr-2" />
            Add Line
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-zinc-500">Loading...</p>
          ) : (
            <>
              <p className="text-sm text-zinc-500 mb-4">
                Configure production lines and their capacities.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {productionLines.map((line) => (
                  <div 
                    key={line.id} 
                    className={`p-4 rounded-lg border ${line.active ? 'bg-zinc-800/50 border-zinc-700' : 'bg-zinc-900 border-zinc-800 opacity-60'}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-medium text-zinc-100">{line.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded ${line.active ? 'bg-green-500/20 text-green-400' : 'bg-zinc-700 text-zinc-500'}`}>
                          {line.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => openLineModal(line)}
                          className="p-1.5 text-zinc-400 hover:text-orange-400 hover:bg-zinc-700 rounded transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => confirmDeleteLine(line)}
                          className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-zinc-700 rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {line.description && (
                      <p className="text-sm text-zinc-400 mb-2">{line.description}</p>
                    )}
                    {line.capacity && (
                      <p className="text-xs text-zinc-500">Capacity: {line.capacity}</p>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-4 mt-4 border-t border-zinc-800">
                <Button onClick={resetProductionLinesToDefaults} variant="outline" size="sm">
                  Reset to Defaults
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Tag Modal */}
      <Dialog open={tagModalOpen} onOpenChange={setTagModalOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle>{editingTag ? 'Edit Tag' : 'Add New Tag'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tag Name *</Label>
              <Input
                value={tagForm.label}
                onChange={(e) => setTagForm({ ...tagForm, label: e.target.value })}
                placeholder="e.g., Rush Order"
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                value={tagForm.description}
                onChange={(e) => setTagForm({ ...tagForm, description: e.target.value })}
                placeholder="Describe when to use this tag"
                className="bg-zinc-800 border-zinc-700"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2 flex-wrap">
                {COLOR_OPTIONS.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => setTagForm({ ...tagForm, color: color.value })}
                    className={`w-8 h-8 rounded border-2 transition-all flex items-center justify-center ${
                      tagForm.color === color.value ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900' : ''
                    } ${color.class}`}
                    title={color.label}
                  />
                ))}
              </div>
            </div>
            <div className="pt-2">
              <Label className="text-zinc-500 text-sm">Preview:</Label>
              <span className={`inline-flex items-center px-3 py-1 rounded text-sm border mt-1 ${getColorClass(tagForm.color)}`}>
                {tagForm.label || 'Tag Name'}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTagModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveTag} className="bg-orange-500 hover:bg-orange-600">
              {editingTag ? 'Update' : 'Add'} Tag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Tag Confirmation */}
      <AlertDialog open={deleteTagDialog.open} onOpenChange={(open) => setDeleteTagDialog({ ...deleteTagDialog, open })}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tag</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the tag "{deleteTagDialog.tag?.label}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTag} className="bg-red-500 hover:bg-red-600">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Production Line Modal */}
      <Dialog open={lineModalOpen} onOpenChange={setLineModalOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle>{editingLine ? 'Edit Production Line' : 'Add Production Line'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Line Name *</Label>
              <Input
                value={lineForm.name}
                onChange={(e) => setLineForm({ ...lineForm, name: e.target.value })}
                placeholder="e.g., Line 3"
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={lineForm.description}
                onChange={(e) => setLineForm({ ...lineForm, description: e.target.value })}
                placeholder="Describe this production line"
                className="bg-zinc-800 border-zinc-700"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Capacity</Label>
              <Input
                value={lineForm.capacity}
                onChange={(e) => setLineForm({ ...lineForm, capacity: e.target.value })}
                placeholder="e.g., 100 units/day"
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="lineActive"
                checked={lineForm.active}
                onChange={(e) => setLineForm({ ...lineForm, active: e.target.checked })}
                className="w-4 h-4 rounded border-zinc-700 bg-zinc-800"
              />
              <Label htmlFor="lineActive" className="cursor-pointer">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLineModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveLine} className="bg-orange-500 hover:bg-orange-600">
              {editingLine ? 'Update' : 'Add'} Line
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Line Confirmation */}
      <AlertDialog open={deleteLineDialog.open} onOpenChange={(open) => setDeleteLineDialog({ ...deleteLineDialog, open })}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Production Line</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteLineDialog.line?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteLine} className="bg-red-500 hover:bg-red-600">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}