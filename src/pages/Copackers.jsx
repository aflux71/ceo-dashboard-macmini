import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import {
  Building2,
  Plus,
  Search,
  Pencil,
  Trash2,
  Mail,
  Phone,
  Clock,
  Star,
  Loader2,
  Package,
  Tag,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import Badge from "@/components/ui/Badge";

const emptyForm = {
  name: "",
  contact_name: "",
  contact_email: "",
  phone: "",
  lead_time_days: "",
  is_preferred: false,
  sku_restrictions: "",
  components_on_hand: "",
  notes: "",
};

export default function Copackers() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const { data: copackers = [], isLoading } = useQuery({
    queryKey: ["copackers"],
    queryFn: () => base44.entities.Copacker.list("-created_date"),
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return copackers;
    const q = search.toLowerCase();
    return copackers.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.contact_name?.toLowerCase().includes(q) ||
        c.contact_email?.toLowerCase().includes(q) ||
        c.sku_restrictions?.toLowerCase().includes(q)
    );
  }, [copackers, search]);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Copacker.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["copackers"] });
      toast.success("Co-packer created");
      closeDialog();
    },
    onError: (err) => {
      const msg = err?.response?.data?.message || err?.message || String(err);
      toast.error(`Failed to create: ${msg}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Copacker.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["copackers"] });
      toast.success("Co-packer updated");
      closeDialog();
    },
    onError: (err) => {
      const msg = err?.response?.data?.message || err?.message || String(err);
      toast.error(`Failed to update: ${msg}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Copacker.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["copackers"] });
      toast.success("Co-packer deleted");
      setDeleteConfirmId(null);
    },
    onError: (err) => {
      const msg = err?.response?.data?.message || err?.message || String(err);
      toast.error(`Failed to delete: ${msg}`);
    },
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setForm(emptyForm);
    setEditingId(null);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (copacker) => {
    setEditingId(copacker.id);
    setForm({
      name: copacker.name || "",
      contact_name: copacker.contact_name || "",
      contact_email: copacker.contact_email || "",
      phone: copacker.phone || "",
      lead_time_days: copacker.lead_time_days != null ? String(copacker.lead_time_days) : "",
      is_preferred: copacker.is_preferred || false,
      sku_restrictions: copacker.sku_restrictions || "",
      components_on_hand: copacker.components_on_hand || "",
      notes: copacker.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name) {
      toast.error("Company name is required");
      return;
    }
    const payload = {
      name: form.name,
      contact_name: form.contact_name,
      contact_email: form.contact_email,
      phone: form.phone,
      lead_time_days: form.lead_time_days ? Number(form.lead_time_days) : null,
      is_preferred: form.is_preferred,
      sku_restrictions: form.sku_restrictions,
      components_on_hand: form.components_on_hand,
      notes: form.notes,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
            <Building2 className="w-6 h-6 text-cyan-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">Co-packers</h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              Manage co-packing partners, capabilities, and contact details
            </p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, contact, or SKU…"
            className="pl-9 bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm"
          />
        </div>
        <Button onClick={openCreate} className="bg-cyan-600 hover:bg-cyan-700 text-white h-9">
          <Plus className="w-4 h-4 mr-2" />
          New Co-packer
        </Button>
      </div>

      {/* Count */}
      <p className="text-xs text-zinc-500">
        {filtered.length} co-packer{filtered.length !== 1 ? "s" : ""}
        {search && ` matching "${search}"`}
      </p>

      {/* Cards */}
      {isLoading ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-12 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-12">
            <div className="flex flex-col items-center text-center">
              <div className="p-3 rounded-xl bg-zinc-800 mb-4">
                <Building2 className="w-8 h-8 text-zinc-600" />
              </div>
              <p className="text-zinc-400 text-sm">
                {copackers.length === 0
                  ? "No co-packers yet. Add your first co-packing partner."
                  : "No co-packers match your search."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((cp) => {
            const skus = cp.sku_restrictions
              ? cp.sku_restrictions.split(",").map((s) => s.trim()).filter(Boolean)
              : [];
            const components = cp.components_on_hand
              ? cp.components_on_hand.split(",").map((s) => s.trim()).filter(Boolean)
              : [];

            return (
              <Card
                key={cp.id}
                className={`bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors ${
                  cp.is_preferred ? "border-amber-500/30" : ""
                }`}
              >
                <CardContent className="p-5 space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-zinc-100 truncate">
                          {cp.name}
                        </h3>
                        {cp.is_preferred && (
                          <Star className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />
                        )}
                      </div>
                      {cp.is_preferred && (
                        <Badge variant="amber">Preferred</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(cp)}
                        className="h-8 w-8 p-0 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteConfirmId(cp.id)}
                        className="h-8 w-8 p-0 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Contact details */}
                  <div className="space-y-1.5 text-xs text-zinc-500">
                    {cp.contact_name && (
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3 h-3 shrink-0" />
                        <span className="text-zinc-300">{cp.contact_name}</span>
                      </div>
                    )}
                    {cp.contact_email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-3 h-3 shrink-0" />
                        <a
                          href={`mailto:${cp.contact_email}`}
                          className="text-cyan-400 hover:underline truncate"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {cp.contact_email}
                        </a>
                      </div>
                    )}
                    {cp.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3 h-3 shrink-0" />
                        <span className="text-zinc-300">{cp.phone}</span>
                      </div>
                    )}
                    {cp.lead_time_days != null && (
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 shrink-0" />
                        <span className="text-zinc-300">{cp.lead_time_days} day lead time</span>
                      </div>
                    )}
                  </div>

                  {/* SKU Restrictions */}
                  {skus.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-zinc-500 font-medium flex items-center gap-1">
                        <Tag className="w-3 h-3" />
                        SKU Restrictions
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {skus.slice(0, 6).map((sku, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 rounded text-xs font-mono bg-zinc-800 text-zinc-400 border border-zinc-700"
                          >
                            {sku}
                          </span>
                        ))}
                        {skus.length > 6 && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-zinc-800 text-zinc-500">
                            +{skus.length - 6} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Components on hand */}
                  {components.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-zinc-500 font-medium flex items-center gap-1">
                        <Package className="w-3 h-3" />
                        Components On Hand
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {components.slice(0, 6).map((comp, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 rounded text-xs bg-green-500/10 text-green-400 border border-green-500/20"
                          >
                            {comp}
                          </span>
                        ))}
                        {components.length > 6 && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-zinc-800 text-zinc-500">
                            +{components.length - 6} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {cp.notes && (
                    <p className="text-xs text-zinc-500 italic line-clamp-2">{cp.notes}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Co-packer" : "New Co-packer"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Company Name *</Label>
                <Input
                  placeholder="Acme Fill Co."
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">Contact Name</Label>
                <Input
                  placeholder="Jane Smith"
                  value={form.contact_name}
                  onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Contact Email</Label>
                <Input
                  type="email"
                  placeholder="jane@acmefill.com"
                  value={form.contact_email}
                  onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">Phone</Label>
                <Input
                  placeholder="(555) 123-4567"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Lead Time (days)</Label>
                <Input
                  type="number"
                  placeholder="14"
                  value={form.lead_time_days}
                  onChange={(e) => setForm({ ...form, lead_time_days: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">Preferred Partner</Label>
                <div className="flex items-center gap-3 pt-1.5">
                  <Switch
                    checked={form.is_preferred}
                    onCheckedChange={(checked) => setForm({ ...form, is_preferred: checked })}
                  />
                  <span className="text-sm text-zinc-400">
                    {form.is_preferred ? (
                      <span className="flex items-center gap-1 text-amber-400">
                        <Star className="w-3.5 h-3.5 fill-amber-400" />
                        Preferred
                      </span>
                    ) : (
                      "Not preferred"
                    )}
                  </span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400">SKU Restrictions</Label>
              <Textarea
                placeholder="Comma-separated SKUs they can handle, e.g. LAV-BL-001, RSE-SC-002"
                value={form.sku_restrictions}
                onChange={(e) => setForm({ ...form, sku_restrictions: e.target.value })}
                className="bg-zinc-800 border-zinc-700 text-zinc-100 resize-none text-sm"
                rows={2}
              />
              <p className="text-xs text-zinc-600">Leave blank if no restrictions (can handle all SKUs)</p>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400">Components On Hand</Label>
              <Textarea
                placeholder="Comma-separated components they stock, e.g. 250ml bottles, pump caps, labels"
                value={form.components_on_hand}
                onChange={(e) => setForm({ ...form, components_on_hand: e.target.value })}
                className="bg-zinc-800 border-zinc-700 text-zinc-100 resize-none text-sm"
                rows={2}
              />
              <p className="text-xs text-zinc-600">Components they keep in stock so you don't need to ship</p>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400">Notes</Label>
              <Textarea
                placeholder="Additional notes, special terms, etc."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="bg-zinc-800 border-zinc-700 text-zinc-100 resize-none text-sm"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} className="border-zinc-700">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : editingId ? (
                <Pencil className="w-4 h-4 mr-2" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              {editingId ? "Save Changes" : "Create Co-packer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Co-packer</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-400 py-2">
            Are you sure you want to delete this co-packer? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)} className="border-zinc-700">
              Cancel
            </Button>
            <Button
              onClick={() => deleteMutation.mutate(deleteConfirmId)}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
