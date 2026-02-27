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
  Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import Badge from "@/components/ui/Badge";
import LotNumberSelect from "@/components/production/LotNumberSelect";
import { convertUnit, areUnitsCompatible } from "@/components/utils/unitConversion";
import KioskPinPad from "./KioskPinPad";

const STEPS = [
  { id: 1, title: "Select Product", icon: Package },
  { id: 2, title: "Batch Setup", icon: Factory },
  { id: 3, title: "Materials", icon: Beaker },
  { id: 4, title: "QC & Submit", icon: ClipboardCheck },
];

export default function KioskProductionEntry({ user, onComplete }) {
  const [step, setStep] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [batchMultiplier, setBatchMultiplier] = useState(1);
  const [showVerifyPad, setShowVerifyPad] = useState(false);
  const [verifyTarget, setVerifyTarget] = useState(null);
  
  const [formData, setFormData] = useState({
    recipe_id: "",
    sku: "",
    product_name: "",
    batch_id: "",
    quantity: 0,
    production_line: 1,
    operator: user?.name || "",
    production_date: new Date().toISOString().split('T')[0],
    notes: "",
    material_usage: [],
    qc_results: [],
    procedure_results: []
  });

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

  const { data: floorUsers = [] } = useQuery({
    queryKey: ['floorUsers'],
    queryFn: () => base44.entities.FloorUser.list(),
  });

  const generateBatchId = () => {
    const prefix = formData.sku?.substring(0, 3)?.toUpperCase() || 'BAT';
    const date = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const count = batches.filter(b => b.batch_id?.startsWith(`${prefix}-${date}`)).length + 1;
    return `${prefix}-${date}-${String(count).padStart(3, '0')}`;
  };

  const selectRecipe = (recipeId) => {
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) return;

    setSelectedRecipe(recipe);
    setBatchMultiplier(1);

    const materials = (recipe.ingredients || []).map(ing => {
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

    const qcChecks = (recipe.qc_checks || []).map(qc => ({
      checkpoint: qc.checkpoint,
      criteria: qc.criteria,
      method: qc.method,
      passed: null,
      value: "",
      notes: ""
    }));

    const procedureResults = (recipe.procedures || []).map(proc => ({
      step: proc.step,
      description: proc.description,
      duration_minutes: proc.duration_minutes,
      notes: proc.notes,
      verified_by: null,
      verified_at: null
    }));

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

  const updateMaterialLot = (index, lotNumber) => {
    const newMaterials = [...formData.material_usage];
    newMaterials[index].lot_number = lotNumber;
    setFormData({ ...formData, material_usage: newMaterials });
  };

  const getInventoryItem = (materialSku) => {
    return inventory.find(i => i.sku === materialSku);
  };

  const updateQCResult = (index, field, value) => {
    const newQC = [...formData.qc_results];
    newQC[index] = { ...newQC[index], [field]: value };
    setFormData({ ...formData, qc_results: newQC });
  };

  const requestVerification = (type, index) => {
    setVerifyTarget({ type, index });
    setShowVerifyPad(true);
  };

  const handleVerified = (verifiedUser) => {
    if (!verifyTarget) return;
    
    const timestamp = new Date().toISOString();
    
    if (verifyTarget.type === 'material') {
      const newMaterials = [...formData.material_usage];
      newMaterials[verifyTarget.index] = {
        ...newMaterials[verifyTarget.index],
        verified_by: verifiedUser.name,
        verified_at: timestamp
      };
      setFormData({ ...formData, material_usage: newMaterials });
    } else if (verifyTarget.type === 'procedure') {
      const newProcedures = [...formData.procedure_results];
      newProcedures[verifyTarget.index] = {
        ...newProcedures[verifyTarget.index],
        verified_by: verifiedUser.name,
        verified_at: timestamp
      };
      setFormData({ ...formData, procedure_results: newProcedures });
    }
    
    setVerifyTarget(null);
    setShowVerifyPad(false);
    toast.success(`Verified by ${verifiedUser.name}`);
  };

  const createBatchMutation = useMutation({
    mutationFn: async (data) => {
      const batch = await base44.entities.Batch.create(data);

      const materialRecords = data.material_usage.map(mat => ({
        batch_id: data.batch_id,
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

      return batch;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      toast.success("Batch submitted successfully!");
      onComplete?.();
    },
    onError: (error) => {
      toast.error("Failed to submit batch: " + error.message);
    }
  });

  const handleSubmit = async () => {
    const batchId = formData.batch_id || generateBatchId();
    
    createBatchMutation.mutate({
      ...formData,
      batch_id: batchId,
      status: 'pending_qc',
      production_date: new Date(formData.production_date).toISOString()
    });
  };

  const allMaterialsVerified = formData.material_usage.every(mat => mat.verified_by);
  const allProceduresVerified = formData.procedure_results.length === 0 || formData.procedure_results.every(proc => proc.verified_by);
  const canOverride = ['owner', 'admin', 'production_lead'].includes(user?.role);

  const canProceed = () => {
    switch (step) {
      case 1: return !!formData.recipe_id;
      case 2: return formData.quantity > 0;
      case 3: return formData.material_usage.length > 0;
      case 4: return (allMaterialsVerified && allProceduresVerified) || canOverride;
      default: return false;
    }
  };

  const filteredRecipes = recipes.filter(r => 
    r.active !== false && 
    (r.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
     r.sku?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="max-w-4xl mx-auto">
      {/* Progress Steps */}
      <div className="flex items-center justify-between mb-8 bg-zinc-900 rounded-xl p-4 border border-zinc-800">
        {STEPS.map((s, idx) => (
          <React.Fragment key={s.id}>
            <div className={`flex items-center gap-3 ${step >= s.id ? 'text-orange-400' : 'text-zinc-600'}`}>
              <div className={`
                w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold
                ${step > s.id ? 'bg-orange-500 text-white' : 
                  step === s.id ? 'bg-orange-500/20 border-2 border-orange-500 text-orange-400' : 
                  'bg-zinc-800 border border-zinc-700 text-zinc-500'}
              `}>
                {step > s.id ? <Check className="w-6 h-6" /> : <s.icon className="w-6 h-6" />}
              </div>
              <span className={`hidden md:inline font-medium ${step >= s.id ? 'text-zinc-200' : 'text-zinc-500'}`}>
                {s.title}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`flex-1 h-1 mx-4 rounded ${step > s.id ? 'bg-orange-500' : 'bg-zinc-800'}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Step Content */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        {/* Step 1: Select Product */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-zinc-100 mb-2">Select Product</h2>
              <p className="text-zinc-500">Choose the product you're producing</p>
            </div>

            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
              <Input
                placeholder="Search by name or SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-14 text-lg bg-zinc-800 border-zinc-700"
              />
            </div>
            
            <div className="grid gap-3 max-h-[400px] overflow-y-auto pr-2">
              {filteredRecipes.map((recipe) => (
                <button
                  key={recipe.id}
                  onClick={() => selectRecipe(recipe.id)}
                  className={`
                    p-5 rounded-xl border-2 text-left transition-all
                    ${formData.recipe_id === recipe.id 
                      ? 'bg-orange-500/10 border-orange-500' 
                      : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-600 active:scale-[0.99]'}
                  `}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-lg text-orange-400">{recipe.sku}</span>
                        <span className="text-zinc-200 font-semibold text-lg">{recipe.name}</span>
                      </div>
                      <p className="text-sm text-zinc-500 mt-1">
                        {recipe.category} • Batch: {recipe.batch_size} units • Line {recipe.production_line || 1}
                      </p>
                    </div>
                    <div className={`w-6 h-6 rounded-full border-2 ${
                      formData.recipe_id === recipe.id 
                        ? 'border-orange-500 bg-orange-500' 
                        : 'border-zinc-600'
                    }`}>
                      {formData.recipe_id === recipe.id && (
                        <Check className="w-full h-full text-white p-0.5" />
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Batch Setup */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-zinc-100 mb-2">Batch Setup</h2>
              <div className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl">
                <p className="text-lg font-semibold text-zinc-100">{formData.product_name}</p>
                <p className="text-orange-400 font-mono">{formData.sku}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label className="text-lg">Batch ID</Label>
                <div className="flex gap-3">
                  <Input
                    value={formData.batch_id}
                    onChange={(e) => setFormData({...formData, batch_id: e.target.value})}
                    placeholder={generateBatchId()}
                    className="h-14 text-lg bg-zinc-800 border-zinc-700"
                  />
                  <Button 
                    variant="outline" 
                    onClick={() => setFormData({...formData, batch_id: generateBatchId()})}
                    className="h-14 w-14"
                  >
                    <RefreshCw className="w-5 h-5" />
                  </Button>
                </div>
              </div>
              
              <div className="space-y-3">
                <Label className="text-lg flex items-center gap-2">
                  <Scale className="w-5 h-5" />
                  Batch Size (units)
                </Label>
                <Input
                  type="number"
                  min="1"
                  value={formData.quantity}
                  onChange={(e) => updateBatchSize(parseInt(e.target.value) || 0)}
                  className="h-14 text-lg bg-zinc-800 border-zinc-700"
                />
                {batchMultiplier !== 1 && (
                  <p className="text-sm text-orange-400">
                    {batchMultiplier.toFixed(2)}x standard batch ({selectedRecipe?.batch_size} units)
                  </p>
                )}
              </div>
              
              <div className="space-y-3">
                <Label className="text-lg">Production Line</Label>
                <div className="flex gap-3">
                  {[1, 2].map(line => (
                    <button
                      key={line}
                      onClick={() => setFormData({...formData, production_line: line})}
                      className={`flex-1 h-14 rounded-xl border-2 font-semibold text-lg transition-all ${
                        formData.production_line === line
                          ? 'bg-orange-500/20 border-orange-500 text-orange-400'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                      }`}
                    >
                      Line {line}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="space-y-3">
                <Label className="text-lg">Production Date</Label>
                <Input
                  type="date"
                  value={formData.production_date}
                  onChange={(e) => setFormData({...formData, production_date: e.target.value})}
                  className="h-14 text-lg bg-zinc-800 border-zinc-700"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Materials */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-zinc-100 mb-2">Materials</h2>
              <p className="text-zinc-500">Record actual quantities used</p>
            </div>
            
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
              {formData.material_usage.map((mat, idx) => (
                <div key={idx} className={`p-5 rounded-xl border-2 ${
                  mat.verified_by 
                    ? 'bg-green-500/5 border-green-500/30' 
                    : 'bg-zinc-800/50 border-zinc-700'
                }`}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <span className="font-mono text-orange-400">{mat.material_sku}</span>
                      <span className="text-zinc-200 ml-3 font-medium">{mat.material_name}</span>
                    </div>
                    <Badge variant={Math.abs(mat.variance_percent) > 5 ? "red" : "green"}>
                      Target: {mat.expected_qty} {mat.unit}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm text-zinc-500">Actual Used</Label>
                      <Input
                        type="number"
                        step="0.001"
                        value={mat.actual_qty}
                        onChange={(e) => updateMaterialUsage(idx, parseFloat(e.target.value) || 0)}
                        className="h-12 text-lg bg-zinc-800 border-zinc-700"
                        disabled={mat.verified_by}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm text-zinc-500">Unit</Label>
                      <div className="h-12 px-3 bg-zinc-800 border border-zinc-700 rounded-md flex items-center text-zinc-400">
                        {mat.unit}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm text-zinc-500">Lot #</Label>
                      <LotNumberSelect
                        inventoryItem={getInventoryItem(mat.material_sku)}
                        value={mat.lot_number}
                        onChange={(lot) => updateMaterialLot(idx, lot)}
                        disabled={mat.verified_by}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm text-zinc-500">Verify</Label>
                      {mat.verified_by ? (
                        <div className="h-12 px-3 rounded-md bg-green-500/10 border border-green-500/30 flex items-center gap-2">
                          <ShieldCheck className="w-5 h-5 text-green-400" />
                          <span className="text-green-400 truncate">{mat.verified_by}</span>
                        </div>
                      ) : (
                        <Button
                          onClick={() => requestVerification('material', idx)}
                          className="w-full h-12 bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30"
                        >
                          <ShieldCheck className="w-5 h-5 mr-2" />
                          Verify
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  {/* Variance indicator */}
                  <div className={`mt-3 px-3 py-2 rounded-lg flex items-center justify-between text-sm ${
                    Math.abs(mat.variance_percent) > 5 ? 'bg-red-500/10 text-red-400' :
                    Math.abs(mat.variance_percent) > 2 ? 'bg-amber-500/10 text-amber-400' :
                    'bg-green-500/10 text-green-400'
                  }`}>
                    <span>Variance: {mat.variance > 0 ? '+' : ''}{mat.variance.toFixed(3)} {mat.unit}</span>
                    <span>{mat.variance_percent > 0 ? '+' : ''}{mat.variance_percent}%</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Procedures */}
            {formData.procedure_results.length > 0 && (
              <div className="pt-6 border-t border-zinc-800">
                <h3 className="text-xl font-bold text-zinc-100 mb-4">Procedures</h3>
                <div className="space-y-3">
                  {formData.procedure_results.map((proc, idx) => (
                    <div key={idx} className={`p-4 rounded-xl border-2 flex items-center gap-4 ${
                      proc.verified_by 
                        ? 'bg-green-500/5 border-green-500/30' 
                        : 'bg-zinc-800/50 border-zinc-700'
                    }`}>
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                        proc.verified_by 
                          ? 'bg-green-500/20 text-green-400' 
                          : 'bg-orange-500/20 text-orange-400'
                      }`}>
                        {proc.verified_by ? <Check className="w-5 h-5" /> : proc.step}
                      </div>
                      <div className="flex-1">
                        <p className="text-zinc-200 font-medium">{proc.description}</p>
                        {proc.duration_minutes > 0 && (
                          <p className="text-sm text-zinc-500">{proc.duration_minutes} min</p>
                        )}
                      </div>
                      {proc.verified_by ? (
                        <div className="px-4 py-2 rounded-lg bg-green-500/10 border border-green-500/30 flex items-center gap-2">
                          <ShieldCheck className="w-5 h-5 text-green-400" />
                          <span className="text-green-400">{proc.verified_by}</span>
                        </div>
                      ) : (
                        <Button
                          onClick={() => requestVerification('procedure', idx)}
                          className="bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30"
                        >
                          <ShieldCheck className="w-5 h-5 mr-2" />
                          Verify
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 4: QC & Submit */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <div className="w-20 h-20 rounded-full bg-orange-500/20 flex items-center justify-center mx-auto mb-4">
                <ClipboardCheck className="w-10 h-10 text-orange-400" />
              </div>
              <h2 className="text-2xl font-bold text-zinc-100">Review & Submit</h2>
              <p className="text-zinc-500">Verify all information before submitting</p>
            </div>

            {/* Verification Status */}
            {(!allMaterialsVerified || !allProceduresVerified) && (
              <div className={`p-4 rounded-xl flex items-start gap-3 ${
                canOverride ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-red-500/10 border border-red-500/30'
              }`}>
                <AlertCircle className={`w-6 h-6 ${canOverride ? 'text-amber-400' : 'text-red-400'}`} />
                <div>
                  <p className={`font-semibold ${canOverride ? 'text-amber-400' : 'text-red-400'}`}>
                    Verification Incomplete
                  </p>
                  <p className="text-sm text-zinc-400">
                    {!allMaterialsVerified && `${formData.material_usage.filter(m => !m.verified_by).length} material(s) not verified. `}
                    {!allProceduresVerified && `${formData.procedure_results.filter(p => !p.verified_by).length} procedure(s) not verified.`}
                  </p>
                  {canOverride && (
                    <p className="text-xs text-amber-400 mt-1">As {user.role}, you can submit without full verification.</p>
                  )}
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="grid grid-cols-2 gap-4 p-6 bg-zinc-800/50 rounded-xl border border-zinc-700">
              <div>
                <p className="text-sm text-zinc-500">Batch ID</p>
                <p className="font-mono font-bold text-orange-400 text-lg">{formData.batch_id || generateBatchId()}</p>
              </div>
              <div>
                <p className="text-sm text-zinc-500">Product</p>
                <p className="font-semibold text-zinc-100 text-lg">{formData.product_name}</p>
              </div>
              <div>
                <p className="text-sm text-zinc-500">Quantity</p>
                <p className="font-semibold text-zinc-100 text-lg">{formData.quantity} units</p>
              </div>
              <div>
                <p className="text-sm text-zinc-500">Production Line</p>
                <p className="text-zinc-200 text-lg">Line {formData.production_line}</p>
              </div>
              <div>
                <p className="text-sm text-zinc-500">Operator</p>
                <p className="text-zinc-200 text-lg">{formData.operator}</p>
              </div>
              <div>
                <p className="text-sm text-zinc-500">Date</p>
                <p className="text-zinc-200 text-lg">{new Date(formData.production_date).toLocaleDateString()}</p>
              </div>
            </div>

            {/* QC Checks */}
            {formData.qc_results.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-zinc-100">In-Process QC</h3>
                {formData.qc_results.map((qc, idx) => (
                  <div key={idx} className="p-4 bg-zinc-800/50 rounded-xl border border-zinc-700">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-zinc-200 font-medium">{qc.checkpoint}</p>
                        <p className="text-sm text-zinc-500">{qc.criteria}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => updateQCResult(idx, 'passed', true)}
                          className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                            qc.passed === true 
                              ? 'bg-green-500 text-white' 
                              : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                          }`}
                        >
                          Pass
                        </button>
                        <button
                          onClick={() => updateQCResult(idx, 'passed', false)}
                          className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                            qc.passed === false 
                              ? 'bg-red-500 text-white' 
                              : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                          }`}
                        >
                          Fail
                        </button>
                      </div>
                    </div>
                    <Input
                      placeholder="Measured value or notes..."
                      value={qc.value}
                      onChange={(e) => updateQCResult(idx, 'value', e.target.value)}
                      className="bg-zinc-800 border-zinc-700"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label className="text-lg">Production Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                placeholder="Any observations or issues..."
                className="h-24 bg-zinc-800 border-zinc-700"
              />
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-6 mt-6 border-t border-zinc-800">
          <Button
            variant="outline"
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1}
            className="h-14 px-8 text-lg"
          >
            <ChevronLeft className="w-5 h-5 mr-2" />
            Back
          </Button>

          {step < 4 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="h-14 px-8 text-lg bg-orange-500 hover:bg-orange-600"
            >
              Next
              <ChevronRight className="w-5 h-5 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={createBatchMutation.isPending || (!canProceed())}
              className="h-14 px-8 text-lg bg-green-600 hover:bg-green-700"
            >
              <Check className="w-5 h-5 mr-2" />
              {createBatchMutation.isPending ? 'Submitting...' : 'Submit Batch'}
            </Button>
          )}
        </div>
      </div>

      {/* Pin Verification Pad */}
      <KioskPinPad
        open={showVerifyPad}
        onClose={() => setShowVerifyPad(false)}
        onVerified={handleVerified}
        floorUsers={floorUsers}
        title={verifyTarget?.type === 'material' ? 'Verify Material' : 'Verify Procedure'}
      />
    </div>
  );
}