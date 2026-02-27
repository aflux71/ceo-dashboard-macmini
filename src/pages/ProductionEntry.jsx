import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import {
  Factory,
  ChevronRight,
  ChevronLeft,
  Check,
  Package,
  Beaker,
  ClipboardCheck,
  RefreshCw,
  AlertCircle,
  Scale,
  ShieldCheck,
  Lock,
  X,
  Printer,
  Play,
  Pause,
  Save,
  Trash2
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import Badge from "@/components/ui/Badge";
import { useFloorPin } from "@/components/auth/FloorPinContext";
import PinVerifyDialog from "@/components/auth/PinVerifyDialog";
import { convertUnit, areUnitsCompatible } from "@/components/utils/unitConversion";
import LotNumberSelect from "@/components/production/LotNumberSelect";
import ProductionQueuePanel from "@/components/production/ProductionQueuePanel";
import HoldReasonDialog from "@/components/production/HoldReasonDialog";
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

const STEPS = [
  { id: 1, title: "Select Product", icon: Package },
  { id: 2, title: "Batch Details", icon: Factory },
  { id: 3, title: "Materials & QC", icon: Beaker },
  { id: 4, title: "Review & Submit", icon: ClipboardCheck },
];

const initialFormData = {
  recipe_id: "",
  sku: "",
  product_name: "",
  batch_id: "",
  quantity: 0,
  production_line: 1,
  operator: "",
  production_date: new Date().toISOString().split('T')[0],
  notes: "",
  material_usage: [],
  qc_results: [],
  procedure_results: [],
  schedule_id: ""
};

export default function ProductionEntry() {
  const { floorUser } = useFloorPin();
  const [step, setStep] = useState(1);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [batchMultiplier, setBatchMultiplier] = useState(1);
  const [formData, setFormData] = useState(initialFormData);
  const [activeBatchId, setActiveBatchId] = useState(null);
  const [queueCollapsed, setQueueCollapsed] = useState(false);
  const [showHoldDialog, setShowHoldDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  // Verification state
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  const [verifyTarget, setVerifyTarget] = useState(null);

  const queryClient = useQueryClient();

  const { data: recipes = [] } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => base44.entities.Recipe.list(),
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => base44.entities.Inventory.list(),
  });

  const { data: batches = [] } = useQuery({
    queryKey: ['batches'],
    queryFn: () => base44.entities.Batch.list(),
  });

  // Check for incoming item from Production Schedule or Queue
  const [pendingScheduleItem, setPendingScheduleItem] = useState(null);
  
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const fromScheduleId = urlParams.get('fromSchedule');
    const batchId = urlParams.get('batchId');
    
    if (batchId && batches.length > 0) {
      const batch = batches.find(b => b.id === batchId);
      if (batch) {
        handleSelectBatch(batch);
        window.history.replaceState({}, '', window.location.pathname);
      }
    } else if (fromScheduleId) {
      const storedItem = sessionStorage.getItem('productionItem');
      if (storedItem) {
        const itemData = JSON.parse(storedItem);
        setPendingScheduleItem({ ...itemData, scheduleId: fromScheduleId });
        sessionStorage.removeItem('productionItem');
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, [batches]);

  // Process pending schedule item
  useEffect(() => {
    if (pendingScheduleItem && recipes.length > 0 && inventory.length > 0) {
      const recipe = recipes.find(r => r.sku === pendingScheduleItem.sku);
      if (recipe) {
        handleNewBatch();
        setSelectedRecipe(recipe);
        setBatchMultiplier(1);
        
        const materials = buildMaterialsFromRecipe(recipe);
        const qcChecks = buildQCFromRecipe(recipe);
        const procedureResults = buildProceduresFromRecipe(recipe);

        const qty = pendingScheduleItem.suggested_qty || recipe.batch_size || 0;
        
        setFormData({
          ...initialFormData,
          recipe_id: recipe.id,
          sku: recipe.sku,
          product_name: recipe.name,
          quantity: qty,
          production_line: pendingScheduleItem.assigned_production_line || recipe.production_line || 1,
          operator: floorUser?.name || '',
          material_usage: materials,
          qc_results: qcChecks,
          procedure_results: procedureResults,
          schedule_id: pendingScheduleItem.scheduleId
        });
        
        setStep(2);
        setPendingScheduleItem(null);
      }
    }
  }, [pendingScheduleItem, recipes, inventory, floorUser]);

  const buildMaterialsFromRecipe = (recipe) => {
    return (recipe.ingredients || []).map(ing => {
      const invItem = inventory.find(i => i.sku === ing.sku || i.name === ing.material);
      const recipeUnit = ing.unit || '';
      const inventoryUnit = invItem?.unit || recipeUnit;
      const sortedLots = (invItem?.lot_numbers || []).filter(l => l.quantity > 0).sort((a, b) => {
        if (!a.expiration_date) return 1;
        if (!b.expiration_date) return -1;
        return new Date(a.expiration_date) - new Date(b.expiration_date);
      });
      const defaultLot = sortedLots.length > 0 ? sortedLots[0].lot : '';
      
      return {
        material_sku: ing.sku || invItem?.sku || '',
        material_name: ing.material || invItem?.name || '',
        expected_qty: ing.qty || 0,
        target_qty: ing.qty || 0,
        actual_qty: ing.qty || 0,
        variance: 0,
        variance_percent: 0,
        unit: recipeUnit,
        inventory_unit: inventoryUnit,
        lot_number: defaultLot,
        inventory_id: invItem?.id || '',
        verified_by: null,
        verified_at: null
      };
    });
  };

  const buildQCFromRecipe = (recipe) => {
    return (recipe.qc_checks || []).map(qc => ({
      checkpoint: qc.checkpoint,
      criteria: qc.criteria,
      method: qc.method,
      passed: null,
      value: "",
      notes: ""
    }));
  };

  const buildProceduresFromRecipe = (recipe) => {
    return (recipe.procedures || []).map(proc => ({
      step: proc.step,
      description: proc.description,
      duration_minutes: proc.duration_minutes,
      notes: proc.notes,
      verified_by: null,
      verified_at: null
    }));
  };

  // Generate batch ID
  const generateBatchId = () => {
    const prefix = formData.sku?.substring(0, 3)?.toUpperCase() || 'BAT';
    const date = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const count = batches.filter(b => b.batch_id?.startsWith(`${prefix}-${date}`)).length + 1;
    return `${prefix}-${date}-${String(count).padStart(3, '0')}`;
  };

  // Set default operator from floor user
  useEffect(() => {
    if (floorUser && !formData.operator) {
      setFormData(prev => ({ ...prev, operator: floorUser.name }));
    }
  }, [floorUser]);

  // Select recipe and build materials
  const selectRecipe = (recipeId) => {
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) return;

    setSelectedRecipe(recipe);
    setBatchMultiplier(1);

    const materials = buildMaterialsFromRecipe(recipe);
    const qcChecks = buildQCFromRecipe(recipe);
    const procedureResults = buildProceduresFromRecipe(recipe);

    setFormData({
      ...formData,
      recipe_id: recipeId,
      sku: recipe.sku,
      product_name: recipe.name,
      quantity: recipe.batch_size || 0,
      production_line: recipe.production_line || 1,
      material_usage: materials,
      qc_results: qcChecks,
      procedure_results: procedureResults,
      batch_id: ''
    });
  };

  // Update quantities when batch multiplier changes
  const updateBatchSize = (newQuantity) => {
    if (!selectedRecipe) return;

    const baseBatchSize = selectedRecipe.batch_size || 1;
    const multiplier = newQuantity / baseBatchSize;
    setBatchMultiplier(multiplier);

    const scaledMaterials = formData.material_usage.map(mat => {
      const baseIngredient = (selectedRecipe.ingredients || []).find(
        i => i.sku === mat.material_sku || i.material === mat.material_name
      );
      const baseQty = baseIngredient?.qty || mat.expected_qty / batchMultiplier;
      const newExpected = parseFloat((baseQty * multiplier).toFixed(3));
      
      return {
        ...mat,
        expected_qty: newExpected,
        target_qty: newExpected,
        actual_qty: newExpected,
        variance: 0,
        variance_percent: 0
      };
    });

    setFormData({
      ...formData,
      quantity: newQuantity,
      material_usage: scaledMaterials
    });
  };

  // Update material actual usage
  const updateMaterialUsage = (index, actualQty) => {
    const newMaterials = [...formData.material_usage];
    const mat = newMaterials[index];
    mat.actual_qty = actualQty;
    mat.variance = parseFloat((actualQty - mat.expected_qty).toFixed(3));
    mat.variance_percent = mat.expected_qty > 0 
      ? parseFloat(((mat.variance / mat.expected_qty) * 100).toFixed(1))
      : 0;
    setFormData({ ...formData, material_usage: newMaterials });
  };

  // Update material lot number
  const updateMaterialLot = (index, lotNumber) => {
    const newMaterials = [...formData.material_usage];
    newMaterials[index].lot_number = lotNumber;
    setFormData({ ...formData, material_usage: newMaterials });
  };

  // Get inventory item for a material
  const getInventoryItem = (materialSku) => {
    return inventory.find(i => i.sku === materialSku);
  };

  // Get converted quantity for inventory deduction
  const getConvertedQtyForInventory = (mat) => {
    if (!mat.inventory_unit || mat.unit === mat.inventory_unit) {
      return { qty: mat.actual_qty, unit: mat.unit };
    }
    if (areUnitsCompatible(mat.unit, mat.inventory_unit)) {
      return { 
        qty: convertUnit(mat.actual_qty, mat.unit, mat.inventory_unit), 
        unit: mat.inventory_unit 
      };
    }
    return { qty: mat.actual_qty, unit: mat.unit };
  };

  // Update QC check result
  const updateQCResult = (index, field, value) => {
    const newQC = [...formData.qc_results];
    newQC[index] = { ...newQC[index], [field]: value };
    setFormData({ ...formData, qc_results: newQC });
  };

  // Handle verification request
  const requestVerification = (type, index) => {
    setVerifyTarget({ type, index });
    setShowVerifyDialog(true);
  };

  // Handle verified callback
  const handleVerified = (user) => {
    if (!verifyTarget) return;
    
    const timestamp = new Date().toISOString();
    
    if (verifyTarget.type === 'material') {
      const newMaterials = [...formData.material_usage];
      newMaterials[verifyTarget.index] = {
        ...newMaterials[verifyTarget.index],
        verified_by: user.name,
        verified_at: timestamp
      };
      setFormData({ ...formData, material_usage: newMaterials });
    } else if (verifyTarget.type === 'procedure') {
      const newProcedures = [...formData.procedure_results];
      newProcedures[verifyTarget.index] = {
        ...newProcedures[verifyTarget.index],
        verified_by: user.name,
        verified_at: timestamp
      };
      setFormData({ ...formData, procedure_results: newProcedures });
    }
    
    setVerifyTarget(null);
    toast.success(`Verified by ${user.name}`);
  };

  // Clear verification (admin/owner only)
  const clearVerification = (type, index) => {
    if (!floorUser || !['admin', 'owner'].includes(floorUser.role)) {
      toast.error("Only admin or owner can clear verification");
      return;
    }
    
    if (type === 'material') {
      const newMaterials = [...formData.material_usage];
      newMaterials[index] = {
        ...newMaterials[index],
        verified_by: null,
        verified_at: null
      };
      setFormData({ ...formData, material_usage: newMaterials });
    } else if (type === 'procedure') {
      const newProcedures = [...formData.procedure_results];
      newProcedures[index] = {
        ...newProcedures[index],
        verified_by: null,
        verified_at: null
      };
      setFormData({ ...formData, procedure_results: newProcedures });
    }
    
    toast.success("Verification cleared");
  };

  // Save batch mutation (for draft/started/on_hold)
  const saveBatchMutation = useMutation({
    mutationFn: async ({ batchData, status }) => {
      const dataToSave = {
        ...batchData,
        batch_id: batchData.batch_id || generateBatchId(),
        status,
        current_step: step,
        production_date: new Date(batchData.production_date).toISOString()
      };

      if (activeBatchId) {
        return await base44.entities.Batch.update(activeBatchId, dataToSave);
      } else {
        return await base44.entities.Batch.create(dataToSave);
      }
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      if (!activeBatchId && result?.id) {
        setActiveBatchId(result.id);
      }
      const statusMessages = {
        draft: "Draft saved",
        started: "Batch started",
        on_hold: "Batch put on hold"
      };
      toast.success(statusMessages[variables.status] || "Batch saved");
    },
    onError: (error) => {
      toast.error("Failed to save batch: " + error.message);
    }
  });

  // Delete batch mutation
  const deleteBatchMutation = useMutation({
    mutationFn: async (batchId) => {
      return await base44.entities.Batch.delete(batchId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      handleNewBatch();
      toast.success("Batch deleted");
    },
    onError: (error) => {
      toast.error("Failed to delete batch: " + error.message);
    }
  });

  // Submit batch mutation (to pending_qc)
  const submitBatchMutation = useMutation({
    mutationFn: async (data) => {
      const batchData = {
        ...data,
        batch_id: data.batch_id || generateBatchId(),
        status: 'pending_qc',
        current_step: 4,
        production_date: new Date(data.production_date).toISOString()
      };

      let batch;
      if (activeBatchId) {
        batch = await base44.entities.Batch.update(activeBatchId, batchData);
      } else {
        batch = await base44.entities.Batch.create(batchData);
      }

      // Create MaterialUsage records
      const materialRecords = data.material_usage.map(mat => ({
        batch_id: batchData.batch_id,
        material_sku: mat.material_sku,
        material_name: mat.material_name,
        target_qty: mat.expected_qty,
        actual_qty: mat.actual_qty,
        variance: mat.variance,
        variance_percent: mat.variance_percent,
        unit: mat.unit,
        recorded_by: data.operator,
        recorded_at: new Date().toISOString()
      }));

      if (materialRecords.length > 0) {
        await base44.entities.MaterialUsage.bulkCreate(materialRecords);
      }

      // Update ForecastSuggestion if from schedule
      if (data.schedule_id) {
        await base44.entities.ForecastSuggestion.update(data.schedule_id, {
          status: 'in_progress',
          scheduled_batch_id: batchData.batch_id
        });
      }

      return batch;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      queryClient.invalidateQueries({ queryKey: ['scheduled-production'] });
      toast.success("Batch submitted to Review Queue");
      handleNewBatch();
    },
    onError: (error) => {
      toast.error("Failed to submit batch: " + error.message);
    }
  });

  // Handle new batch
  const handleNewBatch = () => {
    setActiveBatchId(null);
    setSelectedRecipe(null);
    setBatchMultiplier(1);
    setStep(1);
    setFormData({
      ...initialFormData,
      operator: floorUser?.name || ''
    });
  };

  // Handle select batch from queue
  const handleSelectBatch = (batch) => {
    setActiveBatchId(batch.id);
    setStep(batch.current_step || 1);
    
    const recipe = recipes.find(r => r.id === batch.recipe_id);
    setSelectedRecipe(recipe || null);
    
    if (recipe && batch.quantity && recipe.batch_size) {
      setBatchMultiplier(batch.quantity / recipe.batch_size);
    } else {
      setBatchMultiplier(1);
    }
    
    setFormData({
      recipe_id: batch.recipe_id || "",
      sku: batch.sku || "",
      product_name: batch.product_name || "",
      batch_id: batch.batch_id || "",
      quantity: batch.quantity || 0,
      production_line: batch.production_line || 1,
      operator: batch.operator || floorUser?.name || "",
      production_date: batch.production_date ? batch.production_date.split('T')[0] : new Date().toISOString().split('T')[0],
      notes: batch.notes || "",
      material_usage: batch.material_usage || [],
      qc_results: batch.qc_results || [],
      procedure_results: batch.procedure_results || [],
      schedule_id: batch.schedule_id || ""
    });
  };

  // Handle save as draft
  const handleSaveDraft = () => {
    saveBatchMutation.mutate({ batchData: formData, status: 'draft' });
  };

  // Handle start batch
  const handleStartBatch = () => {
    saveBatchMutation.mutate({ batchData: formData, status: 'started' });
  };

  // Handle put on hold
  const handlePutOnHold = (reason) => {
    saveBatchMutation.mutate({ 
      batchData: { ...formData, hold_reason: reason }, 
      status: 'on_hold' 
    });
    setShowHoldDialog(false);
  };

  // Handle resume from hold
  const handleResume = () => {
    saveBatchMutation.mutate({ 
      batchData: { ...formData, hold_reason: '' }, 
      status: 'started' 
    });
  };

  // Handle submit
  const handleSubmit = () => {
    submitBatchMutation.mutate(formData);
  };

  // Handle delete
  const handleDelete = () => {
    if (activeBatchId) {
      deleteBatchMutation.mutate(activeBatchId);
    }
    setShowDeleteDialog(false);
  };

  // Check if all verifications are complete
  const allMaterialsVerified = formData.material_usage.every(mat => mat.verified_by);
  const allProceduresVerified = formData.procedure_results.every(proc => proc.verified_by);
  const allVerified = allMaterialsVerified && allProceduresVerified;
  const canOverrideVerification = floorUser && ['admin', 'owner'].includes(floorUser.role);

  const canProceed = () => {
    switch (step) {
      case 1: return !!formData.recipe_id;
      case 2: return formData.quantity > 0 && !!formData.operator;
      case 3: return formData.material_usage.length > 0;
      case 4: return allVerified || canOverrideVerification;
      default: return false;
    }
  };

  const totalVariance = formData.material_usage.reduce((sum, mat) => sum + Math.abs(mat.variance), 0);
  const hasSignificantVariance = formData.material_usage.some(mat => Math.abs(mat.variance_percent) > 5);

  // Get current batch status
  const currentBatch = activeBatchId ? batches.find(b => b.id === activeBatchId) : null;
  const currentStatus = currentBatch?.status || 'draft';

  // Print handlers (keeping existing)
  const handlePrintBatchSheet = () => {
    if (!selectedRecipe) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) { toast.error("Please allow popups to print"); return; }
    const batchId = formData.batch_id || generateBatchId();
    // ... (keep existing print implementation)
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Batch Sheet - ${selectedRecipe.name}</title></head><body><h1>Batch Sheet: ${batchId}</h1><p>Product: ${selectedRecipe.name}</p></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
  };

  const handlePrintTraveler = () => {
    if (!selectedRecipe) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) { toast.error("Please allow popups to print"); return; }
    const batchId = formData.batch_id || generateBatchId();
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Traveler - ${selectedRecipe.name}</title></head><body><h1>Manufacturing Traveller: ${batchId}</h1><p>Product: ${selectedRecipe.name}</p></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
  };

  return (
    <div className="flex h-[calc(100vh-100px)] -m-4 lg:-m-6">
      {/* Queue Panel */}
      <ProductionQueuePanel
        batches={batches}
        activeBatchId={activeBatchId}
        onSelectBatch={handleSelectBatch}
        onNewBatch={handleNewBatch}
        isCollapsed={queueCollapsed}
        onToggleCollapse={() => setQueueCollapsed(!queueCollapsed)}
      />

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-zinc-100">Production Entry</h1>
              <p className="text-zinc-500 text-sm mt-1">
                {activeBatchId ? `Editing: ${formData.batch_id || 'New Batch'}` : 'Start a new production batch'}
              </p>
            </div>
            
            {/* Status & Actions */}
            <div className="flex items-center gap-2">
              {currentStatus === 'on_hold' && (
                <Badge variant="amber" className="flex items-center gap-1">
                  <Pause className="w-3 h-3" />
                  On Hold
                </Badge>
              )}
              {currentStatus === 'started' && (
                <Badge variant="blue" className="flex items-center gap-1">
                  <Play className="w-3 h-3" />
                  In Progress
                </Badge>
              )}
              
              {activeBatchId && ['draft', 'started', 'on_hold'].includes(currentStatus) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-red-400 hover:text-red-300"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center justify-between mb-8">
            {STEPS.map((s, idx) => (
              <React.Fragment key={s.id}>
                <div
                  className={`flex items-center gap-3 ${step >= s.id ? 'text-orange-400' : 'text-zinc-600'}`}
                >
                  <div className={`
                    w-10 h-10 rounded-full flex items-center justify-center
                    ${step > s.id ? 'bg-orange-500 text-white' : 
                      step === s.id ? 'bg-orange-500/20 border-2 border-orange-500 text-orange-400' : 
                      'bg-zinc-800 border border-zinc-700 text-zinc-500'}
                  `}>
                    {step > s.id ? <Check className="w-5 h-5" /> : <s.icon className="w-5 h-5" />}
                  </div>
                  <span className={`hidden md:inline text-sm font-medium ${step >= s.id ? 'text-zinc-200' : 'text-zinc-500'}`}>
                    {s.title}
                  </span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-4 ${step > s.id ? 'bg-orange-500' : 'bg-zinc-800'}`} />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Step Content */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-6">
              {/* Step 1: Select Product */}
              {step === 1 && (
                <div className="space-y-6">
                  <div>
                    <Label className="text-base mb-4 block">Select Product to Produce</Label>
                    <div className="grid gap-3 max-h-[500px] overflow-y-auto pr-2">
                      {recipes.filter(r => r.active !== false).map((recipe) => (
                        <div
                          key={recipe.id}
                          onClick={() => selectRecipe(recipe.id)}
                          className={`
                            p-4 rounded-lg border cursor-pointer transition-all
                            ${formData.recipe_id === recipe.id 
                              ? 'bg-orange-500/10 border-orange-500/50' 
                              : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-600'}
                          `}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-3">
                                <span className="font-mono text-sm text-orange-400">{recipe.sku}</span>
                                <span className="text-zinc-200 font-medium">{recipe.name}</span>
                              </div>
                              <p className="text-sm text-zinc-500 mt-1">
                                {recipe.category} • Batch size: {recipe.batch_size} units • Line {recipe.production_line || 1}
                              </p>
                            </div>
                            <div className={`w-5 h-5 rounded-full border-2 ${
                              formData.recipe_id === recipe.id 
                                ? 'border-orange-500 bg-orange-500' 
                                : 'border-zinc-600'
                            }`}>
                              {formData.recipe_id === recipe.id && (
                                <Check className="w-full h-full text-white p-0.5" />
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      {recipes.length === 0 && (
                        <p className="text-center text-zinc-500 py-8">
                          No recipes found. Please add recipes first.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Batch Details */}
              {step === 2 && (
                <div className="space-y-6">
                  <div className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm text-zinc-400">Selected Product:</p>
                        <p className="text-lg font-semibold text-zinc-100">{formData.product_name}</p>
                        <p className="text-sm text-orange-400 font-mono">{formData.sku}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={handlePrintBatchSheet} className="text-zinc-300">
                          <Printer className="w-4 h-4 mr-1" /> Batch Sheet
                        </Button>
                        <Button variant="outline" size="sm" onClick={handlePrintTraveler} className="text-zinc-300">
                          <Printer className="w-4 h-4 mr-1" /> Traveler
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Batch ID</Label>
                      <div className="flex gap-2">
                        <Input
                          value={formData.batch_id}
                          onChange={(e) => setFormData({...formData, batch_id: e.target.value})}
                          placeholder={generateBatchId()}
                          className="bg-zinc-800 border-zinc-700"
                        />
                        <Button type="button" variant="outline" onClick={() => setFormData({...formData, batch_id: generateBatchId()})}>
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-zinc-500">Leave blank to auto-generate</p>
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Scale className="w-4 h-4" /> Batch Size (units)
                      </Label>
                      <Input
                        type="number"
                        min="1"
                        value={formData.quantity}
                        onChange={(e) => updateBatchSize(parseInt(e.target.value) || 0)}
                        className="bg-zinc-800 border-zinc-700"
                      />
                      {batchMultiplier !== 1 && (
                        <p className="text-xs text-orange-400">
                          {batchMultiplier.toFixed(2)}x recipe batch size ({selectedRecipe?.batch_size} units)
                        </p>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Production Line</Label>
                      <Select value={String(formData.production_line)} onValueChange={(v) => setFormData({...formData, production_line: parseInt(v)})}>
                        <SelectTrigger className="bg-zinc-800 border-zinc-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Line 1</SelectItem>
                          <SelectItem value="2">Line 2</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Production Date</Label>
                      <Input
                        type="date"
                        value={formData.production_date}
                        onChange={(e) => setFormData({...formData, production_date: e.target.value})}
                        className="bg-zinc-800 border-zinc-700"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Operator Name</Label>
                    <Input
                      value={formData.operator}
                      onChange={(e) => setFormData({...formData, operator: e.target.value})}
                      placeholder="Enter operator name"
                      className="bg-zinc-800 border-zinc-700"
                    />
                  </div>
                </div>
              )}

              {/* Step 3: Materials & QC */}
              {step === 3 && (
                <div className="space-y-6">
                  {/* Materials Section */}
                  <div>
                    <Label className="text-base mb-2 block">Material Usage</Label>
                    <p className="text-sm text-zinc-500 mb-4">Enter actual quantities from your scale readings.</p>
                    
                    <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2">
                      {formData.material_usage.map((mat, idx) => (
                        <div key={idx} className={`p-4 rounded-lg border ${
                          mat.verified_by ? 'bg-green-500/5 border-green-500/30' : 'bg-zinc-800/50 border-zinc-700'
                        }`}>
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <span className="font-mono text-sm text-orange-400">{mat.material_sku}</span>
                              <span className="text-zinc-200 ml-2">{mat.material_name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={Math.abs(mat.variance_percent) > 5 ? "red" : Math.abs(mat.variance_percent) > 2 ? "amber" : "green"}>
                                Target: {mat.expected_qty} {mat.unit}
                              </Badge>
                              {mat.verified_by && (
                                <Badge variant="green" className="flex items-center gap-1">
                                  <ShieldCheck className="w-3 h-3" /> {mat.verified_by}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="grid grid-cols-5 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs text-zinc-500">Actual Used</Label>
                              <Input
                                type="number"
                                step="0.001"
                                value={mat.actual_qty}
                                onChange={(e) => updateMaterialUsage(idx, parseFloat(e.target.value) || 0)}
                                className="bg-zinc-800 border-zinc-700"
                                disabled={mat.verified_by}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-zinc-500">Unit</Label>
                              <Input value={mat.unit} readOnly className="bg-zinc-800 border-zinc-700 text-zinc-500 h-9" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-zinc-500">Lot #</Label>
                              <LotNumberSelect
                                inventoryItem={getInventoryItem(mat.material_sku)}
                                value={mat.lot_number}
                                onChange={(lot) => updateMaterialLot(idx, lot)}
                                disabled={mat.verified_by}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-zinc-500">Variance</Label>
                              <div className={`h-9 px-2 rounded-md border flex items-center justify-between text-sm ${
                                Math.abs(mat.variance_percent) > 5 ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                                Math.abs(mat.variance_percent) > 2 ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                                'bg-green-500/10 border-green-500/30 text-green-400'
                              }`}>
                                <span>{mat.variance > 0 ? '+' : ''}{mat.variance.toFixed(2)}</span>
                                <span className="text-xs">({mat.variance_percent > 0 ? '+' : ''}{mat.variance_percent}%)</span>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-zinc-500">Verify</Label>
                              {mat.verified_by ? (
                                <div className="flex items-center gap-2">
                                  <div className="h-9 px-3 rounded-md bg-green-500/10 border border-green-500/30 flex items-center gap-2 flex-1">
                                    <Lock className="w-4 h-4 text-green-400" />
                                    <span className="text-sm text-green-400 truncate">{mat.verified_by}</span>
                                  </div>
                                  {canOverrideVerification && (
                                    <Button type="button" variant="ghost" size="sm" onClick={() => clearVerification('material', idx)} className="text-red-400 hover:text-red-300 h-9 px-2">
                                      <X className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>
                              ) : (
                                <Button type="button" variant="outline" onClick={() => requestVerification('material', idx)} className="w-full h-9 text-orange-400 border-orange-500/30 hover:bg-orange-500/10">
                                  <ShieldCheck className="w-4 h-4 mr-2" /> Verify
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Procedures Section */}
                  {formData.procedure_results.length > 0 && (
                    <div className="pt-4 border-t border-zinc-800">
                      <Label className="text-base mb-2 block">Manufacturing Procedures</Label>
                      <div className="space-y-3">
                        {formData.procedure_results.map((proc, idx) => (
                          <div key={idx} className={`p-4 rounded-lg border ${
                            proc.verified_by ? 'bg-green-500/5 border-green-500/30' : 'bg-zinc-800/50 border-zinc-700'
                          }`}>
                            <div className="flex items-start gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold shrink-0 ${
                                proc.verified_by ? 'bg-green-500/20 text-green-400' : 'bg-orange-500/20 text-orange-400'
                              }`}>
                                {proc.verified_by ? <Check className="w-5 h-5" /> : proc.step}
                              </div>
                              <div className="flex-1">
                                <p className="text-zinc-200 font-medium">{proc.description}</p>
                                {proc.duration_minutes > 0 && (
                                  <span className="text-sm text-zinc-500">{proc.duration_minutes} min</span>
                                )}
                              </div>
                              <div className="shrink-0">
                                {proc.verified_by ? (
                                  <div className="flex items-center gap-2">
                                    <Badge variant="green"><ShieldCheck className="w-3 h-3 mr-1" /> Verified</Badge>
                                    {canOverrideVerification && (
                                      <Button type="button" variant="ghost" size="sm" onClick={() => clearVerification('procedure', idx)} className="text-red-400">
                                        <X className="w-4 h-4" />
                                      </Button>
                                    )}
                                  </div>
                                ) : (
                                  <Button type="button" variant="outline" onClick={() => requestVerification('procedure', idx)} className="text-orange-400 border-orange-500/30">
                                    <ShieldCheck className="w-4 h-4 mr-2" /> Verify Step
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* QC Section */}
                  {formData.qc_results.length > 0 && (
                    <div className="pt-4 border-t border-zinc-800">
                      <Label className="text-base mb-2 block">In-Process QC Checks</Label>
                      <div className="space-y-3">
                        {formData.qc_results.map((qc, idx) => (
                          <div key={idx} className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <p className="text-zinc-200 font-medium">{qc.checkpoint}</p>
                                <p className="text-sm text-zinc-500">{qc.criteria}</p>
                              </div>
                              <div className="flex items-center gap-3">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <Checkbox checked={qc.passed === true} onCheckedChange={() => updateQCResult(idx, 'passed', true)} className="border-green-500 data-[state=checked]:bg-green-500" />
                                  <span className="text-sm text-green-400">Pass</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <Checkbox checked={qc.passed === false} onCheckedChange={() => updateQCResult(idx, 'passed', false)} className="border-red-500 data-[state=checked]:bg-red-500" />
                                  <span className="text-sm text-red-400">Fail</span>
                                </label>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <Input placeholder="Measured value..." value={qc.value} onChange={(e) => updateQCResult(idx, 'value', e.target.value)} className="bg-zinc-800 border-zinc-700" />
                              <Input placeholder="Notes..." value={qc.notes} onChange={(e) => updateQCResult(idx, 'notes', e.target.value)} className="bg-zinc-800 border-zinc-700" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 pt-4 border-t border-zinc-800">
                    <Label>Production Notes</Label>
                    <Textarea value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} placeholder="Any observations or issues..." className="bg-zinc-800 border-zinc-700" />
                  </div>
                </div>
              )}

              {/* Step 4: Review */}
              {step === 4 && (
                <div className="space-y-6">
                  <div className="text-center mb-6">
                    <div className="w-16 h-16 rounded-full bg-orange-500/20 flex items-center justify-center mx-auto mb-4">
                      <ClipboardCheck className="w-8 h-8 text-orange-400" />
                    </div>
                    <h3 className="text-xl font-semibold text-zinc-100">Review Batch Details</h3>
                    <p className="text-sm text-zinc-500">Verify all information before submitting to Review Queue</p>
                  </div>

                  {hasSignificantVariance && (
                    <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-400 mt-0.5" />
                      <div>
                        <p className="text-amber-400 font-medium">Significant Material Variance</p>
                        <p className="text-sm text-zinc-400">Some materials have &gt;5% variance.</p>
                      </div>
                    </div>
                  )}

                  {!allVerified && (
                    <div className={`p-4 rounded-lg flex items-start gap-3 ${canOverrideVerification ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
                      <ShieldCheck className={`w-5 h-5 mt-0.5 ${canOverrideVerification ? 'text-amber-400' : 'text-red-400'}`} />
                      <div>
                        <p className={`font-medium ${canOverrideVerification ? 'text-amber-400' : 'text-red-400'}`}>Verification Required</p>
                        <p className="text-sm text-zinc-400">
                          {!allMaterialsVerified && `${formData.material_usage.filter(m => !m.verified_by).length} material(s) not verified. `}
                          {!allProceduresVerified && `${formData.procedure_results.filter(p => !p.verified_by).length} procedure(s) not verified.`}
                        </p>
                        {canOverrideVerification && <p className="text-xs text-amber-400 mt-1">As {floorUser.role}, you can submit without full verification.</p>}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-6 p-6 bg-zinc-800/50 rounded-lg border border-zinc-700">
                    <div><p className="text-sm text-zinc-500">Batch ID</p><p className="font-mono font-semibold text-orange-400">{formData.batch_id || generateBatchId()}</p></div>
                    <div><p className="text-sm text-zinc-500">Product</p><p className="font-semibold text-zinc-100">{formData.product_name}</p></div>
                    <div><p className="text-sm text-zinc-500">SKU</p><p className="font-mono text-zinc-200">{formData.sku}</p></div>
                    <div><p className="text-sm text-zinc-500">Quantity</p><p className="font-semibold text-zinc-100">{formData.quantity} units</p></div>
                    <div><p className="text-sm text-zinc-500">Production Line</p><p className="text-zinc-200">Line {formData.production_line}</p></div>
                    <div><p className="text-sm text-zinc-500">Operator</p><p className="text-zinc-200">{formData.operator}</p></div>
                  </div>
                </div>
              )}

              {/* Navigation */}
              <div className="flex justify-between pt-6 mt-6 border-t border-zinc-800">
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1}>
                    <ChevronLeft className="w-4 h-4 mr-2" /> Previous
                  </Button>
                  
                  {/* Save/Hold Actions */}
                  {step > 1 && (
                    <>
                      <Button variant="outline" onClick={handleSaveDraft} disabled={saveBatchMutation.isPending}>
                        <Save className="w-4 h-4 mr-2" /> Save Draft
                      </Button>
                      
                      {currentStatus === 'on_hold' ? (
                        <Button variant="outline" onClick={handleResume} disabled={saveBatchMutation.isPending} className="text-blue-400 border-blue-500/30">
                          <Play className="w-4 h-4 mr-2" /> Resume
                        </Button>
                      ) : (
                        <Button variant="outline" onClick={() => setShowHoldDialog(true)} disabled={saveBatchMutation.isPending} className="text-amber-400 border-amber-500/30">
                          <Pause className="w-4 h-4 mr-2" /> Hold
                        </Button>
                      )}
                    </>
                  )}
                </div>

                <div className="flex gap-2">
                  {step > 1 && currentStatus !== 'started' && (
                    <Button onClick={handleStartBatch} disabled={saveBatchMutation.isPending} variant="outline" className="text-blue-400 border-blue-500/30">
                      <Play className="w-4 h-4 mr-2" /> Start Batch
                    </Button>
                  )}
                  
                  {step < 4 ? (
                    <Button onClick={() => setStep(step + 1)} disabled={!canProceed()} className="bg-orange-500 hover:bg-orange-600">
                      Next <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                  ) : (
                    <Button onClick={handleSubmit} disabled={submitBatchMutation.isPending || (!allVerified && !canOverrideVerification)} className="bg-green-600 hover:bg-green-700">
                      <Check className="w-4 h-4 mr-2" /> {submitBatchMutation.isPending ? 'Submitting...' : 'Submit to Review'}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialogs */}
      <PinVerifyDialog open={showVerifyDialog} onOpenChange={setShowVerifyDialog} onVerified={handleVerified} title={verifyTarget?.type === 'material' ? 'Verify Material' : 'Verify Procedure Step'} />
      <HoldReasonDialog open={showHoldDialog} onOpenChange={setShowHoldDialog} onConfirm={handlePutOnHold} />
      
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Batch?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete this batch. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}