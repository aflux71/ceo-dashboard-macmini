import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Search, Trash2, Pencil, RefreshCw, Copy, Check } from "lucide-react";
import PortalAccountDialog from "@/components/portal-admin/PortalAccountDialog";

const generateAccessCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // omit ambiguous chars
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
};

export default function PortalAdminAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const load = async () => {
    setLoading(true);
    const list = await base44.entities.PortalAccount.list("store_name", 1000);
    setAccounts(list || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) =>
      (a.store_name || "").toLowerCase().includes(q) ||
      (a.contact_name || "").toLowerCase().includes(q) ||
      (a.contact_email || "").toLowerCase().includes(q)
    );
  }, [accounts, search]);

  const handleSave = async (data) => {
    if (editing) {
      await base44.entities.PortalAccount.update(editing.id, data);
    } else {
      await base44.entities.PortalAccount.create({
        ...data,
        access_code: data.access_code || generateAccessCode(),
      });
    }
    setDialogOpen(false);
    setEditing(null);
    load();
  };

  const toggleActive = async (a) => {
    await base44.entities.PortalAccount.update(a.id, { is_active: !a.is_active });
    load();
  };

  const regenerateCode = async (a) => {
    if (!confirm(`Generate a new access code for "${a.store_name}"? The old code will stop working immediately.`)) return;
    await base44.entities.PortalAccount.update(a.id, { access_code: generateAccessCode() });
    load();
  };

  const handleDelete = async (a) => {
    if (!confirm(`Delete account "${a.store_name}"? This cannot be undone.`)) return;
    await base44.entities.PortalAccount.delete(a.id);
    load();
  };

  const copyCode = async (a) => {
    try {
      await navigator.clipboard.writeText(a.access_code);
      setCopiedId(a.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {}
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Portal Accounts</h1>
          <p className="text-zinc-400 text-sm mt-1">Manage store login credentials for the customer ordering portal</p>
        </div>
        <Button
          onClick={() => { setEditing(null); setDialogOpen(true); }}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          <Plus className="w-4 h-4 mr-2" /> New Store Account
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <Input
          placeholder="Search by store, contact, or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 bg-zinc-900 border-zinc-800 text-white"
        />
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/60 text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-left">Store Name</th>
              <th className="px-3 py-2 text-left">Contact</th>
              <th className="px-3 py-2 text-left">Email</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Access Code</th>
              <th className="px-3 py-2 text-center">Active</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" className="px-3 py-8 text-center text-zinc-500">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan="7" className="px-3 py-8 text-center text-zinc-500">No accounts yet. Click "New Store Account" to add one.</td></tr>
            ) : filtered.map((a) => (
              <tr key={a.id} className="border-t border-zinc-800 hover:bg-zinc-800/30">
                <td className="px-3 py-2 text-white font-medium">{a.store_name}</td>
                <td className="px-3 py-2 text-zinc-400">{a.contact_name || "—"}</td>
                <td className="px-3 py-2 text-zinc-400">{a.contact_email || "—"}</td>
                <td className="px-3 py-2">
                  <Badge variant={a.account_type === "wholesale" ? "purple" : "blue"} className="text-[10px]">
                    {a.account_type || "store"}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-orange-400 bg-zinc-800 px-2 py-0.5 rounded">{a.access_code}</code>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => copyCode(a)}
                      className="h-6 w-6 text-zinc-400 hover:text-white"
                      title="Copy code"
                    >
                      {copiedId === a.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => regenerateCode(a)}
                      className="h-6 w-6 text-zinc-400 hover:text-amber-400"
                      title="Regenerate code"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </td>
                <td className="px-3 py-2 text-center">
                  <Switch checked={!!a.is_active} onCheckedChange={() => toggleActive(a)} />
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => { setEditing(a); setDialogOpen(true); }}
                      className="h-7 w-7 text-zinc-400 hover:text-white"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDelete(a)}
                      className="h-7 w-7 text-zinc-400 hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PortalAccountDialog
        open={dialogOpen}
        onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}
        onSave={handleSave}
        editing={editing}
        generateCode={generateAccessCode}
      />
    </div>
  );
}