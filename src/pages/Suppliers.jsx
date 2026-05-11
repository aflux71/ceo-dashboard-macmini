import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Truck,
  Plus,
  Search,
  Edit,
  Trash2,
  Mail,
  Phone,
  Briefcase
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import Badge from "@/components/ui/Badge";

export default function Suppliers() {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all"); // all | suppliers | clients
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    contact_name: "",
    email: "",
    phone: "",
    address: "",
    payment_terms: "",
    lead_time_days: 0,
    notes: "",
    active: true,
    is_client: false
  });

  const queryClient = useQueryClient();

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Supplier.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      closeModal();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Supplier.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      closeModal();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Supplier.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] })
  });

  const openModal = (supplier = null) => {
    if (supplier) {
      setEditItem(supplier);
      setFormData({
        name: supplier.name || "",
        contact_name: supplier.contact_name || "",
        email: supplier.email || "",
        phone: supplier.phone || "",
        address: supplier.address || "",
        payment_terms: supplier.payment_terms || "",
        lead_time_days: supplier.lead_time_days || 0,
        notes: supplier.notes || "",
        active: supplier.active !== false,
        is_client: supplier.is_client === true
      });
    } else {
      setEditItem(null);
      setFormData({
        name: "",
        contact_name: "",
        email: "",
        phone: "",
        address: "",
        payment_terms: "",
        lead_time_days: 0,
        notes: "",
        active: true,
        is_client: false
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

  const filtered = suppliers.filter(supplier => {
    const matchesSearch = !search || 
      supplier.name?.toLowerCase().includes(search.toLowerCase()) ||
      supplier.contact_name?.toLowerCase().includes(search.toLowerCase());
    const matchesType =
      filterType === "all" ||
      (filterType === "clients" && supplier.is_client === true) ||
      (filterType === "suppliers" && supplier.is_client !== true);
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Suppliers & Clients</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Manage supplier and private label client contacts
          </p>
        </div>
        <Button onClick={() => openModal()} className="bg-orange-500 hover:bg-orange-600 text-white">
          <Plus className="w-4 h-4 mr-2" />
          Add Contact
        </Button>
      </div>

      {/* Search + Filter */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-6 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              placeholder="Search by name or contact..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-zinc-800 border-zinc-700 text-zinc-100"
            />
          </div>
          <div className="flex gap-1 bg-zinc-800 border border-zinc-700 rounded-md p-1">
            {[
              { key: "all", label: "All" },
              { key: "suppliers", label: "Suppliers" },
              { key: "clients", label: "Clients" },
            ].map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setFilterType(opt.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  filterType === opt.key
                    ? "bg-orange-500 text-white"
                    : "text-zinc-400 hover:text-zinc-100"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Suppliers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <p className="col-span-full text-center text-zinc-500 py-8">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="col-span-full text-center text-zinc-500 py-8">No suppliers found</p>
        ) : (
          filtered.map((supplier) => {
            const isClient = supplier.is_client === true;
            return (
            <Card key={supplier.id} className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors">
              <CardContent className="pt-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isClient ? 'bg-purple-500/20' : 'bg-orange-500/20'}`}>
                      {isClient
                        ? <Briefcase className="w-5 h-5 text-purple-400" />
                        : <Truck className="w-5 h-5 text-orange-400" />}
                    </div>
                    <div>
                      <h3 className="font-semibold text-zinc-100">{supplier.name}</h3>
                      {supplier.contact_name && (
                        <p className="text-sm text-zinc-500">{supplier.contact_name}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {isClient && (
                      <Badge variant="purple">Client</Badge>
                    )}
                    <Badge variant={supplier.active !== false ? 'green' : 'default'}>
                      {supplier.active !== false ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>
                
                <div className="space-y-2 text-sm mb-4">
                  {supplier.email && (
                    <div className="flex items-center gap-2 text-zinc-400">
                      <Mail className="w-4 h-4" />
                      <a href={`mailto:${supplier.email}`} className="hover:text-orange-400">
                        {supplier.email}
                      </a>
                    </div>
                  )}
                  {supplier.phone && (
                    <div className="flex items-center gap-2 text-zinc-400">
                      <Phone className="w-4 h-4" />
                      <span>{supplier.phone}</span>
                    </div>
                  )}
                  {supplier.lead_time_days > 0 && (
                    <p className="text-zinc-500">
                      Lead time: <span className="text-zinc-300">{supplier.lead_time_days} days</span>
                    </p>
                  )}
                  {supplier.payment_terms && (
                    <p className="text-zinc-500">
                      Terms: <span className="text-zinc-300">{supplier.payment_terms}</span>
                    </p>
                  )}
                </div>

                <div className="flex gap-2 pt-4 border-t border-zinc-800">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openModal(supplier)}
                    className="flex-1"
                  >
                    <Edit className="w-4 h-4 mr-1" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm('Delete this contact?')) {
                        deleteMutation.mutate(supplier.id);
                      }
                    }}
                    className="text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
            );
          })
        )}
      </div>

      {/* Add/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-lg">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Edit Contact' : 'Add Contact'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-800/50 px-3 py-2">
              <div>
                <Label className="text-zinc-200">Private Label Client</Label>
                <p className="text-xs text-zinc-500 mt-0.5">Toggle on if this is a client (not a supplier)</p>
              </div>
              <Switch
                checked={formData.is_client}
                onCheckedChange={(checked) => setFormData({...formData, is_client: checked})}
              />
            </div>
            <div className="space-y-2">
              <Label>Company Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                required
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="space-y-2">
              <Label>Contact Name</Label>
              <Input
                value={formData.contact_name}
                onChange={(e) => setFormData({...formData, contact_name: e.target.value})}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Textarea
                value={formData.address}
                onChange={(e) => setFormData({...formData, address: e.target.value})}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Payment Terms</Label>
                <Input
                  value={formData.payment_terms}
                  onChange={(e) => setFormData({...formData, payment_terms: e.target.value})}
                  placeholder="e.g., Net 30"
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
              <div className="space-y-2">
                <Label>Lead Time (days)</Label>
                <Input
                  type="number"
                  value={formData.lead_time_days}
                  onChange={(e) => setFormData({...formData, lead_time_days: parseInt(e.target.value) || 0})}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="flex items-center justify-between pt-2">
              <Label>Active</Label>
              <Switch
                checked={formData.active}
                onCheckedChange={(checked) => setFormData({...formData, active: checked})}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
              <Button type="submit" className="bg-orange-500 hover:bg-orange-600">
                {editItem ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}