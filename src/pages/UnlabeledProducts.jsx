import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Tag, Pencil, Check, X, Plus, Search } from "lucide-react";
import { toast } from "sonner";

const EMPTY_FORM = { product_name: "", sku: "", batch_id: "", qty_unlabeled: "", qty_labeled: "", notes: "" };

function ProductSearch({ value, onSelect }) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const { data: inventory = [] } = useQuery({
    queryKey: ["inventory_finished"],
    queryFn: () => base44.entities.Inventory.filter({ type: "finished_product" }),
  });
  const { data: recipes = [] } = useQuery({
    queryKey: ["recipes_active"],
    queryFn: () => base44.entities.Recipe.filter({ active: true }),
  });

  // Merge inventory finished products + recipes into one searchable list
  // Recipes take priority — inventory may be missing items
  const inventoryMap = new Map(inventory.map(i => [i.sku, i]));
  const recipeOptions = recipes.map(r => ({ label: r.name, sku: r.sku, source: "recipe" }));
  const inventoryOnly = inventory
    .filter(i => !recipes.find(r => r.sku === i.sku))
    .map(i => ({ label: i.name, sku: i.sku, source: "inventory" }));
  const options = [...recipeOptions, ...inventoryOnly];

  const filtered = query.length > 1
    ? options.filter(o =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        o.sku?.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 20)
    : [];

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-zinc-500" />
        <Input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search product name or SKU..."
          className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm pl-8"
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl max-h-52 overflow-y-auto">
          {filtered.map((opt, i) => (
            <button
              key={i}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-zinc-700 transition-colors flex items-center justify-between gap-2"
              onClick={() => {
                setQuery(opt.label);
                setOpen(false);
                onSelect({ product_name: opt.label, sku: opt.sku });
              }}
            >
              <span className="text-sm text-zinc-100 truncate">{opt.label}</span>
              <span className="text-xs text-zinc-500 font-mono shrink-0">{opt.sku}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function UnlabeledProducts() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_FORM);

  const { data: items = [] } = useQuery({
    queryKey: ["unlabeled_products"],
    queryFn: () => base44.entities.UnlabeledProduct.list("-created_date"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.UnlabeledProduct.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unlabeled_products"] });
      toast.success("Removed");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.UnlabeledProduct.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unlabeled_products"] });
      setEditing(null);
      toast.success("Updated");
    },
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.UnlabeledProduct.create({
      ...data,
      qty_unlabeled: Number(data.qty_unlabeled),
      qty_labeled: Number(data.qty_labeled),
      batch_entity_id: "manual",
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unlabeled_products"] });
      setShowAddForm(false);
      setAddForm(EMPTY_FORM);
      toast.success("Added");
    },
  });

  const startEdit = (item) => {
    setEditing({ id: item.id, qty_unlabeled: item.qty_unlabeled, qty_labeled: item.qty_labeled, notes: item.notes || "" });
  };

  const saveEdit = () => {
    updateMutation.mutate({
      id: editing.id,
      data: {
        qty_unlabeled: Number(editing.qty_unlabeled),
        qty_labeled: Number(editing.qty_labeled),
        notes: editing.notes,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100">Unlabeled Products</h1>
          <p className="text-sm text-zinc-400 mt-1">Products pending labeling from the review queue</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-amber-500/20 border border-amber-500/30 rounded-lg px-4 py-2 text-center">
            <p className="text-xs text-amber-400 font-medium">Unlabeled</p>
            <span className="text-2xl font-bold text-amber-400">{items.length}</span>
          </div>
          <Button onClick={() => setShowAddForm(v => !v)} className="bg-zinc-700 hover:bg-zinc-600 gap-2">
            <Plus className="w-4 h-4" /> Add Manually
          </Button>
        </div>
      </div>

      {showAddForm && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-zinc-300">Add Unlabeled Product</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-zinc-400 block mb-1">Product Name <span className="text-red-400">*</span></label>
              <ProductSearch
                value={addForm.product_name}
                onSelect={({ product_name, sku }) => setAddForm(p => ({ ...p, product_name, sku }))}
              />
              {addForm.sku && (
                <p className="text-xs text-zinc-500 font-mono mt-1">SKU: {addForm.sku}</p>
              )}
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Batch ID</label>
              <Input value={addForm.batch_id} onChange={e => setAddForm(p => ({ ...p, batch_id: e.target.value }))} placeholder="e.g. 990-260415-3" className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Qty Unlabeled</label>
                <Input type="number" min={0} value={addForm.qty_unlabeled} onChange={e => setAddForm(p => ({ ...p, qty_unlabeled: e.target.value }))} placeholder="0" className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm" />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Qty Labeled</label>
                <Input type="number" min={0} value={addForm.qty_labeled} onChange={e => setAddForm(p => ({ ...p, qty_labeled: e.target.value }))} placeholder="0" className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm" />
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Notes</label>
            <Textarea value={addForm.notes} onChange={e => setAddForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional notes..." className="bg-zinc-800 border-zinc-700 text-zinc-100 text-xs min-h-[50px]" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" disabled={!addForm.product_name || createMutation.isPending} onClick={() => createMutation.mutate(addForm)} className="bg-green-600 hover:bg-green-700 gap-1 text-xs">
              <Check className="w-3 h-3" /> Save
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setShowAddForm(false); setAddForm(EMPTY_FORM); }} className="border-zinc-700 text-zinc-400 text-xs gap-1">
              <X className="w-3 h-3" /> Cancel
            </Button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 text-center text-zinc-500">
            No unlabeled products recorded
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const isEditing = editing?.id === item.id;
            return (
              <div key={item.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded text-xs font-mono font-semibold">
                        {item.batch_id}
                      </span>
                      <Tag className="w-3 h-3 text-zinc-500" />
                    </div>
                    <p className="font-semibold text-zinc-100">{item.product_name}</p>
                    <p className="text-xs text-zinc-500 font-mono">{item.sku}</p>

                    {isEditing ? (
                      <div className="mt-3 space-y-2">
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <label className="text-xs text-zinc-400 block mb-1">Qty Unlabeled</label>
                            <Input
                              type="number"
                              min={0}
                              value={editing.qty_unlabeled}
                              onChange={(e) => setEditing((p) => ({ ...p, qty_unlabeled: e.target.value }))}
                              className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm h-8"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="text-xs text-zinc-400 block mb-1">Qty Labeled</label>
                            <Input
                              type="number"
                              min={0}
                              value={editing.qty_labeled}
                              onChange={(e) => setEditing((p) => ({ ...p, qty_labeled: e.target.value }))}
                              className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm h-8"
                            />
                          </div>
                        </div>
                        <Textarea
                          placeholder="Notes..."
                          value={editing.notes}
                          onChange={(e) => setEditing((p) => ({ ...p, notes: e.target.value }))}
                          className="bg-zinc-800 border-zinc-700 text-zinc-100 text-xs min-h-[50px]"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={saveEdit} disabled={updateMutation.isPending} className="bg-green-600 hover:bg-green-700 text-xs gap-1">
                            <Check className="w-3 h-3" /> Save
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditing(null)} className="border-zinc-700 text-zinc-400 text-xs gap-1">
                            <X className="w-3 h-3" /> Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 flex gap-6 text-sm">
                        <div>
                          <span className="text-zinc-500 text-xs">Unlabeled: </span>
                          <span className="text-amber-400 font-semibold">{item.qty_unlabeled}</span>
                        </div>
                        <div>
                          <span className="text-zinc-500 text-xs">Labeled: </span>
                          <span className="text-green-400 font-semibold">{item.qty_labeled}</span>
                        </div>
                        {item.notes && (
                          <p className="text-xs text-zinc-400 mt-1">{item.notes}</p>
                        )}
                      </div>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => startEdit(item)}
                        className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(item.id)}
                        className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-950/20 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}